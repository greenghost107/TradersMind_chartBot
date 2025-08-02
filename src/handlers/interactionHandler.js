/**
 * Interaction Handler - Handles Discord button interactions
 */

const { EmbedBuilder } = require('discord.js');

class InteractionHandler {
    constructor(stockService, chartService, threadService) {
        this.stockService = stockService;
        this.chartService = chartService;
        this.threadService = threadService;
    }

    /**
     * Handle button interaction
     */
    async handleInteraction(interaction) {
        // Only handle button interactions
        if (!interaction.isButton()) return;
        
        // Only handle stock ticker buttons
        if (!interaction.customId.startsWith('stock_')) return;

        const ticker = interaction.customId.replace('stock_', '');
        
        try {
            await interaction.deferReply({ ephemeral: true });
            
            // Get the channel from interaction (could be main channel or thread)
            const channel = interaction.channel.isThread() ? 
                interaction.channel.parent : interaction.channel;
            
            // Get or create user's dedicated thread
            const userThread = await this.threadService.getOrCreateUserThread(channel, interaction.user);
            
            // Fetch stock data
            const stockData = await this.stockService.fetchStockData(ticker);
            
            // Generate chart
            const chartBuffer = await this.chartService.generateChart(stockData);
            
            // Create embed
            const embed = this.chartService.createStockEmbed(stockData);

            // Send chart to user's thread
            await userThread.send({
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
            console.error(`Error handling interaction for ${ticker}:`, error);
            
            // Send error message to user
            const errorEmbed = new EmbedBuilder()
                .setTitle(`❌ Error: ${ticker}`)
                .setDescription(`Could not fetch data for **${ticker}**. Please check if the symbol is correct.`)
                .setColor(0xff4444);
                
            try {
                await interaction.editReply({ embeds: [errorEmbed] });
            } catch (replyError) {
                console.error('Error sending error message:', replyError);
            }
        }
    }

    /**
     * Validate interaction before processing
     */
    shouldProcessInteraction(interaction) {
        // Must be a button interaction
        if (!interaction.isButton()) return false;
        
        // Must be a stock button
        if (!interaction.customId.startsWith('stock_')) return false;
        
        // Must have a valid ticker
        const ticker = interaction.customId.replace('stock_', '');
        if (!ticker || ticker.length === 0 || ticker.length > 5) return false;
        
        return true;
    }

    /**
     * Extract ticker from interaction
     */
    getTickerFromInteraction(interaction) {
        if (!interaction.customId.startsWith('stock_')) {
            return null;
        }
        
        return interaction.customId.replace('stock_', '');
    }

    /**
     * Get interaction statistics
     */
    getInteractionStats(interaction) {
        const ticker = this.getTickerFromInteraction(interaction);
        
        return {
            userId: interaction.user.id,
            username: interaction.user.username,
            ticker: ticker,
            channelId: interaction.channel.id,
            channelName: interaction.channel.name,
            isInThread: interaction.channel.isThread(),
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = InteractionHandler;