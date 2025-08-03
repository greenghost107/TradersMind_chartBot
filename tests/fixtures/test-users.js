/**
 * Test User Fixtures
 * Provides consistent test users for integration testing
 */

const { MockUser } = require('../mocks/discord-mock');

// Test users for multi-user scenarios
const testUsers = {
    // User 1: Posts the initial message with stock ticker
    messageAuthor: new MockUser('user_001', 'StockTrader1'),
    
    // User 2: Clicks the button and gets their own thread
    buttonClicker: new MockUser('user_002', 'InvestorJoe'),
    
    // User 3: Should not see User 2's thread
    outsideUser: new MockUser('user_003', 'RandomUser'),
    
    // Bot user
    botUser: new MockUser('bot_123', 'TradersMindBot', true),
    
    // Admin user (for permission testing)
    adminUser: new MockUser('admin_001', 'ServerAdmin')
};

// Test scenarios data
const testScenarios = {
    singleTicker: {
        message: 'I think GOOGL is going up today',
        expectedTickers: ['GOOGL'],
        buttonCount: 1
    },
    
    multipleTickers: {
        message: 'Trading AAPL, MSFT, and TSLA today',
        expectedTickers: ['AAPL', 'MSFT', 'TSLA'],
        buttonCount: 3
    },
    
    noTickers: {
        message: 'Bad day for trading',
        expectedTickers: [],
        buttonCount: 0
    },
    
    manyTickers: {
        message: 'CHEF, AGX, TPR, GEV, PRIM, VIK, OKLO, SMR, CLS, ECG',
        expectedTickers: ['CHEF', 'AGX', 'TPR', 'GEV', 'PRIM', 'VIK', 'OKLO', 'SMR', 'CLS', 'ECG'],
        buttonCount: 10
    }
};

// Mock thread names for consistency
const threadNames = {
    getThreadName: (user) => {
        const displayName = typeof user === 'string' ? user : 
            (user.displayName || user.globalName || user.username);
        return `📊 ${displayName}'s Stock Charts`;
    },
    
    // Expected thread names for test users
    user2Thread: `📊 ${testUsers.buttonClicker.displayName || testUsers.buttonClicker.globalName || testUsers.buttonClicker.username}'s Stock Charts`,
    user3Thread: `📊 ${testUsers.outsideUser.displayName || testUsers.outsideUser.globalName || testUsers.outsideUser.username}'s Stock Charts`
};

// Permission sets for testing
const permissions = {
    // Standard user permissions
    user: {
        canSendMessages: true,
        canCreateThreads: false,
        canSendMessagesInThreads: true,
        canViewChannel: true
    },
    
    // Bot permissions (what the bot needs)
    bot: {
        canSendMessages: true,
        canCreateThreads: true,
        canSendMessagesInThreads: true,
        canAttachFiles: true,
        canEmbedLinks: true,
        canReadMessageHistory: true,
        canUseExternalEmojis: true
    },
    
    // Admin permissions
    admin: {
        canSendMessages: true,
        canCreateThreads: true,
        canSendMessagesInThreads: true,
        canAttachFiles: true,
        canEmbedLinks: true,
        canReadMessageHistory: true,
        canUseExternalEmojis: true,
        canManageThreads: true,
        canManageMessages: true
    }
};

// Test channel configurations
const testChannels = {
    mainChannel: {
        id: 'channel_123',
        name: 'stock-chat',
        type: 'GUILD_TEXT'
    },
    
    restrictedChannel: {
        id: 'channel_456',
        name: 'private-trading',
        type: 'GUILD_TEXT'
    }
};

// Mock API responses for consistent testing
const mockApiResponses = {
    googl: {
        symbol: 'GOOGL',
        currentPrice: '150.25',
        change: '2.15',
        changePercent: '1.45',
        dates: ['2024-01-01', '2024-01-02', '2024-01-03'],
        prices: [148.10, 149.50, 150.25],
        volumes: [1000000, 1100000, 950000],
        company: 'GOOGL'
    },
    
    aapl: {
        symbol: 'AAPL',
        currentPrice: '185.50',
        change: '-1.25',
        changePercent: '-0.67',
        dates: ['2024-01-01', '2024-01-02', '2024-01-03'],
        prices: [187.00, 186.25, 185.50],
        volumes: [2000000, 1900000, 2100000],
        company: 'AAPL'
    },
    
    invalidTicker: {
        error: 'Stock not found'
    }
};

module.exports = {
    testUsers,
    testScenarios,
    threadNames,
    permissions,
    testChannels,
    mockApiResponses
};