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
        this.channels = new Map();
        this.deletedMessages = [];
    }

    async fetchChannel(channelId) {
        return this.channels.get(channelId);
    }

    get channels() {
        return {
            fetch: async (channelId) => {
                return this.channels.get(channelId);
            }
        };
    }
}

// Mock Discord channel
class MockDiscordChannel {
    constructor(id) {
        this.id = id;
        this.messages = new Map();
        this.deletedMessages = [];
    }

    get messages() {
        return {
            fetch: async (messageId) => {
                const message = this.messages.get(messageId);
                if (!message) {
                    const error = new Error('Unknown Message');
                    error.code = 10008;
                    throw error;
                }
                return message;
            }
        };
    }

    createMockMessage(messageId, content = 'test message') {
        const message = {
            id: messageId,
            content,
            delete: async () => {
                this.messages.delete(messageId);
                this.deletedMessages.push(messageId);
                return true;
            }
        };
        this.messages.set(messageId, message);
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

// Utility function to create messages with specific timestamps
function createMessageWithAge(messageTrackingService, ageInHours, messageId = null, ticker = 'AAPL') {
    const id = messageId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const channelId = 'test_channel_123';
    const userId = 'test_user_456';
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
    
    // Directly insert into tracking service (bypassing normal tracking)
    messageTrackingService.trackedMessages.set(id, messageData);
    messageTrackingService.messageToCache.set(id, cacheKeys);
    
    return { messageId: id, channelId, userId, ticker, cacheKeys };
}

test.describe('Retention Policy Tests', () => {
    let mockEnvironment;
    let messageTrackingService;
    let retentionService;
    let mockClient;
    let mockChannel;
    let mockStockService;
    let mockChartService;

    test.beforeEach(() => {
        // Setup mock environment with 2-hour retention for fast testing
        mockEnvironment = new MockEnvironment(2);
        
        // Setup services
        messageTrackingService = new MessageTrackingService(mockEnvironment);
        mockStockService = new MockStockService();
        mockChartService = new MockChartService();
        
        // Setup mock Discord client and channel
        mockClient = new MockDiscordClient();
        mockChannel = new MockDiscordChannel('test_channel_123');
        mockClient.channels.set('test_channel_123', mockChannel);
        
        retentionService = new RetentionService(
            mockClient, 
            messageTrackingService, 
            mockStockService, 
            mockChartService,
            mockEnvironment
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
            
            // Verify cache was cleaned up
            expect(mockStockService.clearedKeys).toHaveLength(1);
            expect(mockChartService.clearedKeys).toHaveLength(1);
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
            
            // Verify cache cleanup for all
            expect(mockStockService.clearedKeys).toHaveLength(5);
            expect(mockChartService.clearedKeys).toHaveLength(5);
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
});