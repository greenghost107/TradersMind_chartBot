/**
 * Chart Service - Handles chart generation using Puppeteer
 */

const puppeteer = require('puppeteer');
const { logger } = require('../utils/logger');

class ChartService {
    constructor(stockService, messageTrackingService = null) {
        this.stockService = stockService;
        this.messageTrackingService = messageTrackingService;
        this.chartCache = new Map();
    }

    /**
     * Generate stock chart using Puppeteer and Chart.js
     */
    async generateChart(stockData, messageId = null, channelId = null, userId = null) {
        // Check if chart is already cached
        const cacheKey = this.getChartCacheKey(stockData.symbol);
        const cachedChart = this.getFromCache(cacheKey);
        if (cachedChart) {
            logger.debug('Using cached chart', { ticker: stockData.symbol });
            
            // Track message with cache key if tracking is enabled
            if (this.messageTrackingService && messageId) {
                this.messageTrackingService.trackMessage(
                    messageId, 
                    channelId, 
                    userId, 
                    stockData.symbol, 
                    [cacheKey]
                );
            }
            
            return cachedChart;
        }
        
        try {
            logger.logWithPrefix('📊', `Generated chart for ${stockData.symbol} (${stockData.source || 'unknown'})`);
            
            const browser = await puppeteer.launch({ 
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu'
                ]
            });
            
            const page = await browser.newPage();
            await page.setViewport({ width: 840, height: 440 });
            
            const color = stockData.change >= 0 ? '#00ff88' : '#ff4444';
            const bgColor = stockData.change >= 0 ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 68, 68, 0.1)';
            
            const htmlContent = this.generateChartHTML(stockData, color, bgColor);
            
            await page.setContent(htmlContent);
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const chartBuffer = await page.screenshot({
                clip: { x: 0, y: 0, width: 840, height: 440 },
                type: 'png'
            });
            
            await browser.close();
            
            // Cache the generated chart with timestamp
            this.setInCache(cacheKey, chartBuffer);
            
            // Track message with cache key if tracking is enabled
            if (this.messageTrackingService && messageId) {
                this.messageTrackingService.trackMessage(
                    messageId, 
                    channelId, 
                    userId, 
                    stockData.symbol, 
                    [cacheKey]
                );
            }
            
            logger.success('Chart generated and cached', { 
                ticker: stockData.symbol,
                cacheKey 
            });
            
            return chartBuffer;
            
        } catch (error) {
            logger.error('Chart generation failed', {
                ticker: stockData.symbol,
                error: error.message
            });
            throw new Error(`Chart generation failed: ${error.message}`);
        }
    }

    /**
     * Generate HTML content for the chart
     */
    generateChartHTML(stockData, color, bgColor) {
        const formattedDates = stockData.dates.map(date => {
            const d = new Date(date);
            return `${d.getMonth() + 1}/${d.getDate()}`;
        });

        const changeSign = stockData.change >= 0 ? '+' : '';
        const title = `${stockData.symbol} - $${stockData.currentPrice} (${changeSign}${stockData.changePercent}%)`;

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <script src="https://cdn.jsdelivr.net/npm/chart.js@3.9.1"></script>
            <style>body { margin: 0; padding: 20px; background: white; font-family: Arial; }</style>
        </head>
        <body>
            <canvas id="chart" width="800" height="400"></canvas>
            <script>
            const ctx = document.getElementById('chart').getContext('2d');
            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: ${JSON.stringify(formattedDates)},
                    datasets: [{
                        label: '${stockData.symbol} Price',
                        data: ${JSON.stringify(stockData.prices)},
                        borderColor: '${color}',
                        backgroundColor: '${bgColor}',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.1
                    }]
                },
                options: {
                    responsive: false,
                    plugins: {
                        title: {
                            display: true,
                            text: '${title}',
                            font: { size: 16, weight: 'bold' },
                            color: '${color}'
                        },
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            beginAtZero: false,
                            ticks: {
                                callback: function(value) {
                                    return '$' + value.toFixed(2);
                                }
                            }
                        }
                    }
                }
            });
            console.log('Chart rendered');
            </script>
        </body>
        </html>`;
    }

    /**
     * Create Discord embed for stock data
     */
    createStockEmbed(stockData) {
        const { EmbedBuilder } = require('discord.js');
        
        const embed = new EmbedBuilder()
            .setTitle(`${stockData.symbol} 1D`)
            .setDescription(`$${stockData.currentPrice} (${stockData.change >= 0 ? '+' : ''}${stockData.changePercent}%)`)
            .setColor(stockData.change >= 0 ? 0x00ff88 : 0xff4444)
            .setImage('attachment://chart.png');

        return embed;
    }

    /**
     * Generate cache key for chart data
     * @param {string} ticker - Stock ticker symbol
     * @returns {string} Cache key
     */
    getChartCacheKey(ticker) {
        const today = new Date().toISOString().split('T')[0];
        return `chart_${ticker}_${today}`;
    }

    /**
     * Get chart from cache
     * @param {string} cacheKey - Cache key
     * @returns {Buffer|null} Cached chart buffer or null
     */
    getFromCache(cacheKey) {
        const cacheEntry = this.chartCache.get(cacheKey);
        if (!cacheEntry) {
            return null;
        }

        // Check if cache entry is still valid (same day)
        const today = new Date().toISOString().split('T')[0];
        if (cacheEntry.date !== today) {
            this.chartCache.delete(cacheKey);
            return null;
        }

        return cacheEntry.data;
    }

    /**
     * Store chart in cache
     * @param {string} cacheKey - Cache key
     * @param {Buffer} chartBuffer - Chart data to cache
     */
    setInCache(cacheKey, chartBuffer) {
        const today = new Date().toISOString().split('T')[0];
        this.chartCache.set(cacheKey, {
            data: chartBuffer,
            date: today,
            timestamp: Date.now()
        });
    }

    /**
     * Clear specific entry from cache
     * @param {string} cacheKey - Cache key to remove
     * @returns {boolean} True if entry was removed
     */
    clearFromCache(cacheKey) {
        return this.chartCache.delete(cacheKey);
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache statistics
     */
    getCacheStats() {
        return {
            size: this.chartCache.size,
            keys: Array.from(this.chartCache.keys())
        };
    }

    /**
     * Clean up expired cache entries
     * @returns {number} Number of entries cleaned
     */
    cleanupExpiredCache() {
        const today = new Date().toISOString().split('T')[0];
        let cleaned = 0;

        for (const [key, entry] of this.chartCache) {
            if (entry.date !== today) {
                this.chartCache.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            logger.debug('Cleaned up expired chart cache entries', { 
                entriesRemoved: cleaned 
            });
        }

        return cleaned;
    }
}

module.exports = ChartService;