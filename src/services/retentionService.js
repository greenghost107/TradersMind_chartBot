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
        this.cleanupCycleCount = 0;
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
            this.cleanupCycleCount++;
            logger.debug('Starting retention cleanup cycle', { cycleCount: this.cleanupCycleCount });
            
            const expiredMessages = this.messageTrackingService.getExpiredMessages();
            
            if (expiredMessages.length === 0) {
                logger.debug('No expired messages found');
                
                // Still run periodic orphaned thread cleanup even if no expired messages
                if (this.cleanupCycleCount % 6 === 0) {
                    try {
                        const channelIds = new Set(
                            this.messageTrackingService.getAllTrackedMessages()
                                .map(msg => msg.channelId)
                                .filter(id => id)
                        );

                        for (const channelId of channelIds) {
                            await this.cleanupOrphanedThreads(channelId);
                        }
                    } catch (orphanError) {
                        logger.warn('Error during orphaned thread cleanup', { error: orphanError.message });
                    }
                }
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

            // Run orphaned thread cleanup periodically (every 6th cleanup cycle ~= 6 hours)
            if (this.cleanupCycleCount % 6 === 0) {
                try {
                    // Get all unique channel IDs from tracked messages to clean up orphaned threads
                    const channelIds = new Set(
                        this.messageTrackingService.getAllTrackedMessages()
                            .map(msg => msg.channelId)
                            .filter(id => id)
                    );

                    for (const channelId of channelIds) {
                        await this.cleanupOrphanedThreads(channelId);
                    }
                } catch (orphanError) {
                    logger.warn('Error during orphaned thread cleanup', { error: orphanError.message });
                }
            }

            logger.info('Retention cleanup completed', {
                messagesDeleted: successCount,
                errors: errorCount,
                trackingDataCleaned: cleanedTracking,
                cycleCount: this.cleanupCycleCount
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
        const { messageId, channelId, cacheKeys, userId, threadId, isEphemeral } = messageData;

        try {
            // Handle ephemeral messages differently - they auto-expire and can't be deleted
            if (isEphemeral) {
                logger.debug('Skipping deletion for ephemeral message (auto-expires)', {
                    messageId,
                    channelId,
                    messageType: messageData.type
                });
                
                // Still clean up cache and tracking for ephemeral messages
                await this.cleanupCacheData(messageData);
                await this.cleanupThreadIfNeeded(messageData);
                this.messageTrackingService.untrackMessage(messageId);
                return;
            }

            // Get the Discord channel for regular messages
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

            // Try to fetch and delete the regular message
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

                // Try to delete the actual thread - use multiple strategies
                let threadToDelete = null;
                
                // Strategy 1: Use provided threadId
                if (threadId) {
                    try {
                        threadToDelete = await this.client.channels.fetch(threadId);
                    } catch (error) {
                        logger.debug('Could not fetch thread by threadId', { threadId, error: error.message });
                    }
                }
                
                // Strategy 2: If no threadId or fetch failed, search by thread name pattern
                if (!threadToDelete && channelId) {
                    try {
                        const parentChannel = await this.client.channels.fetch(channelId);
                        if (parentChannel && parentChannel.threads) {
                            const activeThreads = await parentChannel.threads.fetchActive();
                            const archivedThreads = await parentChannel.threads.fetchArchived();
                            
                            // Combine active and archived threads
                            const allThreads = new Map([...activeThreads.threads, ...archivedThreads.threads]);
                            
                            // Look for thread with our pattern and matching user
                            const threadPattern = /^📊 (.+)'s Stock Charts$/;
                            for (const [id, thread] of allThreads) {
                                if (threadPattern.test(thread.name)) {
                                    // Try to match the user by checking thread ownership or recent messages
                                    const botId = this.client.user?.id;
                                    if (botId && thread.ownerId === botId) {
                                        try {
                                            const messages = await thread.messages.fetch({ limit: 5 });
                                            const hasUserMessages = messages.some(msg => 
                                                allTrackedMessages.some(tracked => 
                                                    tracked.messageId === msg.id && tracked.userId === userId
                                                )
                                            );
                                            if (hasUserMessages) {
                                                threadToDelete = thread;
                                                logger.debug('Found thread by pattern matching', { 
                                                    threadId: thread.id, 
                                                    threadName: thread.name,
                                                    userId 
                                                });
                                                break;
                                            }
                                        } catch (msgError) {
                                            logger.debug('Could not check thread messages', { 
                                                threadId: thread.id, 
                                                error: msgError.message 
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    } catch (error) {
                        logger.debug('Could not search threads by pattern', { channelId, error: error.message });
                    }
                }

                // Attempt thread deletion
                if (threadToDelete && threadToDelete.isThread()) {
                    try {
                        await threadToDelete.delete();
                        logger.debug('Thread deleted successfully', {
                            threadId: threadToDelete.id,
                            threadName: threadToDelete.name,
                            userId
                        });
                    } catch (threadError) {
                        if (threadError.code === 10008) { // Unknown Channel (thread already deleted)
                            logger.debug('Thread already deleted', { threadId: threadToDelete.id });
                        } else if (threadError.code === 50013) { // Missing Permissions
                            logger.warn('Missing permissions to delete thread', {
                                threadId: threadToDelete.id,
                                userId
                            });
                        } else {
                            logger.warn('Failed to delete thread', {
                                threadId: threadToDelete.id,
                                userId,
                                error: threadError.message
                            });
                        }
                    }
                } else {
                    logger.debug('No thread found to delete', { userId, providedThreadId: threadId });
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
     * Find and clean up orphaned threads (threads without tracked messages)
     * @param {string} channelId - Channel ID to search for orphaned threads
     */
    async cleanupOrphanedThreads(channelId) {
        if (!this.threadService) {
            return;
        }

        try {
            logger.debug('Starting orphaned thread cleanup', { channelId });

            const channel = await this.client.channels.fetch(channelId);
            if (!channel || !channel.threads) {
                return;
            }

            // Fetch all threads (active and archived)
            const activeThreads = await channel.threads.fetchActive();
            const archivedThreads = await channel.threads.fetchArchived();
            const allThreads = new Map([...activeThreads.threads, ...archivedThreads.threads]);

            const allTrackedMessages = this.messageTrackingService.getAllTrackedMessages();
            const threadPattern = /^📊 (.+)'s Stock Charts$/;
            let cleanedCount = 0;

            for (const [threadId, thread] of allThreads) {
                // Only process our bot's threads
                const botId = this.client.user?.id;
                if (!threadPattern.test(thread.name) || !botId || thread.ownerId !== botId) {
                    continue;
                }

                try {
                    // Check if this thread has any tracked messages
                    const hasTrackedMessages = allTrackedMessages.some(msg => msg.threadId === threadId);
                    
                    // If no tracked messages, check if thread has any recent content
                    if (!hasTrackedMessages) {
                        const messages = await thread.messages.fetch({ limit: 10 });
                        const hasUserContent = messages.some(msg => 
                            !msg.system && 
                            msg.author.id !== this.client.user?.id &&
                            (Date.now() - msg.createdTimestamp) < (2 * 60 * 60 * 1000) // 2 hours
                        );

                        // Only delete threads that are truly empty/old
                        if (!hasUserContent && thread.archived) {
                            await thread.delete();
                            cleanedCount++;
                            logger.debug('Deleted orphaned thread', {
                                threadId,
                                threadName: thread.name,
                                archived: thread.archived,
                                messageCount: messages.size
                            });
                        }
                    }
                } catch (error) {
                    logger.debug('Error checking thread for orphaned cleanup', {
                        threadId,
                        threadName: thread.name,
                        error: error.message
                    });
                }
            }

            if (cleanedCount > 0) {
                logger.info('Orphaned thread cleanup completed', {
                    channelId,
                    threadsDeleted: cleanedCount
                });
            }

        } catch (error) {
            logger.error('Error during orphaned thread cleanup', {
                channelId,
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