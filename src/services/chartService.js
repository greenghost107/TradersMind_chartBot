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
     * Validate OHLC stock data before chart generation
     */
    validateStockData(stockData) {
        // Check required fields
        const requiredFields = ['symbol', 'dates', 'opens', 'highs', 'lows', 'closes'];
        for (const field of requiredFields) {
            if (!stockData[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        }

        // Check array lengths match
        const expectedLength = stockData.dates.length;
        const arrays = ['opens', 'highs', 'lows', 'closes'];
        for (const arrayName of arrays) {
            if (stockData[arrayName].length !== expectedLength) {
                throw new Error(`Array length mismatch: ${arrayName} has ${stockData[arrayName].length} items, expected ${expectedLength}`);
            }
        }

        // Check for minimum data points
        if (expectedLength < 2) {
            throw new Error(`Insufficient data points: ${expectedLength}, need at least 2`);
        }

        // Validate OHLC relationships
        for (let i = 0; i < expectedLength; i++) {
            const open = parseFloat(stockData.opens[i]);
            const high = parseFloat(stockData.highs[i]);
            const low = parseFloat(stockData.lows[i]);
            const close = parseFloat(stockData.closes[i]);

            // Skip validation for null/undefined values (will be filtered out)
            if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) {
                logger.warn(`Invalid OHLC data at index ${i}`, { 
                    ticker: stockData.symbol,
                    open, high, low, close
                });
                continue;
            }

            // Validate OHLC relationships: High >= max(Open, Close), Low <= min(Open, Close)
            if (high < Math.max(open, close) || low > Math.min(open, close)) {
                logger.warn(`Invalid OHLC relationship at index ${i}`, {
                    ticker: stockData.symbol,
                    date: stockData.dates[i],
                    open, high, low, close
                });
            }
        }

        return true;
    }

    /**
     * Generate stock chart using Puppeteer and Plotly.js
     */
    async generateChart(stockData, messageId = null, channelId = null, userId = null, threadId = null) {
        // Declare cacheKey at function scope so it's available in catch blocks
        let cacheKey;
        
        try {
            // Validate stock data first
            this.validateStockData(stockData);

            // Check if chart is already cached
            cacheKey = this.getChartCacheKey(stockData.symbol);
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
                        [cacheKey],
                        threadId
                    );
                }
                
                return cachedChart;
            }
        } catch (validationError) {
            logger.error('Stock data validation failed', {
                ticker: stockData.symbol,
                error: validationError.message,
                dataKeys: Object.keys(stockData)
            });
            throw new Error(`Data validation failed: ${validationError.message}`);
        }
        
        let browser;
        try {
            logger.logWithPrefix('📊', `Generating candlestick chart for ${stockData.symbol} (${stockData.source || 'unknown'})`);
            
            browser = await puppeteer.launch({ 
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--disable-extensions',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding'
                ]
            });
            
            const page = await browser.newPage();
            
            // Set longer timeout for chart generation
            page.setDefaultTimeout(30000);
            
            // Listen for console errors
            page.on('console', msg => {
                if (msg.type() === 'error') {
                    logger.warn('Browser console error', {
                        ticker: stockData.symbol,
                        error: msg.text()
                    });
                }
            });

            // Listen for page errors
            page.on('pageerror', error => {
                logger.error('Page error during chart generation', {
                    ticker: stockData.symbol,
                    error: error.message
                });
            });
            
            await page.setViewport({ width: 840, height: 440 });
            
            const color = stockData.change >= 0 ? '#00ff88' : '#ff4444';
            const bgColor = stockData.change >= 0 ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 68, 68, 0.1)';
            
            const htmlContent = this.generateChartHTML(stockData, color, bgColor);
            
            await page.setContent(htmlContent);
            
            // Wait for Plotly to load (reduced timeout)
            await page.waitForFunction(
                () => typeof window.Plotly !== 'undefined',
                { timeout: 3000 }
            );
            
            // Wait for chart container to be populated (reduced timeout)
            await page.waitForFunction(
                () => {
                    const chartDiv = document.querySelector('#chart');
                    return chartDiv && (chartDiv.children.length > 0 || chartDiv.innerHTML.includes('plotly') || chartDiv.innerHTML.includes('Chart generation failed'));
                },
                { timeout: 5000 }
            );
            
            // Reduced wait for rendering
            await new Promise(resolve => setTimeout(resolve, 800));
            
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
                    [cacheKey],
                    threadId
                );
            }
            
            logger.success('Chart generated and cached', { 
                ticker: stockData.symbol,
                cacheKey 
            });
            
            return chartBuffer;
            
        } catch (error) {
            // Ensure browser cleanup on error
            if (browser) {
                try {
                    await browser.close();
                } catch (closeError) {
                    logger.warn('Failed to close browser after error', {
                        ticker: stockData.symbol,
                        closeError: closeError.message
                    });
                }
            }

            logger.error('Chart generation failed', {
                ticker: stockData.symbol,
                error: error.message,
                errorType: error.constructor.name,
                step: error.message.includes('Waiting failed') ? 'chart_rendering' : 'browser_setup',
                cacheKey: cacheKey || 'not_set'
            });
            
            // Provide more specific error messages
            if (error.message.includes('Waiting failed')) {
                throw new Error(`Chart rendering timeout: Failed to generate ${stockData.symbol} chart within time limit. This may be due to network issues or complex data.`);
            } else if (error.message.includes('Navigation timeout')) {
                throw new Error(`Chart generation timeout: Failed to load chart libraries for ${stockData.symbol}.`);
            } else {
                throw new Error(`Chart generation failed: ${error.message}`);
            }
        }
    }

    /**
     * Generate HTML content for the chart
     */
    generateChartHTML(stockData, color, bgColor) {
        const changeSign = stockData.change >= 0 ? '+' : '';
        const title = `${stockData.symbol} - $${stockData.currentPrice} (${changeSign}${stockData.changePercent}%)`;

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <script src="https://cdn.plot.ly/plotly-2.35.2.min.js"></script>
            <style>
                body { 
                    margin: 0; 
                    padding: 20px; 
                    background: white; 
                    font-family: Arial, sans-serif;
                }
                #chart { 
                    width: 800px; 
                    height: 400px;
                    margin: 0 auto;
                }
            </style>
        </head>
        <body>
            <div id="chart"></div>
            <script>
            try {
                // Candlestick trace data
                const trace = {
                    x: ${JSON.stringify(stockData.dates)},
                    close: ${JSON.stringify(stockData.closes)},
                    decreasing: { 
                        line: { color: '#ff4444' }, 
                        fillcolor: 'rgba(255, 68, 68, 0.1)' 
                    },
                    high: ${JSON.stringify(stockData.highs)},
                    increasing: { 
                        line: { color: '#00ff88' },
                        fillcolor: 'rgba(0, 255, 136, 0.1)'
                    },
                    low: ${JSON.stringify(stockData.lows)},
                    open: ${JSON.stringify(stockData.opens)},
                    type: 'candlestick',
                    xaxis: 'x',
                    yaxis: 'y',
                    name: '${stockData.symbol}',
                    showlegend: false
                };

                // Layout configuration
                const layout = {
                    title: {
                        text: '${title}',
                        font: { 
                            size: 16, 
                            color: '${color}',
                            family: 'Arial, sans-serif'
                        },
                        x: 0.5,
                        xanchor: 'center'
                    },
                    xaxis: {
                        title: '',
                        rangeslider: { visible: false },
                        type: 'date',
                        tickformat: '%b %d',
                        showgrid: true,
                        gridcolor: 'rgba(128, 128, 128, 0.2)'
                    },
                    yaxis: {
                        title: {
                            text: 'Price ($)',
                            font: { size: 12 }
                        },
                        tickformat: '$.2f',
                        fixedrange: false,
                        showgrid: true,
                        gridcolor: 'rgba(128, 128, 128, 0.2)'
                    },
                    width: 800,
                    height: 400,
                    margin: { l: 60, r: 30, t: 60, b: 50 },
                    plot_bgcolor: 'white',
                    paper_bgcolor: 'white',
                    font: {
                        family: 'Arial, sans-serif',
                        size: 11,
                        color: '#333'
                    }
                };

                // Configuration options
                const config = {
                    displayModeBar: false, // Hide toolbar for cleaner screenshot
                    staticPlot: true,      // Disable interactivity for screenshot
                    responsive: false      // Fixed size for consistent screenshots
                };

                // Create the plot
                Plotly.newPlot('chart', [trace], layout, config)
                    .then(() => {
                        console.log('Plotly candlestick chart rendered successfully');
                    })
                    .catch(plotlyError => {
                        console.error('Plotly rendering error:', plotlyError);
                        throw new Error('Failed to render candlestick chart: ' + plotlyError.message);
                    });
                
            } catch (error) {
                console.error('Error setting up Plotly chart:', error);
                throw new Error('Failed to setup candlestick chart: ' + error.message);
            }
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