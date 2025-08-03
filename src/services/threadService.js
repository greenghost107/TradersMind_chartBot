/**
 * Thread Service - Handles Discord thread management
 */

class ThreadService {
    constructor() {
        this.userThreads = new Map();
    }

    /**
     * Get or create a dedicated thread for a user
     */
    async getOrCreateUserThread(channel, user) {
        const userId = user.id;
        
        // Check if user already has an active thread
        if (this.userThreads.has(userId)) {
            const existingThread = this.userThreads.get(userId);
            try {
                // Verify thread still exists and is accessible
                await existingThread.fetch();
                return existingThread;
            } catch (error) {
                // Thread was deleted or is inaccessible, remove from map
                this.userThreads.delete(userId);
            }
        }

        // Create new thread for user
        const thread = await channel.threads.create({
            name: `📊 ${user.displayName || user.globalName || user.username}'s Stock Charts`,
            autoArchiveDuration: 60, // Auto-archive after 1 hour of inactivity
            reason: 'Stock chart viewing thread'
        });
        
        // Store thread in map
        this.userThreads.set(userId, thread);
        
        // Auto-cleanup thread reference after 1 hour
        setTimeout(() => {
            this.userThreads.delete(userId);
        }, 3600000); // 1 hour
        
        return thread;
    }

    /**
     * Get user's existing thread if it exists
     */
    getUserThread(userId) {
        return this.userThreads.get(userId);
    }

    /**
     * Remove user thread from tracking
     */
    removeUserThread(userId) {
        this.userThreads.delete(userId);
    }

    /**
     * Clean up all expired thread references
     */
    cleanupExpiredThreads() {
        console.log('🧹 Cleaning up thread references...');
        
        // Note: This is a basic cleanup. In a production environment,
        // you might want to check if threads are still active/accessible
        const currentTime = Date.now();
        const oneHour = 3600000;
        
        for (const [userId, thread] of this.userThreads.entries()) {
            try {
                // If thread is archived or too old, remove from tracking
                if (thread.archived || (currentTime - thread.createdTimestamp) > oneHour) {
                    this.userThreads.delete(userId);
                }
            } catch (error) {
                // If we can't access the thread, remove it
                this.userThreads.delete(userId);
            }
        }
    }

    /**
     * Get total number of tracked threads
     */
    getActiveThreadCount() {
        return this.userThreads.size;
    }

    /**
     * Get all user IDs with active threads
     */
    getActiveUserIds() {
        return Array.from(this.userThreads.keys());
    }

    /**
     * Send a message to a user's thread
     */
    async sendToUserThread(userId, messageOptions) {
        const thread = this.userThreads.get(userId);
        if (!thread) {
            throw new Error(`No active thread found for user ${userId}`);
        }

        try {
            return await thread.send(messageOptions);
        } catch (error) {
            // If sending fails, the thread might be deleted
            this.userThreads.delete(userId);
            throw new Error(`Failed to send message to thread: ${error.message}`);
        }
    }

    /**
     * Check if user has an active thread
     */
    hasActiveThread(userId) {
        return this.userThreads.has(userId);
    }
}

module.exports = ThreadService;