/**
 * Interaction Handler - Handles Discord button interactions
 */

const { EmbedBuilder } = require('discord.js');
const { logger } = require('../utils/logger');

class InteractionHandler {
    constructor(stockService, chartService, messageTrackingService = null) {
        this.stockService = stockService;
        this.chartService = chartService;
        this.messageTrackingService = messageTrackingService;
    }

    /**
     * Handle button interaction
     */
    async handleInteraction(interaction) {
        // Only handle button interactions
        if (!interaction.isButton()) {
            logger.debug('Ignoring non-button interaction', {
                type: interaction.type,
                customId: interaction.customId
            });
            return;
        }
        
        // Only handle stock ticker buttons
        if (!interaction.customId || !interaction.customId.startsWith('stock_')) {
            logger.debug('Ignoring non-stock interaction', {
                customId: interaction.customId
            });
            return;
        }

        const ticker = interaction.customId.replace('stock_', '');
        
        // Validate ticker format
        if (!ticker || ticker.length === 0 || ticker.length > 10) {
            logger.warn('Invalid ticker format', {
                ticker,
                user: interaction.user.username,
                customId: interaction.customId
            });
            return;
        }
        
        let replyDeferred = false;
        
        try {
            await interaction.deferReply({ ephemeral: true });
            replyDeferred = true;
            
            logger.debug('Processing ephemeral chart request', {
                user: interaction.user.username,
                userId: interaction.user.id,
                ticker,
                channelId: interaction.channel.id
            });
            
            // Fetch stock data
            const stockData = await this.stockService.fetchStockData(ticker);
            
            // Generate chart for ephemeral response
            const chartBuffer = await this.chartService.generateChart(
                stockData, 
                null, // messageId will be set after sending
                interaction.channel.id, // use channel instead of thread
                interaction.user.id
            );
            
            // Create embed
            const embed = this.chartService.createStockEmbed(stockData);

            // Send chart as ephemeral response (only visible to requesting user)
            const chartMessage = await interaction.editReply({
                embeds: [embed],
                files: [{
                    attachment: chartBuffer,
                    name: 'chart.png'
                }]
            });
            
            // Track the ephemeral message for retention if tracking service is available
            if (this.messageTrackingService) {
                const cacheKey = this.chartService.getChartCacheKey(ticker);
                this.messageTrackingService.trackMessage(
                    chartMessage.id,
                    interaction.channel.id,
                    interaction.user.id,
                    ticker,
                    [cacheKey],
                    null, // no threadId for ephemeral responses
                    true  // isEphemeral = true
                );
            }
            
            logger.success('Chart sent as ephemeral response', { 
                user: interaction.user.username,
                ticker,
                channelId: interaction.channel.id,
                messageId: chartMessage.id
            });
            
        } catch (error) {
            logger.error('Error handling ephemeral interaction', {
                ticker,
                user: interaction.user.username,
                error: error.message,
                replyDeferred
            });
            
            // Send error message as ephemeral response
            if (replyDeferred) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle(`❌ Error: ${ticker}`)
                    .setDescription(`Could not fetch data for **${ticker}**. Please check if the symbol is correct.`)
                    .setColor(0xff4444);
                    
                try {
                    await interaction.editReply({ embeds: [errorEmbed] });
                } catch (replyError) {
                    logger.error('Error sending ephemeral error message', {
                        ticker,
                        error: replyError.message
                    });
                }
            } else {
                // If reply wasn't deferred, try to respond directly
                try {
                    const errorEmbed = new EmbedBuilder()
                        .setTitle(`❌ Error: ${ticker}`)
                        .setDescription(`Could not fetch data for **${ticker}**. Please check if the symbol is correct.`)
                        .setColor(0xff4444);
                    
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
                    } else {
                        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                    }
                } catch (replyError) {
                    logger.error('Error sending fallback ephemeral error message', {
                        ticker,
                        error: replyError.message
                    });
                }
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