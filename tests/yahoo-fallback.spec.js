const { test, expect } = require('@playwright/test');

// Create mock implementations for dependencies
class MockAxios {
    static get = null; // Will be set in tests
}

class MockYahooFinance {
    static historical = null; // Will be set in tests
    static quote = null; // Will be set in tests
}

class MockLogger {
    static debug() {}
    static info() {}
    static warn() {}
    static error() {}
    static logWithPrefix() {}
}

// Create a testable version of StockService with dependency injection
class TestableStockService {
    constructor(axios, yahooFinance, logger) {
        this.stockCache = new Map();
        this.apiKey = 'test_api_key';
        this.axios = axios;
        this.yahooFinance = yahooFinance;
        this.logger = logger;
        this.yahooService = new TestableYahooFinanceService(yahooFinance, logger);
    }

    getCacheKey(ticker) {
        const today = new Date().toISOString().split('T')[0];
        return `${ticker}_${today}`;
    }

    isCacheValid(cacheEntry) {
        if (!cacheEntry) return false;
        const today = new Date().toISOString().split('T')[0];
        const cacheDate = new Date(cacheEntry.timestamp).toISOString().split('T')[0];
        return cacheDate === today;
    }

    async fetchStockData(ticker) {
        // Check cache first
        const cacheKey = this.getCacheKey(ticker);
        const cachedData = this.stockCache.get(cacheKey);
        
        if (cachedData && this.isCacheValid(cachedData)) {
            this.logger.debug('Using cached stock data', { ticker });
            return cachedData.stockData;
        }
        
        // Try Alpha Vantage first
        try {
            const stockData = await this.fetchFromAlphaVantage(ticker);
            
            // Cache the fresh data
            this.stockCache.set(cacheKey, {
                stockData,
                chartBuffer: null,
                timestamp: new Date()
            });
            
            this.logger.logWithPrefix('💾', `Cached fresh data for ${ticker} (Alpha Vantage)`);
            return stockData;
            
        } catch (alphaError) {
            this.logger.warn('Alpha Vantage failed, trying Yahoo Finance fallback', {
                ticker,
                alphaError: alphaError.message
            });
            
            // Fallback to Yahoo Finance
            try {
                const stockData = await this.yahooService.fetchStockData(ticker);
                
                // Cache the fallback data
                this.stockCache.set(cacheKey, {
                    stockData,
                    chartBuffer: null,
                    timestamp: new Date()
                });
                
                this.logger.logWithPrefix('💾', `Cached fresh data for ${ticker} (Yahoo Finance fallback)`);
                return stockData;
                
            } catch (yahooError) {
                this.logger.error('Both data sources failed', {
                    ticker,
                    alphaError: alphaError.message,
                    yahooError: yahooError.message
                });
                throw new Error(`Failed to fetch data for ${ticker}: Alpha Vantage (${alphaError.message}), Yahoo Finance (${yahooError.message})`);
            }
        }
    }

