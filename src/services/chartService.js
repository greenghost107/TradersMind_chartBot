/**
 * Chart Service - Handles chart generation using Puppeteer
 */

const puppeteer = require('puppeteer');

class ChartService {
    constructor(stockService) {
        this.stockService = stockService;
    }

    /**
     * Generate stock chart using Puppeteer and Chart.js
     */
    async generateChart(stockData) {
        // Check if chart is already cached
        const cachedChart = this.stockService.getCachedChart(stockData.symbol);
        if (cachedChart) {
            return cachedChart;
        }
        
        try {
            console.log(`📊 Generating fresh chart for ${stockData.symbol}...`);
            
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
            
            // Cache the generated chart
            this.stockService.setCachedChart(stockData.symbol, chartBuffer);
            
            return chartBuffer;
            
        } catch (error) {
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
            .setTitle(`${stockData.symbol}`)
            .setDescription(`$${stockData.currentPrice} (${stockData.change >= 0 ? '+' : ''}${stockData.changePercent}%)`)
            .setColor(stockData.change >= 0 ? 0x00ff88 : 0xff4444)
            .setImage('attachment://chart.png');

        return embed;
    }
}

module.exports = ChartService;