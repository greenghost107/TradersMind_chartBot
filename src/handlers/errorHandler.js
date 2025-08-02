/**
 * Error Handler - Centralized error handling and logging
 */

class ErrorHandler {
    constructor() {
        this.errorCounts = new Map();
        this.lastErrors = [];
        this.maxErrorHistory = 100;
    }

    /**
     * Handle and log errors with context
     */
    handleError(error, context = {}) {
        const errorInfo = {
            message: error.message,
            stack: error.stack,
            context,
            timestamp: new Date().toISOString(),
            type: error.constructor.name
        };

        // Log the error
        this.logError(errorInfo);
        
        // Track error frequency
        this.trackError(error.message);
        
        // Store in history
        this.addToHistory(errorInfo);
        
        return errorInfo;
    }

    /**
     * Log error with appropriate level
     */
    logError(errorInfo) {
        const { message, context, timestamp } = errorInfo;
        
        console.error(`🚨 [${timestamp}] Error: ${message}`);
        
        if (context.ticker) {
            console.error(`   Ticker: ${context.ticker}`);
        }
        
        if (context.userId) {
            console.error(`   User: ${context.userId}`);
        }
        
        if (context.action) {
            console.error(`   Action: ${context.action}`);
        }
        
        // Log stack trace for development
        if (process.env.NODE_ENV === 'development') {
            console.error(`   Stack: ${errorInfo.stack}`);
        }
    }

    /**
     * Track error frequency for monitoring
     */
    trackError(errorMessage) {
        const count = this.errorCounts.get(errorMessage) || 0;
        this.errorCounts.set(errorMessage, count + 1);
        
        // Alert if error occurs frequently
        if (count > 10) {
            console.warn(`⚠️  Frequent error detected: "${errorMessage}" (${count + 1} times)`);
        }
    }

    /**
     * Add error to history
     */
    addToHistory(errorInfo) {
        this.lastErrors.unshift(errorInfo);
        
        // Keep only recent errors
        if (this.lastErrors.length > this.maxErrorHistory) {
            this.lastErrors.splice(this.maxErrorHistory);
        }
    }

    /**
     * Handle stock-related errors specifically
     */
    handleStockError(error, ticker, context = {}) {
        return this.handleError(error, {
            ...context,
            ticker,
            action: 'stock_operation'
        });
    }

    /**
     * Handle Discord-related errors specifically
     */
    handleDiscordError(error, context = {}) {
        return this.handleError(error, {
            ...context,
            action: 'discord_operation'
        });
    }

    /**
     * Handle chart generation errors specifically
     */
    handleChartError(error, ticker, context = {}) {
        return this.handleError(error, {
            ...context,
            ticker,
            action: 'chart_generation'
        });
    }

    /**
     * Get error statistics
     */
    getErrorStats() {
        const totalErrors = this.lastErrors.length;
        const recentErrors = this.lastErrors.filter(
            error => Date.now() - new Date(error.timestamp).getTime() < 3600000 // Last hour
        ).length;
        
        const mostFrequentErrors = Array.from(this.errorCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        
        return {
            totalErrors,
            recentErrors,
            mostFrequentErrors,
            errorTypes: [...new Set(this.lastErrors.map(e => e.type))]
        };
    }

    /**
     * Clear error history
     */
    clearHistory() {
        this.lastErrors = [];
        this.errorCounts.clear();
        console.log('🧹 Error history cleared');
    }

    /**
     * Check if system is healthy based on error rates
     */
    isSystemHealthy() {
        const recentErrors = this.lastErrors.filter(
            error => Date.now() - new Date(error.timestamp).getTime() < 300000 // Last 5 minutes
        ).length;
        
        // Consider unhealthy if more than 10 errors in 5 minutes
        return recentErrors < 10;
    }
}

module.exports = ErrorHandler;