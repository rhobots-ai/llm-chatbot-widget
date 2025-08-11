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
const tokenCounter = require('./utils/token-counter');
const database = require('./utils/database');

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
        
        <script src="/js/marked.umd.js"></script>
        <script>
          // Load conversation data
          const conversationData = ${JSON.stringify({
            id: conversation.id,
            name: conversation.name,
            created: conversation.created_at,
            messageCount: conversation.message_count,
            messages: conversation.messages
          })};
          
          // Configure marked for security
          if (window.marked && window.marked.setOptions) {
            window.marked.setOptions({
              sanitize: false, // We'll handle sanitization ourselves
              breaks: true,    // Convert \\n to <br>
              gfm: true       // GitHub Flavored Markdown
            });
          }
          
          // HTML sanitization function to prevent XSS
          function sanitizeHtml(html) {
            // Create a temporary div to parse HTML
            const temp = document.createElement('div');
            temp.innerHTML = html;
            
            // Remove script tags and event handlers
            const scripts = temp.querySelectorAll('script');
            scripts.forEach(script => script.remove());
            
            // Remove dangerous attributes
            const allElements = temp.querySelectorAll('*');
            allElements.forEach(element => {
              // Remove event handler attributes
              Array.from(element.attributes).forEach(attr => {
                if (attr.name.startsWith('on')) {
                  element.removeAttribute(attr.name);
                }
              });
              
              // Only allow safe attributes for links
              if (element.tagName === 'A') {
                const href = element.getAttribute('href');
                element.removeAttribute('href');
                if (href && (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:'))) {
                  element.setAttribute('href', href);
                  element.setAttribute('target', '_blank');
                  element.setAttribute('rel', 'noopener noreferrer');
                }
              }
            });
            
            return temp.innerHTML;
          }
          
          // Markdown parser using marked library with fallback
          function parseMarkdown(text) {
            try {
              // Use marked library if available
              if (window.marked && typeof window.marked.parse === 'function') {
                const html = window.marked.parse(text);
                const sanitizedHtml = sanitizeHtml(html);
                return enhanceCodeBlocks(sanitizedHtml);
              }
            } catch (error) {
              console.warn('Error using marked library, falling back to simple parser:', error);
            }
            
            // Fallback to simple markdown parsing
            return parseMarkdownSimple(text);
          }
          
          // Simple fallback markdown parser
          function parseMarkdownSimple(text) {
            // Escape HTML to prevent XSS
            text = text.replace(/&/g, '&amp;')
                       .replace(/</g, '&lt;')
                       .replace(/>/g, '&gt;')
                       .replace(/"/g, '&quot;')
                       .replace(/'/g, '&#39;');

            // Parse markdown elements
            // Bold text **text** or __text__
            text = text.replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>');
            text = text.replace(/__(.*?)__/g, '<strong>$1</strong>');
            
            // Italic text *text* or _text_
            text = text.replace(/\\*(.*?)\\*/g, '<em>$1</em>');
            text = text.replace(/\\b_([^\\s_]+)_\\b/g, '<em>$1</em>');

            // Code blocks with language detection \`\`\`language\\ncode\`\`\`
            text = text.replace(/\`\`\`(\\w+)?\\n?([\\s\\S]*?)\`\`\`/g, (match, lang, code) => {
              const language = lang || 'text';
              const codeBlockId = \`chatbot-code-\${Date.now()}-\${Math.random().toString(36).substr(2, 9)}\`;
              const isSQLBlock = ['sql', 'postgres', 'postgresql', 'mysql', 'sqlite'].includes(language.toLowerCase());
              
              let headerButtons = \`
                <button class="chatbot-code-copy" data-code-id="\${codeBlockId}" title="Copy code">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                  </svg>
                </button>
              \`;
              
              if (isSQLBlock) {
                headerButtons = \`
                  <button class="chatbot-code-run" data-code-id="\${codeBlockId}" title="Run SQL query">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  </button>
                \` + headerButtons;
              }
              
              return \`<div class="chatbot-code-block">
                <div class="chatbot-code-header">
                  <span class="chatbot-code-language">\${language}</span>
                  <div class="chatbot-code-actions">
                    \${headerButtons}
                  </div>
                </div>
                <pre class="chatbot-code-content" id="\${codeBlockId}"><code>\${code.trim()}</code></pre>
                <div class="chatbot-sql-results" id="\${codeBlockId}-results" style="display: none;"></div>
              </div>\`;
            });
            
            // Inline code \`code\`
            text = text.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
            
            // Links [text](url)
            text = text.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
            
            // Line breaks (double newline becomes paragraph break)
            text = text.replace(/\\n\\n/g, '</p><p>');
            text = '<p>' + text + '</p>';
            
            // Single line breaks become <br>
            text = text.replace(/\\n/g, '<br>');
            
            // Handle lists
            text = text.replace(/^[\\*\\-]\\s+(.+)$/gm, '<li>$1</li>');
            text = text.replace(/(<li>.*<\\/li>)/s, '<ul>$1</ul>');
            
            // Ordered lists
            text = text.replace(/^\\d+\\.\\s+(.+)$/gm, '<li>$1</li>');
            
            // Headers
            text = text.replace(/^### (.*$)/gm, '<h3>$1</h3>');
            text = text.replace(/^## (.*$)/gm, '<h2>$1</h2>');
            text = text.replace(/^# (.*$)/gm, '<h1>$1</h1>');
            
            // Clean up empty paragraphs
            text = text.replace(/<p><\\/p>/g, '');
            text = text.replace(/<p>\\s*<\\/p>/g, '');
            
            return text;
          }
          
          // Enhance code blocks with copy functionality and SQL run button
          function enhanceCodeBlocks(html) {
            // Create a temporary div to parse HTML
            const temp = document.createElement('div');
            temp.innerHTML = html;
            
            // Find all pre elements (code blocks)
            const preElements = temp.querySelectorAll('pre');
            
            preElements.forEach((pre, index) => {
              const code = pre.querySelector('code');
              if (!code) return;
              
              // Extract language from class attribute (e.g., language-javascript)
              let language = 'text';
              const codeClasses = code.className || '';
              const languageMatch = codeClasses.match(/language-(\\w+)/);
              if (languageMatch) {
                language = languageMatch[1];
              }
              
              // Get the code content
              const codeContent = code.textContent || code.innerText || '';
              
              // Check if this is a SQL code block
              const isSQLBlock = ['sql', 'postgres', 'postgresql', 'mysql', 'sqlite'].includes(language.toLowerCase());
              
              // Create enhanced code block structure
              const codeBlockId = \`chatbot-code-\${Date.now()}-\${index}\`;
              const enhancedCodeBlock = document.createElement('div');
              enhancedCodeBlock.className = 'chatbot-code-block';
              
              // Create header buttons HTML
              let headerButtons = \`
                <button class="chatbot-code-copy" data-code-id="\${codeBlockId}" title="Copy code">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                  </svg>
                </button>
              \`;
              
              // Add run button for SQL blocks
              if (isSQLBlock) {
                headerButtons = \`
                  <button class="chatbot-code-run" data-code-id="\${codeBlockId}" title="Run SQL query">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  </button>
                \` + headerButtons;
              }
              
              enhancedCodeBlock.innerHTML = \`
                <div class="chatbot-code-header">
                  <span class="chatbot-code-language">\${language}</span>
                  <div class="chatbot-code-actions">
                    \${headerButtons}
                  </div>
                </div>
                <pre class="chatbot-code-content" id="\${codeBlockId}"><code>\${codeContent}</code></pre>
                <div class="chatbot-sql-results" id="\${codeBlockId}-results" style="display: none;"></div>
              \`;
              
              // Replace the original pre element
              pre.parentNode.replaceChild(enhancedCodeBlock, pre);
            });
            
            return temp.innerHTML;
          }
          
          // Copy code to clipboard
          async function copyCodeToClipboard(codeId, button) {
            try {
              const codeElement = document.getElementById(codeId);
              if (!codeElement) {
                console.error('Code element not found:', codeId);
                return;
              }
              
              const codeContent = codeElement.querySelector('code');
              const textToCopy = codeContent ? codeContent.textContent : codeElement.textContent;
              
              // Use modern clipboard API if available
              if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(textToCopy);
              } else {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = textToCopy;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                textArea.style.top = '-999999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                document.execCommand('copy');
                textArea.remove();
              }
              
              // Show visual feedback
              const originalContent = button.innerHTML;
              button.innerHTML = \`
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
              \`;
              button.style.color = '#10b981';
              
              // Reset button after 2 seconds
              setTimeout(() => {
                button.innerHTML = originalContent;
                button.style.color = '';
              }, 2000);
              
            } catch (error) {
              console.error('Failed to copy code:', error);
              
              // Show error feedback
              const originalContent = button.innerHTML;
              button.innerHTML = \`
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              \`;
              button.style.color = '#ef4444';
              
              // Reset button after 2 seconds
              setTimeout(() => {
                button.innerHTML = originalContent;
                button.style.color = '';
              }, 2000);
            }
          }
          
          // Execute SQL query
          async function executeSQLQuery(codeId, button) {
            try {
              const codeElement = document.getElementById(codeId);
              if (!codeElement) {
                console.error('Code element not found:', codeId);
                return;
              }
              
              const codeContent = codeElement.querySelector('code');
              const sqlQuery = codeContent ? codeContent.textContent.trim() : '';
              
              if (!sqlQuery) {
                console.error('No SQL query found');
                return;
              }
              
              // Show loading state
              const originalContent = button.innerHTML;
              button.innerHTML = \`
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/>
                  <path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" fill="none"/>
                </svg>
              \`;
              button.disabled = true;
              button.style.color = '#6b7280';
              
              // Get results container
              const resultsContainer = document.getElementById(\`\${codeId}-results\`);
              if (resultsContainer) {
                resultsContainer.style.display = 'none';
                resultsContainer.innerHTML = '';
              }
              
              // Execute SQL query
              const response = await fetch('/api/sql/execute', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  query: sqlQuery,
                  timeout: 30000,
                  limit: 100
                })
              });
              
              const result = await response.json();
              
              // Reset button
              button.innerHTML = originalContent;
              button.disabled = false;
              button.style.color = '';
              
              if (response.ok && result.success) {
                // Show successful results
                showSQLResults(result, codeId);
              } else {
                // Show error
                const errorMessage = result.message + ': ' + (result.details?.[0] || 'Unknown SQL error');
                showSQLError(errorMessage, codeId);
              }
              
            } catch (error) {
              console.error('SQL execution error:', error);
              
              // Reset button
              const originalContent = \`
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              \`;
              button.innerHTML = originalContent;
              button.disabled = false;
              button.style.color = '';
              
              // Show error
              showSQLError(error.message || 'Failed to execute SQL query', codeId);
            }
          }
          
          // Show SQL results
          function showSQLResults(result, codeId) {
            const resultsContainer = document.getElementById(\`\${codeId}-results\`);
            if (!resultsContainer) return;
            
            const { data, rowCount, executionTime, truncated } = result;
            
            let resultsHTML = \`
              <div class="chatbot-sql-results-header">
                <div class="chatbot-sql-results-info">
                  <span class="chatbot-sql-success-icon">✓</span>
                  <span>Query executed successfully</span>
                  <span class="chatbot-sql-meta">\${rowCount} rows in \${executionTime}ms</span>
                </div>
                <button class="chatbot-sql-toggle" data-toggle-target="\${codeId}-results-content">▼</button>
              </div>
              <div class="chatbot-sql-results-content" id="\${codeId}-results-content">
            \`;
            
            if (data && data.length > 0) {
              // Create table
              const columns = Object.keys(data[0]);
              resultsHTML += \`
                <div class="chatbot-sql-table-container">
                  <table class="chatbot-sql-table">
                    <thead>
                      <tr>
                        \${columns.map(col => \`<th>\${col}</th>\`).join('')}
                      </tr>
                    </thead>
                    <tbody>
                      \${data.map(row => \`
                        <tr>
                          \${columns.map(col => \`<td>\${row[col] !== null ? String(row[col]) : '<em>null</em>'}</td>\`).join('')}
                        </tr>
                      \`).join('')}
                    </tbody>
                  </table>
                </div>
              \`;
              
              if (truncated) {
                resultsHTML += \`<div class="chatbot-sql-warning">Results truncated to \${data.length} rows</div>\`;
              }
            } else {
              resultsHTML += \`<div class="chatbot-sql-empty">No data returned</div>\`;
            }
            
            resultsHTML += \`</div>\`;
            
            resultsContainer.innerHTML = resultsHTML;
            resultsContainer.style.display = 'block';
          }
          
          // Show SQL error
          function showSQLError(errorMessage, codeId) {
            const resultsContainer = document.getElementById(\`\${codeId}-results\`);
            if (!resultsContainer) return;
            
            const resultsHTML = \`
              <div class="chatbot-sql-results-header chatbot-sql-error-header">
                <div class="chatbot-sql-results-info">
                  <span class="chatbot-sql-error-icon">✗</span>
                  <span>Query failed</span>
                </div>
                <button class="chatbot-sql-toggle" data-toggle-target="\${codeId}-results-content">▼</button>
              </div>
              <div class="chatbot-sql-results-content" id="\${codeId}-results-content">
                <div class="chatbot-sql-error-message">\${errorMessage}</div>
              </div>
            \`;
            
            resultsContainer.innerHTML = resultsHTML;
            resultsContainer.style.display = 'block';
          }
          
          // Render messages
          function renderMessages() {
            const container = document.getElementById('messagesContainer');
            
            conversationData.messages.forEach(message => {
              const messageEl = document.createElement('div');
              messageEl.className = \`message \${message.sender}\`;
              
              const timestamp = new Date(message.timestamp).toLocaleTimeString();
              
              // Parse markdown for bot messages, keep plain text for user messages
              const messageContent = message.sender === 'bot' ? parseMarkdown(message.text) : escapeHtml(message.text);
              
              messageEl.innerHTML = \`
                <div class="message-content">
                  <div class="message-text">\${messageContent}</div>
                  <div class="message-time">\${timestamp}</div>
                </div>
              \`;
              
              container.appendChild(messageEl);
              
              // Add event listeners for code blocks if this is a bot message
              if (message.sender === 'bot') {
                setTimeout(() => {
                  const copyButtons = messageEl.querySelectorAll('.chatbot-code-copy');
                  copyButtons.forEach(button => {
                    button.addEventListener('click', (e) => {
                      e.preventDefault();
                      const codeId = button.getAttribute('data-code-id');
                      if (codeId) {
                        copyCodeToClipboard(codeId, button);
                      }
                    });
                  });
                  
                  const runButtons = messageEl.querySelectorAll('.chatbot-code-run');
                  runButtons.forEach(button => {
                    button.addEventListener('click', (e) => {
                      e.preventDefault();
                      const codeId = button.getAttribute('data-code-id');
                      if (codeId) {
                        executeSQLQuery(codeId, button);
                      }
                    });
                  });
                  
                  // Add event listeners for SQL results toggle buttons
                  const toggleButtons = messageEl.querySelectorAll('.chatbot-sql-toggle');
                  toggleButtons.forEach(button => {
                    button.addEventListener('click', (e) => {
                      e.preventDefault();
                      const targetId = button.getAttribute('data-toggle-target');
                      const targetElement = document.getElementById(targetId);
                      
                      if (targetElement) {
                        const isVisible = targetElement.style.display !== 'none';
                        targetElement.style.display = isVisible ? 'none' : 'block';
                        button.textContent = isVisible ? '▼' : '▲';
                      }
                    });
                  });
                }, 0);
              }
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

    // Count input tokens for user message
    const inputTokens = tokenCounter.countTokens(message, 'gpt-4'); // Default model for counting

    // Add user message to conversation with token data
    const userMessageId = await conversationManager.addMessageWithTokens(
      currentConversationId, 
      message, 
      'user', 
      {}, 
      {
        inputTokens: inputTokens,
        outputTokens: 0,
        modelName: 'user-input',
        cost: 0
      }
    );

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

    // Extract response message, thread ID, and token usage
    const responseMessage = typeof response === 'string' ? response : response.message;
    const responseThreadId = typeof response === 'object' ? response.threadId : null;
    const tokenUsage = typeof response === 'object' ? response.tokenUsage : null;

    // Map conversation to thread if we got a new thread ID
    if (responseThreadId && !existingThreadId) {
      await conversationManager.mapToThread(currentConversationId, responseThreadId);
    }

    // Add bot response to conversation with token data
    const messageId = await conversationManager.addMessageWithTokens(
      currentConversationId, 
      responseMessage, 
      'bot', 
      {}, 
      tokenUsage ? {
        inputTokens: tokenUsage.inputTokens || 0,
        outputTokens: tokenUsage.outputTokens || 0,
        modelName: tokenUsage.modelName || 'gpt-4',
        cost: tokenUsage.cost || 0
      } : {
        inputTokens: 0,
        outputTokens: tokenCounter.countTokens(responseMessage, 'gpt-4'),
        modelName: 'gpt-4',
        cost: 0
      }
    );

    // Get conversation token usage for response
    const conversationUsage = await database.getConversationTokenUsage(currentConversationId);

    // Send response in the format expected by the widget
    res.json({
      message: responseMessage,
      messageId: messageId,
      conversationId: currentConversationId,
      threadId: responseThreadId || existingThreadId,
      provider: finalProvider,
      assistantId: finalAssistantId,
      tokenUsage: tokenUsage,
      usage: {
        totalInputTokens: conversationUsage.total_input_tokens || 0,
        totalOutputTokens: conversationUsage.total_output_tokens || 0,
        totalTokens: (conversationUsage.total_input_tokens || 0) + (conversationUsage.total_output_tokens || 0),
        totalCost: conversationUsage.total_cost || 0,
        modelName: conversationUsage.model_name
      }
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

    // Count input tokens for user message
    const inputTokens = tokenCounter.countTokens(message, 'gpt-4'); // Default model for counting

    // Add user message to conversation with token data
    await conversationManager.addMessageWithTokens(
      currentConversationId, 
      message, 
      'user', 
      {}, 
      {
        inputTokens: inputTokens,
        outputTokens: 0,
        modelName: 'user-input',
        cost: 0
      }
    );

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

    // Extract response message, thread ID, and token usage
    const responseMessage = typeof response === 'string' ? response : response.message;
    const responseThreadId = typeof response === 'object' ? response.threadId : null;
    const tokenUsage = typeof response === 'object' ? response.tokenUsage : null;

    // Map conversation to thread if we got a new thread ID
    if (responseThreadId && !existingThreadId) {
      await conversationManager.mapToThread(currentConversationId, responseThreadId);
    }

    // Add bot response to conversation with token data
    const messageId = await conversationManager.addMessageWithTokens(
      currentConversationId, 
      responseMessage, 
      'bot', 
      {}, 
      tokenUsage ? {
        inputTokens: tokenUsage.inputTokens || 0,
        outputTokens: tokenUsage.outputTokens || 0,
        modelName: tokenUsage.modelName || 'gpt-4',
        cost: tokenUsage.cost || 0
      } : {
        inputTokens: 0,
        outputTokens: tokenCounter.countTokens(responseMessage, 'gpt-4'),
        modelName: 'gpt-4',
        cost: 0
      }
    );

    // Get conversation token usage for response
    const conversationUsage = await database.getConversationTokenUsage(currentConversationId);

    // Send final completion event
    if (!res.destroyed) {
      res.write('data: ' + JSON.stringify({
        type: 'done',
        conversationId: currentConversationId,
        messageId: messageId,
        threadId: responseThreadId || existingThreadId,
        provider: finalProvider,
        assistantId: finalAssistantId,
        usage: {
          totalInputTokens: conversationUsage.total_input_tokens || 0,
          totalOutputTokens: conversationUsage.total_output_tokens || 0,
          totalTokens: (conversationUsage.total_input_tokens || 0) + (conversationUsage.total_output_tokens || 0),
          totalCost: conversationUsage.total_cost || 0,
          modelName: conversationUsage.model_name
        }
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

// Get OpenAI assistants from API
app.get('/api/assistants/openai', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    
    // Check if OpenAI is configured
    if (!config.openai.apiKey) {
      return res.status(500).json(createErrorResponse(
        'OpenAI not configured',
        ['OpenAI API key is required'],
        500
      ));
    }
    
    // Create OpenAI provider configuration
    const providerConfig = {
      apiKey: config.openai.apiKey,
      defaultAssistantId: config.openai.defaultAssistantId
    };

    // Create provider instance
    const openaiProvider = await providerFactory.createProvider('openai', providerConfig);

    const assistants = await openaiProvider.listAssistants(limit);
    
    res.json({
      assistants: assistants,
      provider: 'openai',
      total: assistants.length,
      default: config.openai.defaultAssistantId
    });
  } catch (error) {
    console.error('OpenAI Assistants API Error:', error);
    res.status(500).json(createErrorResponse(
      'Failed to fetch OpenAI assistants',
      [error.message],
      500
    ));
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

    // Get token usage for this conversation
    const usage = await database.getConversationTokenUsage(req.params.id);

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
      messages: conversation.messages,
      usage: {
        totalInputTokens: usage.total_input_tokens || 0,
        totalOutputTokens: usage.total_output_tokens || 0,
        totalTokens: (usage.total_input_tokens || 0) + (usage.total_output_tokens || 0),
        totalCost: usage.total_cost || 0,
        modelName: usage.model_name,
        formattedTokens: tokenCounter.formatTokenCount((usage.total_input_tokens || 0) + (usage.total_output_tokens || 0)),
        formattedCost: tokenCounter.formatCost(usage.total_cost || 0),
        modelDisplayName: tokenCounter.getModelDisplayName(usage.model_name)
      }
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
    
    // Get usage data for each conversation
    const conversationsWithUsage = await Promise.all(
      conversations.map(async (conv) => {
        const usage = await database.getConversationTokenUsage(conv.id);
        return {
          id: conv.id,
          name: conv.name || 'Untitled Conversation',
          threadId: conv.thread_id,
          provider: conv.provider,
          assistantType: conv.assistant_type,
          created: conv.created_at,
          lastActivity: conv.last_activity,
          messageCount: conv.message_count,
          metadata: conv.metadata,
          metabaseQuestionUrl: conv.metabase_question_url,
          usage: {
            totalInputTokens: usage.total_input_tokens || 0,
            totalOutputTokens: usage.total_output_tokens || 0,
            totalTokens: (usage.total_input_tokens || 0) + (usage.total_output_tokens || 0),
            totalCost: usage.total_cost || 0,
            modelName: usage.model_name,
            formattedTokens: tokenCounter.formatTokenCount((usage.total_input_tokens || 0) + (usage.total_output_tokens || 0)),
            formattedCost: tokenCounter.formatCost(usage.total_cost || 0),
            modelDisplayName: tokenCounter.getModelDisplayName(usage.model_name)
          }
        };
      })
    );
    
    res.json({
      conversations: conversationsWithUsage,
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
    
    // Get token usage for this conversation
    const usage = await database.getConversationTokenUsage(conversation.id);
    
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
      messages: fullConversation.messages,
      usage: {
        totalInputTokens: usage.total_input_tokens || 0,
        totalOutputTokens: usage.total_output_tokens || 0,
        totalTokens: (usage.total_input_tokens || 0) + (usage.total_output_tokens || 0),
        totalCost: usage.total_cost || 0,
        modelName: usage.model_name,
        formattedTokens: tokenCounter.formatTokenCount((usage.total_input_tokens || 0) + (usage.total_output_tokens || 0)),
        formattedCost: tokenCounter.formatCost(usage.total_cost || 0),
        modelDisplayName: tokenCounter.getModelDisplayName(usage.model_name)
      }
    });
  } catch (error) {
    console.error('Get Conversation by Thread Error:', error);
    res.status(500).json(createErrorResponse('Failed to get conversation by thread'));
  }
});

// Message rating endpoints

// Submit or update message rating
app.post('/api/messages/:messageId/rating', async (req, res) => {
  try {
    const { messageId } = req.params;
    const { rating, comment } = req.body;

    // Validate rating
    if (!rating || !['thumbs_up', 'thumbs_down'].includes(rating)) {
      return res.status(400).json(createErrorResponse(
        'Invalid rating',
        ['Rating must be either "thumbs_up" or "thumbs_down"'],
        400
      ));
    }

    // Check if message exists
    const database = require('./utils/database');
    const message = await database.getMessageById(messageId);
    if (!message) {
      return res.status(404).json(createErrorResponse('Message not found'));
    }

    // Update the rating
    const success = await database.updateMessageRating(messageId, rating, comment || null);
    
    if (success) {
      res.json({
        success: true,
        messageId: parseInt(messageId),
        rating: rating,
        comment: comment || null,
        timestamp: Date.now()
      });
    } else {
      res.status(500).json(createErrorResponse('Failed to update rating'));
    }

  } catch (error) {
    console.error('Update Message Rating Error:', error);
    res.status(500).json(createErrorResponse('Failed to update message rating'));
  }
});

// Get message rating
app.get('/api/messages/:messageId/rating', async (req, res) => {
  try {
    const { messageId } = req.params;

    // Check if message exists
    const database = require('./utils/database');
    const message = await database.getMessageById(messageId);
    if (!message) {
      return res.status(404).json(createErrorResponse('Message not found'));
    }

    // Get the rating
    const ratingData = await database.getMessageRating(messageId);
    
    res.json({
      messageId: parseInt(messageId),
      rating: ratingData?.rating || null,
      comment: ratingData?.rating_comment || null,
      timestamp: ratingData?.rating_timestamp || null
    });

  } catch (error) {
    console.error('Get Message Rating Error:', error);
    res.status(500).json(createErrorResponse('Failed to get message rating'));
  }
});

// Clear message rating
app.delete('/api/messages/:messageId/rating', async (req, res) => {
  try {
    const { messageId } = req.params;

    // Check if message exists
    const database = require('./utils/database');
    const message = await database.getMessageById(messageId);
    if (!message) {
      return res.status(404).json(createErrorResponse('Message not found'));
    }

    // Clear the rating
    const success = await database.clearMessageRating(messageId);
    
    if (success) {
      res.json({
        success: true,
        messageId: parseInt(messageId)
      });
    } else {
      res.status(500).json(createErrorResponse('Failed to clear rating'));
    }

  } catch (error) {
    console.error('Clear Message Rating Error:', error);
    res.status(500).json(createErrorResponse('Failed to clear message rating'));
  }
});

// Token usage endpoints

// Get conversation token usage
app.get('/api/conversations/:id/usage', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if conversation exists
    const conversation = await conversationManager.getConversation(id);
    if (!conversation) {
      return res.status(404).json(createErrorResponse('Conversation not found'));
    }

    // Get token usage
    const usage = await database.getConversationTokenUsage(id);
    
    res.json({
      conversationId: id,
      totalInputTokens: usage.total_input_tokens || 0,
      totalOutputTokens: usage.total_output_tokens || 0,
      totalTokens: (usage.total_input_tokens || 0) + (usage.total_output_tokens || 0),
      totalCost: usage.total_cost || 0,
      modelName: usage.model_name,
      formattedTokens: tokenCounter.formatTokenCount((usage.total_input_tokens || 0) + (usage.total_output_tokens || 0)),
      formattedCost: tokenCounter.formatCost(usage.total_cost || 0),
      modelDisplayName: tokenCounter.getModelDisplayName(usage.model_name)
    });

  } catch (error) {
    console.error('Get Conversation Usage Error:', error);
    res.status(500).json(createErrorResponse('Failed to get conversation usage'));
  }
});

// Get user token usage statistics
app.get('/api/users/:userId/usage', async (req, res) => {
  try {
    const { userId } = req.params;
    const timeframe = req.query.timeframe ? parseInt(req.query.timeframe) : null;

    // Get user token usage
    const usage = await database.getUserTokenUsage(userId, timeframe);
    
    res.json({
      userId: userId,
      timeframe: timeframe,
      totalInputTokens: usage.total_input_tokens || 0,
      totalOutputTokens: usage.total_output_tokens || 0,
      totalTokens: (usage.total_input_tokens || 0) + (usage.total_output_tokens || 0),
      totalCost: usage.total_cost || 0,
      conversationCount: usage.conversation_count || 0,
      formattedTokens: tokenCounter.formatTokenCount((usage.total_input_tokens || 0) + (usage.total_output_tokens || 0)),
      formattedCost: tokenCounter.formatCost(usage.total_cost || 0)
    });

  } catch (error) {
    console.error('Get User Usage Error:', error);
    res.status(500).json(createErrorResponse('Failed to get user usage'));
  }
});

// Get token usage by model
app.get('/api/usage/by-model', async (req, res) => {
  try {
    const userId = req.query.userId || null;
    const timeframe = req.query.timeframe ? parseInt(req.query.timeframe) : null;

    // Get usage by model
    const usageByModel = await database.getTokenUsageByModel(userId, timeframe);
    
    const formattedUsage = usageByModel.map(usage => ({
      modelName: usage.model_name,
      modelDisplayName: tokenCounter.getModelDisplayName(usage.model_name),
      totalInputTokens: usage.total_input_tokens || 0,
      totalOutputTokens: usage.total_output_tokens || 0,
      totalTokens: (usage.total_input_tokens || 0) + (usage.total_output_tokens || 0),
      totalCost: usage.total_cost || 0,
      conversationCount: usage.conversation_count || 0,
      formattedTokens: tokenCounter.formatTokenCount((usage.total_input_tokens || 0) + (usage.total_output_tokens || 0)),
      formattedCost: tokenCounter.formatCost(usage.total_cost || 0)
    }));

    res.json({
      userId: userId,
      timeframe: timeframe,
      models: formattedUsage
    });

  } catch (error) {
    console.error('Get Usage by Model Error:', error);
    res.status(500).json(createErrorResponse('Failed to get usage by model'));
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
