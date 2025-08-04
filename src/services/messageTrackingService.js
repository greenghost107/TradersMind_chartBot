/**
 * MessageTrackingService - Tracks bot-created messages for retention management
 */

const { logger } = require('../utils/logger');

class MessageTrackingService {
    constructor(environment = null) {
        this.trackedMessages = new Map();
        this.messageToCache = new Map();
        this.environment = environment;
    }

    /**
     * Track a bot-created message with metadata
     * @param {string} messageId - Discord message ID
     * @param {string} channelId - Discord channel ID
     * @param {string} userId - User who triggered the message
     * @param {string} ticker - Stock ticker associated with the message
     * @param {Array} cacheKeys - Cache keys to clean up when message is deleted
     * @param {string} threadId - Thread ID if message was sent to a thread
     */
    trackMessage(messageId, channelId, userId, ticker, cacheKeys = [], threadId = null) {
        const messageData = {
            messageId,
            channelId,
            userId,
            ticker,
            threadId,
            createdAt: new Date(),
            cacheKeys,
            type: 'chart_response'
        };

        this.trackedMessages.set(messageId, messageData);
        
        // Store cache mapping for quick lookup
        cacheKeys.forEach(cacheKey => {
            if (!this.messageToCache.has(messageId)) {
                this.messageToCache.set(messageId, []);
            }
            this.messageToCache.get(messageId).push(cacheKey);
        });

        logger.debug('Message tracked for retention', {
            messageId,
            channelId,
            userId,
            ticker,
            cacheKeys: cacheKeys.length
        });
    }

    /**
     * Track a button interaction message
     * @param {string} messageId - Discord message ID
     * @param {string} channelId - Discord channel ID
     * @param {Array} tickers - Detected tickers in the message
     */
    trackButtonMessage(messageId, channelId, tickers) {
        const messageData = {
            messageId,
            channelId,
            tickers,
            createdAt: new Date(),
            cacheKeys: [],
            type: 'button_interaction'
        };

        this.trackedMessages.set(messageId, messageData);
        
        logger.debug('Button message tracked for retention', {
            messageId,
            channelId,
            tickers
        });
    }

    /**
     * Track a thread system message created by Discord
     * @param {string} messageId - Discord message ID
     * @param {string} channelId - Discord channel ID
     * @param {string} threadId - Thread ID that was created
     * @param {string} userId - User who created the thread
     */
    trackThreadSystemMessage(messageId, channelId, threadId, userId) {
        const messageData = {
            messageId,
            channelId,
            threadId,
            userId,
            createdAt: new Date(),
            cacheKeys: [],
            type: 'thread_system_message'
        };

        this.trackedMessages.set(messageId, messageData);
        
        logger.debug('Thread system message tracked for retention', {
            messageId,
            channelId,
            threadId,
            userId
        });
    }

    /**
     * Get all messages that should be deleted (older than configured retention period)
     * @returns {Array} Array of message data that should be deleted
     */
    getExpiredMessages() {
        const now = new Date();
        const retentionMs = this.environment ? 
            this.environment.getMessageRetentionMs() : 
            (26 * 60 * 60 * 1000); // Default 26 hours
        
        const cutoffTime = new Date(now.getTime() - retentionMs);
        
        const expiredMessages = [];
        
        for (const [messageId, messageData] of this.trackedMessages) {
            if (messageData.createdAt < cutoffTime) {
                expiredMessages.push(messageData);
            }
        }
        
        logger.debug('Found expired messages for cleanup', {
            count: expiredMessages.length,
            cutoffTime: cutoffTime.toISOString(),
            retentionHours: retentionMs / (60 * 60 * 1000)
        });
        
        return expiredMessages;
    }

    /**
     * Get cache keys associated with a message
     * @param {string} messageId - Discord message ID
     * @returns {Array} Array of cache keys to clean up
     */
    getCacheKeysForMessage(messageId) {
        return this.messageToCache.get(messageId) || [];
    }

    /**
     * Remove tracking for a message (after successful deletion)
     * @param {string} messageId - Discord message ID
     */
    untrackMessage(messageId) {
        const messageData = this.trackedMessages.get(messageId);
        
        if (messageData) {
            // Clean up cache mapping
            this.messageToCache.delete(messageId);
            
            // Remove from tracked messages
            this.trackedMessages.delete(messageId);
            
            logger.debug('Message untracked', {
                messageId,
                type: messageData.type
            });
        }
    }

    /**
     * Get all tracked messages (for debugging)
     * @returns {Array} Array of all tracked message data
     */
    getAllTrackedMessages() {
        return Array.from(this.trackedMessages.values());
    }

    /**
     * Get tracking statistics
     * @returns {Object} Statistics about tracked messages
     */
    getStats() {
        const totalMessages = this.trackedMessages.size;
        const totalCacheEntries = Array.from(this.messageToCache.values())
            .reduce((total, keys) => total + keys.length, 0);
        
        const messageTypes = {};
        for (const messageData of this.trackedMessages.values()) {
            messageTypes[messageData.type] = (messageTypes[messageData.type] || 0) + 1;
        }
        
        return {
            totalMessages,
            totalCacheEntries,
            messageTypes
        };
    }

    /**
     * Clean up old tracking data (for messages older than retention + safety buffer)
     */
    cleanupTrackingData() {
        const now = new Date();
        const safetyBufferMs = this.environment ? 
            this.environment.getMessageRetentionSafetyBufferMs() :
            (30 * 60 * 60 * 1000); // Default 30 hours
        
        const cutoffTime = new Date(now.getTime() - safetyBufferMs);
        
        let cleaned = 0;
        
        for (const [messageId, messageData] of this.trackedMessages) {
            if (messageData.createdAt < cutoffTime) {
                this.untrackMessage(messageId);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            logger.info('Cleaned up old tracking data', { 
                messagesRemoved: cleaned,
                cutoffTime: cutoffTime.toISOString()
            });
        }
        
        return cleaned;
    }
}

module.exports = MessageTrackingService;