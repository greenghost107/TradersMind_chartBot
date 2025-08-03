/**
 * Stock Service - Handles stock data fetching and caching
 */

const axios = require('axios');
const { logger } = require('../utils/logger');

class StockService {
    constructor() {
        this.stockCache = new Map();
        this.apiKey = process.env.ALPHA_VANTAGE_API_KEY;
        
        // Auto-cleanup expired cache entries every hour
        setInterval(() => this.cleanupExpiredCache(), 3600000);
    }

    /**
     * Generate cache key for a ticker
     */
    getCacheKey(ticker) {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        return `${ticker}_${today}`;
    }

    /**
     * Check if cache entry is still valid (same day)
     */
    isCacheValid(cacheEntry) {
        if (!cacheEntry) return false;
        
        const today = new Date().toISOString().split('T')[0];
        const cacheDate = new Date(cacheEntry.timestamp).toISOString().split('T')[0];
        
        return cacheDate === today;
    }

    /**
     * Clean up expired cache entries
     */
    cleanupExpiredCache() {
        logger.debug('Cleaning up expired stock cache entries');
        const today = new Date().toISOString().split('T')[0];
        let cleaned = 0;
        
        for (const [key, entry] of this.stockCache.entries()) {
            const cacheDate = new Date(entry.timestamp).toISOString().split('T')[0];
            if (cacheDate !== today) {
                this.stockCache.delete(key);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            logger.debug('Cleaned up expired stock cache entries', { 
                entriesRemoved: cleaned 
            });
        }
        
        return cleaned;
    }

    /**
     * Fetch stock data with caching
     */
    async fetchStockData(ticker) {
        // Check cache first
        const cacheKey = this.getCacheKey(ticker);
        const cachedData = this.stockCache.get(cacheKey);
        
        if (cachedData && this.isCacheValid(cachedData)) {
            logger.debug('Using cached stock data', { ticker });
            return cachedData.stockData;
        }
        
        try {
            logger.logWithPrefix('🌐', `Fetching fresh data for ${ticker}`);
            
            if (!this.apiKey) {
                throw new Error('API key not configured');
            }

            const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${ticker}&apikey=${this.apiKey}&outputsize=compact`;
            const response = await axios.get(url);
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

            const stockData = {
                symbol: ticker,
                currentPrice: currentPrice.toFixed(2),
                change: change.toFixed(2),
                changePercent,
                dates,
                prices,
                volumes,
                company: metaData['2. Symbol']
            };
            
            // Cache the fresh data
            this.stockCache.set(cacheKey, {
                stockData,
                chartBuffer: null, // Will be set by ChartService
                timestamp: new Date()
            });
            
            logger.logWithPrefix('💾', `Cached fresh data for ${ticker}`);
            return stockData;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Get cached chart buffer if available
     */
    getCachedChart(ticker) {
        const cacheKey = this.getCacheKey(ticker);
        const cachedData = this.stockCache.get(cacheKey);
        
        if (cachedData && this.isCacheValid(cachedData) && cachedData.chartBuffer) {
            logger.debug('Using cached chart from stock service', { ticker });
            return cachedData.chartBuffer;
        }
        
        return null;
    }

    /**
     * Set cached chart buffer
     */
    setCachedChart(ticker, chartBuffer) {
        const cacheKey = this.getCacheKey(ticker);
        const cachedEntry = this.stockCache.get(cacheKey);
        
        if (cachedEntry) {
            cachedEntry.chartBuffer = chartBuffer;
            logger.debug('Chart cached in stock service', { ticker });
        } else {
            // Create new cache entry if it doesn't exist
            this.stockCache.set(cacheKey, {
                stockData: null,
                chartBuffer: chartBuffer,
                timestamp: new Date()
            });
        }
    }

    /**
     * Clear specific entry from cache by key
     * @param {string} cacheKey - Cache key to remove
     * @returns {boolean} True if entry was removed
     */
    clearFromCache(cacheKey) {
        return this.stockCache.delete(cacheKey);
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache statistics
     */
    getCacheStats() {
        return {
            size: this.stockCache.size,
            keys: Array.from(this.stockCache.keys())
        };
    }
}

module.exports = StockService;