    async fetchFromAlphaVantage(ticker) {
        this.logger.logWithPrefix('🌐', `Fetching fresh data for ${ticker} from Alpha Vantage`);
        
        if (!this.apiKey) {
            throw new Error('Alpha Vantage API key not configured');
        }

        const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${ticker}&apikey=${this.apiKey}&outputsize=compact`;
        const response = await this.axios.get(url);
        const data = response.data;
        
        if (data['Error Message']) {
            throw new Error('Stock not found');
        }

        if (data['Note']) {
            throw new Error('API rate limit exceeded');
        }

        const timeSeries = data['Time Series (Daily)'];
        const metaData = data['Meta Data'];
        
        if (!timeSeries) {
            throw new Error('No data available');
        }

        const dates = Object.keys(timeSeries).slice(0, 30).reverse();
        const prices = dates.map(date => parseFloat(timeSeries[date]['4. close']));
        const volumes = dates.map(date => parseInt(timeSeries[date]['5. volume']));
        
        const latestDate = Object.keys(timeSeries)[0];
        const latestData = timeSeries[latestDate];
        const currentPrice = parseFloat(latestData['4. close']);
        const previousPrice = parseFloat(timeSeries[Object.keys(timeSeries)[1]]['4. close']);
        const change = currentPrice - previousPrice;
        const changePercent = ((change / previousPrice) * 100).toFixed(2);

        return {
            symbol: ticker,
            currentPrice: currentPrice.toFixed(2),
            change: change.toFixed(2),
            changePercent,
            dates,
            prices,
            volumes,
            company: metaData['2. Symbol'],
            source: 'alphavantage'
        };
    }
}

class TestableYahooFinanceService {
    constructor(yahooFinance, logger) {
        this.yahooFinance = yahooFinance;
        this.logger = logger;
    }

    async fetchStockData(ticker) {
        try {
            this.logger.logWithPrefix('🟡', `Fetching data from Yahoo Finance for ${ticker}`);
            
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 30);
            
            const historicalData = await this.yahooFinance.historical(ticker, {
                period1: startDate,
                period2: endDate,
                interval: '1d'
            });
            
            if (!historicalData || historicalData.length === 0) {
                throw new Error('No historical data available');
            }
            
            const quote = await this.yahooFinance.quote(ticker);
            
            if (!quote) {
                throw new Error('No quote data available');
            }
            
            return this.transformYahooData(ticker, historicalData, quote);
            
        } catch (error) {
            this.logger.error('Yahoo Finance API error', {
                ticker,
                error: error.message
            });
            throw new Error(`Yahoo Finance error: ${error.message}`);
        }
    }

    transformYahooData(ticker, historicalData, quote) {
        const sortedData = historicalData
            .filter(day => day.close !== null && day.close !== undefined)
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .slice(-30);
        
        if (sortedData.length < 2) {
            throw new Error('Insufficient historical data');
        }
        
        const dates = sortedData.map(day => day.date.toISOString().split('T')[0]);
        const prices = sortedData.map(day => parseFloat(day.close));
        const volumes = sortedData.map(day => parseInt(day.volume) || 0);
        
        const currentPrice = quote.regularMarketPrice || quote.price || prices[prices.length - 1];
        const previousPrice = prices[prices.length - 2];
        const change = currentPrice - previousPrice;
        const changePercent = ((change / previousPrice) * 100).toFixed(2);
        
        return {
            symbol: ticker.toUpperCase(),
            currentPrice: currentPrice.toFixed(2),
            change: change.toFixed(2),
            changePercent,
            dates,
            prices,
            volumes,
            company: quote.shortName || quote.longName || ticker,
            source: 'yahoo'
        };
    }
}

// Sample data for mocking
const mockAlphaVantageRateLimit = {
    data: {
        "Note": "Thank you for using Alpha Vantage! Our standard API rate limit is 25 requests per day."
    }
};

const mockYahooHistoricalData = [
    {
        date: new Date('2024-01-01'),
        close: 148.10,
        volume: 1000000
    },
    {
        date: new Date('2024-01-02'),
        close: 149.50,
        volume: 1100000
    },
    {
        date: new Date('2024-01-03'),
        close: 150.25,
        volume: 950000
    }
];

const mockYahooQuote = {
    regularMarketPrice: 150.25,
    shortName: 'Apple Inc.',
    longName: 'Apple Inc.'
};

test.describe('Yahoo Finance Fallback Tests', () => {
    let stockService;
    let mockAxios;
    let mockYahooFinance;
    let mockLogger;

    test.beforeEach(() => {
        // Create fresh mock instances for each test
        mockAxios = {
            get: async () => ({ data: {} })
        };
        
        mockYahooFinance = {
            historical: async () => [],
            quote: async () => ({})
        };
        
        mockLogger = MockLogger;
        
        // Create testable service with injected dependencies
        stockService = new TestableStockService(mockAxios, mockYahooFinance, mockLogger);
    });

    test.describe('Alpha Vantage Rate Limit Fallback', () => {
        test('should fallback to Yahoo Finance when Alpha Vantage hits rate limit', async () => {
            // Mock Alpha Vantage rate limit response
            mockAxios.get = async () => mockAlphaVantageRateLimit;
            
            // Mock Yahoo Finance success response
            mockYahooFinance.historical = async () => mockYahooHistoricalData;
            mockYahooFinance.quote = async () => mockYahooQuote;
            
            // Fetch stock data
            const result = await stockService.fetchStockData('AAPL');
            
            // Verify result structure matches expected format
            expect(result).toMatchObject({
                symbol: 'AAPL',
                currentPrice: expect.any(String),
                change: expect.any(String),
                changePercent: expect.any(String),
                dates: expect.any(Array),
                prices: expect.any(Array),
                volumes: expect.any(Array),
                company: expect.any(String),
                source: 'yahoo'
            });
            
            // Verify data values
            expect(result.currentPrice).toBe('150.25');
            expect(result.symbol).toBe('AAPL');
            expect(result.dates).toHaveLength(3);
            expect(result.prices).toEqual([148.10, 149.50, 150.25]);
        });

        test('should handle Alpha Vantage stock not found with Yahoo fallback', async () => {
            // Mock Alpha Vantage "stock not found" response
            mockAxios.get = async () => ({
                data: {
                    "Error Message": "Invalid API call. Please retry or visit the documentation."
                }
            });
            
            // Mock Yahoo Finance success response
            mockYahooFinance.historical = async () => mockYahooHistoricalData;
            mockYahooFinance.quote = async () => mockYahooQuote;
            
            const result = await stockService.fetchStockData('AAPL');
            
            // Should still get valid data from Yahoo
            expect(result.source).toBe('yahoo');
            expect(result.symbol).toBe('AAPL');
        });

        test('should throw error when both Alpha Vantage and Yahoo Finance fail', async () => {
            // Mock Alpha Vantage failure
            mockAxios.get = async () => mockAlphaVantageRateLimit;
            
            // Mock Yahoo Finance failure
            mockYahooFinance.historical = async () => {
                throw new Error('Yahoo service unavailable');
            };
            
            // Should throw error with details from both services
            await expect(stockService.fetchStockData('INVALID')).rejects.toThrow();
        });
    });

    test.describe('Yahoo Finance Service Standalone', () => {
        let yahooService;

        test.beforeEach(() => {
            yahooService = new TestableYahooFinanceService(mockYahooFinance, mockLogger);
        });

        test('should fetch and transform Yahoo Finance data correctly', async () => {
            // Mock Yahoo Finance responses
            mockYahooFinance.historical = async () => mockYahooHistoricalData;
            mockYahooFinance.quote = async () => mockYahooQuote;
            
            const result = await yahooService.fetchStockData('AAPL');
            
            // Verify transformation
            expect(result).toMatchObject({
                symbol: 'AAPL',
                currentPrice: '150.25',
                change: expect.any(String),
                changePercent: expect.any(String),
                dates: ['2024-01-01', '2024-01-02', '2024-01-03'],
                prices: [148.10, 149.50, 150.25],
                volumes: [1000000, 1100000, 950000],
                company: 'Apple Inc.',
                source: 'yahoo'
            });
            
            // Verify calculated change
            const expectedChange = (150.25 - 149.50).toFixed(2);
            const expectedChangePercent = (((150.25 - 149.50) / 149.50) * 100).toFixed(2);
            expect(result.change).toBe(expectedChange);
            expect(result.changePercent).toBe(expectedChangePercent);
        });

        test('should handle Yahoo Finance service unavailable', async () => {
            mockYahooFinance.historical = async () => {
                throw new Error('Network error');
            };
            
            await expect(yahooService.fetchStockData('AAPL')).rejects.toThrow(
                'Yahoo Finance error: Network error'
            );
        });

        test('should handle empty historical data', async () => {
            mockYahooFinance.historical = async () => [];
            
            await expect(yahooService.fetchStockData('INVALID')).rejects.toThrow(
                'No historical data available'
            );
        });
    });

    test.describe('Integration Test - Complete Flow', () => {
        test('should handle complete flow: rate limit -> Yahoo fallback -> chart generation', async () => {
            // Mock Alpha Vantage rate limit
            mockAxios.get = async () => mockAlphaVantageRateLimit;
            
            // Mock Yahoo Finance success
            mockYahooFinance.historical = async () => mockYahooHistoricalData;
            mockYahooFinance.quote = async () => mockYahooQuote;
            
            // Test complete flow
            const stockData = await stockService.fetchStockData('AAPL');
            
            // Verify the data can be used for chart generation
            expect(stockData.dates).toHaveLength(3);
            expect(stockData.prices).toHaveLength(3);
            expect(stockData.symbol).toBe('AAPL');
            expect(stockData.source).toBe('yahoo');
            
            // Verify data is cached
            const cachedData = stockService.stockCache.get('AAPL_' + new Date().toISOString().split('T')[0]);
            expect(cachedData).toBeDefined();
            expect(cachedData.stockData.source).toBe('yahoo');
            
            // Verify subsequent calls use cache 
            const cachedResult = await stockService.fetchStockData('AAPL');
            expect(cachedResult).toEqual(stockData);
        });

        test('should prefer Alpha Vantage when available', async () => {
            // Mock successful Alpha Vantage response
            mockAxios.get = async () => ({
                data: {
                    'Meta Data': {
                        '2. Symbol': 'AAPL'
                    },
                    'Time Series (Daily)': {
                        '2024-01-03': {
                            '4. close': '150.25',
                            '5. volume': '950000'
                        },
                        '2024-01-02': {
                            '4. close': '149.50',
                            '5. volume': '1100000'
                        },
                        '2024-01-01': {
                            '4. close': '148.10',
                            '5. volume': '1000000'
                        }
                    }
                }
            });
            
            const result = await stockService.fetchStockData('AAPL');
            
            // Should use Alpha Vantage
            expect(result.source).toBe('alphavantage');
        });
    });
});