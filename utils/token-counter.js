const { encoding_for_model } = require('tiktoken');

/**
 * Token Counter Utility
 * Handles token counting and cost calculation for OpenAI models
 */
class TokenCounter {
  constructor() {
    this.encoders = new Map(); // Cache encoders for performance
  }

  /**
   * Get encoder for a specific model
   * @param {string} modelName - OpenAI model name
   * @returns {Object} - Tiktoken encoder
   */
  getEncoder(modelName) {
    if (!this.encoders.has(modelName)) {
      try {
        // Map assistant models to their base models for tiktoken
        const baseModel = this.getBaseModelForTokenCounting(modelName);
        const encoder = encoding_for_model(baseModel);
        this.encoders.set(modelName, encoder);
      } catch (error) {
        console.warn(`Failed to get encoder for model ${modelName}, using gpt-3.5-turbo as fallback:`, error.message);
        // Fallback to gpt-3.5-turbo encoder
        const encoder = encoding_for_model('gpt-3.5-turbo');
        this.encoders.set(modelName, encoder);
      }
    }
    return this.encoders.get(modelName);
  }

  /**
   * Map assistant model names to base models for token counting
   * @param {string} modelName - Model name (could be assistant ID or model name)
   * @returns {string} - Base model name for tiktoken
   */
  getBaseModelForTokenCounting(modelName) {
    // If it's already a known base model, return as-is
    const knownModels = ['gpt-4', 'gpt-4-turbo', 'gpt-4-turbo-preview', 'gpt-3.5-turbo', 'gpt-3.5-turbo-16k'];
    if (knownModels.includes(modelName)) {
      return modelName;
    }

    // For assistant IDs or unknown models, default to gpt-4 (most common for assistants)
    // This can be made more sophisticated by querying the assistant details
    return 'gpt-4';
  }

  /**
   * Count tokens in a text string
   * @param {string} text - Text to count tokens for
   * @param {string} modelName - Model name for appropriate encoding
   * @returns {number} - Token count
   */
  countTokens(text, modelName = 'gpt-4') {
    if (!text || typeof text !== 'string') {
      return 0;
    }

    try {
      const encoder = this.getEncoder(modelName);
      const tokens = encoder.encode(text);
      return tokens.length;
    } catch (error) {
      console.error('Error counting tokens:', error);
      // Rough fallback: ~4 characters per token
      return Math.ceil(text.length / 4);
    }
  }

  /**
   * Count tokens for a conversation history
   * @param {Array} messages - Array of message objects with text and role
   * @param {string} modelName - Model name for appropriate encoding
   * @returns {number} - Total token count
   */
  countConversationTokens(messages, modelName = 'gpt-4') {
    if (!Array.isArray(messages)) {
      return 0;
    }

    let totalTokens = 0;

    // Add tokens for each message
    messages.forEach(message => {
      if (message.text) {
        totalTokens += this.countTokens(message.text, modelName);
        // Add overhead tokens for message formatting (role, etc.)
        totalTokens += 4; // Approximate overhead per message
      }
    });

    // Add system message overhead if applicable
    totalTokens += 3; // Base conversation overhead

    return totalTokens;
  }

  /**
   * Extract token usage from OpenAI API response
   * @param {Object} response - OpenAI API response
   * @returns {Object} - Token usage data
   */
  extractUsageFromResponse(response) {
    const defaultUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    };

    if (!response) {
      return defaultUsage;
    }

    // Check for usage in different response formats
    if (response.usage) {
      return {
        prompt_tokens: response.usage.prompt_tokens || 0,
        completion_tokens: response.usage.completion_tokens || 0,
        total_tokens: response.usage.total_tokens || 0
      };
    }

    // For assistant API responses, usage might be nested differently
    if (response.data && response.data.usage) {
      return {
        prompt_tokens: response.data.usage.prompt_tokens || 0,
        completion_tokens: response.data.usage.completion_tokens || 0,
        total_tokens: response.data.usage.total_tokens || 0
      };
    }

    return defaultUsage;
  }

  /**
   * Calculate cost for token usage
   * @param {number} inputTokens - Number of input tokens
   * @param {number} outputTokens - Number of output tokens
   * @param {string} modelName - Model name for pricing
   * @returns {number} - Cost in USD
   */
  calculateCost(inputTokens, outputTokens, modelName) {
    const pricing = this.getModelPricing(modelName);
    
    const inputCost = (inputTokens / 1000000) * pricing.input;
    const outputCost = (outputTokens / 1000000) * pricing.output;
    
    return inputCost + outputCost;
  }

  /**
   * Get pricing for a model
   * @param {string} modelName - Model name
   * @returns {Object} - Pricing object with input and output rates per 1K tokens
   */
  getModelPricing(modelName) {
    // OpenAI pricing as of 2024 (USD per 1M tokens)
    const pricing = {
      'gpt-4.1': {
        input: 2,
        output: 8
      },
      'gpt-4.1-mini': {
        input: 0.4,
        output: 1.6
      },
      'gpt-4.1-nano': {
        input: 0.1,
        output: 0.4
      },
      'gpt-4': {
        input: 0.03,
        output: 0.06
      },
      'gpt-4-turbo': {
        input: 0.01,
        output: 0.03
      },
      'gpt-4-turbo-preview': {
        input: 0.01,
        output: 0.03
      },
      'gpt-3.5-turbo': {
        input: 0.001,
        output: 0.002
      },
      'gpt-3.5-turbo-16k': {
        input: 0.003,
        output: 0.004
      }
    };

    // Default to gpt-4 pricing for unknown models (conservative estimate)
    return pricing[modelName] || pricing['gpt-4'];
  }

  /**
   * Format token count for display
   * @param {number} tokens - Token count
   * @returns {string} - Formatted token count
   */
  formatTokenCount(tokens) {
    if (tokens < 1000) {
      return tokens.toString();
    } else if (tokens < 1000000) {
      return (tokens / 1000).toFixed(1) + 'K';
    } else {
      return (tokens / 1000000).toFixed(1) + 'M';
    }
  }

  /**
   * Format cost for display
   * @param {number} cost - Cost in USD
   * @returns {string} - Formatted cost
   */
  formatCost(cost) {
    if (cost < 0.01) {
      return '<$0.01';
    } else if (cost < 1) {
      return '$' + cost.toFixed(3);
    } else {
      return '$' + cost.toFixed(2);
    }
  }

  /**
   * Get model display name
   * @param {string} modelName - Model name or assistant ID
   * @returns {string} - Display-friendly model name
   */
  getModelDisplayName(modelName) {
    const displayNames = {
      'gpt-4': 'GPT-4',
      'gpt-4-turbo': 'GPT-4 Turbo',
      'gpt-4-turbo-preview': 'GPT-4 Turbo',
      'gpt-3.5-turbo': 'GPT-3.5 Turbo',
      'gpt-3.5-turbo-16k': 'GPT-3.5 Turbo 16K'
    };

    return displayNames[modelName] || 'GPT-4'; // Default display name
  }

  /**
   * Clean up encoders (call this on shutdown)
   */
  cleanup() {
    this.encoders.forEach(encoder => {
      if (encoder && typeof encoder.free === 'function') {
        encoder.free();
      }
    });
    this.encoders.clear();
  }
}

// Export singleton instance
module.exports = new TokenCounter();
