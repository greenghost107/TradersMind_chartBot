/**
 * Application Constants and Configuration
 */

module.exports = {
    // Discord limits
    DISCORD: {
        MAX_BUTTONS_PER_ROW: 5,
        MAX_ROWS_PER_MESSAGE: 5,
        MAX_BUTTONS_TOTAL: 25,
        MAX_MESSAGE_LENGTH: 2000,
        MAX_EMBED_DESCRIPTION: 4096
    },

    // Chart configuration
    CHART: {
        WIDTH: 840,
        HEIGHT: 440,
        CANVAS_WIDTH: 800,
        CANVAS_HEIGHT: 400,
        WAIT_TIME: 3000, // milliseconds to wait for chart rendering
        COLORS: {
            POSITIVE: '#00ff88',
            NEGATIVE: '#ff4444',
            POSITIVE_BG: 'rgba(0, 255, 136, 0.1)',
            NEGATIVE_BG: 'rgba(255, 68, 68, 0.1)'
        }
    },

    // Stock data configuration
    STOCK: {
        MAX_TICKER_LENGTH: 5,
        MIN_TICKER_LENGTH: 1,
        DATA_POINTS: 30, // Number of days to show in chart
        API_TIMEOUT: 10000, // 10 seconds
        RETRY_ATTEMPTS: 3,
        RETRY_DELAY: 1000 // milliseconds
    },

    // Cache configuration
    CACHE: {
        DEFAULT_TTL: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
        CLEANUP_INTERVAL: 60 * 60 * 1000, // 1 hour in milliseconds
        MAX_ENTRIES: 1000
    },

    // Thread configuration
    THREADS: {
        AUTO_ARCHIVE_DURATION: 60, // minutes
        CLEANUP_INTERVAL: 60 * 60 * 1000, // 1 hour in milliseconds
        MAX_ACTIVE_THREADS: 100,
        NAME_TEMPLATE: '📊 {username}\'s Stock Charts'
    },

    // Error handling
    ERRORS: {
        MAX_ERROR_HISTORY: 100,
        FREQUENT_ERROR_THRESHOLD: 10,
        HEALTH_CHECK_INTERVAL: 5 * 60 * 1000, // 5 minutes
        MAX_ERRORS_PER_INTERVAL: 10
    },

    // API URLs and endpoints
    APIS: {
        ALPHA_VANTAGE: {
            BASE_URL: 'https://www.alphavantage.co/query',
            FUNCTION: 'TIME_SERIES_DAILY',
            OUTPUT_SIZE: 'compact'
        }
    },

    // Logging
    LOGGING: {
        LEVELS: {
            ERROR: 'error',
            WARN: 'warn',
            INFO: 'info',
            DEBUG: 'debug'
        },
        PREFIXES: {
            ERROR: '🚨',
            WARN: '⚠️',
            INFO: 'ℹ️',
            DEBUG: '🔍',
            SUCCESS: '✅',
            CACHE: '💾',
            CHART: '📊',
            THREAD: '🧵',
            API: '🌐',
            CLEANUP: '🧹'
        }
    },

    // Puppeteer configuration
    PUPPETEER: {
        ARGS: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ],
        VIEWPORT: {
            width: 840,
            height: 440
        },
        TIMEOUT: 30000 // 30 seconds
    },

    // Rate limiting
    RATE_LIMITS: {
        ALPHA_VANTAGE_FREE: 25, // requests per day
        CHART_GENERATION: 100, // charts per hour
        BUTTON_CLICKS: 60 // clicks per minute per user
    },

    // Feature flags
    FEATURES: {
        ENABLE_CACHING: true,
        ENABLE_THREAD_CLEANUP: true,
        ENABLE_ERROR_TRACKING: true,
        ENABLE_STATS_LOGGING: true,
        ENABLE_HEALTH_CHECKS: true
    },

    // Messages and templates
    MESSAGES: {
        ERRORS: {
            STOCK_NOT_FOUND: 'Could not fetch data for **{ticker}**. Please check if the symbol is correct.',
            API_RATE_LIMIT: 'API rate limit exceeded. Please try again later.',
            CHART_GENERATION_FAILED: 'Failed to generate chart for **{ticker}**. Please try again.',
            THREAD_CREATION_FAILED: 'Failed to create thread. Please check bot permissions.',
            GENERAL_ERROR: 'An error occurred while processing your request. Please try again.'
        },
        SUCCESS: {
            CHART_SENT: 'Chart sent to your thread!',
            THREAD_CREATED: 'Thread created successfully!'
        }
    }
};