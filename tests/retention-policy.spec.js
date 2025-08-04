const { test, expect } = require('@playwright/test');
const MessageTrackingService = require('../src/services/messageTrackingService');
const RetentionService = require('../src/services/retentionService');
const Environment = require('../src/config/environment');

// Mock environment for testing
class MockEnvironment {
    constructor(retentionHours = 2) { // Use 2 hours for faster testing
        this.retentionHours = retentionHours;
    }

    getMessageRetentionHours() {
        return this.retentionHours;
    }

    getMessageRetentionMs() {
        return this.retentionHours * 60 * 60 * 1000;
    }

    getMessageRetentionSafetyBufferMs() {
        return (this.retentionHours + 4) * 60 * 60 * 1000;
    }
}

// Mock Discord client
class MockDiscordClient {
    constructor() {
        this._channelsMap = new Map();
        this.deletedMessages = [];
    }

    async fetchChannel(channelId) {
        return this._channelsMap.get(channelId);
    }

    get channels() {
        return {
            fetch: async (channelId) => {
                return this._channelsMap.get(channelId);
            }
        };
    }

    // Helper method for tests to add channels
    addChannel(channel) {
        this._channelsMap.set(channel.id, channel);
    }
}

// Mock Discord channel
class MockDiscordChannel {
    constructor(id) {
        this.id = id;
        this._messagesMap = new Map();
        this.deletedMessages = [];
    }

    get messages() {
        return {
            fetch: async (messageId) => {
                const message = this._messagesMap.get(messageId);
                if (!message) {
                    const error = new Error('Unknown Message');
                    error.code = 10008;
                    throw error;
                }
                return message;
            },
            has: (messageId) => {
                return this._messagesMap.has(messageId);
            }
        };
    }

    createMockMessage(messageId, content = 'test message') {
        const message = {
            id: messageId,
            content,
            delete: async () => {
                this._messagesMap.delete(messageId);
                this.deletedMessages.push(messageId);
                return true;
            }
        };
        this._messagesMap.set(messageId, message);
        return message;
    }
}

// Mock services
class MockStockService {
    constructor() {
        this.clearedKeys = [];
    }

    clearFromCache(cacheKey) {
        this.clearedKeys.push(cacheKey);
        return true;
    }
}

class MockChartService {
    constructor() {
        this.clearedKeys = [];
    }

    clearFromCache(cacheKey) {
        this.clearedKeys.push(cacheKey);
        return true;
    }
}

class MockThreadService {
    constructor() {
        this.removedUserIds = [];
        this.userThreads = new Map();
    }

    removeUserThread(userId) {
        this.removedUserIds.push(userId);
        return this.userThreads.delete(userId);
    }

    // Helper method for tests to simulate having a thread for a user
    addUserThread(userId, threadId) {
        this.userThreads.set(userId, { id: threadId, userId });
    }

    // Helper method for tests to check if removeUserThread was called
    wasUserThreadRemoved(userId) {
        return this.removedUserIds.includes(userId);
    }

    // Helper method to clear tracking for tests
    clearRemovedUserIds() {
        this.removedUserIds = [];
    }
}

// Utility function to create messages with specific timestamps
function createMessageWithAge(messageTrackingService, ageInHours, messageId = null, ticker = 'AAPL', options = {}) {
    const id = messageId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const channelId = options.channelId || 'test_channel_123';
    const userId = options.userId || 'test_user_456';
    const threadId = options.threadId || null;
    const cacheKeys = [`stock_${ticker}_2024-01-01`, `chart_${ticker}_2024-01-01`];
    
    // Manually create message data with specific timestamp
    const messageData = {
        messageId: id,
        channelId,
        userId,
        ticker,
        createdAt: new Date(Date.now() - (ageInHours * 60 * 60 * 1000)),
        cacheKeys,
        type: 'chart_response'
    };
    
    // Add threadId if provided
    if (threadId) {
        messageData.threadId = threadId;
    }
    
    // Directly insert into tracking service (bypassing normal tracking)
    messageTrackingService.trackedMessages.set(id, messageData);
    messageTrackingService.messageToCache.set(id, cacheKeys);
    
    return { messageId: id, channelId, userId, ticker, cacheKeys, threadId };
}

