try {
    require('dotenv').config();
} catch (error) {
    console.error('⚠️  dotenv not found. Make sure to run: npm install');
    process.exit(1);
}

let Client, GatewayIntentBits, EmbedBuilder;
let axios;
let ChartJSNodeCanvas;

try {
    ({ Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js'));
} catch (error) {
    console.error('❌ discord.js not found. Please run: npm install');
    console.error('Error:', error.message);
    process.exit(1);
}

try {
    axios = require('axios');
} catch (error) {
    console.error('❌ axios not found. Please run: npm install');
    process.exit(1);
}

let puppeteer;
try {
    puppeteer = require('puppeteer');
} catch (error) {
    console.error('❌ puppeteer not found. Please run: npm install');
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Chart generation using Puppeteer (no Canvas compilation needed)

// Track user threads for organized chart viewing
const userThreads = new Map();

// Daily stock data cache to reduce API calls
const stockCache = new Map();



function detectStockTickers(message) {
    // Improved pattern using word boundaries to handle comma-separated lists better
    const tickerPattern = /\b([A-Z]{1,5})\b/g;
    const matches = [];
    let match;
    
    // Common words to exclude (not stock tickers)
    const excludeWords = new Set([
        'ATH', 'WH', 'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS', 'ONE', 'OUR', 'OUT', 'DAY', 'GET', 'HAS', 'HIM', 'HIS', 'HOW', 'ITS', 'MAY', 'NEW', 'NOW', 'OLD', 'SEE', 'TWO', 'WAY', 'WHO', 'BOY', 'DID', 'DOWN', 'EACH', 'EVEN', 'FROM', 'GIVE', 'GOOD', 'HAVE', 'HERE', 'INTO', 'JUST', 'KNOW', 'LIKE', 'LOOK', 'MADE', 'MAKE', 'MAN', 'MANY', 'MORE', 'MOST', 'MOVE', 'MUCH', 'MUST', 'NEED', 'ONLY', 'OVER', 'OWN', 'PUT', 'RIGHT', 'SAID', 'SAME', 'SAY', 'SHE', 'SHOW', 'SOME', 'TAKE', 'THAN', 'THEM', 'THESE', 'THEY', 'THIS', 'TIME', 'VERY', 'WANT', 'WATER', 'WELL', 'WERE', 'WHAT', 'WHEN', 'WHERE', 'WHICH', 'WILL', 'WITH', 'WORK', 'WOULD', 'WRITE', 'YEAR', 'YOUR', 'LONG', 'SHORT', 'BUY', 'SELL', 'BAD', 'GOOD', 'THINK', 'BOUGHT', 'BUYING', 'TRADING', 'I', 'A', 'O', 'U'
    ]);
    
    while ((match = tickerPattern.exec(message)) !== null) {
        const ticker = match[1];
        // Filter out common words and ensure reasonable ticker length
        if (ticker.length >= 1 && ticker.length <= 5 && !excludeWords.has(ticker)) {
            matches.push(ticker);
        }
    }
    
    return [...new Set(matches)];
}

function getCacheKey(ticker) {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    return `${ticker}_${today}`;
}

function isCacheValid(cacheEntry) {
    if (!cacheEntry) return false;
    
    const today = new Date().toISOString().split('T')[0];
    const cacheDate = new Date(cacheEntry.timestamp).toISOString().split('T')[0];
    
    return cacheDate === today;
}

function cleanupExpiredCache() {
    console.log('🧹 Cleaning up expired cache entries...');
    const today = new Date().toISOString().split('T')[0];
    
    for (const [key, entry] of stockCache.entries()) {
        const cacheDate = new Date(entry.timestamp).toISOString().split('T')[0];
        if (cacheDate !== today) {
            stockCache.delete(key);
        }
    }
}

// Clean up cache every hour
setInterval(cleanupExpiredCache, 3600000);

async function getOrCreateUserThread(channel, user) {
    const userId = user.id;
    
    // Check if user already has an active thread
    if (userThreads.has(userId)) {
        const existingThread = userThreads.get(userId);
        try {
            // Verify thread still exists and is accessible
            await existingThread.fetch();
            return existingThread;
        } catch (error) {
            // Thread was deleted or is inaccessible, remove from map
            userThreads.delete(userId);
        }
    }
    const thread = await channel.threads.create({
        name: `📊 ${user.username}'s Stock Charts`,
        autoArchiveDuration: 60, // Auto-archive after 1 hour of inactivity
        reason: 'Stock chart viewing thread'
    });
    
    // Store thread in map
    userThreads.set(userId, thread);
    
    // Auto-cleanup thread reference after 1 hour
    setTimeout(() => {
        userThreads.delete(userId);
    }, 3600000); // 1 hour
    
    return thread;
}

async function fetchStockData(ticker) {
    // Check cache first
    const cacheKey = getCacheKey(ticker);
    const cachedData = stockCache.get(cacheKey);
    
    if (cachedData && isCacheValid(cachedData)) {
        console.log(`📊 Using cached data for ${ticker}`);
        return cachedData.stockData;
    }
    
    try {
        console.log(`🌐 Fetching fresh data for ${ticker}...`);
        const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
        if (!apiKey) {
            throw new Error('API key not configured');
        }

        const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${ticker}&apikey=${apiKey}&outputsize=compact`;
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
        
        // Cache the fresh data (chart will be cached separately)
        stockCache.set(cacheKey, {
            stockData,
            chartBuffer: null, // Will be set when chart is generated
            timestamp: new Date()
        });
        
        console.log(`💾 Cached fresh data for ${ticker}`);
        return stockData;
    } catch (error) {
        throw error;
    }
}

async function generateChart(stockData) {
    // Check if chart is already cached
    const cacheKey = getCacheKey(stockData.symbol);
    const cachedData = stockCache.get(cacheKey);
    
    if (cachedData && cachedData.chartBuffer) {
        console.log(`📊 Using cached chart for ${stockData.symbol}`);
        return cachedData.chartBuffer;
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
        
        const htmlContent = `
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
                    labels: ${JSON.stringify(stockData.dates.map(date => {
                        const d = new Date(date);
                        return `${d.getMonth() + 1}/${d.getDate()}`;
                    }))},
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
                            text: '${stockData.symbol} - $${stockData.currentPrice} (${stockData.change >= 0 ? '+' : ''}${stockData.changePercent}%)',
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
        
        await page.setContent(htmlContent);
        await new Promise(resolve => setTimeout(resolve, 3000));
        const chart = await page.screenshot({
            clip: { x: 0, y: 0, width: 840, height: 440 },
            type: 'png'
        });
        
        await browser.close();
        
        // Cache the generated chart
        const cachedEntry = stockCache.get(cacheKey);
        if (cachedEntry) {
            cachedEntry.chartBuffer = chart;
            console.log(`💾 Cached fresh chart for ${stockData.symbol}`);
        } else {
            // Create new cache entry if it doesn't exist
            stockCache.set(cacheKey, {
                stockData,
                chartBuffer: chart,
                timestamp: new Date()
            });
        }
        
        return chart;
        
    } catch (error) {
        throw error;
    }
}

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;


    const tickers = detectStockTickers(message.content);
    
    if (tickers.length > 0) {
        console.log(`📊 Detected: ${tickers.join(', ')}`);
        
        // Create multiple action rows to handle all tickers (max 25 tickers, 5 per row)
        const actionRows = [];
        const maxTickers = Math.min(tickers.length, 25); // Discord limit: max 5 rows * 5 buttons = 25
        
        for (let i = 0; i < maxTickers; i += 5) {
            const rowTickers = tickers.slice(i, i + 5);
            const stockButtons = rowTickers.map(ticker => 
                new ButtonBuilder()
                    .setCustomId(`stock_${ticker}`)
                    .setLabel(`📊 ${ticker}`)
                    .setStyle(ButtonStyle.Secondary)
            );
            
            const actionRow = new ActionRowBuilder().addComponents(stockButtons);
            actionRows.push(actionRow);
        }
        
        try {
            await message.reply({
                components: actionRows
            });
        } catch (error) {
            // Ignore reply errors
        }
    }
});

// Handle button interactions for stock charts
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    
    if (interaction.customId.startsWith('stock_')) {
        const ticker = interaction.customId.replace('stock_', '');
        
        try {
            await interaction.deferReply({ ephemeral: true });
            
            // Get the channel from interaction (could be main channel or thread)
            const channel = interaction.channel.isThread() ? 
                interaction.channel.parent : interaction.channel;
            
            // Get or create user's dedicated thread
            const userThread = await getOrCreateUserThread(channel, interaction.user);
            
            const stockData = await fetchStockData(ticker);
            const chartBuffer = await generateChart(stockData);
            
            const embed = new EmbedBuilder()
                .setTitle(`${stockData.symbol}`)
                .setDescription(`$${stockData.currentPrice} (${stockData.change >= 0 ? '+' : ''}${stockData.changePercent}%)`)
                .setColor(stockData.change >= 0 ? 0x00ff88 : 0xff4444)
                .setImage('attachment://chart.png');

            const chartMessage = await userThread.send({
                embeds: [embed],
                files: [{
                    attachment: chartBuffer,
                    name: 'chart.png'
                }]
            });
            
            console.log(`📊 Charts sent to ${interaction.user.username}`);
            
            // Delete the deferred reply to avoid showing any message
            await interaction.deleteReply();
            
        } catch (error) {
            
            const errorEmbed = new EmbedBuilder()
                .setTitle(`❌ Error: ${ticker}`)
                .setDescription(`Could not fetch data for **${ticker}**. Please check if the symbol is correct.`)
                .setColor(0xff4444);
                
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
});

// Validate environment variables
if (!process.env.DISCORD_BOT_TOKEN) {
    console.error('❌ DISCORD_BOT_TOKEN is missing from .env file');
    console.error('Please copy .env.example to .env and add your bot token');
    process.exit(1);
}

if (!process.env.ALPHA_VANTAGE_API_KEY) {
    console.error('❌ ALPHA_VANTAGE_API_KEY is missing from .env file');
    console.error('Get a free API key at: https://www.alphavantage.co/support/#api-key');
    process.exit(1);
}

console.log('🚀 Starting TradersMind Discord Bot...');
client.login(process.env.DISCORD_BOT_TOKEN);