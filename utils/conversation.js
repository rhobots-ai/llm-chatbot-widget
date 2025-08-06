const database = require('./database');

/**
 * Conversation Management Utility
 * Handles conversation state and thread management with SQLite persistence
 */
class ConversationManager {
  constructor() {
    this.initialized = false;
  }

  /**
   * Initialize the conversation manager
   */
  async initialize() {
    if (!this.initialized) {
      await database.initialize();
      this.initialized = true;
    }
  }

  /**
   * Create a new conversation
   * @param {string} userId - User identifier (optional)
   * @param {Object} metadata - Additional conversation metadata
   * @param {string} name - Optional conversation name
   * @returns {string} - Conversation ID
   */
  async createConversation(userId = null, metadata = {}, name = null) {
    await this.ensureInitialized();
    const conversationId = this.generateId();
    const metabaseQuestionUrl = metadata.metabaseQuestionUrl || null;
    await database.createConversation(conversationId, userId, metadata, metabaseQuestionUrl, name);
    return conversationId;
  }

  /**
   * Get conversation by ID
   * @param {string} conversationId - Conversation ID
   * @returns {Object|null} - Conversation object or null if not found
   */
  async getConversation(conversationId) {
    await this.ensureInitialized();
    return await database.getConversation(conversationId);
  }

  /**
   * Add message to conversation
   * @param {string} conversationId - Conversation ID
   * @param {string} message - Message text
   * @param {string} sender - Message sender ('user' or 'bot')
   * @param {Object} metadata - Additional message metadata
   * @returns {number} - Message ID
   */
  async addMessage(conversationId, message, sender, metadata = {}) {
    await this.ensureInitialized();
    
    // Check if conversation exists
    const conversation = await database.getConversation(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const messageId = await database.addMessage(conversationId, message, sender, metadata);
    
    // Auto-generate conversation name from first user message if not already named
    if (sender === 'user' && !conversation.name && conversation.message_count === 0) {
      const generatedName = database.generateConversationName(message);
      await database.updateConversationName(conversationId, generatedName);
    }
    
    return messageId;
  }

  /**
   * Get conversation history
   * @param {string} conversationId - Conversation ID
   * @param {number} limit - Maximum number of messages to return
   * @returns {Array} - Array of message objects
   */
  async getHistory(conversationId, limit = null) {
    await this.ensureInitialized();
    const messages = await database.getMessages(conversationId, limit);
    return this.convertToWidgetHistory(messages);
  }

  /**
   * Map conversation to thread ID
   * @param {string} conversationId - Conversation ID
   * @param {string} threadId - Thread ID from AI provider
   */
  async mapToThread(conversationId, threadId) {
    await this.ensureInitialized();
    await database.updateConversationThread(conversationId, threadId);
  }

  /**
   * Get thread ID for conversation
   * @param {string} conversationId - Conversation ID
   * @returns {string|null} - Thread ID or null if not mapped
   */
  async getThreadId(conversationId) {
    await this.ensureInitialized();
    const conversation = await database.getConversation(conversationId);
    return conversation ? conversation.thread_id : null;
  }

  /**
   * Get conversation by thread ID
   * @param {string} threadId - Thread ID
   * @returns {Object|null} - Conversation object or null if not found
   */
  async getConversationByThreadId(threadId) {
    await this.ensureInitialized();
    return await database.getConversationByThreadId(threadId);
  }

  /**
   * Get conversations for a user
   * @param {string} userId - User ID
   * @param {number} limit - Maximum number of conversations to return
   * @param {number} offset - Offset for pagination
   * @returns {Array} - Array of conversation objects
   */
  async getUserConversations(userId, limit = 10, offset = 0) {
    await this.ensureInitialized();
    return await database.getUserConversations(userId, limit, offset);
  }

  /**
   * Delete conversation
   * @param {string} conversationId - Conversation ID
   * @returns {boolean} - Success status
   */
  async deleteConversation(conversationId) {
    await this.ensureInitialized();
    return await database.deleteConversation(conversationId);
  }

  /**
   * Clean up old conversations
   * @param {number} maxAge - Maximum age in milliseconds
   * @returns {number} - Number of conversations cleaned up
   */
  async cleanupOldConversations(maxAge = 24 * 60 * 60 * 1000) {
    await this.ensureInitialized();
    return await database.cleanupOldConversations(maxAge);
  }

  /**
   * Get conversation statistics
   * @returns {Object} - Statistics object
   */
  async getStats() {
    await this.ensureInitialized();
    return await database.getStats();
  }

  /**
   * Update conversation metadata
   * @param {string} conversationId - Conversation ID
   * @param {Object} metadata - Metadata to update
   * @returns {boolean} - Success status
   */
  async updateConversationMetadata(conversationId, metadata) {
    await this.ensureInitialized();
    return await database.updateConversationMetadata(conversationId, metadata);
  }

  /**
   * Update conversation name
   * @param {string} conversationId - Conversation ID
   * @param {string} name - New conversation name
   * @returns {boolean} - Success status
   */
  async updateConversationName(conversationId, name) {
    await this.ensureInitialized();
    return await database.updateConversationName(conversationId, name);
  }

  /**
   * Generate conversation name from message
   * @param {string} message - Message to generate name from
   * @returns {string} - Generated conversation name
   */
  generateConversationName(message) {
    return database.generateConversationName(message);
  }

  /**
   * Get conversation with full message history
   * @param {string} conversationId - Conversation ID
   * @returns {Object|null} - Conversation with messages or null if not found
   */
  async getConversationWithMessages(conversationId) {
    await this.ensureInitialized();
    
    const conversation = await database.getConversation(conversationId);
    if (!conversation) {
      return null;
    }

    const messages = await database.getMessages(conversationId);
    
    return {
      ...conversation,
      messages: this.convertToWidgetHistory(messages)
    };
  }

  /**
   * Ensure the manager is initialized
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Generate unique ID
   * @returns {string} - Unique identifier
   */
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * Convert widget history format to internal format
   * @param {Array} widgetHistory - History from widget
   * @returns {Array} - Converted history
   */
  convertWidgetHistory(widgetHistory) {
    if (!Array.isArray(widgetHistory)) {
      return [];
    }

    return widgetHistory.map(msg => ({
      text: msg.text || msg.message || '',
      sender: msg.sender || 'user',
      timestamp: msg.timestamp || Date.now()
    }));
  }

  /**
   * Convert internal history to widget format
   * @param {Array} internalHistory - Internal history format (from database)
   * @returns {Array} - Widget-compatible history
   */
  convertToWidgetHistory(internalHistory) {
    if (!Array.isArray(internalHistory)) {
      return [];
    }

    return internalHistory.map(msg => ({
      id: msg.id,
      text: msg.text,
      sender: msg.sender,
      timestamp: msg.timestamp,
      rating: msg.rating,
      rating_comment: msg.rating_comment,
      rating_timestamp: msg.rating_timestamp
    }));
  }

  /**
   * Close database connection (for graceful shutdown)
   */
  async close() {
    if (this.initialized) {
      await database.close();
      this.initialized = false;
    }
  }
}

// Export singleton instance
module.exports = new ConversationManager();
