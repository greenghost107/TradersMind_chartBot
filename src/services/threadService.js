/**
 * Thread Service - Handles Discord thread management
 */

class ThreadService {
    constructor(botClient = null) {
        this.userThreads = new Map();
        this.botClient = botClient;
        
        // Our bot's specific thread name pattern
        this.THREAD_NAME_PATTERN = /^📊 (.+)'s Stock Charts$/;
    }

    /**
     * Get the current bot ID (lazy initialization)
     * @returns {string|null} Bot user ID if available
     */
    getBotId() {
        return this.botClient?.user?.id || null;
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
                return {
                    thread: existingThread,
                    systemMessageId: null,
                    isNewThread: false
                };
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
        
        console.log(`🧵 Created thread for user ${user.username} (${userId}): ${thread.name} [${thread.id}]`);
        
        // Try to find the system message created by Discord
        let systemMessageId = null;
        try {
            systemMessageId = await this.findThreadSystemMessage(channel, thread);
        } catch (error) {
            console.warn(`⚠️ Could not find system message for thread ${thread.id}:`, error.message);
        }
        
        // Auto-cleanup thread reference after 1 hour (but only if no pending messages)
        setTimeout(() => {
            // Only remove if the thread has been archived/inactive
            if (this.userThreads.has(userId)) {
                const thread = this.userThreads.get(userId);
                try {
                    // Keep reference if thread is still active (not archived)
                    if (thread.archived) {
                        this.userThreads.delete(userId);
                        console.log(`⏰ Auto-removed archived thread reference for user ${userId} after 1 hour`);
                    } else {
                        console.log(`⏰ Keeping active thread reference for user ${userId} - thread not yet archived`);
                    }
                } catch (error) {
                    // If we can't access the thread, remove the reference
                    this.userThreads.delete(userId);
                    console.log(`⏰ Auto-removed stale thread reference for user ${userId} after 1 hour (error: ${error.message})`);
                }
            }
        }, 3600000); // 1 hour
        
        // Return both thread and system message info
        return {
            thread,
            systemMessageId,
            isNewThread: true
        };
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
     * Check if user has pending tracked messages before removing thread reference
     * @param {string} userId - User ID to check
     * @param {Function} hasUserMessagesCallback - Function that returns true if user has tracked messages
     * @returns {boolean} - True if thread reference was removed
     */
    removeUserThreadIfSafe(userId, hasUserMessagesCallback) {
        if (!this.userThreads.has(userId)) {
            return false;
        }

        // Check if user has pending messages
        if (hasUserMessagesCallback && hasUserMessagesCallback(userId)) {
            console.log(`🔒 Keeping thread reference for user ${userId} - has pending tracked messages`);
            return false;
        }

        this.userThreads.delete(userId);
        console.log(`🧹 Safely removed thread reference for user ${userId} - no pending messages`);
        return true;
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

    /**
     * Force delete a user's thread immediately
     */
    async forceDeleteUserThread(userId, reason = 'Forced cleanup') {
        const thread = this.userThreads.get(userId);
        if (!thread) {
            return false;
        }

        try {
            // Remove from tracking first
            this.removeUserThread(userId);
            
            // Try to delete the actual Discord thread
            await thread.delete(reason);
            
            console.log(`🗑️ Force deleted thread for user ${userId}: ${reason}`);
            return true;
        } catch (error) {
            console.warn(`⚠️ Failed to force delete thread for user ${userId}:`, error.message);
            return false;
        }
    }

    /**
     * Clean up thread immediately if it has issues
     */
    async cleanupThreadOnError(userId, errorContext = '') {
        const thread = this.userThreads.get(userId);
        if (!thread) {
            return;
        }

        try {
            // First try to fetch the thread to see if it still exists
            await thread.fetch();
            
            // If fetch succeeds, just remove from tracking (let Discord auto-archive)
            this.removeUserThread(userId);
            console.log(`🧹 Cleaned up thread reference for user ${userId} due to error: ${errorContext}`);
            
        } catch (fetchError) {
            // Thread doesn't exist anymore, just remove from tracking
            this.removeUserThread(userId);
            console.log(`🧹 Removed stale thread reference for user ${userId}: ${fetchError.message}`);
        }
    }

    /**
     * Get thread info for debugging
     */
    getThreadInfo(userId) {
        const thread = this.userThreads.get(userId);
        if (!thread) {
            return null;
        }

        return {
            id: thread.id,
            name: thread.name,
            archived: thread.archived,
            locked: thread.locked,
            createdTimestamp: thread.createdTimestamp,
            memberCount: thread.memberCount
        };
    }

    /**
     * Find the system message created by Discord when a thread is created by our bot
     */
    async findThreadSystemMessage(channel, thread) {
        try {
            // Ensure we have bot info for validation
            const botId = this.getBotId();
            if (!botId || !this.botClient?.user) {
                console.warn('Bot client not yet logged in, skipping thread system message search');
                return null;
            }

            // Verify the thread name matches our pattern
            if (!this.THREAD_NAME_PATTERN.test(thread.name)) {
                console.warn('Thread name does not match our pattern, skipping system message search', {
                    threadName: thread.name,
                    pattern: this.THREAD_NAME_PATTERN.toString()
                });
                return null;
            }

            // Fetch recent messages from the parent channel
            const messages = await channel.messages.fetch({ limit: 10 });
            
            // Look for the thread creation system message created by our bot
            for (const message of messages.values()) {
                if (message.system && 
                    message.type === 18 && // MessageType.ThreadCreated
                    await this.isOurBotSystemMessage(message, thread)) {
                    return message.id;
                }
            }
            
            return null;
        } catch (error) {
            console.warn('Error finding thread system message:', error.message);
            return null;
        }
    }

    /**
     * Validate that a system message was created for our bot's thread
     */
    async isOurBotSystemMessage(message, thread) {
        try {
            // Check the message content format and extract info
            // Expected: "botname started a thread: 📊 Username's Stock Charts. See all threads."
            const contentMatch = message.content.match(/^(.+?) started a thread: (.+?)\. See all threads\.$/);
            if (!contentMatch) {
                return false;
            }

            const [, botMention, threadName] = contentMatch;
            
            // Verify the thread name matches exactly
            if (threadName !== thread.name) {
                return false;
            }

            // Verify the thread name matches our specific pattern
            if (!this.THREAD_NAME_PATTERN.test(threadName)) {
                return false;
            }

            // Verify the bot mentioned is our bot
            const botUser = this.botClient.user;
            if (!botMention.includes(botUser.username) && !botMention.includes(botUser.id)) {
                return false;
            }

            // If we have thread reference, verify ownership
            if (message.thread) {
                if (message.thread.id !== thread.id) {
                    return false;
                }
                
                const botId = this.getBotId();
                if (message.thread.ownerId && message.thread.ownerId !== botId) {
                    return false;
                }
            }

            return true;

        } catch (error) {
            console.warn('Error validating system message:', error.message);
            return false;
        }
    }
}

module.exports = ThreadService;