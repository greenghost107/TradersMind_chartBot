/**
 * Interaction Handler - Handles Discord button interactions
 */

const { EmbedBuilder } = require('discord.js');
const { logger } = require('../utils/logger');

class InteractionHandler {
    constructor(stockService, chartService, messageTrackingService = null, botClient = null) {
        this.stockService = stockService;
        this.chartService = chartService;
        this.messageTrackingService = messageTrackingService;
        this.botClient = botClient;
        
        // Track processed interactions to prevent duplicates
        this.processedInteractions = new Set();
        
        // Track user+ticker requests to prevent rapid duplicates
        this.userTickerRequests = new Map();
        
        // Clean up processed interactions every 5 minutes
        setInterval(() => {
            this.processedInteractions.clear();
            this.userTickerRequests.clear();
            logger.debug('Cleared processed interactions cache');
        }, 5 * 60 * 1000);
    }

    /**
     * Validate if this interaction is from our bot's message
     */
    isOurInteraction(interaction) {
        try {
            // Check if we have bot client available
            if (!this.botClient || !this.botClient.user) {
                logger.debug('Bot client not available for interaction validation');
                return true; // Allow interaction if we can't validate
            }

            // Check if the message this interaction is from was sent by our bot
            if (interaction.message && interaction.message.author) {
                const isFromOurBot = interaction.message.author.id === this.botClient.user.id;
                if (!isFromOurBot) {
                    logger.debug('Ignoring interaction from another bot\'s message', {
                        messageAuthor: interaction.message.author.username,
                        ourBotId: this.botClient.user.id,
                        customId: interaction.customId
                    });
                    return false;
                }
            }

            return true;
        } catch (error) {
            logger.warn('Error validating interaction origin', {
                error: error.message,
                customId: interaction.customId
            });
            return true; // Allow interaction if validation fails
        }
    }

