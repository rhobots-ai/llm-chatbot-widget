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

  async sendMessageStream(message, history = [], options = {}, onProgress) {
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

      // Emit start event
      if (onProgress) {
        onProgress({
          type: 'message_start',
          threadId: threadId
        });
      }

      // Create streaming run
      const stream = await this.client.beta.threads.runs.create(threadId, {
        assistant_id: assistantId,
        stream: true
      });

      let finalMessage = '';
      let currentMessageId = null;
      let runId = null;

      // Process streaming events
      for await (const event of stream) {
        try {
          // Handle different event types
          switch (event.event) {
            case 'thread.run.created':
              runId = event.data.id;
              if (onProgress) {
                onProgress({
                  type: 'progress',
                  status: 'created',
                  threadId: threadId
                });
              }
              break;

            case 'thread.run.in_progress':
              if (onProgress) {
                onProgress({
                  type: 'progress',
                  status: 'in_progress',
                  threadId: threadId
                });
              }
              break;

            case 'thread.message.created':
              currentMessageId = event.data.id;
              break;

            case 'thread.message.delta':
              // Handle message content deltas (real streaming)
              if (event.data.delta && event.data.delta.content) {
                for (const contentDelta of event.data.delta.content) {
                  if (contentDelta.type === 'text' && contentDelta.text && contentDelta.text.value) {
                    finalMessage += contentDelta.text.value;
                    
                    // Emit streaming content
                    if (onProgress) {
                      onProgress({
                        type: 'message_delta',
                        content: finalMessage,
                        threadId: threadId
                      });
                    }
                  }
                }
              }
              break;

            case 'thread.message.completed':
              // Message is complete
              if (onProgress) {
                onProgress({
                  type: 'progress',
                  status: 'message_completed',
                  threadId: threadId
                });
              }
              break;

            case 'thread.run.completed':
              // Run is complete
              if (onProgress) {
                onProgress({
                  type: 'progress',
                  status: 'completed',
                  threadId: threadId
                });
              }
              break;

            case 'thread.run.failed':
              const errorMessage = event.data.last_error && event.data.last_error.message 
                ? event.data.last_error.message 
                : 'Unknown error';
              throw new Error(`Assistant run failed: ${errorMessage}`);

            case 'thread.run.requires_action':
              throw new Error('Assistant requires action (function calling not implemented)');

            case 'error':
              throw new Error(`Stream error: ${event.data.message || 'Unknown streaming error'}`);

            default:
              // Log unknown events for debugging
              console.debug('Unknown stream event:', event.event);
              break;
          }
        } catch (eventError) {
          console.error('Error processing stream event:', eventError);
          throw eventError;
        }
      }

      // If we didn't get any content from streaming, fall back to getting the final message
      if (!finalMessage && currentMessageId) {
        try {
          const messages = await this.client.beta.threads.messages.list(threadId, {
            order: 'desc',
            limit: 1
          });

          const assistantMessage = messages.data[0];
          if (assistantMessage && assistantMessage.role === 'assistant') {
            const textContent = assistantMessage.content.find(content => content.type === 'text');
            if (textContent) {
              finalMessage = textContent.text.value;
            }
          }
        } catch (fallbackError) {
          console.warn('Failed to get final message as fallback:', fallbackError.message);
        }
      }

      if (!finalMessage) {
        throw new Error('No assistant response received');
      }

      // Store thread ID for future use
      this.threads.set(threadId, {
        id: threadId,
        created: Date.now(),
        lastUsed: Date.now()
      });

      // Emit completion event
      if (onProgress) {
        onProgress({
          type: 'message_complete',
          content: finalMessage,
          threadId: threadId
        });
      }

      return {
        message: finalMessage,
        threadId: threadId
      };

    } catch (error) {
      console.error('OpenAI Provider Stream Error:', error);
      
      // Emit error event
      if (onProgress) {
        onProgress({
          type: 'error',
          error: error.message
        });
      }
      
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
