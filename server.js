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

// Import SQL API components
const postgresManager = require('./utils/postgres');
const sqlApiRoutes = require('./routes/sql-api');

// Import Metabase API components
const metabaseApiRoutes = require('./routes/metabase-api');

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
app.use(express.static('public', {
  setHeaders: (res, path) => {
    if (path.endsWith('.js')) {
      res.set('Content-Type', 'application/javascript');
      res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    }
    else if (path.endsWith('.css')) {
      res.set('Content-Type', 'text/css');
      res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    }
  }
}));

// Serve shared conversation page
app.get('/chat/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    
    // Get conversation with messages
    const conversation = await conversationManager.getConversationWithMessages(conversationId);
    if (!conversation) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Conversation Not Found</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                   text-align: center; padding: 2rem; background: #f8f9fa; }
            .error { background: white; padding: 2rem; border-radius: 8px; max-width: 400px; 
                     margin: 2rem auto; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          </style>
        </head>
        <body>
          <div class="error">
            <h1>🔍 Conversation Not Found</h1>
            <p>The conversation you're looking for doesn't exist or may have been deleted.</p>
          </div>
        </body>
        </html>
      `);
    }

    // Serve the shared conversation page
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${conversation.name || 'Shared Conversation'}</title>
        <link rel="stylesheet" href="/css/shared-chat.css">
      </head>
      <body>
        <div class="shared-chat-container">
          <header class="chat-header">
            <h1>${conversation.name || 'Shared Conversation'}</h1>
            <div class="chat-meta">
              <span class="date">${new Date(conversation.created_at).toLocaleDateString()}</span>
              <span class="message-count">${conversation.message_count} messages</span>
            </div>
          </header>
          
          <div class="messages-container" id="messagesContainer">
            <!-- Messages will be loaded here -->
          </div>
          
          <footer class="chat-footer">
            <p>This is a shared conversation. <a href="/demo.html">Start your own chat</a></p>
          </footer>
        </div>
        
        <script>
          // Load conversation data
          const conversationData = ${JSON.stringify({
            id: conversation.id,
            name: conversation.name,
            created: conversation.created_at,
            messageCount: conversation.message_count,
            messages: conversation.messages
          })};
          
          // Render messages
          function renderMessages() {
            const container = document.getElementById('messagesContainer');
            
            conversationData.messages.forEach(message => {
              const messageEl = document.createElement('div');
              messageEl.className = \`message \${message.sender}\`;
              
              const timestamp = new Date(message.timestamp).toLocaleTimeString();
              
              messageEl.innerHTML = \`
                <div class="message-content">
                  <div class="message-text">\${escapeHtml(message.text)}</div>
                  <div class="message-time">\${timestamp}</div>
                </div>
              \`;
              
              container.appendChild(messageEl);
            });
          }
          
          function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
          }
          
          // Initialize
          document.addEventListener('DOMContentLoaded', renderMessages);
        </script>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error('Shared Chat Error:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Error</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                 text-align: center; padding: 2rem; background: #f8f9fa; }
          .error { background: white; padding: 2rem; border-radius: 8px; max-width: 400px; 
                   margin: 2rem auto; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        </style>
      </head>
      <body>
        <div class="error">
          <h1>⚠️ Error</h1>
          <p>Something went wrong while loading this conversation.</p>
        </div>
      </body>
      </html>
    `);
  }
});

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} ${req.method} ${req.path} - ${req.ip}`);
  next();
});

// Mount SQL API routes
app.use('/api/sql', sqlApiRoutes);

// Mount Metabase API routes
app.use('/api/metabase', metabaseApiRoutes);

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
    // Check if streaming is requested
    const isStreaming = req.query.stream === 'true' || req.body.stream === true;
    
    if (isStreaming) {
      return handleStreamingChat(req, res);
    }

    // Validate request
    const validation = validateChatRequest(req.body);
    if (!validation.isValid) {
      return res.status(400).json(createErrorResponse(
        'Invalid request',
        validation.errors,
        400
      ));
    }

    const { message, history, provider, assistantId, assistantType, conversationId, threadId, metabaseQuestionUrl } = validation.data;

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
      const metadata = {
        provider: finalProvider,
        assistantId: finalAssistantId,
        assistantType: assistantType || 'default'
      };
      
      // Add Metabase question URL to metadata if provided
      if (metabaseQuestionUrl) {
        metadata.metabaseQuestionUrl = metabaseQuestionUrl;
      }
      
      currentConversationId = await conversationManager.createConversation(req.ip, metadata);
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

// Streaming chat handler
async function handleStreamingChat(req, res) {
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

    const { message, history, provider, assistantId, assistantType, conversationId, threadId, metabaseQuestionUrl } = validation.data;

    // Set up Server-Sent Events headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Send initial connection event
    res.write('data: ' + JSON.stringify({ type: 'connected' }) + '\n\n');

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
      res.write('data: ' + JSON.stringify({
        type: 'error',
        error: 'No assistant configured'
      }) + '\n\n');
      res.end();
      return;
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
        console.warn(`Thread ID ${threadId} provided but no conversation found`);
      }
    }

    // Create new conversation if none exists
    if (!currentConversationId) {
      const metadata = {
        provider: finalProvider,
        assistantId: finalAssistantId,
        assistantType: assistantType || 'default'
      };
      
      // Add Metabase question URL to metadata if provided
      if (metabaseQuestionUrl) {
        metadata.metabaseQuestionUrl = metabaseQuestionUrl;
      }
      
      currentConversationId = await conversationManager.createConversation(req.ip, metadata);
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
        res.write('data: ' + JSON.stringify({
          type: 'error',
          error: `Provider '${finalProvider}' is not supported`
        }) + '\n\n');
        res.end();
        return;
    }

    // Create provider instance
    const aiProvider = await providerFactory.createProvider(finalProvider, providerConfig);

    // Handle client disconnect
    req.on('close', () => {
      console.log('Client disconnected from streaming chat');
    });

    // Send message to AI provider with streaming
    const response = await aiProvider.sendMessageStream(message, history, {
      assistantId: finalAssistantId,
      threadId: existingThreadId
    }, (event) => {
      // Send streaming events to client
      if (!res.destroyed) {
        res.write('data: ' + JSON.stringify(event) + '\n\n');
      }
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

    // Send final completion event
    if (!res.destroyed) {
      res.write('data: ' + JSON.stringify({
        type: 'done',
        conversationId: currentConversationId,
        threadId: responseThreadId || existingThreadId,
        provider: finalProvider,
        assistantId: finalAssistantId
      }) + '\n\n');
      res.end();
    }

  } catch (error) {
    console.error('Streaming Chat API Error:', error);
    
    if (!res.destroyed) {
      res.write('data: ' + JSON.stringify({
        type: 'error',
        error: error.message
      }) + '\n\n');
      res.end();
    }
  }
}

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
      name: conversation.name,
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
        name: conv.name || 'Untitled Conversation',
        threadId: conv.thread_id,
        provider: conv.provider,
        assistantType: conv.assistant_type,
        created: conv.created_at,
        lastActivity: conv.last_activity,
        messageCount: conv.message_count,
        metadata: conv.metadata,
        metabaseQuestionUrl: conv.metabase_question_url
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
      name: fullConversation.name,
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

// Initialize PostgreSQL connection (optional - will only initialize if env vars are present)
async function initializePostgreSQL() {
  try {
    await postgresManager.initialize();
    console.log('🐘 PostgreSQL connection initialized successfully');
  } catch (error) {
    console.warn('⚠️ PostgreSQL initialization failed:', error.message);
    console.warn('💡 SQL API endpoints will not be available until PostgreSQL is configured');
  }
}

// Start server
const PORT = config.port;
app.listen(PORT, async () => {
  console.log('🚀 Chatbot Widget Backend Server Started');
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${config.nodeEnv}`);
  console.log(`🔑 OpenAI configured: ${!!config.openai.apiKey}`);
  console.log(`🤖 Default Assistant: ${config.openai.defaultAssistantId || 'Not configured'}`);
  console.log(`🛡️ CORS origins: ${config.cors.allowedOrigins.join(', ')}`);
  
  // Initialize PostgreSQL
  await initializePostgreSQL();
  
  console.log('✅ Ready to handle chat requests!');
  console.log('🔗 Available endpoints:');
  console.log('   - POST /api/chat (Chat API)');
  console.log('   - POST /api/sql/execute (SQL Query Execution)');
  console.log('   - GET  /api/sql/test (Database Connection Test)');
  console.log('   - GET  /api/sql/docs (SQL API Documentation)');
  console.log('   - GET  /api/metabase/question/:id (Metabase Question API)');
  console.log('   - GET  /api/metabase/test (Metabase Connection Test)');
  console.log('   - GET  /api/metabase/docs (Metabase API Documentation)');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  await cleanup();
  await conversationManager.close();
  await postgresManager.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  await cleanup();
  await conversationManager.close();
  await postgresManager.close();
  process.exit(0);
});
