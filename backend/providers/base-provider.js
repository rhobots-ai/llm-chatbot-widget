/**
 * Base Provider Interface
 * All AI providers must implement this interface
 */
class BaseProvider {
  constructor(config) {
    this.config = config;
  }

  /**
   * Initialize the provider with configuration
   * @param {Object} config - Provider-specific configuration
   */
  async initialize(config) {
    throw new Error('initialize() must be implemented by provider');
  }

  /**
   * Send a message and get a response
   * @param {string} message - User message
   * @param {Array} history - Conversation history
   * @param {Object} options - Additional options (assistantId, etc.)
   * @returns {Promise<string>} - AI response
   */
  async sendMessage(message, history = [], options = {}) {
    throw new Error('sendMessage() must be implemented by provider');
  }

  /**
   * Create a new conversation thread
   * @param {Object} options - Thread creation options
   * @returns {Promise<string>} - Thread ID
   */
  async createThread(options = {}) {
    throw new Error('createThread() must be implemented by provider');
  }

  /**
   * Get conversation thread
   * @param {string} threadId - Thread ID
   * @returns {Promise<Object>} - Thread object
   */
  async getThread(threadId) {
    throw new Error('getThread() must be implemented by provider');
  }

  /**
   * Delete a conversation thread
   * @param {string} threadId - Thread ID
   * @returns {Promise<boolean>} - Success status
   */
  async deleteThread(threadId) {
    throw new Error('deleteThread() must be implemented by provider');
  }

  /**
   * Validate provider configuration
   * @returns {boolean} - Configuration validity
   */
  validateConfig() {
    throw new Error('validateConfig() must be implemented by provider');
  }

  /**
   * Get provider name
   * @returns {string} - Provider name
   */
  getName() {
    throw new Error('getName() must be implemented by provider');
  }

  /**
   * Get provider capabilities
   * @returns {Object} - Provider capabilities
   */
  getCapabilities() {
    return {
      streaming: false,
      fileUpload: false,
      functionCalling: false,
      imageGeneration: false,
      codeInterpreter: false
    };
  }
}

module.exports = BaseProvider;
