/**
 * Logger Utility - Structured logging with different levels
 */

const CONFIG = require('../constants/config');

class Logger {
    constructor(level = 'info') {
        this.level = level;
        this.levels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3
        };
    }

    /**
     * Check if message should be logged based on level
     */
    shouldLog(messageLevel) {
        return this.levels[messageLevel] <= this.levels[this.level];
    }

    /**
     * Format log message with timestamp and prefix
     */
    formatMessage(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const prefix = CONFIG.LOGGING.PREFIXES[level.toUpperCase()] || '';
        
        let formatted = `[${timestamp}] ${prefix} ${message}`;
        
        if (data) {
            formatted += ` ${JSON.stringify(data)}`;
        }
        
        return formatted;
    }

    /**
     * Log error message
     */
    error(message, data = null) {
        if (this.shouldLog('error')) {
            console.error(this.formatMessage('error', message, data));
        }
    }

    /**
     * Log warning message
     */
    warn(message, data = null) {
        if (this.shouldLog('warn')) {
            console.warn(this.formatMessage('warn', message, data));
        }
    }

    /**
     * Log info message
     */
    info(message, data = null) {
        if (this.shouldLog('info')) {
            console.log(this.formatMessage('info', message, data));
        }
    }

    /**
     * Log debug message
     */
    debug(message, data = null) {
        if (this.shouldLog('debug')) {
            console.log(this.formatMessage('debug', message, data));
        }
    }

    /**
     * Log success message
     */
    success(message, data = null) {
        if (this.shouldLog('info')) {
            const timestamp = new Date().toISOString();
            const prefix = CONFIG.LOGGING.PREFIXES.SUCCESS;
            let formatted = `[${timestamp}] ${prefix} ${message}`;
            
            if (data) {
                formatted += ` ${JSON.stringify(data)}`;
            }
            
            console.log(formatted);
        }
    }

    /**
     * Log with specific prefix
     */
    logWithPrefix(prefix, message, data = null) {
        if (this.shouldLog('info')) {
            const timestamp = new Date().toISOString();
            let formatted = `[${timestamp}] ${prefix} ${message}`;
            
            if (data) {
                formatted += ` ${JSON.stringify(data)}`;
            }
            
            console.log(formatted);
        }
    }

    /**
     * Set log level
     */
    setLevel(level) {
        if (this.levels.hasOwnProperty(level)) {
            this.level = level;
        } else {
            this.warn(`Invalid log level: ${level}. Using current level: ${this.level}`);
        }
    }

    /**
     * Get current log level
     */
    getLevel() {
        return this.level;
    }
}

// Create default logger instance
// Note: Environment class can't be imported here due to circular dependency
// Use env var directly with same defaults as Environment class
const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'info');
const defaultLogger = new Logger(logLevel);

module.exports = {
    Logger,
    logger: defaultLogger
};