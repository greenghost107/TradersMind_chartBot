/**
 * Message Handler - Handles incoming Discord messages
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { detectStockTickers } = require('../utils/ticker-detector');
const { logger } = require('../utils/logger');

class MessageHandler {
    constructor(messageTrackingService = null) {
        this.messageTrackingService = messageTrackingService;
    }

    /**
     * Handle incoming Discord message
     */
    async handleMessage(message) {
        // Ignore bot messages
        if (message.author.bot) return;

        // Detect stock tickers in the message
        const tickers = detectStockTickers(message.content);
        
        if (tickers.length > 0) {
            logger.debug(`Detected tickers: ${tickers.join(', ')}`);
            
            try {
                // Create interactive buttons for detected tickers
                const actionRows = this.createTickerButtons(tickers);
                
                const buttonMessage = await message.reply({
                    components: actionRows
                });

                // Track button message for retention if tracking service is available
                if (this.messageTrackingService) {
                    this.messageTrackingService.trackButtonMessage(
                        buttonMessage.id,
                        message.channel.id,
                        tickers
                    );
                }

                logger.debug('Button message created and tracked', {
                    messageId: buttonMessage.id,
                    channelId: message.channel.id,
                    tickers: tickers.length
                });

            } catch (error) {
                logger.error('Error creating ticker buttons', {
                    tickers,
                    error: error.message
                });
                // Ignore reply errors - don't want to crash the bot
            }
        }
    }

    /**
     * Create interactive buttons for detected tickers
     */
    createTickerButtons(tickers) {
        const actionRows = [];
        const maxTickers = Math.min(tickers.length, 25); // Discord limit: max 5 rows * 5 buttons = 25
        
        for (let i = 0; i < maxTickers; i += 5) {
            const rowTickers = tickers.slice(i, i + 5);
            const stockButtons = rowTickers.map(ticker => 
                new ButtonBuilder()
                    .setCustomId(`stock_${ticker}`)
                    .setLabel(`📊 ${ticker}`)
                    .setStyle(ButtonStyle.Secondary)
            );
            
            const actionRow = new ActionRowBuilder().addComponents(stockButtons);
            actionRows.push(actionRow);
        }
        
        return actionRows;
    }

    /**
     * Validate if message should be processed
     */
    shouldProcessMessage(message) {
        // Don't process bot messages
        if (message.author.bot) return false;
        
        // Don't process empty messages
        if (!message.content || message.content.trim().length === 0) return false;
        
        // Don't process system messages
        if (message.system) return false;
        
        return true;
    }

    /**
     * Get statistics about ticker detection
     */
    getDetectionStats(message) {
        const tickers = detectStockTickers(message.content);
        
        return {
            messageLength: message.content.length,
            tickersDetected: tickers.length,
            tickers: tickers,
            uniqueTickers: [...new Set(tickers)].length,
            buttonsToCreate: Math.min(tickers.length, 25)
        };
    }
}

module.exports = MessageHandler;