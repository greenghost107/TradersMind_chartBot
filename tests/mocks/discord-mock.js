/**
 * Discord.js Mock Utilities for Testing
 * Provides mock implementations of Discord client, channels, threads, and interactions
 */

class MockUser {
    constructor(id, username, bot = false) {
        this.id = id;
        this.username = username;
        this.bot = bot;
        this.tag = `${username}#1234`;
    }
}

class MockThread {
    constructor(id, name, parentId, ownerId) {
        this.id = id;
        this.name = name;
        this.parentId = parentId;
        this.ownerId = ownerId;
        this.isThread = () => true;
        this.parent = { id: parentId };
        this.messages = [];
        this.members = new Map();
        this.archived = false;
        
        // Add owner to thread members
        this.members.set(ownerId, { user: { id: ownerId } });
    }

    async send(options) {
        const message = new MockMessage('thread_msg_' + Date.now(), this, options);
        this.messages.push(message);
        return message;
    }

    async fetch() {
        if (this.archived) {
            throw new Error('Thread not found or archived');
        }
        return this;
    }

    // Simulate thread visibility - only owner and server members with permissions can see
    canUserAccess(userId) {
        return this.members.has(userId) || userId === this.ownerId;
    }
}

class MockChannel {
    constructor(id, name) {
        this.id = id;
        this.name = name;
        this._threadsMap = new Map();
        this.messages = [];
        this.isThread = () => false;
    }

    async send(options) {
        const message = new MockMessage('msg_' + Date.now(), this, options);
        this.messages.push(message);
        return message;
    }

    async fetch() {
        return this;
    }

    get threads() {
        return {
            create: async (options) => {
                const threadId = 'thread_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                const thread = new MockThread(threadId, options.name, this.id, options.ownerId);
                this._threadsMap.set(threadId, thread);
                return thread;
            },
            cache: this._threadsMap,
            get: (threadId) => this._threadsMap.get(threadId)
        };
    }
}

class MockMessage {
    constructor(id, channel, options = {}) {
        this.id = id;
        this.channel = channel;
        this.content = options.content || '';
        this.components = options.components || [];
        this.embeds = options.embeds || [];
        this.files = options.files || [];
        this.author = options.author || new MockUser('bot', 'TestBot', true);
        this.createdTimestamp = Date.now();
    }

    async reply(options) {
        const reply = new MockMessage('reply_' + Date.now(), this.channel, options);
        reply.reference = { messageId: this.id };
        this.channel.messages.push(reply);
        return reply;
    }

    async delete() {
        const index = this.channel.messages.indexOf(this);
        if (index > -1) {
            this.channel.messages.splice(index, 1);
        }
    }
}

class MockInteraction {
    constructor(user, customId, channel) {
        this.user = user;
        this.customId = customId;
        this.channel = channel;
        this.deferred = false;
        this.replied = false;
        this.deleted = false;
        this.id = 'interaction_' + Date.now();
    }

    isButton() {
        return this.customId.startsWith('stock_');
    }

    async deferReply(options = {}) {
        this.deferred = true;
        this.ephemeral = options.ephemeral || false;
        return Promise.resolve();
    }

    async reply(options) {
        this.replied = true;
        this.replyOptions = options;
        return Promise.resolve();
    }

    async editReply(options) {
        if (!this.deferred && !this.replied) {
            throw new Error('Cannot edit reply before deferring or replying');
        }
        this.replyOptions = { ...this.replyOptions, ...options };
        return Promise.resolve();
    }

    async deleteReply() {
        if (!this.deferred && !this.replied) {
            throw new Error('Cannot delete reply before deferring or replying');
        }
        this.deleted = true;
        return Promise.resolve();
    }
}

class MockClient {
    constructor() {
        this.user = new MockUser('bot_123', 'TestBot', true);
        this.channels = new Map();
        this.users = new Map();
        this.events = new Map();
        this.userThreads = new Map(); // Simulate the bot's userThreads Map
        
        // Add some default channels
        const testChannel = new MockChannel('channel_123', 'test-channel');
        this.channels.set('channel_123', testChannel);
    }

    on(event, handler) {
        if (!this.events.has(event)) {
            this.events.set(event, []);
        }
        this.events.get(event).push(handler);
    }

    emit(event, ...args) {
        const handlers = this.events.get(event) || [];
        handlers.forEach(handler => handler(...args));
    }

    // Simulate bot startup
    async login(token) {
        this.emit('ready');
        return token;
    }

    // Helper methods for testing
    createUser(id, username) {
        const user = new MockUser(id, username);
        this.users.set(id, user);
        return user;
    }

    createChannel(id, name) {
        const channel = new MockChannel(id, name);
        this.channels.set(id, channel);
        return channel;
    }

    simulateMessage(content, author, channel) {
        const message = new MockMessage('msg_' + Date.now(), channel, { content, author });
        channel.messages.push(message);
        this.emit('messageCreate', message);
        return message;
    }

    simulateButtonClick(user, customId, channel) {
        const interaction = new MockInteraction(user, customId, channel);
        this.emit('interactionCreate', interaction);
        return interaction;
    }

    // Get threads for a specific user
    getUserThreads(userId) {
        return this.userThreads.get(userId);
    }

    // Check if user can see a specific thread
    canUserSeeThread(userId, threadId) {
        for (const [channelId, channel] of this.channels) {
            const thread = channel._threadsMap.get(threadId);
            if (thread) {
                return thread.canUserAccess(userId);
            }
        }
        return false;
    }
}

// Mock Alpha Vantage API response
const mockStockData = {
    symbol: 'GOOGL',
    currentPrice: '150.25',
    change: '2.15',
    changePercent: '1.45',
    dates: ['2024-01-01', '2024-01-02', '2024-01-03'],
    prices: [148.10, 149.50, 150.25],
    volumes: [1000000, 1100000, 950000],
    company: 'GOOGL'
};

// Mock chart buffer
const mockChartBuffer = Buffer.from('fake-chart-data');

module.exports = {
    MockUser,
    MockThread,
    MockChannel,
    MockMessage,
    MockInteraction,
    MockClient,
    mockStockData,
    mockChartBuffer
};