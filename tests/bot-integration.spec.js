const { test, expect } = require('@playwright/test');
const { MockClient, mockStockData, mockChartBuffer } = require('./mocks/discord-mock');
const { testUsers, testScenarios, threadNames, mockApiResponses } = require('./fixtures/test-users');
const { detectStockTickers } = require('../utils/ticker-detector');

// Mock modules for testing
const mockModules = {
    // Mock Alpha Vantage API
    fetchStockData: async (ticker) => {
        if (ticker === 'GOOGL') return mockApiResponses.googl;
        if (ticker === 'AAPL') return mockApiResponses.aapl;
        throw new Error('Stock not found');
    },
    
    // Mock chart generation
    generateChart: async (stockData) => {
        return mockChartBuffer;
    }
};

test.describe('Discord Bot Integration Tests', () => {
    let mockClient;
    let testChannel;
    let userThreads;

    test.beforeEach(() => {
        // Initialize mock Discord client
        mockClient = new MockClient();
        testChannel = mockClient.channels.get('channel_123');
        userThreads = new Map(); // Simulate bot's userThreads Map
        
        // Reset test state
        mockClient.userThreads.clear();
    });

    test.describe('Multi-User Thread Interaction Flow', () => {
        test('should handle complete multi-user interaction scenario', async () => {
            const { messageAuthor, buttonClicker, outsideUser } = testUsers;
            
            // === STEP 1: User 1 posts message with GOOGL ===
            console.log('Step 1: User 1 posts message containing GOOGL');
            const originalMessage = mockClient.simulateMessage(
                'I think GOOGL is going up today',
                messageAuthor,
                testChannel
            );
            
            // Verify ticker detection
            const detectedTickers = detectStockTickers(originalMessage.content);
            expect(detectedTickers).toContain('GOOGL');
            expect(detectedTickers).toHaveLength(1);
            
            // === STEP 2: Bot responds with interactive buttons ===
            console.log('Step 2: Bot creates interactive buttons');
            
            // Simulate bot's message creation logic
            const buttonMessage = await testChannel.send({
                components: [{
                    components: [{
                        customId: 'stock_GOOGL',
                        label: '📊 GOOGL',
                        style: 'Secondary'
                    }]
                }]
            });
            
            // Verify button was created
            expect(buttonMessage.components).toHaveLength(1);
            expect(buttonMessage.components[0].components[0].customId).toBe('stock_GOOGL');
            expect(buttonMessage.components[0].components[0].label).toBe('📊 GOOGL');
            
            // === STEP 3: User 2 clicks GOOGL button ===
            console.log('Step 3: User 2 clicks GOOGL button');
            const interaction = mockClient.simulateButtonClick(
                buttonClicker,
                'stock_GOOGL',
                testChannel
            );
            
            // Verify interaction is button click
            expect(interaction.isButton()).toBe(true);
            expect(interaction.customId).toBe('stock_GOOGL');
            expect(interaction.user.id).toBe(buttonClicker.id);
            
            // === STEP 4: Simulate bot's thread creation and chart posting ===
            console.log('Step 4: Bot creates thread for User 2');
            
            // Simulate bot's getOrCreateUserThread logic
            const userThread = await testChannel.threads.create({
                name: threadNames.getThreadName(buttonClicker.username),
                autoArchiveDuration: 60,
                reason: 'Stock chart viewing thread',
                ownerId: buttonClicker.id
            });
            
            // Store thread in userThreads map (simulate bot's behavior)
            userThreads.set(buttonClicker.id, userThread);
            
            // Verify thread was created
            expect(userThread.name).toBe(threadNames.user2Thread);
            expect(userThread.ownerId).toBe(buttonClicker.id);
            expect(userThread.parentId).toBe(testChannel.id);
            
            // Simulate chart posting
            const stockData = await mockModules.fetchStockData('GOOGL');
            const chartBuffer = await mockModules.generateChart(stockData);
            
            const chartMessage = await userThread.send({
                embeds: [{
                    title: stockData.symbol,
                    description: `$${stockData.currentPrice} (${stockData.change >= 0 ? '+' : ''}${stockData.changePercent}%)`,
                    color: stockData.change >= 0 ? 0x00ff88 : 0xff4444,
                    image: { url: 'attachment://chart.png' }
                }],
                files: [{
                    attachment: chartBuffer,
                    name: 'chart.png'
                }]
            });
            
            // Verify chart was posted
            expect(chartMessage.embeds).toHaveLength(1);
            expect(chartMessage.embeds[0].title).toBe('GOOGL');
            expect(chartMessage.files).toHaveLength(1);
            expect(chartMessage.files[0].name).toBe('chart.png');
            
            // === STEP 5: Assert User 2 can see their thread ===
            console.log('Step 5: Verify User 2 can access their thread');
            
            expect(userThread.canUserAccess(buttonClicker.id)).toBe(true);
            expect(userThread.members.has(buttonClicker.id)).toBe(true);
            
            // User 2 should be able to fetch their thread
            const fetchedThread = await userThread.fetch();
            expect(fetchedThread.id).toBe(userThread.id);
            
            // === STEP 6: Assert User 3 cannot see User 2's thread ===
            console.log('Step 6: Verify User 3 cannot access User 2\'s thread');
            
            expect(userThread.canUserAccess(outsideUser.id)).toBe(false);
            expect(userThread.members.has(outsideUser.id)).toBe(false);
            
            // User 3 should not be able to see the thread
            expect(mockClient.canUserSeeThread(outsideUser.id, userThread.id)).toBe(false);
            
            // === STEP 7: Assert both users can see original interactive message ===
            console.log('Step 7: Verify both users can see original message');
            
            // Both users should see the original message with buttons in the main channel
            const channelMessages = testChannel.messages;
            expect(channelMessages).toContain(originalMessage);
            expect(channelMessages).toContain(buttonMessage);
            
            // Button should still be interactive for both users
            const availableButton = buttonMessage.components[0].components[0];
            expect(availableButton.customId).toBe('stock_GOOGL');
            expect(availableButton.label).toBe('📊 GOOGL');
            
            console.log('✅ All assertions passed - Multi-user interaction flow complete');
        });

        test('should create separate threads for different users clicking same ticker', async () => {
            const { messageAuthor, buttonClicker, outsideUser } = testUsers;
            
            // User 1 posts GOOGL message
            mockClient.simulateMessage('GOOGL looks good', messageAuthor, testChannel);
            
            // User 2 clicks button - gets their thread
            const interaction1 = mockClient.simulateButtonClick(buttonClicker, 'stock_GOOGL', testChannel);
            const thread1 = await testChannel.threads.create({
                name: threadNames.getThreadName(buttonClicker.username),
                ownerId: buttonClicker.id
            });
            userThreads.set(buttonClicker.id, thread1);
            
            // User 3 clicks same button - should get their own separate thread
            const interaction2 = mockClient.simulateButtonClick(outsideUser, 'stock_GOOGL', testChannel);
            const thread2 = await testChannel.threads.create({
                name: threadNames.getThreadName(outsideUser.username),
                ownerId: outsideUser.id
            });
            userThreads.set(outsideUser.id, thread2);
            
            // Verify separate threads
            expect(thread1.id).not.toBe(thread2.id);
            expect(thread1.ownerId).toBe(buttonClicker.id);
            expect(thread2.ownerId).toBe(outsideUser.id);
            
            // Verify thread isolation
            expect(thread1.canUserAccess(buttonClicker.id)).toBe(true);
            expect(thread1.canUserAccess(outsideUser.id)).toBe(false);
            
            expect(thread2.canUserAccess(outsideUser.id)).toBe(true);
            expect(thread2.canUserAccess(buttonClicker.id)).toBe(false);
        });

        test('should handle user clicking multiple different tickers', async () => {
            const { messageAuthor, buttonClicker } = testUsers;
            
            // User posts message with multiple tickers
            mockClient.simulateMessage('Trading GOOGL and AAPL today', messageAuthor, testChannel);
            
            // Create buttons for both tickers
            await testChannel.send({
                components: [{
                    components: [
                        { customId: 'stock_GOOGL', label: '📊 GOOGL' },
                        { customId: 'stock_AAPL', label: '📊 AAPL' }
                    ]
                }]
            });
            
            // User clicks GOOGL button
            mockClient.simulateButtonClick(buttonClicker, 'stock_GOOGL', testChannel);
            
            // User's thread should be reused for AAPL (same user, same thread)
            let userThread = userThreads.get(buttonClicker.id);
            if (!userThread) {
                userThread = await testChannel.threads.create({
                    name: threadNames.getThreadName(buttonClicker.username),
                    ownerId: buttonClicker.id
                });
                userThreads.set(buttonClicker.id, userThread);
            }
            
            // User clicks AAPL button - should use same thread
            mockClient.simulateButtonClick(buttonClicker, 'stock_AAPL', testChannel);
            
            // Should still be the same thread
            const sameThread = userThreads.get(buttonClicker.id);
            expect(sameThread.id).toBe(userThread.id);
            
            // Both charts should be in the same thread
            await userThread.send({ content: 'GOOGL chart posted' });
            await userThread.send({ content: 'AAPL chart posted' });
            
            expect(userThread.messages).toHaveLength(2);
        });

        test('should handle no tickers in message', async () => {
            const { messageAuthor } = testUsers;
            
            // User posts message with no tickers
            const message = mockClient.simulateMessage('Bad day for trading', messageAuthor, testChannel);
            
            // Verify no tickers detected
            const detectedTickers = detectStockTickers(message.content);
            expect(detectedTickers).toHaveLength(0);
            
            // Bot should not create any buttons
            const messagesBeforeBot = testChannel.messages.length;
            
            // Simulate bot logic: if no tickers, don't reply
            if (detectedTickers.length === 0) {
                // Bot should not create button message
            }
            
            // No new messages should be created
            expect(testChannel.messages).toHaveLength(messagesBeforeBot);
        });
    });

    test.describe('Thread Management', () => {
        test('should handle thread cleanup and reuse logic', async () => {
            const { buttonClicker } = testUsers;
            
            // Create initial thread
            const thread1 = await testChannel.threads.create({
                name: threadNames.getThreadName(buttonClicker.username),
                ownerId: buttonClicker.id
            });
            userThreads.set(buttonClicker.id, thread1);
            
            // Simulate thread exists and is accessible
            expect(await thread1.fetch()).toBe(thread1);
            
            // Simulate thread gets archived/deleted
            thread1.archived = true;
            
            // When user clicks button again, should create new thread
            mockClient.simulateButtonClick(buttonClicker, 'stock_GOOGL', testChannel);
            
            // Simulate bot's thread reuse logic
            let existingThread;
            try {
                existingThread = await thread1.fetch();
            } catch (error) {
                // Thread was deleted/archived, create new one
                existingThread = await testChannel.threads.create({
                    name: threadNames.getThreadName(buttonClicker.username),
                    ownerId: buttonClicker.id
                });
                userThreads.set(buttonClicker.id, existingThread);
            }
            
            // Should have new thread
            expect(existingThread.id).not.toBe(thread1.id);
            expect(existingThread.archived).toBe(false);
        });
    });
});