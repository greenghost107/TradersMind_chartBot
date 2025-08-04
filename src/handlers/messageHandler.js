/**
 * Message Handler - Handles incoming Discord messages
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageType } = require('discord.js');
const { detectStockTickers } = require('../utils/ticker-detector');
const { logger } = require('../utils/logger');

class MessageHandler {
    constructor(messageTrackingService = null, botClient = null) {
        this.messageTrackingService = messageTrackingService;
        this.botClient = botClient;
        this.botId = botClient?.user?.id || null;
        
        // Our bot's specific thread name pattern
        this.THREAD_NAME_PATTERN = /^📊 (.+)'s Stock Charts$/;
    }

    /**
     * Handle incoming Discord message
     */
    async handleMessage(message) {
        // Handle thread system messages first (only those created by our bot)
        if (message.system && message.type === MessageType.ThreadCreated) {
            // Only process if this system message is about our bot's thread creation
            if (await this.isOurBotThreadSystemMessage(message)) {
                await this.handleThreadSystemMessage(message);
            }
            return;
        }

        // Ignore other bot messages
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
     * Check if a thread system message is related to our bot's thread creation
     */
    async isOurBotThreadSystemMessage(message) {
        try {
            // First, check if we have a bot ID to validate against
            if (!this.botId) {
                logger.warn('Bot ID not available for system message validation');
                return false;
            }

            // Extract the bot name from the system message content
            // Format: "botname started a thread: 📊 Username's Stock Charts. See all threads."
            const contentMatch = message.content.match(/^(.+?) started a thread: (.+?)\. See all threads\.$/);
            if (!contentMatch) {
                logger.debug('System message does not match expected format', {
                    content: message.content
                });
                return false;
            }

            const [, botMention, threadName] = contentMatch;
            
            // Verify the thread name matches our specific pattern
            if (!this.THREAD_NAME_PATTERN.test(threadName)) {
                logger.debug('Thread name does not match our pattern', {
                    threadName,
                    pattern: this.THREAD_NAME_PATTERN.toString()
                });
                return false;
            }

            // For our bot's messages, we expect a thread reference to exist
            // If the message claims to be about thread creation but has no thread, reject it
            if (!message.thread) {
                logger.debug('System message has no thread reference', {
                    messageId: message.id,
                    content: message.content
                });
                return false;
            }
            
            // Check if our bot is the thread owner/creator
            const thread = message.thread;
            if (thread.ownerId && thread.ownerId !== this.botId) {
                logger.debug('Thread not owned by our bot', {
                    threadOwnerId: thread.ownerId,
                    ourBotId: this.botId
                });
                return false;
            }
            
            // Double-check the thread name pattern
            if (!this.THREAD_NAME_PATTERN.test(thread.name)) {
                logger.debug('Thread object name does not match our pattern', {
                    threadName: thread.name
                });
                return false;
            }

            // Additional safety: check if the bot mention in the message refers to our bot
            // This is a more complex check since the mention could be in different formats
            const botUser = this.botClient?.user;
            if (botUser && botMention !== botUser.username && !botMention.includes(botUser.id)) {
                logger.debug('Bot mention does not match our bot', {
                    mentionedBot: botMention,
                    ourBotUsername: botUser.username,
                    ourBotId: botUser.id
                });
                return false;
            }

            logger.debug('System message validated as ours', {
                messageId: message.id,
                threadName: contentMatch[2]
            });
            
            return true;

        } catch (error) {
            logger.error('Error validating system message ownership', {
                messageId: message.id,
                error: error.message
            });
            return false;
        }
    }

    /**
     * Handle Discord thread system messages
     */
    async handleThreadSystemMessage(message) {
        if (!this.messageTrackingService) return;

        try {
            // Extract thread info from the system message
            const threadInfo = this.extractThreadInfoFromSystemMessage(message);
            
            if (threadInfo) {
                // Track the system message for retention cleanup
                this.messageTrackingService.trackThreadSystemMessage(
                    message.id,
                    message.channel.id,
                    threadInfo.threadId,
                    threadInfo.userId
                );

                logger.debug('Thread system message tracked', {
                    messageId: message.id,
                    channelId: message.channel.id,
                    threadId: threadInfo.threadId,
                    userId: threadInfo.userId
                });
            }
        } catch (error) {
            logger.error('Error handling thread system message', {
                messageId: message.id,
                error: error.message
            });
        }
    }

    /**
     * Extract thread information from Discord system message
     */
    extractThreadInfoFromSystemMessage(message) {
        try {
            // The thread should be available in the message reference
            if (message.thread) {
                return {
                    threadId: message.thread.id,
                    threadName: message.thread.name,
                    userId: message.thread.ownerId || null
                };
            }

            // Fallback: try to parse from message content
            // Format: "username started a thread: Thread Name. See all threads."
            const match = message.content.match(/^(.+?) started a thread: (.+?)\. See all threads\./);
            if (match) {
                return {
                    threadId: null, // Will need to be resolved later
                    threadName: match[2],
                    userId: null    // Will need to be resolved later
                };
            }
        } catch (error) {
            logger.warn('Failed to extract thread info from system message', {
                messageId: message.id,
                content: message.content,
                error: error.message
            });
        }

        return null;
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