/**
 * TradersMind Discord Bot - Main Entry Point
 * Refactored for better structure and maintainability
 */

const Environment = require('./config/environment');
const DiscordConfig = require('./config/discord');
const StockService = require('./services/stockService');
const ChartService = require('./services/chartService');
const MessageTrackingService = require('./services/messageTrackingService');
const RetentionService = require('./services/retentionService');
const MessageHandler = require('./handlers/messageHandler');
const InteractionHandler = require('./handlers/interactionHandler');
const ErrorHandler = require('./handlers/errorHandler');
const { logger } = require('./utils/logger');

class TradersMindsBot {
    constructor() {
        this.environment = null;
        this.discordConfig = null;
        this.client = null;
        this.services = {};
        this.handlers = {};
        this.isRunning = false;
    }

    /**
     * Initialize the bot and all its services
     */
    async initialize() {
        try {
            console.log('🚀 Starting TradersMind Discord Bot...');
            
            // Initialize configuration
            this.environment = new Environment();
            this.environment.printConfigSummary();
            
            // Initialize error handler first
            this.handlers.error = new ErrorHandler();
            
            // Initialize Discord client first so we can pass it to services
            this.discordConfig = new DiscordConfig(this.environment);
            this.client = this.discordConfig.createClient();
            
            // Initialize services
            this.services.stock = new StockService();
            this.services.messageTracking = new MessageTrackingService(this.environment);
            this.services.chart = new ChartService(this.services.stock, this.services.messageTracking);
            
            // Initialize handlers with message tracking and bot client
            this.handlers.message = new MessageHandler(this.services.messageTracking, this.client);
            this.handlers.interaction = new InteractionHandler(
                this.services.stock,
                this.services.chart,
                this.services.messageTracking
            );
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Initialize retention service after Discord client is ready
            this.services.retention = new RetentionService(
                this.client,
                this.services.messageTracking,
                this.services.stock,
                this.services.chart,
                null, // threadService no longer needed
                this.environment
            );
            
            logger.success('Bot initialization completed');
            
        } catch (error) {
            console.error('❌ Failed to initialize bot:', error.message);
            throw error;
        }
    }

    /**
     * Setup Discord event listeners
     */
    setupEventListeners() {
        // Message events
        this.client.on('messageCreate', async (message) => {
            try {
                await this.handlers.message.handleMessage(message);
            } catch (error) {
                this.handlers.error.handleDiscordError(error, {
                    action: 'message_handling',
                    messageId: message.id,
                    authorId: message.author.id
                });
            }
        });

        // Interaction events
        this.client.on('interactionCreate', async (interaction) => {
            try {
                await this.handlers.interaction.handleInteraction(interaction);
            } catch (error) {
                this.handlers.error.handleDiscordError(error, {
                    action: 'interaction_handling',
                    interactionId: interaction.id,
                    userId: interaction.user.id,
                    customId: interaction.customId
                });
            }
        });

        // Global error handling
        this.client.on('error', (error) => {
            this.handlers.error.handleDiscordError(error, {
                action: 'discord_client_error'
            });
        });

        // Ready event
        this.client.on('ready', () => {
            this.isRunning = true;
            this.startPeriodicTasks();
            
            // Start retention service after Discord client is ready
            if (this.services.retention) {
                this.services.retention.start(60); // Run cleanup every 60 minutes
                logger.info('Retention service started with 60-minute intervals');
            }
        });
    }

    /**
     * Start periodic maintenance tasks
     */
    startPeriodicTasks() {
        // Log stats every 2 hours
        setInterval(() => {
            this.logStats();
        }, 7200000);

        // Health check every hour
        setInterval(() => {
            this.healthCheck();
        }, 3600000);
        
        // Chart cache cleanup every hour
        setInterval(() => {
            if (this.services.chart) {
                this.services.chart.cleanupExpiredCache();
            }
        }, 3600000);
    }

