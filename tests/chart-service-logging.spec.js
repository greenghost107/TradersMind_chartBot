/**
 * Chart Service Logging Tests
 * Tests logging functionality for user tracking and cache/generation source tracking
 */

const { test, expect } = require('@playwright/test');
const ChartService = require('../src/services/chartService');

// Mock Logger for capturing log calls
class MockLogger {
    constructor() {
        this.logs = [];
    }

    debug(message, data = null) {
        this.logs.push({ level: 'debug', message, data });
    }

    logWithPrefix(prefix, message, data = null) {
        this.logs.push({ level: 'info', prefix, message, data });
    }

    success(message, data = null) {
        this.logs.push({ level: 'success', message, data });
    }

    error(message, data = null) {
        this.logs.push({ level: 'error', message, data });
    }

    warn(message, data = null) {
        this.logs.push({ level: 'warn', message, data });
    }

    getLogs(level = null) {
        if (level) {
            return this.logs.filter(log => log.level === level);
        }
        return this.logs;
    }

    getLogsByMessage(messagePattern) {
        return this.logs.filter(log => 
            typeof log.message === 'string' && log.message.includes(messagePattern)
        );
    }

    clearLogs() {
        this.logs = [];
    }
}

// Mock Stock Service
class MockStockService {
    async fetchStockData(ticker) {
        return {
            symbol: ticker,
            currentPrice: '150.25',
            change: '2.15',
            changePercent: '1.45',
            dates: ['2024-01-01', '2024-01-02', '2024-01-03'],
            opens: [148.10, 150.00, 149.75],
            highs: [150.50, 151.25, 150.90],
            lows: [147.80, 149.50, 149.00],
            closes: [150.00, 149.75, 150.25],
            volumes: [1000000, 1200000, 950000],
            source: 'test_data'
        };
    }
}

// Sample stock data for testing
const sampleStockData = {
    symbol: 'AAPL',
    currentPrice: '185.25',
    change: '2.15',
    changePercent: '1.17',
    dates: ['2024-01-01', '2024-01-02', '2024-01-03'],
    opens: [180.00, 181.50, 183.00],
    highs: [182.50, 184.00, 185.50],
    lows: [179.50, 180.00, 181.50],
    closes: [181.50, 183.00, 185.25],
    volumes: [1000000, 1200000, 950000],
    source: 'test_data'
};

test.describe('Chart Service Logging Integration Tests', () => {
    let mockLogger;
    let mockStockService;
    let chartService;

    test.beforeEach(() => {
        // Replace the logger module with our mock
        mockLogger = new MockLogger();
        mockStockService = new MockStockService();
        
        // Mock the logger module
        jest.doMock('../src/utils/logger', () => ({
            logger: mockLogger
        }));
        
        // Create ChartService with mocked dependencies
        chartService = new ChartService(mockStockService);
        
        // Mock the browser operations to avoid actual chart generation
        chartService.generateChartHTML = () => '<html>Mock Chart</html>';
    });

    test.afterEach(() => {
        mockLogger.clearLogs();
        jest.clearAllMocks();
    });

    test('should log cache hit with user tracking information', async () => {
        const userId = 'user123';
        const channelId = 'channel456';
        const messageId = 'msg789';
        
        // First, populate the cache by mocking a cached chart
        const cacheKey = chartService.getChartCacheKey('AAPL');
        chartService.setInCache(cacheKey, Buffer.from('fake-chart-data'));
        
        try {
            // This should hit the cache
            await chartService.generateChart(sampleStockData, messageId, channelId, userId);
        } catch (error) {
            // Expected to fail due to mocked browser operations, but cache hit should be logged
        }
        
        // Verify cache hit was logged with user information
        const cacheLogs = mockLogger.getLogsByMessage('Chart retrieved from cache');
        expect(cacheLogs).toHaveLength(1);
        
        const cacheLog = cacheLogs[0];
        expect(cacheLog.level).toBe('debug');
        expect(cacheLog.data).toMatchObject({
            ticker: 'AAPL',
            userId: userId,
            channelId: channelId,
            source: 'cache',
            cacheKey: expect.stringContaining('chart_AAPL_')
        });
    });

    test('should log chart generation with user tracking information', async () => {
        const userId = 'user456';
        const channelId = 'channel789';
        const messageId = 'msg123';
        
        try {
            // This should generate a new chart (no cache)
            await chartService.generateChart(sampleStockData, messageId, channelId, userId);
        } catch (error) {
            // Expected to fail due to mocked browser operations
        }
        
        // Verify chart generation was logged with user information
        const generationLogs = mockLogger.getLogsByMessage('Generating candlestick chart');
        expect(generationLogs).toHaveLength(1);
        
        const generationLog = generationLogs[0];
        expect(generationLog.level).toBe('info');
        expect(generationLog.prefix).toBe('📊');
        expect(generationLog.message).toContain('AAPL');
        expect(generationLog.data).toMatchObject({
            userId: userId,
            channelId: channelId,
            source: 'generated',
            dataSource: 'test_data'
        });
    });

    test('should log error with user context when validation fails', async () => {
        const userId = 'user789';
        const channelId = 'channel123';
        const messageId = 'msg456';
        
        const invalidStockData = {
            symbol: 'INVALID',
            // Missing required fields
        };
        
        try {
            await chartService.generateChart(invalidStockData, messageId, channelId, userId);
        } catch (error) {
            // Expected to fail due to validation
        }
        
        // Verify error was logged with user information
        const errorLogs = mockLogger.getLogsByMessage('Stock data validation failed');
        expect(errorLogs).toHaveLength(1);
        
        const errorLog = errorLogs[0];
        expect(errorLog.level).toBe('error');
        expect(errorLog.data).toMatchObject({
            ticker: 'INVALID',
            userId: userId,
            channelId: channelId,
            error: expect.stringContaining('Missing required field')
        });
    });

    test('should handle missing user information gracefully', async () => {
        try {
            // Call without userId/channelId
            await chartService.generateChart(sampleStockData, null, null, null);
        } catch (error) {
            // Expected to fail due to mocked browser operations
        }
        
        // Verify logs still work with undefined user data
        const generationLogs = mockLogger.getLogsByMessage('Generating candlestick chart');
        expect(generationLogs).toHaveLength(1);
        
        const generationLog = generationLogs[0];
        expect(generationLog.data).toMatchObject({
            userId: null,
            channelId: null,
            source: 'generated',
            dataSource: 'test_data'
        });
    });
});