    /**
     * Handle button interaction
     */
    async handleInteraction(interaction) {
        // Create unique interaction identifier
        const interactionId = `${interaction.id}_${interaction.user.id}_${interaction.customId}`;
        
        // Check if we've already processed this interaction
        if (this.processedInteractions.has(interactionId)) {
            logger.warn('Duplicate interaction detected, ignoring', {
                interactionId: interaction.id,
                customId: interaction.customId,
                user: interaction.user.username
            });
            return;
        }
        
        // Mark interaction as being processed
        this.processedInteractions.add(interactionId);
        
        // Extract ticker for rapid duplicate prevention
        const ticker = interaction.customId?.replace('stock_', '');
        if (ticker) {
            const userTickerKey = `${interaction.user.id}_${ticker}`;
            const now = Date.now();
            const lastRequest = this.userTickerRequests.get(userTickerKey);
            
            // Prevent rapid duplicate requests within 10 seconds
            if (lastRequest && (now - lastRequest) < 10000) {
                logger.warn('Rapid duplicate request detected, ignoring', {
                    user: interaction.user.username,
                    ticker,
                    timeSinceLastRequest: Math.round((now - lastRequest) / 1000) + 's',
                    interactionId: interaction.id
                });
                
                // Optionally send a brief error response to let user know
                try {
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: '⏳ Please wait a moment before requesting the same chart again.',
                            ephemeral: true
                        });
                    }
                } catch (error) {
                    // Silently ignore if we can't respond
                    logger.debug('Could not send duplicate request warning', { 
                        ticker, 
                        user: interaction.user.username 
                    });
                }
                return;
            }
            
            // Record this request timestamp
            this.userTickerRequests.set(userTickerKey, now);
        }

        // Log all interactions for debugging
        logger.debug('Processing interaction', {
            id: interaction.id,
            type: interaction.type,
            customId: interaction.customId || 'N/A',
            user: interaction.user.username,
            isButton: interaction.isButton(),
            isStringSelectMenu: interaction.isStringSelectMenu(),
            isCommand: interaction.isCommand(),
            messageAuthor: interaction.message?.author?.username || 'N/A',
            interactionState: {
                replied: interaction.replied,
                deferred: interaction.deferred
            }
        });

        // Only handle button interactions
        if (!interaction.isButton()) {
            logger.debug('Ignoring non-button interaction', {
                type: interaction.type,
                customId: interaction.customId
            });
            return;
        }
        
        // Only handle stock ticker buttons - silently ignore others
        if (!interaction.customId || !interaction.customId.startsWith('stock_')) {
            logger.debug('Ignoring non-stock interaction', {
                customId: interaction.customId
            });
            return;
        }

        // Validate this is from our bot's message
        if (!this.isOurInteraction(interaction)) {
            return;
        }
        
        // Validate ticker format (ticker already extracted above)
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
            // Double-check interaction state before proceeding
            if (interaction.replied || interaction.deferred) {
                logger.warn('Interaction already acknowledged before processing, skipping', {
                    ticker,
                    user: interaction.user.username,
                    interactionId: interaction.id,
                    replied: interaction.replied,
                    deferred: interaction.deferred
                });
                return;
            }

            // Additional safety check: verify interaction is still valid
            if (!interaction.isRepliable()) {
                logger.warn('Interaction is no longer repliable, skipping', {
                    ticker,
                    user: interaction.user.username,
                    interactionId: interaction.id
                });
                return;
            }

            logger.debug('Attempting to defer ephemeral reply', {
                user: interaction.user.username,
                ticker,
                interactionId: interaction.id,
                interactionState: {
                    replied: interaction.replied,
                    deferred: interaction.deferred
                }
            });

            try {
                await interaction.deferReply({ ephemeral: true });
                replyDeferred = true;
                logger.debug('Successfully deferred interaction reply', {
                    ticker,
                    user: interaction.user.username,
                    interactionId: interaction.id
                });
            } catch (deferError) {
                logger.error('Failed to defer interaction reply', {
                    ticker,
                    user: interaction.user.username,
                    interactionId: interaction.id,
                    error: deferError.message,
                    interactionState: {
                        replied: interaction.replied,
                        deferred: interaction.deferred
                    }
                });
                
                // If defer failed, don't proceed with chart generation
                return;
            }
            
            logger.debug('Successfully deferred reply, processing ephemeral chart request', {
                user: interaction.user.username,
                userId: interaction.user.id,
                ticker,
                channelId: interaction.channel.id,
                replyDeferred: true
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

            logger.debug('Sending chart as ephemeral response', {
                user: interaction.user.username,
                ticker,
                replyDeferred
            });

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
                errorStack: error.stack,
                replyDeferred,
                interactionState: {
                    replied: interaction.replied,
                    deferred: interaction.deferred
                }
            });
            
            // Send error message as ephemeral response
            const errorEmbed = new EmbedBuilder()
                .setTitle(`❌ Error: ${ticker}`)
                .setDescription(`Could not fetch data for **${ticker}**. Please check if the symbol is correct.`)
                .setColor(0xff4444);
                
            logger.debug('Attempting to send error response', {
                ticker,
                user: interaction.user.username,
                replyDeferred,
                interactionState: {
                    replied: interaction.replied,
                    deferred: interaction.deferred
                }
            });
                
            try {
                // Final safety check before sending error response
                if (interaction.replied && !replyDeferred) {
                    logger.warn('Cannot send error response: interaction already replied', {
                        ticker,
                        user: interaction.user.username
                    });
                    return;
                } else if (interaction.deferred && replyDeferred) {
                    // We already deferred, so use editReply
                    logger.debug('Using editReply for error response', { ticker });
                    await interaction.editReply({ embeds: [errorEmbed] });
                } else if (!interaction.replied && !interaction.deferred && !replyDeferred) {
                    // We haven't responded yet, so use reply
                    logger.debug('Using reply for error response', { ticker });
                    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                } else {
                    logger.warn('Ambiguous interaction state, cannot send error response', {
                        ticker,
                        user: interaction.user.username,
                        replied: interaction.replied,
                        deferred: interaction.deferred,
                        replyDeferred
                    });
                    return;
                }
                
                logger.debug('Successfully sent error response', { ticker, user: interaction.user.username });
                
            } catch (replyError) {
                // Only log the error, don't try to respond again
                logger.error('Failed to send ephemeral error message', {
                    ticker,
                    user: interaction.user.username,
                    originalError: error.message,
                    replyError: replyError.message,
                    replyDeferred,
                    interactionState: {
                        replied: interaction.replied,
                        deferred: interaction.deferred
                    }
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