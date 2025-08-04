/**
 * RetentionService - Handles 26-hour message cleanup and cache management
 */

const { logger } = require('../utils/logger');

class RetentionService {
    constructor(client, messageTrackingService, stockService, chartService, threadService = null, environment = null) {
        this.client = client;
        this.messageTrackingService = messageTrackingService;
        this.stockService = stockService;
        this.chartService = chartService;
        this.threadService = threadService;
        this.environment = environment;
        this.cleanupInterval = null;
        this.isRunning = false;
    }

    /**
     * Start the retention service with periodic cleanup
     * @param {number} intervalMinutes - How often to run cleanup (default: 60 minutes)
     */
    start(intervalMinutes = 60) {
        if (this.isRunning) {
            logger.warn('RetentionService is already running');
            return;
        }

        const intervalMs = intervalMinutes * 60 * 1000;
        const retentionHours = this.environment ? 
            this.environment.getMessageRetentionHours() : 26;
        
        logger.info('Starting RetentionService', {
            intervalMinutes,
            intervalMs,
            retentionHours
        });

        // Run initial cleanup
        this.runCleanup();

        // Schedule periodic cleanup
        this.cleanupInterval = setInterval(() => {
            this.runCleanup();
        }, intervalMs);

        this.isRunning = true;
        logger.success('RetentionService started successfully');
    }

