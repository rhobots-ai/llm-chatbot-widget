/**
 * Input Validation Utility
 * Validates and sanitizes API inputs
 */

/**
 * Validate chat message request
 * @param {Object} body - Request body
 * @returns {Object} - Validation result
 */
function validateChatRequest(body) {
  const errors = [];
  const sanitized = {};

  // Validate message
  if (!body.message) {
    errors.push('Message is required');
  } else if (typeof body.message !== 'string') {
    errors.push('Message must be a string');
  } else if (body.message.trim().length === 0) {
    errors.push('Message cannot be empty');
  } else if (body.message.length > 4000) {
    errors.push('Message too long (max 4000 characters)');
  } else {
    sanitized.message = body.message.trim();
  }

  // Validate history (optional)
  if (body.history !== undefined) {
    if (!Array.isArray(body.history)) {
      errors.push('History must be an array');
    } else {
      const historyErrors = validateHistory(body.history);
      if (historyErrors.length > 0) {
        errors.push(...historyErrors);
      } else {
        sanitized.history = body.history;
      }
    }
  } else {
    sanitized.history = [];
  }

  // Validate provider (optional)
  if (body.provider !== undefined) {
    if (typeof body.provider !== 'string') {
      errors.push('Provider must be a string');
    } else if (!isValidProvider(body.provider)) {
      errors.push('Invalid provider');
    } else {
      sanitized.provider = body.provider.toLowerCase();
    }
  }

  // Validate assistantId (optional)
  if (body.assistantId !== undefined) {
    if (typeof body.assistantId !== 'string') {
      errors.push('AssistantId must be a string');
    } else if (body.assistantId.trim().length === 0) {
      errors.push('AssistantId cannot be empty');
    } else {
      sanitized.assistantId = body.assistantId.trim();
    }
  }

  // Validate assistantType (optional)
  if (body.assistantType !== undefined) {
    if (typeof body.assistantType !== 'string') {
      errors.push('AssistantType must be a string');
    } else {
      sanitized.assistantType = body.assistantType.trim();
    }
  }

  // Validate conversationId (optional)
  if (body.conversationId !== undefined) {
    if (typeof body.conversationId !== 'string') {
      errors.push('ConversationId must be a string');
    } else {
      sanitized.conversationId = body.conversationId.trim();
    }
  }

  // Validate threadId (optional)
  if (body.threadId !== undefined) {
    if (typeof body.threadId !== 'string') {
      errors.push('ThreadId must be a string');
    } else {
      sanitized.threadId = body.threadId.trim();
    }
  }

  return {
    isValid: errors.length === 0,
    errors: errors,
    data: sanitized
  };
}

/**
 * Validate message history array
 * @param {Array} history - Message history
 * @returns {Array} - Array of error messages
 */
function validateHistory(history) {
  const errors = [];

  if (history.length > 100) {
    errors.push('History too long (max 100 messages)');
    return errors;
  }

  for (let i = 0; i < history.length; i++) {
    const message = history[i];
    
    if (!message || typeof message !== 'object') {
      errors.push(`History item ${i} must be an object`);
      continue;
    }

    if (!message.text || typeof message.text !== 'string') {
      errors.push(`History item ${i} must have a text field`);
    } else if (message.text.length > 4000) {
      errors.push(`History item ${i} text too long`);
    }

    if (!message.sender || typeof message.sender !== 'string') {
      errors.push(`History item ${i} must have a sender field`);
    } else if (!['user', 'bot', 'assistant'].includes(message.sender)) {
      errors.push(`History item ${i} sender must be 'user', 'bot', or 'assistant'`);
    }

    if (message.timestamp !== undefined) {
      if (typeof message.timestamp !== 'number' || message.timestamp < 0) {
        errors.push(`History item ${i} timestamp must be a positive number`);
      }
    }
  }

  return errors;
}

/**
 * Check if provider is valid
 * @param {string} provider - Provider name
 * @returns {boolean} - Whether provider is valid
 */
function isValidProvider(provider) {
  const validProviders = ['openai', 'anthropic', 'google', 'azure'];
  return validProviders.includes(provider.toLowerCase());
}

/**
 * Sanitize text content
 * @param {string} text - Text to sanitize
 * @returns {string} - Sanitized text
 */
function sanitizeText(text) {
  if (typeof text !== 'string') {
    return '';
  }

  // Remove potentially harmful characters
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Validate assistant configuration
 * @param {Object} config - Assistant configuration
 * @returns {Object} - Validation result
 */
function validateAssistantConfig(config) {
  const errors = [];
  const sanitized = {};

  if (!config || typeof config !== 'object') {
    errors.push('Assistant config must be an object');
    return { isValid: false, errors, data: {} };
  }

  // Validate provider
  if (!config.provider || typeof config.provider !== 'string') {
    errors.push('Provider is required and must be a string');
  } else if (!isValidProvider(config.provider)) {
    errors.push('Invalid provider');
  } else {
    sanitized.provider = config.provider.toLowerCase();
  }

  // Validate assistantId (optional)
  if (config.assistantId !== undefined && config.assistantId !== null) {
    if (typeof config.assistantId !== 'string') {
      errors.push('AssistantId must be a string');
    } else {
      sanitized.assistantId = config.assistantId.trim();
    }
  }

  // Validate name (optional)
  if (config.name !== undefined) {
    if (typeof config.name !== 'string') {
      errors.push('Name must be a string');
    } else {
      sanitized.name = sanitizeText(config.name);
    }
  }

  // Validate description (optional)
  if (config.description !== undefined) {
    if (typeof config.description !== 'string') {
      errors.push('Description must be a string');
    } else {
      sanitized.description = sanitizeText(config.description);
    }
  }

  // Validate instructions (optional)
  if (config.instructions !== undefined) {
    if (typeof config.instructions !== 'string') {
      errors.push('Instructions must be a string');
    } else if (config.instructions.length > 10000) {
      errors.push('Instructions too long (max 10000 characters)');
    } else {
      sanitized.instructions = sanitizeText(config.instructions);
    }
  }

  return {
    isValid: errors.length === 0,
    errors: errors,
    data: sanitized
  };
}

/**
 * Create error response
 * @param {string} message - Error message
 * @param {Array} details - Error details
 * @param {number} statusCode - HTTP status code
 * @returns {Object} - Error response object
 */
function createErrorResponse(message, details = [], statusCode = 400) {
  return {
    error: true,
    message: message,
    details: details,
    statusCode: statusCode,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  validateChatRequest,
  validateHistory,
  validateAssistantConfig,
  isValidProvider,
  sanitizeText,
  createErrorResponse
};
