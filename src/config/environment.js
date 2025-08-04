/**
 * Environment Configuration - Validates and manages environment variables
 */

class Environment {
    constructor() {
        this.loadEnvironment();
        this.validateRequired();
    }

    /**
     * Load environment variables from .env file
     */
    loadEnvironment() {
        try {
            require('dotenv').config();
        } catch (error) {
            console.error('⚠️  dotenv not found. Make sure to run: npm install');
            process.exit(1);
        }
    }

    /**
     * Validate required environment variables
     */
    validateRequired() {
        const requiredVars = [
            'DISCORD_BOT_TOKEN',
            'ALPHA_VANTAGE_API_KEY'
        ];

        const missing = [];
        
        for (const varName of requiredVars) {
            if (!process.env[varName]) {
                missing.push(varName);
            }
        }

        if (missing.length > 0) {
            console.error('❌ Missing required environment variables:');
            missing.forEach(varName => {
                console.error(`   - ${varName}`);
            });
            
            console.error('\nPlease check your .env file and ensure all required variables are set.');
            
            if (missing.includes('DISCORD_BOT_TOKEN')) {
                console.error('Get Discord bot token at: https://discord.com/developers/applications');
            }
            
            if (missing.includes('ALPHA_VANTAGE_API_KEY')) {
                console.error('Get Alpha Vantage API key at: https://www.alphavantage.co/support/#api-key');
            }
            
            process.exit(1);
        }
    }

    /**
     * Get Discord bot token
     */
    getDiscordToken() {
        return process.env.DISCORD_BOT_TOKEN;
    }

    /**
     * Get Alpha Vantage API key
     */
    getAlphaVantageKey() {
        return process.env.ALPHA_VANTAGE_API_KEY;
    }

    /**
     * Get environment name (development, production, etc.)
     */
    getEnvironment() {
        return process.env.NODE_ENV || 'development';
    }

    /**
     * Check if running in development mode
     */
    isDevelopment() {
        return this.getEnvironment() === 'development';
    }

    /**
     * Check if running in production mode
     */
    isProduction() {
        return this.getEnvironment() === 'production';
    }

    /**
     * Get log level
     */
    getLogLevel() {
        return process.env.LOG_LEVEL || (this.isDevelopment() ? 'debug' : 'warn');
    }

    /**
     * Get cache TTL in milliseconds
     */
    getCacheTTL() {
        const hours = parseInt(process.env.CACHE_TTL_HOURS) || 24;
        return hours * 60 * 60 * 1000; // Convert to milliseconds
    }

    /**
     * Get message retention hours
     */
    getMessageRetentionHours() {
        const hours = parseFloat(process.env.MESSAGE_RETENTION_HOURS);
        if (isNaN(hours) || hours < 0.1 || hours > 168) { // Min 6 minutes, Max 1 week
            return 26; // Default 26 hours
        }
        return hours;
    }

    /**
     * Get message retention in milliseconds
     */
    getMessageRetentionMs() {
        return this.getMessageRetentionHours() * 60 * 60 * 1000;
    }

    /**
     * Get safety buffer for message retention (retention + 4 hours)
     */
    getMessageRetentionSafetyBufferMs() {
        return (this.getMessageRetentionHours() + 4) * 60 * 60 * 1000;
    }

    /**
     * Get thread cleanup interval in milliseconds
     */
    getThreadCleanupInterval() {
        const hours = parseInt(process.env.THREAD_CLEANUP_HOURS) || 1;
        return hours * 60 * 60 * 1000; // Convert to milliseconds
    }

    /**
     * Get maximum tickers per message
     */
    getMaxTickersPerMessage() {
        return parseInt(process.env.MAX_TICKERS_PER_MESSAGE) || 25;
    }

    /**
     * Get chart generation timeout in milliseconds
     */
    getChartTimeout() {
        const seconds = parseInt(process.env.CHART_TIMEOUT_SECONDS) || 30;
        return seconds * 1000; // Convert to milliseconds
    }

    /**
     * Get all configuration as an object
     */
    getConfig() {
        return {
            discord: {
                token: this.getDiscordToken()
            },
            alphaVantage: {
                apiKey: this.getAlphaVantageKey()
            },
            environment: this.getEnvironment(),
            logging: {
                level: this.getLogLevel()
            },
            cache: {
                ttl: this.getCacheTTL()
            },
            threads: {
                cleanupInterval: this.getThreadCleanupInterval()
            },
            retention: {
                hours: this.getMessageRetentionHours(),
                milliseconds: this.getMessageRetentionMs(),
                safetyBufferMs: this.getMessageRetentionSafetyBufferMs()
            },
            limits: {
                maxTickersPerMessage: this.getMaxTickersPerMessage(),
                chartTimeout: this.getChartTimeout()
            }
        };
    }

    /**
     * Print configuration summary (without sensitive data)
     */
    printConfigSummary() {
        const config = this.getConfig();
        
        console.log('🔧 Configuration Summary:');
        console.log(`   Environment: ${config.environment}`);
        console.log(`   Log Level: ${config.logging.level}`);
        console.log(`   Cache TTL: ${config.cache.ttl / 1000 / 60 / 60} hours`);
        console.log(`   Thread Cleanup: ${config.threads.cleanupInterval / 1000 / 60 / 60} hours`);
        console.log(`   Message Retention: ${config.retention.hours} hours`);
        console.log(`   Max Tickers: ${config.limits.maxTickersPerMessage}`);
        console.log(`   Chart Timeout: ${config.limits.chartTimeout / 1000} seconds`);
        console.log(`   Discord Token: ${config.discord.token ? '✅ Set' : '❌ Missing'}`);
        console.log(`   Alpha Vantage Key: ${config.alphaVantage.apiKey ? '✅ Set' : '❌ Missing'}`);
    }
}

module.exports = Environment;