    /**
     * Stop the retention service
     */
    stop() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        
        this.isRunning = false;
        logger.info('RetentionService stopped');
    }

    /**
     * Run cleanup process for expired messages
     */
    async runCleanup() {
        try {
            logger.debug('Starting retention cleanup cycle');
            
            const expiredMessages = this.messageTrackingService.getExpiredMessages();
            
            if (expiredMessages.length === 0) {
                logger.debug('No expired messages found');
                return;
            }

            logger.info('Processing expired messages', {
                count: expiredMessages.length
            });

            let successCount = 0;
            let errorCount = 0;

            for (const messageData of expiredMessages) {
                try {
                    await this.deleteMessageAndCleanup(messageData);
                    successCount++;
                } catch (error) {
                    logger.error('Failed to delete expired message', {
                        messageId: messageData.messageId,
                        channelId: messageData.channelId,
                        error: error.message
                    });
                    errorCount++;
                }
            }

            // Clean up old tracking data
            const cleanedTracking = this.messageTrackingService.cleanupTrackingData();

            logger.info('Retention cleanup completed', {
                messagesDeleted: successCount,
                errors: errorCount,
                trackingDataCleaned: cleanedTracking
            });

        } catch (error) {
            logger.error('Error during retention cleanup', {
                error: error.message,
                stack: error.stack
            });
        }
    }

    /**
     * Delete a specific message and clean up associated cache
     * @param {Object} messageData - Message data from tracking service
     */
    async deleteMessageAndCleanup(messageData) {
        const { messageId, channelId, cacheKeys, userId, threadId } = messageData;

        try {
            // Get the Discord channel
            const channel = await this.client.channels.fetch(channelId);
            
            if (!channel) {
                logger.warn('Channel not found for message deletion', {
                    channelId,
                    messageId
                });
                // Still clean up cache and tracking
                await this.cleanupCacheData(messageData);
                await this.cleanupThreadIfNeeded(messageData);
                this.messageTrackingService.untrackMessage(messageId);
                return;
            }

            // Try to fetch and delete the message
            try {
                const message = await channel.messages.fetch(messageId);
                await message.delete();
                
                logger.debug('Message deleted successfully', {
                    messageId,
                    channelId,
                    messageType: messageData.type
                });
            } catch (messageError) {
                // Message might already be deleted or bot lacks permissions
                if (messageError.code === 10008) { // Unknown Message
                    logger.debug('Message already deleted', { messageId });
                } else if (messageError.code === 50013) { // Missing Permissions
                    logger.warn('Missing permissions to delete message', {
                        messageId,
                        channelId
                    });
                } else {
                    throw messageError;
                }
            }

            // Clean up associated cache data
            await this.cleanupCacheData(messageData);

            // Clean up thread if this was the user's thread
            await this.cleanupThreadIfNeeded(messageData);

            // Remove from tracking
            this.messageTrackingService.untrackMessage(messageId);

        } catch (error) {
            logger.error('Failed to delete message and cleanup', {
                messageId,
                channelId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Clean up cache data associated with a message
     * @param {Object} messageData - Message data containing cache keys
     */
    async cleanupCacheData(messageData) {
        const { cacheKeys, ticker } = messageData;

        if (!cacheKeys || cacheKeys.length === 0) {
            return;
        }

        try {
            let cleanedCount = 0;

            for (const cacheKey of cacheKeys) {
                try {
                    // Try to clean from stock service cache
                    if (this.stockService && this.stockService.clearFromCache) {
                        const stockCleaned = this.stockService.clearFromCache(cacheKey);
                        if (stockCleaned) cleanedCount++;
                    }

                    // Try to clean from chart service cache
                    if (this.chartService && this.chartService.clearFromCache) {
                        const chartCleaned = this.chartService.clearFromCache(cacheKey);
                        if (chartCleaned) cleanedCount++;
                    }

                } catch (cacheError) {
                    logger.warn('Failed to clean cache entry', {
                        cacheKey,
                        error: cacheError.message
                    });
                }
            }

            if (cleanedCount > 0) {
                logger.debug('Cache data cleaned up', {
                    ticker,
                    cacheKeys: cacheKeys.length,
                    cleanedCount
                });
            }

        } catch (error) {
            logger.error('Error during cache cleanup', {
                ticker,
                cacheKeys: cacheKeys.length,
                error: error.message
            });
        }
    }

    /**
     * Clean up thread if needed based on message data
     * @param {Object} messageData - Message data containing thread information
     */
    async cleanupThreadIfNeeded(messageData) {
        const { userId, threadId, channelId } = messageData;

        if (!this.threadService || !userId) {
            return;
        }

        try {
            // Check if this user has any remaining tracked messages
            const allTrackedMessages = this.messageTrackingService.getAllTrackedMessages();
            const userMessages = allTrackedMessages.filter(msg => msg.userId === userId);

            if (userMessages.length <= 1) { // Only this message (or none left)
                // Remove user thread from tracking
                this.threadService.removeUserThread(userId);

                // Try to delete/archive the actual thread if we have threadId
                if (threadId) {
                    try {
                        const thread = await this.client.channels.fetch(threadId);
                        if (thread && thread.isThread()) {
                            await thread.delete();
                            logger.debug('Thread deleted successfully', {
                                threadId,
                                userId
                            });
                        }
                    } catch (threadError) {
                        if (threadError.code === 10008) { // Unknown Channel (thread already deleted)
                            logger.debug('Thread already deleted', { threadId });
                        } else if (threadError.code === 50013) { // Missing Permissions
                            logger.warn('Missing permissions to delete thread', {
                                threadId,
                                userId
                            });
                        } else {
                            logger.warn('Failed to delete thread', {
                                threadId,
                                userId,
                                error: threadError.message
                            });
                        }
                    }
                }

                logger.debug('Thread cleanup completed', { userId, threadId });
            }

        } catch (error) {
            logger.error('Error during thread cleanup', {
                userId,
                threadId,
                error: error.message
            });
        }
    }

    /**
     * Manually trigger cleanup (for testing or immediate cleanup)
     */
    async triggerCleanup() {
        logger.info('Manual cleanup triggered');
        await this.runCleanup();
    }

    /**
     * Get retention service status and statistics
     */
    getStatus() {
        const trackingStats = this.messageTrackingService.getStats();
        
        return {
            isRunning: this.isRunning,
            intervalActive: !!this.cleanupInterval,
            ...trackingStats
        };
    }

    /**
     * Get next cleanup time
     */
    getNextCleanupTime() {
        if (!this.isRunning || !this.cleanupInterval) {
            return null;
        }

        // This is approximate since we don't track exact interval timing
        const now = new Date();
        const nextCleanup = new Date(now.getTime() + (60 * 60 * 1000)); // Assume 60 min interval
        return nextCleanup;
    }
}

module.exports = RetentionService;