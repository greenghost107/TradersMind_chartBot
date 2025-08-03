/**
 * Interaction Handler - Handles Discord button interactions
 */

const { EmbedBuilder } = require('discord.js');
const { logger } = require('../utils/logger');

class InteractionHandler {
    constructor(stockService, chartService, threadService, messageTrackingService = null) {
        this.stockService = stockService;
        this.chartService = chartService;
        this.threadService = threadService;
        this.messageTrackingService = messageTrackingService;
    }

    /**
     * Handle button interaction
     */
    async handleInteraction(interaction) {
        // Only handle button interactions
        if (!interaction.isButton()) return;
        
        // Only handle stock ticker buttons
        if (!interaction.customId.startsWith('stock_')) return;

        const ticker = interaction.customId.replace('stock_', '');
        
        try {
            await interaction.deferReply({ ephemeral: true });
            
            // Get the channel from interaction (could be main channel or thread)
            const channel = interaction.channel.isThread() ? 
                interaction.channel.parent : interaction.channel;
            
            // Get or create user's dedicated thread
            const userThread = await this.threadService.getOrCreateUserThread(channel, interaction.user);
            
            // Fetch stock data
            const stockData = await this.stockService.fetchStockData(ticker);
            
            // Generate chart with message tracking
            const chartBuffer = await this.chartService.generateChart(
                stockData, 
                null, // messageId will be set after sending
                userThread.id, 
                interaction.user.id
            );
            
            // Create embed
            const embed = this.chartService.createStockEmbed(stockData);

            // Send chart to user's thread
            const chartMessage = await userThread.send({
                embeds: [embed],
                files: [{
                    attachment: chartBuffer,
                    name: 'chart.png'
                }]
            });
            
            // Track the message for retention if tracking service is available
            if (this.messageTrackingService) {
                const cacheKey = this.chartService.getChartCacheKey(ticker);
                this.messageTrackingService.trackMessage(
                    chartMessage.id,
                    userThread.id,
                    interaction.user.id,
                    ticker,
                    [cacheKey]
                );
            }
            
            logger.success('Chart sent to user thread', { 
                user: interaction.user.username,
                ticker,
                threadId: userThread.id,
                messageId: chartMessage.id
            });
            
            // Delete the deferred reply to avoid showing any message
            await interaction.deleteReply();
            
        } catch (error) {
            logger.error('Error handling interaction', {
                ticker,
                user: interaction.user.username,
                error: error.message
            });
            
            // Send error message to user
            const errorEmbed = new EmbedBuilder()
                .setTitle(`❌ Error: ${ticker}`)
                .setDescription(`Could not fetch data for **${ticker}**. Please check if the symbol is correct.`)
                .setColor(0xff4444);
                
            try {
                await interaction.editReply({ embeds: [errorEmbed] });
            } catch (replyError) {
                logger.error('Error sending error message', {
                    ticker,
                    error: replyError.message
                });
            }
        }
    }

    /**
     * Validate interaction before processing
     */
    shouldProcessInteraction(interaction) {
        // Must be a button interaction
        if (!interaction.isButton()) return false;
        
        // Must be a stock button
        if (!interaction.customId.startsWith('stock_')) return false;
        
        // Must have a valid ticker
        const ticker = interaction.customId.replace('stock_', '');
        if (!ticker || ticker.length === 0 || ticker.length > 5) return false;
        
        return true;
    }

    /**
     * Extract ticker from interaction
     */
    getTickerFromInteraction(interaction) {
        if (!interaction.customId.startsWith('stock_')) {
            return null;
        }
        
        return interaction.customId.replace('stock_', '');
    }

    /**
     * Get interaction statistics
     */
    getInteractionStats(interaction) {
        const ticker = this.getTickerFromInteraction(interaction);
        
        return {
            userId: interaction.user.id,
            username: interaction.user.username,
            ticker: ticker,
            channelId: interaction.channel.id,
            channelName: interaction.channel.name,
            isInThread: interaction.channel.isThread(),
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = InteractionHandler;