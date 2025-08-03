/**
 * Yahoo Finance Service - Handles stock data fetching from Yahoo Finance as fallback
 */

const yahooFinance = require('yahoo-finance2').default;
const { logger } = require('../utils/logger');

class YahooFinanceService {
    constructor() {
        // No API key required for Yahoo Finance
    }

    /**
     * Fetch stock data from Yahoo Finance
     * @param {string} ticker - Stock ticker symbol
     * @returns {Object} Stock data in Alpha Vantage compatible format
     */
    async fetchStockData(ticker) {
        try {
            logger.logWithPrefix('🟡', `Fetching data from Yahoo Finance for ${ticker}`);
            
            // Get historical data (last 30 days)
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 30);
            
            const historicalData = await yahooFinance.historical(ticker, {
                period1: startDate,
                period2: endDate,
                interval: '1d'
            });
            
            if (!historicalData || historicalData.length === 0) {
                throw new Error('No historical data available');
            }
            
            // Get current quote
            const quote = await yahooFinance.quote(ticker);
            
            if (!quote) {
                throw new Error('No quote data available');
            }
            
            // Transform Yahoo data to Alpha Vantage format
            return this.transformYahooData(ticker, historicalData, quote);
            
        } catch (error) {
            logger.error('Yahoo Finance API error', {
                ticker,
                error: error.message
            });
            throw new Error(`Yahoo Finance error: ${error.message}`);
        }
    }

    /**
     * Transform Yahoo Finance data to Alpha Vantage compatible format
     * @param {string} ticker - Stock ticker symbol
     * @param {Array} historicalData - Yahoo historical data
     * @param {Object} quote - Yahoo quote data
     * @returns {Object} Transformed stock data
     */
    transformYahooData(ticker, historicalData, quote) {
        // Sort by date (oldest first) and take last 30 days
        const sortedData = historicalData
            .filter(day => day.close !== null && day.close !== undefined)
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .slice(-30);
        
        if (sortedData.length < 2) {
            throw new Error('Insufficient historical data');
        }
        
        // Extract dates and prices
        const dates = sortedData.map(day => day.date.toISOString().split('T')[0]);
        const prices = sortedData.map(day => parseFloat(day.close));
        const volumes = sortedData.map(day => parseInt(day.volume) || 0);
        
        // Calculate current price and change
        const currentPrice = quote.regularMarketPrice || quote.price || prices[prices.length - 1];
        const previousPrice = prices[prices.length - 2];
        const change = currentPrice - previousPrice;
        const changePercent = ((change / previousPrice) * 100).toFixed(2);
        
        const stockData = {
            symbol: ticker.toUpperCase(),
            currentPrice: currentPrice.toFixed(2),
            change: change.toFixed(2),
            changePercent,
            dates,
            prices,
            volumes,
            company: quote.shortName || quote.longName || ticker,
            source: 'yahoo' // Mark data source for debugging
        };
        
        logger.debug('Yahoo Finance data transformed', {
            ticker,
            currentPrice: stockData.currentPrice,
            change: stockData.change,
            dataPoints: dates.length
        });
        
        return stockData;
    }

    /**
     * Check if Yahoo Finance is available
     * @returns {boolean} True if service is accessible
     */
    async isAvailable() {
        try {
            // Test with a common stock
            await yahooFinance.quote('AAPL');
            return true;
        } catch (error) {
            logger.warn('Yahoo Finance service unavailable', {
                error: error.message
            });
            return false;
        }
    }

    /**
     * Get service information
     * @returns {Object} Service metadata
     */
    getServiceInfo() {
        return {
            name: 'Yahoo Finance',
            description: 'Free stock data service as fallback',
            rateLimits: 'No official limits, but requests should be reasonable',
            dataSource: 'yahoo-finance2 npm package'
        };
    }
}

module.exports = YahooFinanceService;