    /**
     * Log bot statistics
     */
    logStats() {
        try {
            const discordStats = this.discordConfig.getStats();
            const errorStats = this.handlers.error.getErrorStats();
            // Thread service no longer used with ephemeral responses
            const retentionStats = this.services.retention ? this.services.retention.getStatus() : null;
            const stockCacheStats = this.services.stock ? this.services.stock.getCacheStats() : null;
            const chartCacheStats = this.services.chart ? this.services.chart.getCacheStats() : null;
            
            logger.info('Bot Statistics', {
                guilds: discordStats.guilds,
                activeThreads: threadCount,
                recentErrors: errorStats.recentErrors,
                uptimeMinutes: Math.floor(discordStats.uptime / 1000 / 60),
                ping: discordStats.ping,
                retention: retentionStats,
                stockCache: stockCacheStats?.size || 0,
                chartCache: chartCacheStats?.size || 0
            });
        } catch (error) {
            this.handlers.error.handleError(error, { action: 'stats_logging' });
        }
    }

    /**
     * Perform health checks
     */
    healthCheck() {
        try {
            const isHealthy = this.handlers.error.isSystemHealthy();
            const isDiscordReady = this.discordConfig.isReady();
            
            if (!isHealthy) {
                console.warn('⚠️  System health check failed - high error rate detected');
            }
            
            if (!isDiscordReady) {
                console.warn('⚠️  Discord client is not ready');
            }
            
            // Log health status in development mode
            if (this.environment.isDevelopment()) {
                console.log(`💚 Health Check: Discord=${isDiscordReady ? '✅' : '❌'}, Errors=${isHealthy ? '✅' : '❌'}`);
            }
        } catch (error) {
            this.handlers.error.handleError(error, { action: 'health_check' });
        }
    }

    /**
     * Start the bot
     */
    async start() {
        try {
            await this.initialize();
            await this.discordConfig.login();
            
            console.log('🎉 TradersMind Discord Bot is now running!');
            
            // Setup graceful shutdown
            this.setupShutdownHandlers();
            
        } catch (error) {
            console.error('❌ Failed to start bot:', error.message);
            process.exit(1);
        }
    }

    /**
     * Setup graceful shutdown handlers
     */
    setupShutdownHandlers() {
        const shutdown = async (signal) => {
            console.log(`\n🛑 Received ${signal}. Gracefully shutting down...`);
            await this.shutdown();
            process.exit(0);
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        
        process.on('uncaughtException', (error) => {
            this.handlers.error.handleError(error, { action: 'uncaught_exception' });
            console.error('🚨 Uncaught Exception:', error);
            process.exit(1);
        });

        process.on('unhandledRejection', (reason, promise) => {
            this.handlers.error.handleError(new Error(`Unhandled Rejection: ${reason}`), { 
                action: 'unhandled_rejection',
                promise: promise.toString()
            });
            console.error('🚨 Unhandled Rejection:', reason);
        });
    }

    /**
     * Gracefully shutdown the bot
     */
    async shutdown() {
        try {
            this.isRunning = false;
            
            logger.info('Cleaning up resources...');
            
            // Stop retention service
            if (this.services.retention) {
                this.services.retention.stop();
            }
            
            // Cleanup services (thread cleanup no longer needed with ephemeral responses)
            
            if (this.services.stock) {
                this.services.stock.cleanupExpiredCache();
            }
            
            if (this.services.chart) {
                this.services.chart.cleanupExpiredCache();
            }
            
            // Shutdown Discord client
            if (this.discordConfig) {
                await this.discordConfig.shutdown();
            }
            
            logger.success('Shutdown completed successfully');
            
        } catch (error) {
            console.error('❌ Error during shutdown:', error.message);
        }
    }

    /**
     * Get bot status
     */
    getStatus() {
        return {
            running: this.isRunning,
            discord: this.discordConfig ? this.discordConfig.getStats() : null,
            errors: this.handlers.error ? this.handlers.error.getErrorStats() : null,
            // threads: thread service removed (using ephemeral responses now),
            retention: this.services.retention ? this.services.retention.getStatus() : null,
            stockCache: this.services.stock ? this.services.stock.getCacheStats() : null,
            chartCache: this.services.chart ? this.services.chart.getCacheStats() : null
        };
    }
}

// Create and start the bot if this file is run directly
if (require.main === module) {
    const bot = new TradersMindsBot();
    bot.start().catch(error => {
        console.error('❌ Fatal error starting bot:', error);
        process.exit(1);
    });
}

module.exports = TradersMindsBot;