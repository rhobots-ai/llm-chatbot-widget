const OpenAI = require('openai');
const BaseProvider = require('./base-provider');

class OpenAIProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.client = null;
    this.threads = new Map(); // In-memory thread storage for demo
  }

  async initialize(config) {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    this.client = new OpenAI({
      apiKey: config.apiKey,
    });
    
    this.defaultAssistantId = config.defaultAssistantId;
    
    // Validate the API key and assistant
    try {
      if (this.defaultAssistantId) {
        await this.client.beta.assistants.retrieve(this.defaultAssistantId);
        console.log('✅ OpenAI Assistant validated successfully');
      }
    } catch (error) {
      console.warn('⚠️ Warning: Could not validate OpenAI Assistant:', error.message);
    }
  }

  async sendMessage(message, history = [], options = {}) {
    if (!this.client) {
      throw new Error('OpenAI provider not initialized');
    }

    const assistantId = options.assistantId || this.defaultAssistantId;
    if (!assistantId) {
      throw new Error('No assistant ID provided');
    }

    try {
      // Get or create thread
      let threadId = options.threadId;
      if (!threadId) {
        threadId = await this.createThread();
      }

      // Add the user message to the thread
      await this.client.beta.threads.messages.create(threadId, {
        role: 'user',
        content: message
      });

      // Run the assistant
      const run = await this.client.beta.threads.runs.create(threadId, {
        assistant_id: assistantId
      });

      // Wait for completion
      let runStatus = await this.client.beta.threads.runs.retrieve(threadId, run.id);
      
      // Poll for completion (with timeout)
      const maxAttempts = 30; // 30 seconds timeout
      let attempts = 0;
      
      while (runStatus.status === 'in_progress' || runStatus.status === 'queued') {
        if (attempts >= maxAttempts) {
          throw new Error('Assistant response timeout');
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        runStatus = await this.client.beta.threads.runs.retrieve(threadId, run.id);
        attempts++;
      }

      if (runStatus.status === 'failed') {
        const errorMessage = runStatus.last_error && runStatus.last_error.message 
          ? runStatus.last_error.message 
          : 'Unknown error';
        throw new Error(`Assistant run failed: ${errorMessage}`);
      }

      if (runStatus.status === 'requires_action') {
        throw new Error('Assistant requires action (function calling not implemented)');
      }

      // Get the assistant's response
      const messages = await this.client.beta.threads.messages.list(threadId, {
        order: 'desc',
        limit: 1
      });

      const assistantMessage = messages.data[0];
      if (!assistantMessage || assistantMessage.role !== 'assistant') {
        throw new Error('No assistant response found');
      }

      // Extract text content
      const textContent = assistantMessage.content.find(content => content.type === 'text');
      if (!textContent) {
        throw new Error('No text content in assistant response');
      }

      // Store thread ID for future use
      this.threads.set(threadId, {
        id: threadId,
        created: Date.now(),
        lastUsed: Date.now()
      });

      return {
        message: textContent.text.value,
        threadId: threadId
      };

    } catch (error) {
      console.error('OpenAI Provider Error:', error);
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  async createThread(options = {}) {
    if (!this.client) {
      throw new Error('OpenAI provider not initialized');
    }

    try {
      const thread = await this.client.beta.threads.create(options);
      return thread.id;
    } catch (error) {
      throw new Error(`Failed to create thread: ${error.message}`);
    }
  }

  async getThread(threadId) {
    if (!this.client) {
      throw new Error('OpenAI provider not initialized');
    }

    try {
      const thread = await this.client.beta.threads.retrieve(threadId);
      return thread;
    } catch (error) {
      throw new Error(`Failed to get thread: ${error.message}`);
    }
  }

  async deleteThread(threadId) {
    if (!this.client) {
      throw new Error('OpenAI provider not initialized');
    }

    try {
      await this.client.beta.threads.del(threadId);
      this.threads.delete(threadId);
      return true;
    } catch (error) {
      console.error('Failed to delete thread:', error);
      return false;
    }
  }

  validateConfig() {
    return !!(this.config.apiKey && this.defaultAssistantId);
  }

  getName() {
    return 'openai';
  }

  getCapabilities() {
    return {
      streaming: true,
      fileUpload: true,
      functionCalling: true,
      imageGeneration: false,
      codeInterpreter: true
    };
  }

  // Utility method to clean up old threads (for memory management)
  cleanupOldThreads(maxAge = 24 * 60 * 60 * 1000) { // 24 hours
    const now = Date.now();
    for (const [threadId, threadInfo] of this.threads.entries()) {
      if (now - threadInfo.lastUsed > maxAge) {
        this.deleteThread(threadId);
      }
    }
  }
}

module.exports = OpenAIProvider;