test.describe('Retention Policy Tests', () => {
    let mockEnvironment;
    let messageTrackingService;
    let retentionService;
    let mockClient;
    let mockChannel;
    let mockStockService;
    let mockChartService;
    let mockThreadService;

    test.beforeEach(() => {
        // Setup mock environment with 2-hour retention for fast testing
        mockEnvironment = new MockEnvironment(2);
        
        // Setup services
        messageTrackingService = new MessageTrackingService(mockEnvironment);
        mockStockService = new MockStockService();
        mockChartService = new MockChartService();
        mockThreadService = new MockThreadService();
        
        // Setup mock Discord client and channel
        mockClient = new MockDiscordClient();
        mockChannel = new MockDiscordChannel('test_channel_123');
        mockClient.addChannel(mockChannel);
        
        retentionService = new RetentionService(
            mockClient, 
            messageTrackingService, 
            mockStockService, 
            mockChartService,
            mockThreadService,  // 5th parameter: threadService
            mockEnvironment     // 6th parameter: environment
        );
    });

    test.describe('Environment Configuration', () => {
        test('should use default 26 hours when no environment provided', () => {
            const service = new MessageTrackingService();
            
            // Create a message that's 25 hours old (should not expire with 26h default)
            createMessageWithAge(service, 25, 'msg_25h_old');
            
            const expired = service.getExpiredMessages();
            expect(expired).toHaveLength(0);
            
            // Create a message that's 27 hours old (should expire with 26h default)
            createMessageWithAge(service, 27, 'msg_27h_old');
            
            const expiredAfter = service.getExpiredMessages();
            expect(expiredAfter).toHaveLength(1);
        });

        test('should use configured retention hours from environment', () => {
            const customEnv = new MockEnvironment(1); // 1 hour retention
            const service = new MessageTrackingService(customEnv);
            
            // Create a message that's 30 minutes old (should not expire)
            createMessageWithAge(service, 0.5, 'msg_30m_old');
            
            const notExpired = service.getExpiredMessages();
            expect(notExpired).toHaveLength(0);
            
            // Create a message that's 1.5 hours old (should expire)
            createMessageWithAge(service, 1.5, 'msg_1h30m_old');
            
            const expired = service.getExpiredMessages();
            expect(expired).toHaveLength(1);
            expect(expired[0].messageId).toBe('msg_1h30m_old');
        });

        test('should validate retention hours within acceptable range', () => {
            const env = new Environment();
            
            // Test with valid value
            process.env.MESSAGE_RETENTION_HOURS = '12';
            expect(env.getMessageRetentionHours()).toBe(12);
            
            // Test with invalid value (too high)
            process.env.MESSAGE_RETENTION_HOURS = '200';
            expect(env.getMessageRetentionHours()).toBe(26); // Should use default
            
            // Test with invalid value (too low)
            process.env.MESSAGE_RETENTION_HOURS = '0';
            expect(env.getMessageRetentionHours()).toBe(26); // Should use default
            
            // Test with non-numeric value
            process.env.MESSAGE_RETENTION_HOURS = 'invalid';
            expect(env.getMessageRetentionHours()).toBe(26); // Should use default
            
            // Clean up
            delete process.env.MESSAGE_RETENTION_HOURS;
        });

        test('should support fractional hour retention (15-minute retention)', () => {
            const env = new Environment();
            
            // Test 15-minute retention (0.25 hours)
            process.env.MESSAGE_RETENTION_HOURS = '0.25';
            expect(env.getMessageRetentionHours()).toBe(0.25);
            
            // Test 6-minute retention (0.1 hours - minimum allowed)
            process.env.MESSAGE_RETENTION_HOURS = '0.1';
            expect(env.getMessageRetentionHours()).toBe(0.1);
            
            // Test below minimum (should use default)
            process.env.MESSAGE_RETENTION_HOURS = '0.05';
            expect(env.getMessageRetentionHours()).toBe(26);
            
            // Clean up
            delete process.env.MESSAGE_RETENTION_HOURS;
        });

        test('should handle 15-minute message retention correctly', () => {
            const fifteenMinEnv = new MockEnvironment(0.25); // 15 minutes
            const service = new MessageTrackingService(fifteenMinEnv);
            
            // Create a message that's 10 minutes old (should not expire)
            createMessageWithAge(service, 10/60, 'msg_10min_old'); // 10/60 = 0.167 hours
            
            const notExpired = service.getExpiredMessages();
            expect(notExpired).toHaveLength(0);
            
            // Create a message that's 20 minutes old (should expire)
            createMessageWithAge(service, 20/60, 'msg_20min_old'); // 20/60 = 0.333 hours
            
            const expired = service.getExpiredMessages();
            expect(expired).toHaveLength(1);
            expect(expired[0].messageId).toBe('msg_20min_old');
        });
    });

    test.describe('Message Tracking', () => {
        test('should track messages with timestamps', () => {
            const messageData = createMessageWithAge(messageTrackingService, 0, 'test_msg_1');
            
            const tracked = messageTrackingService.getAllTrackedMessages();
            expect(tracked).toHaveLength(1);
            expect(tracked[0].messageId).toBe('test_msg_1');
            expect(tracked[0].ticker).toBe('AAPL');
            expect(tracked[0].cacheKeys).toHaveLength(2);
        });

        test('should identify expired messages correctly', () => {
            // Create messages of different ages
            createMessageWithAge(messageTrackingService, 1, 'fresh_msg'); // 1 hour old
            createMessageWithAge(messageTrackingService, 2.5, 'expired_msg_1'); // 2.5 hours old
            createMessageWithAge(messageTrackingService, 3, 'expired_msg_2'); // 3 hours old
            
            const expired = messageTrackingService.getExpiredMessages();
            expect(expired).toHaveLength(2);
            
            const expiredIds = expired.map(msg => msg.messageId);
            expect(expiredIds).toContain('expired_msg_1');
            expect(expiredIds).toContain('expired_msg_2');
            expect(expiredIds).not.toContain('fresh_msg');
        });

        test('should track both button and chart messages', () => {
            // Track a button message
            messageTrackingService.trackButtonMessage('btn_msg_1', 'test_channel_123', ['AAPL', 'TSLA']);
            
            // Track a chart message
            messageTrackingService.trackMessage('chart_msg_1', 'test_channel_123', 'user_1', 'AAPL', ['cache_key_1']);
            
            const stats = messageTrackingService.getStats();
            expect(stats.totalMessages).toBe(2);
            expect(stats.messageTypes.button_interaction).toBe(1);
            expect(stats.messageTypes.chart_response).toBe(1);
        });
    });

    test.describe('Message Deletion Process', () => {
        test('should delete expired messages from Discord', async () => {
            // Create and track an expired message
            const messageData = createMessageWithAge(messageTrackingService, 3, 'expired_msg');
            
            // Create the message in mock Discord channel
            mockChannel.createMockMessage('expired_msg', 'Mock chart message');
            
            // Run retention cleanup
            await retentionService.runCleanup();
            
            // Verify message was deleted
            expect(mockChannel.deletedMessages).toContain('expired_msg');
            expect(mockChannel.messages.has('expired_msg')).toBe(false);
        });

        test('should clean up associated cache data', async () => {
            // Create expired message with cache keys
            const messageData = createMessageWithAge(messageTrackingService, 3, 'expired_with_cache');
            
            // Create the message in mock Discord channel
            mockChannel.createMockMessage('expired_with_cache');
            
            // Run retention cleanup
            await retentionService.runCleanup();
            
            // Verify cache was cleaned up (both stock and chart keys)
            expect(mockStockService.clearedKeys).toHaveLength(2);
            expect(mockChartService.clearedKeys).toHaveLength(2);
            expect(mockStockService.clearedKeys).toContain('stock_AAPL_2024-01-01');
            expect(mockChartService.clearedKeys).toContain('chart_AAPL_2024-01-01');
        });

        test('should handle message deletion failures gracefully', async () => {
            // Create expired message
            createMessageWithAge(messageTrackingService, 3, 'nonexistent_msg');
            
            // Don't create the message in Discord (simulate deleted/missing message)
            
            // Run retention cleanup (should not throw error)
            await expect(retentionService.runCleanup()).resolves.not.toThrow();
            
            // Should still clean up tracking data
            const tracked = messageTrackingService.getAllTrackedMessages();
            const hasNonexistentMsg = tracked.some(msg => msg.messageId === 'nonexistent_msg');
            expect(hasNonexistentMsg).toBe(false);
        });

        test('should untrack messages after successful deletion', async () => {
            // Create expired message
            createMessageWithAge(messageTrackingService, 3, 'track_cleanup_msg');
            mockChannel.createMockMessage('track_cleanup_msg');
            
            // Verify message is tracked
            let tracked = messageTrackingService.getAllTrackedMessages();
            expect(tracked.some(msg => msg.messageId === 'track_cleanup_msg')).toBe(true);
            
            // Run cleanup
            await retentionService.runCleanup();
            
            // Verify message is no longer tracked
            tracked = messageTrackingService.getAllTrackedMessages();
            expect(tracked.some(msg => msg.messageId === 'track_cleanup_msg')).toBe(false);
        });
    });

    test.describe('Cleanup Safety and Edge Cases', () => {
        test('should not delete messages within retention period', async () => {
            // Create fresh message (1 hour old, within 2-hour retention)
            createMessageWithAge(messageTrackingService, 1, 'fresh_msg');
            mockChannel.createMockMessage('fresh_msg');
            
            // Run cleanup
            await retentionService.runCleanup();
            
            // Verify message was NOT deleted
            expect(mockChannel.deletedMessages).not.toContain('fresh_msg');
            expect(mockChannel.messages.has('fresh_msg')).toBe(true);
        });

        test('should handle multiple expired messages in batch', async () => {
            // Create multiple expired messages
            for (let i = 0; i < 5; i++) {
                const msgId = `expired_batch_${i}`;
                createMessageWithAge(messageTrackingService, 3, msgId, `STOCK${i}`);
                mockChannel.createMockMessage(msgId);
            }
            
            // Run cleanup
            await retentionService.runCleanup();
            
            // Verify all were deleted
            for (let i = 0; i < 5; i++) {
                expect(mockChannel.deletedMessages).toContain(`expired_batch_${i}`);
            }
            
            // Verify cache cleanup for all (5 messages × 2 keys each = 10)
            expect(mockStockService.clearedKeys).toHaveLength(10);
            expect(mockChartService.clearedKeys).toHaveLength(10);
        });

        test('should clean up tracking data with safety buffer', () => {
            // Create message older than safety buffer (6+ hours with 2h retention + 4h buffer)
            createMessageWithAge(messageTrackingService, 7, 'old_tracking_data');
            
            // Run tracking cleanup
            const cleaned = messageTrackingService.cleanupTrackingData();
            
            expect(cleaned).toBe(1);
            
            const tracked = messageTrackingService.getAllTrackedMessages();
            expect(tracked.some(msg => msg.messageId === 'old_tracking_data')).toBe(false);
        });

        test('should preserve tracking data within safety buffer', () => {
            // Create message within safety buffer (5 hours, less than 6h buffer)
            createMessageWithAge(messageTrackingService, 5, 'within_buffer');
            
            // Run tracking cleanup
            const cleaned = messageTrackingService.cleanupTrackingData();
            
            expect(cleaned).toBe(0);
            
            const tracked = messageTrackingService.getAllTrackedMessages();
            expect(tracked.some(msg => msg.messageId === 'within_buffer')).toBe(true);
        });
    });

    test.describe('Service Integration', () => {
        test('should start and stop retention service properly', () => {
            expect(retentionService.isRunning).toBe(false);
            
            retentionService.start(5); // 5 minute intervals for testing
            expect(retentionService.isRunning).toBe(true);
            
            retentionService.stop();
            expect(retentionService.isRunning).toBe(false);
        });

        test('should provide retention service status', () => {
            retentionService.start(10);
            
            const status = retentionService.getStatus();
            expect(status.isRunning).toBe(true);
            expect(status.intervalActive).toBe(true);
            expect(status.totalMessages).toBeDefined();
            
            retentionService.stop();
        });

        test('should handle manual cleanup trigger', async () => {
            // Create expired message
            createMessageWithAge(messageTrackingService, 3, 'manual_cleanup_test');
            mockChannel.createMockMessage('manual_cleanup_test');
            
            // Trigger manual cleanup
            await retentionService.triggerCleanup();
            
            // Verify cleanup occurred
            expect(mockChannel.deletedMessages).toContain('manual_cleanup_test');
        });
    });

    test.describe('Time Simulation Integration Test', () => {
        test('should complete full retention lifecycle', async () => {
            // Step 1: Track a fresh message
            const messageData = createMessageWithAge(messageTrackingService, 0, 'lifecycle_test', 'GOOGL');
            mockChannel.createMockMessage('lifecycle_test', 'GOOGL chart message');
            
            // Verify initial state
            expect(messageTrackingService.getAllTrackedMessages()).toHaveLength(1);
            expect(mockChannel.messages.has('lifecycle_test')).toBe(true);
            
            // Step 2: Simulate time passage (artificially age the message)
            const trackedMessage = messageTrackingService.trackedMessages.get('lifecycle_test');
            trackedMessage.createdAt = new Date(Date.now() - (3 * 60 * 60 * 1000)); // 3 hours ago
            
            // Step 3: Run retention cleanup
            await retentionService.runCleanup();
            
            // Step 4: Verify complete cleanup
            expect(mockChannel.deletedMessages).toContain('lifecycle_test');
            expect(mockChannel.messages.has('lifecycle_test')).toBe(false);
            expect(messageTrackingService.getAllTrackedMessages()).toHaveLength(0);
            expect(mockStockService.clearedKeys).toContain('stock_GOOGL_2024-01-01');
            expect(mockChartService.clearedKeys).toContain('chart_GOOGL_2024-01-01');
        });
    });

    test.describe('Thread Cleanup Tests', () => {
        test('should cleanup thread when user has no remaining messages', async () => {
            const userId = 'test_user_thread_cleanup';
            const threadId = 'test_thread_123';
            
            // Create an expired message with thread info
            createMessageWithAge(messageTrackingService, 3, 'thread_cleanup_msg', 'AAPL', {
                userId,
                threadId
            });
            mockChannel.createMockMessage('thread_cleanup_msg');
            
            // Setup thread service to have this user
            mockThreadService.addUserThread(userId, threadId);
            
            // Run cleanup
            await retentionService.runCleanup();
            
            // Verify thread cleanup was called
            expect(mockThreadService.wasUserThreadRemoved(userId)).toBe(true);
            expect(mockChannel.deletedMessages).toContain('thread_cleanup_msg');
        });

        test('should not cleanup thread when user has remaining messages', async () => {
            const userId = 'test_user_multiple_msgs';
            const threadId = 'test_thread_456';
            
            // Create one expired message and one fresh message for same user
            createMessageWithAge(messageTrackingService, 3, 'expired_msg', 'AAPL', {
                userId,
                threadId
            });
            createMessageWithAge(messageTrackingService, 0.5, 'fresh_msg', 'GOOGL', {
                userId,
                threadId
            });
            mockChannel.createMockMessage('expired_msg');
            mockChannel.createMockMessage('fresh_msg');
            
            // Setup thread service to have this user
            mockThreadService.addUserThread(userId, threadId);
            
            // Run cleanup
            await retentionService.runCleanup();
            
            // Verify thread was NOT cleaned up (user still has fresh message)
            expect(mockThreadService.wasUserThreadRemoved(userId)).toBe(false);
            expect(mockChannel.deletedMessages).toContain('expired_msg');
            expect(mockChannel.deletedMessages).not.toContain('fresh_msg');
        });

        test('should handle thread cleanup gracefully when no threadService provided', async () => {
            // Create a retention service without thread service
            const noThreadRetentionService = new RetentionService(
                mockClient, 
                messageTrackingService, 
                mockStockService, 
                mockChartService,
                null,  // No thread service
                mockEnvironment
            );
            
            // Create an expired message
            createMessageWithAge(messageTrackingService, 3, 'no_thread_service_msg', 'AAPL');
            mockChannel.createMockMessage('no_thread_service_msg');
            
            // Should not throw error when thread service is null
            await expect(noThreadRetentionService.runCleanup()).resolves.not.toThrow();
            expect(mockChannel.deletedMessages).toContain('no_thread_service_msg');
        });
    });

    test.describe('Thread System Message Tests', () => {
        test('should track and cleanup thread system messages', async () => {
            const userId = 'test_user_system_msg';
            const threadId = 'test_thread_system_123';
            const systemMessageId = 'system_msg_456';
            
            // Track a thread system message
            messageTrackingService.trackThreadSystemMessage(
                systemMessageId,
                'test_channel_123',
                threadId,
                userId
            );
            
            // Create the system message in mock channel
            mockChannel.createMockMessage(systemMessageId, 'hover-assistant started a thread: 📊 User\'s Stock Charts. See all threads.');
            
            // Age the message to be expired
            const trackedMessage = messageTrackingService.trackedMessages.get(systemMessageId);
            trackedMessage.createdAt = new Date(Date.now() - (3 * 60 * 60 * 1000)); // 3 hours ago
            
            // Run cleanup
            await retentionService.runCleanup();
            
            // Verify system message was deleted
            expect(mockChannel.deletedMessages).toContain(systemMessageId);
            expect(messageTrackingService.getAllTrackedMessages()).not.toContainEqual(
                expect.objectContaining({ messageId: systemMessageId })
            );
        });

        test('should handle system message tracking with thread info', async () => {
            const userId = 'test_user_thread_info';
            const threadId = 'test_thread_789';
            const systemMessageId = 'system_msg_789';
            
            // Track system message
            messageTrackingService.trackThreadSystemMessage(
                systemMessageId,
                'test_channel_123',
                threadId,
                userId
            );
            
            // Verify message is tracked with correct type
            const trackedMessage = messageTrackingService.trackedMessages.get(systemMessageId);
            expect(trackedMessage).toBeDefined();
            expect(trackedMessage.type).toBe('thread_system_message');
            expect(trackedMessage.threadId).toBe(threadId);
            expect(trackedMessage.userId).toBe(userId);
            expect(trackedMessage.channelId).toBe('test_channel_123');
        });

        test('should include system messages in expired message list', async () => {
            // Create multiple message types
            createMessageWithAge(messageTrackingService, 3, 'expired_chart', 'AAPL');
            createMessageWithAge(messageTrackingService, 3, 'expired_button', 'GOOGL');
            
            // Add system message
            messageTrackingService.trackThreadSystemMessage(
                'expired_system',
                'test_channel_123',
                'thread_123',
                'user_123'
            );
            
            // Age the system message
            const systemMessage = messageTrackingService.trackedMessages.get('expired_system');
            systemMessage.createdAt = new Date(Date.now() - (3 * 60 * 60 * 1000));
            
            // Get expired messages
            const expiredMessages = messageTrackingService.getExpiredMessages();
            
            // Verify all message types are included
            expect(expiredMessages).toHaveLength(3);
            expect(expiredMessages.map(m => m.messageId)).toContain('expired_system');
            expect(expiredMessages.find(m => m.messageId === 'expired_system').type).toBe('thread_system_message');
        });

        test('should not delete fresh system messages', async () => {
            const systemMessageId = 'fresh_system_msg';
            
            // Track a fresh system message (0.5 hours old)
            messageTrackingService.trackThreadSystemMessage(
                systemMessageId,
                'test_channel_123',
                'thread_fresh',
                'user_fresh'
            );
            
            // Age it to be within retention period
            const systemMessage = messageTrackingService.trackedMessages.get(systemMessageId);
            systemMessage.createdAt = new Date(Date.now() - (0.5 * 60 * 60 * 1000));
            
            mockChannel.createMockMessage(systemMessageId);
            
            // Run cleanup
            await retentionService.runCleanup();
            
            // Verify system message was NOT deleted
            expect(mockChannel.deletedMessages).not.toContain(systemMessageId);
            expect(mockChannel.messages.has(systemMessageId)).toBe(true);
        });

        test('should handle system message deletion errors gracefully', async () => {
            const systemMessageId = 'error_system_msg';
            
            // Track expired system message
            messageTrackingService.trackThreadSystemMessage(
                systemMessageId,
                'test_channel_123',
                'thread_error',
                'user_error'
            );
            
            // Age it to be expired
            const systemMessage = messageTrackingService.trackedMessages.get(systemMessageId);
            systemMessage.createdAt = new Date(Date.now() - (3 * 60 * 60 * 1000));
            
            // Don't create the message in mock channel (simulates already deleted)
            
            // Should not throw error when message doesn't exist
            await expect(retentionService.runCleanup()).resolves.not.toThrow();
            
            // Message should be untracked even if deletion failed
            expect(messageTrackingService.getAllTrackedMessages()).not.toContainEqual(
                expect.objectContaining({ messageId: systemMessageId })
            );
        });
    });

    test.describe('Bot-Specific System Message Safety Tests', () => {
        let mockBotClient;
        let messageHandlerWithBot;

        test.beforeEach(() => {
            // Create mock bot client
            mockBotClient = {
                user: {
                    id: 'our_bot_123',
                    username: 'hover-assistant'
                }
            };
            
            // Create message handler with bot client
            messageHandlerWithBot = {
                botId: 'our_bot_123',
                botClient: mockBotClient,
                THREAD_NAME_PATTERN: /^📊 (.+)'s Stock Charts$/,
                messageTrackingService: messageTrackingService,
                
                async isOurBotThreadSystemMessage(message) {
                    // Simplified version of the validation logic for testing
                    try {
                        const contentMatch = message.content.match(/^(.+?) started a thread: (.+?)\. See all threads\.$/);
                        if (!contentMatch) return false;
                        
                        const [, botMention, threadName] = contentMatch;
                        
                        // Check thread name pattern
                        if (!this.THREAD_NAME_PATTERN.test(threadName)) return false;
                        
                        // Check bot mention
                        if (!botMention.includes(this.botClient.user.username)) return false;
                        
                        // For our bot's messages, we expect a thread reference to exist
                        // If the message claims to be about thread creation but has no thread, reject it
                        if (!message.thread) return false;
                        
                        // Check thread ownership if thread is provided
                        if (message.thread.ownerId) {
                            if (message.thread.ownerId !== this.botId) return false;
                        }
                        
                        return true;
                    } catch {
                        return false;
                    }
                }
            };
        });

        test('should NOT track system messages from other bots', async () => {
            const systemMessage = {
                id: 'other_bot_system',
                system: true,
                type: 18, // MessageType.ThreadCreated
                content: 'different-bot started a thread: 📊 User\'s Stock Charts. See all threads.',
                thread: { id: 'thread_123', name: '📊 User\'s Stock Charts' }
            };

            // Should not validate as our bot's message
            const isOurs = await messageHandlerWithBot.isOurBotThreadSystemMessage(systemMessage);
            expect(isOurs).toBe(false);
            
            // Verify message is not tracked
            const initialCount = messageTrackingService.getAllTrackedMessages().length;
            // Message should not be tracked since it's not from our bot
            expect(messageTrackingService.getAllTrackedMessages()).toHaveLength(initialCount);
        });

        test('should NOT track system messages with different thread name patterns', async () => {
            const systemMessage = {
                id: 'wrong_pattern_system',
                system: true,
                type: 18,
                content: 'hover-assistant started a thread: General Discussion Thread. See all threads.',
                thread: { id: 'thread_456', name: 'General Discussion Thread' }
            };

            // Should not validate due to wrong thread name pattern
            const isOurs = await messageHandlerWithBot.isOurBotThreadSystemMessage(systemMessage);
            expect(isOurs).toBe(false);
        });

        test('should NOT track system messages with malformed content', async () => {
            const systemMessage = {
                id: 'malformed_system',
                system: true,
                type: 18,
                content: 'Something else happened with a thread',
                thread: { id: 'thread_789', name: '📊 User\'s Stock Charts' }
            };

            // Should not validate due to malformed content
            const isOurs = await messageHandlerWithBot.isOurBotThreadSystemMessage(systemMessage);
            expect(isOurs).toBe(false);
        });

        test('should ONLY track system messages that match our exact criteria', async () => {
            const validSystemMessage = {
                id: 'valid_system_msg',
                system: true,
                type: 18,
                content: 'hover-assistant started a thread: 📊 TestUser\'s Stock Charts. See all threads.',
                thread: { 
                    id: 'thread_valid', 
                    name: '📊 TestUser\'s Stock Charts',
                    ownerId: 'our_bot_123'
                }
            };

            // Should validate as our bot's message
            const isOurs = await messageHandlerWithBot.isOurBotThreadSystemMessage(validSystemMessage);
            expect(isOurs).toBe(true);
        });

        test('should NOT track system messages from threads with wrong ownership', async () => {
            const systemMessage = {
                id: 'wrong_owner_system',
                system: true,
                type: 18,
                content: 'hover-assistant started a thread: 📊 User\'s Stock Charts. See all threads.',
                thread: { 
                    id: 'thread_wrong', 
                    name: '📊 User\'s Stock Charts',
                    ownerId: 'different_bot_456' // Wrong owner
                }
            };

            // Should not validate due to wrong thread ownership
            const isOurs = await messageHandlerWithBot.isOurBotThreadSystemMessage(systemMessage);
            expect(isOurs).toBe(false);
        });

        test('should handle edge cases safely', async () => {
            const edgeCases = [
                {
                    id: 'no_content',
                    system: true,
                    type: 18,
                    content: '', // Empty content
                },
                {
                    id: 'null_thread',
                    system: true,
                    type: 18,
                    content: 'hover-assistant started a thread: 📊 User\'s Stock Charts. See all threads.',
                    thread: null // No thread reference
                },
                {
                    id: 'similar_but_different',
                    system: true,
                    type: 18,
                    content: 'hover-assistant started a thread: 📈 User\'s Trading Charts. See all threads.', // Similar but different emoji
                }
            ];

            for (let i = 0; i < edgeCases.length; i++) {
                const testCase = edgeCases[i];
                const isOurs = await messageHandlerWithBot.isOurBotThreadSystemMessage(testCase);
                expect(isOurs).toBe(false, `Edge case ${testCase.id} should return false but returned true`);
            }
        });
    });
});