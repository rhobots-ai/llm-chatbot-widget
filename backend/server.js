const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Import configuration and utilities
const config = require('./config/environment');
const assistantsConfig = require('./config/assistants.json');
const providerFactory = require('./providers');
const conversationManager = require('./utils/conversation');
const { validateChatRequest, createErrorResponse } = require('./utils/validation');

// Create Express app
const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for API
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
console.log('🛡️ CORS allowed origins:', config.cors.allowedOrigins);
app.use(cors({
  origin: function (origin, callback) {
    console.log('🔍 CORS request from origin:', origin);
    
    // In development mode, allow all origins including null (file://) and localhost
    if (config.nodeEnv === 'development') {
      console.log('✅ CORS origin allowed in development mode:', origin || 'null');
      return callback(null, true);
    }
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (config.cors.allowedOrigins.indexOf(origin) !== -1) {
      console.log('✅ CORS origin allowed:', origin);
      callback(null, true);
    } else {
      console.log('❌ CORS origin blocked:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    error: true,
    message: 'Too many requests, please try again later.',
    statusCode: 429
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from public directory
app.use(express.static('public'));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} ${req.method} ${req.path} - ${req.ip}`);
  next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const stats = await conversationManager.getStats();
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      stats: stats,
      providers: providerFactory.getAvailableProviders()
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Main chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    // Validate request
    const validation = validateChatRequest(req.body);
    if (!validation.isValid) {
      return res.status(400).json(createErrorResponse(
        'Invalid request',
        validation.errors,
        400
      ));
    }

    const { message, history, provider, assistantId, assistantType, conversationId, threadId } = validation.data;

    // Determine which assistant configuration to use
    let assistantConfig;
    if (assistantType && assistantsConfig[assistantType]) {
      assistantConfig = assistantsConfig[assistantType];
    } else {
      assistantConfig = assistantsConfig.default;
    }

    // Override with request parameters if provided
    const finalProvider = provider || assistantConfig.provider || 'openai';
    const finalAssistantId = assistantId || assistantConfig.assistantId || config.openai.defaultAssistantId;

    if (!finalAssistantId) {
      return res.status(500).json(createErrorResponse(
        'No assistant configured',
        ['Assistant ID not found in configuration'],
        500
      ));
    }

    // Get or create conversation based on thread ID
    let currentConversationId = conversationId;
    let existingThreadId = threadId;

    if (threadId) {
      // Look up existing conversation by thread ID
      const existingConversation = await conversationManager.getConversationByThreadId(threadId);
      if (existingConversation) {
        currentConversationId = existingConversation.id;
      } else {
        // Thread ID provided but no conversation found - this shouldn't happen
        console.warn(`Thread ID ${threadId} provided but no conversation found`);
      }
    }

    // Create new conversation if none exists
    if (!currentConversationId) {
      currentConversationId = await conversationManager.createConversation(req.ip, {
        provider: finalProvider,
        assistantId: finalAssistantId,
        assistantType: assistantType || 'default'
      });
    }

    // Add user message to conversation
    await conversationManager.addMessage(currentConversationId, message, 'user');

    // Get provider configuration
    let providerConfig;
    switch (finalProvider) {
      case 'openai':
        providerConfig = {
          apiKey: config.openai.apiKey,
          defaultAssistantId: finalAssistantId
        };
        break;
      default:
        return res.status(400).json(createErrorResponse(
          'Unsupported provider',
          [`Provider '${finalProvider}' is not supported`],
          400
        ));
    }

    // Create provider instance
    const aiProvider = await providerFactory.createProvider(finalProvider, providerConfig);

    // Send message to AI provider
    const response = await aiProvider.sendMessage(message, history, {
      assistantId: finalAssistantId,
      threadId: existingThreadId
    });

    // Extract response message and thread ID
    const responseMessage = typeof response === 'string' ? response : response.message;
    const responseThreadId = typeof response === 'object' ? response.threadId : null;

    // Map conversation to thread if we got a new thread ID
    if (responseThreadId && !existingThreadId) {
      await conversationManager.mapToThread(currentConversationId, responseThreadId);
    }

    // Add bot response to conversation
    await conversationManager.addMessage(currentConversationId, responseMessage, 'bot');

    // Send response in the format expected by the widget
    res.json({
      message: responseMessage,
      conversationId: currentConversationId,
      threadId: responseThreadId || existingThreadId,
      provider: finalProvider,
      assistantId: finalAssistantId
    });

  } catch (error) {
    console.error('Chat API Error:', error);
    
    // Determine error type and status code
    let statusCode = 500;
    let errorMessage = 'Internal server error';
    
    if (error.message.includes('API key')) {
      statusCode = 401;
      errorMessage = 'Authentication failed';
    } else if (error.message.includes('rate limit') || error.message.includes('quota')) {
      statusCode = 429;
      errorMessage = 'Rate limit exceeded';
    } else if (error.message.includes('timeout')) {
      statusCode = 408;
      errorMessage = 'Request timeout';
    } else if (error.message.includes('not found') || error.message.includes('assistant')) {
      statusCode = 404;
      errorMessage = 'Assistant not found';
    }

    res.status(statusCode).json(createErrorResponse(
      errorMessage,
      config.nodeEnv === 'development' ? [error.message] : [],
      statusCode
    ));
  }
});

// Get available providers endpoint
app.get('/api/providers', (req, res) => {
  try {
    const providers = providerFactory.getAvailableProviders().map(name => ({
      name: name,
      capabilities: providerFactory.getProviderCapabilities(name)
    }));

    res.json({
      providers: providers,
      default: 'openai'
    });
  } catch (error) {
    console.error('Providers API Error:', error);
    res.status(500).json(createErrorResponse('Failed to get providers'));
  }
});

// Get available assistants endpoint
app.get('/api/assistants', (req, res) => {
  try {
    const assistants = Object.entries(assistantsConfig).map(([key, config]) => ({
      type: key,
      name: config.name,
      description: config.description,
      provider: config.provider
    }));

    res.json({
      assistants: assistants,
      default: 'default'
    });
  } catch (error) {
    console.error('Assistants API Error:', error);
    res.status(500).json(createErrorResponse('Failed to get assistants'));
  }
});

// Conversation management endpoints

// Get conversation with full message history
app.get('/api/conversations/:id', async (req, res) => {
  try {
    const conversation = await conversationManager.getConversationWithMessages(req.params.id);
    if (!conversation) {
      return res.status(404).json(createErrorResponse('Conversation not found'));
    }

    res.json({
      id: conversation.id,
      userId: conversation.user_id,
      threadId: conversation.thread_id,
      provider: conversation.provider,
      assistantId: conversation.assistant_id,
      assistantType: conversation.assistant_type,
      created: conversation.created_at,
      lastActivity: conversation.last_activity,
      messageCount: conversation.message_count,
      metadata: conversation.metadata,
      messages: conversation.messages
    });
  } catch (error) {
    console.error('Get Conversation Error:', error);
    res.status(500).json(createErrorResponse('Failed to get conversation'));
  }
});

// Get conversations for a user
app.get('/api/users/:userId/conversations', async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    const conversations = await conversationManager.getUserConversations(userId, limit, offset);
    
    res.json({
      conversations: conversations.map(conv => ({
        id: conv.id,
        threadId: conv.thread_id,
        provider: conv.provider,
        assistantType: conv.assistant_type,
        created: conv.created_at,
        lastActivity: conv.last_activity,
        messageCount: conv.message_count,
        metadata: conv.metadata
      })),
      pagination: {
        limit,
        offset,
        hasMore: conversations.length === limit
      }
    });
  } catch (error) {
    console.error('Get User Conversations Error:', error);
    res.status(500).json(createErrorResponse('Failed to get user conversations'));
  }
});

// Get conversation history (messages only)
app.get('/api/conversations/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || null;
    const offset = parseInt(req.query.offset) || 0;

    const messages = await conversationManager.getHistory(id, limit);
    
    res.json({
      conversationId: id,
      messages: messages,
      pagination: {
        limit,
        offset,
        hasMore: limit ? messages.length === limit : false
      }
    });
  } catch (error) {
    console.error('Get Conversation Messages Error:', error);
    res.status(500).json(createErrorResponse('Failed to get conversation messages'));
  }
});

// Delete conversation
app.delete('/api/conversations/:id', async (req, res) => {
  try {
    const deleted = await conversationManager.deleteConversation(req.params.id);
    if (!deleted) {
      return res.status(404).json(createErrorResponse('Conversation not found'));
    }

    res.json({ success: true, message: 'Conversation deleted' });
  } catch (error) {
    console.error('Delete Conversation Error:', error);
    res.status(500).json(createErrorResponse('Failed to delete conversation'));
  }
});

// Resume conversation by thread ID
app.get('/api/threads/:threadId/conversation', async (req, res) => {
  try {
    const conversation = await conversationManager.getConversationByThreadId(req.params.threadId);
    if (!conversation) {
      return res.status(404).json(createErrorResponse('Conversation not found for thread'));
    }

    // Get full conversation with messages
    const fullConversation = await conversationManager.getConversationWithMessages(conversation.id);
    
    res.json({
      id: fullConversation.id,
      userId: fullConversation.user_id,
      threadId: fullConversation.thread_id,
      provider: fullConversation.provider,
      assistantId: fullConversation.assistant_id,
      assistantType: fullConversation.assistant_type,
      created: fullConversation.created_at,
      lastActivity: fullConversation.last_activity,
      messageCount: fullConversation.message_count,
      metadata: fullConversation.metadata,
      messages: fullConversation.messages
    });
  } catch (error) {
    console.error('Get Conversation by Thread Error:', error);
    res.status(500).json(createErrorResponse('Failed to get conversation by thread'));
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json(createErrorResponse('Endpoint not found', [], 404));
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Unhandled Error:', error);
  res.status(500).json(createErrorResponse(
    'Internal server error',
    config.nodeEnv === 'development' ? [error.message] : [],
    500
  ));
});

// Cleanup function
async function cleanup() {
  try {
    console.log('🧹 Running cleanup...');
    const cleaned = await conversationManager.cleanupOldConversations();
    console.log(`🗑️ Cleaned up ${cleaned} old conversations`);
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

// Run cleanup every hour
setInterval(cleanup, 60 * 60 * 1000);

// Start server
const PORT = config.port;
app.listen(PORT, () => {
  console.log('🚀 Chatbot Widget Backend Server Started');
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${config.nodeEnv}`);
  console.log(`🔑 OpenAI configured: ${!!config.openai.apiKey}`);
  console.log(`🤖 Default Assistant: ${config.openai.defaultAssistantId || 'Not configured'}`);
  console.log(`🛡️ CORS origins: ${config.cors.allowedOrigins.join(', ')}`);
  console.log('✅ Ready to handle chat requests!');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  await cleanup();
  await conversationManager.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  await cleanup();
  await conversationManager.close();
  process.exit(0);
});
