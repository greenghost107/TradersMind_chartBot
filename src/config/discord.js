/**
 * Discord Configuration - Sets up Discord client with proper intents and error handling
 */

const { Client, GatewayIntentBits } = require('discord.js');

class DiscordConfig {
    constructor(environment) {
        this.environment = environment;
        this.client = null;
    }

    /**
     * Create and configure Discord client
     */
    createClient() {
        try {
            this.client = new Client({
                intents: [
                    GatewayIntentBits.Guilds,
                    GatewayIntentBits.GuildMessages,
                    GatewayIntentBits.MessageContent
                ]
            });

            this.setupClientEvents();
            return this.client;
        } catch (error) {
            console.error('❌ Failed to create Discord client:', error.message);
            throw error;
        }
    }

    /**
     * Setup basic client events
     */
    setupClientEvents() {
        this.client.on('ready', () => {
            console.log(`✅ Logged in as ${this.client.user.tag}!`);
            console.log(`🤖 Bot is active in ${this.client.guilds.cache.size} server(s)`);
        });

        this.client.on('error', (error) => {
            console.error('🚨 Discord client error:', error);
        });

        this.client.on('warn', (warning) => {
            if (this.environment.isDevelopment()) {
                console.warn('⚠️  Discord warning:', warning);
            }
        });

        this.client.on('disconnect', () => {
            console.warn('🔌 Discord client disconnected');
        });

        this.client.on('reconnecting', () => {
            console.log('🔄 Discord client reconnecting...');
        });
    }

    /**
     * Login to Discord
     */
    async login() {
        if (!this.client) {
            throw new Error('Discord client not created. Call createClient() first.');
        }

        try {
            const token = this.environment.getDiscordToken();
            await this.client.login(token);
            console.log('🚀 Discord bot started successfully');
        } catch (error) {
            console.error('❌ Failed to login to Discord:', error.message);
            throw error;
        }
    }

    /**
     * Get the Discord client
     */
    getClient() {
        return this.client;
    }

    /**
     * Gracefully shutdown the Discord client
     */
    async shutdown() {
        if (this.client) {
            console.log('🛑 Shutting down Discord client...');
            await this.client.destroy();
            this.client = null;
            console.log('✅ Discord client shut down successfully');
        }
    }

    /**
     * Get client statistics
     */
    getStats() {
        if (!this.client || !this.client.isReady()) {
            return {
                ready: false,
                guilds: 0,
                users: 0,
                channels: 0
            };
        }

        return {
            ready: true,
            guilds: this.client.guilds.cache.size,
            users: this.client.users.cache.size,
            channels: this.client.channels.cache.size,
            uptime: this.client.uptime,
            ping: this.client.ws.ping
        };
    }

    /**
     * Check if client is ready
     */
    isReady() {
        return this.client && this.client.isReady();
    }
}

module.exports = DiscordConfig;