test.describe('Cache vs Generation Tracking Tests', () => {
    let mockLogger;
    let mockStockService;
    let chartService;

    test.beforeEach(() => {
        mockLogger = new MockLogger();
        mockStockService = new MockStockService();
        
        // Mock the logger module
        jest.doMock('../src/utils/logger', () => ({
            logger: mockLogger
        }));
        
        chartService = new ChartService(mockStockService);
        chartService.generateChartHTML = () => '<html>Mock Chart</html>';
    });

    test.afterEach(() => {
        mockLogger.clearLogs();
        jest.clearAllMocks();
    });

    test('should track cache vs generation sources correctly', async () => {
        const user1 = 'user1';
        const user2 = 'user2';
        const channelId = 'channel1';
        
        try {
            // First request should generate chart (cache miss)
            await chartService.generateChart(sampleStockData, 'msg1', channelId, user1);
        } catch (error) {
            // Expected to fail due to mocked browser
        }
        
        // Manually add to cache to simulate successful generation
        const cacheKey = chartService.getChartCacheKey('AAPL');
        chartService.setInCache(cacheKey, Buffer.from('chart-data'));
        
        try {
            // Second request should hit cache
            await chartService.generateChart(sampleStockData, 'msg2', channelId, user2);
        } catch (error) {
            // Expected behavior for cache hit
        }
        
        // Verify first request logged as 'generated'
        const generationLogs = mockLogger.getLogsByMessage('Generating candlestick chart');
        expect(generationLogs).toHaveLength(1);
        expect(generationLogs[0].data.source).toBe('generated');
        expect(generationLogs[0].data.userId).toBe(user1);
        
        // Verify second request logged as 'cache'
        const cacheLogs = mockLogger.getLogsByMessage('Chart retrieved from cache');
        expect(cacheLogs).toHaveLength(1);
        expect(cacheLogs[0].data.source).toBe('cache');
        expect(cacheLogs[0].data.userId).toBe(user2);
    });

    test('should track multiple users requesting same ticker', async () => {
        const users = ['user1', 'user2', 'user3'];
        const channelId = 'channel1';
        
        // Populate cache first
        const cacheKey = chartService.getChartCacheKey('AAPL');
        chartService.setInCache(cacheKey, Buffer.from('chart-data'));
        
        // Multiple users request same ticker
        for (let i = 0; i < users.length; i++) {
            try {
                await chartService.generateChart(sampleStockData, `msg${i}`, channelId, users[i]);
            } catch (error) {
                // Expected for cache hits
            }
        }
        
        // Verify all requests hit cache with different users
        const cacheLogs = mockLogger.getLogsByMessage('Chart retrieved from cache');
        expect(cacheLogs).toHaveLength(3);
        
        cacheLogs.forEach((log, index) => {
            expect(log.data.source).toBe('cache');
            expect(log.data.userId).toBe(users[index]);
            expect(log.data.ticker).toBe('AAPL');
        });
    });

    test('should validate cache efficiency logging shows usage patterns', async () => {
        const ticker1Data = { ...sampleStockData, symbol: 'MSFT' };
        const ticker2Data = { ...sampleStockData, symbol: 'GOOGL' };
        
        // Pre-populate cache for MSFT
        const msftCacheKey = chartService.getChartCacheKey('MSFT');
        chartService.setInCache(msftCacheKey, Buffer.from('msft-chart'));
        
        try {
            // MSFT should hit cache
            await chartService.generateChart(ticker1Data, 'msg1', 'ch1', 'user1');
            // GOOGL should miss cache and generate
            await chartService.generateChart(ticker2Data, 'msg2', 'ch1', 'user1');
        } catch (error) {
            // Expected due to mocked browser
        }
        
        const allLogs = mockLogger.getLogs();
        const cacheHits = allLogs.filter(log => log.data && log.data.source === 'cache');
        const generations = allLogs.filter(log => log.data && log.data.source === 'generated');
        
        // MSFT should have cache hit
        expect(cacheHits).toHaveLength(1);
        expect(cacheHits[0].data.ticker).toBe('MSFT');
        
        // GOOGL should have generation attempt
        expect(generations).toHaveLength(1);
        expect(generations[0].data && generations[0].message.includes('GOOGL')).toBeTruthy();
    });
});