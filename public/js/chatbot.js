(function() {
  'use strict';

  // Prevent multiple instances
  if (window.ChatbotWidget) {
    return;
  }

  // Default configuration
  const defaultConfig = {
    apiUrl: 'https://yourdomain.com/api/chat',
    primaryColor: '#4F46E5',
    position: 'bottom-right',
    welcomeMessage: 'Hello! How can I help you today?',
    placeholder: 'Type your message...',
    title: 'Chat Support',
    icon: 'https://rhobots.ai/images/icon.svg',
    maxHeight: '500px',
    width: '500px',
    zIndex: 10000,
    view: 'bubble' // 'bubble' or 'sidesheet'
  };

  // Merge user config with defaults
  const config = Object.assign({}, defaultConfig, window.ChatbotWidgetConfig || {});

  // Widget state
  let isOpen = false;
  let isMinimized = false;
  let messageHistory = [];
  let conversationHistory = []; // Store multiple conversations
  let currentConversationId = null;
  let currentThreadId = null; // Track current thread ID
  let isTyping = false;
  let showingHistory = false;

  // DOM elements
  let chatBubble, chatWindow, messagesContainer, messageInput, sendButton;

  // Load external CSS file with CSP support
  function loadStyles() {
    return new Promise((resolve, reject) => {
      // Check if styles are already loaded
      if (document.querySelector('link[data-chatbot-widget-styles]') || document.querySelector('style[data-chatbot-widget-styles]')) {
        resolve();
        return;
      }

      // Try external CSS first if CSP allows it
      if (config.cssUrl || !config.disableExternalCSS) {
        tryExternalCSS().then(resolve).catch(() => {
          console.warn('External CSS failed, using inline styles with nonce support');
          injectInlineStyles();
          resolve();
        });
      } else {
        // Skip external CSS and go straight to inline
        injectInlineStyles();
        resolve();
      }
    });
  }

  // Try to load external CSS
  function tryExternalCSS() {
    return new Promise((resolve, reject) => {
      // Determine CSS URL
      let cssUrl = config.cssUrl || 'css/chatbot.css';
      
      // If no explicit CSS URL provided, try to determine from script location
      if (!config.cssUrl) {
        const scripts = document.querySelectorAll('script[src]');
        for (let script of scripts) {
          if (script.src.includes('chatbot.js')) {
            const scriptUrl = new URL(script.src);
            cssUrl = scriptUrl.href.replace('js/chatbot.js', 'css/chatbot.css');
            break;
          }
        }
      }

      // Create and load the CSS file
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.type = 'text/css';
      link.href = cssUrl;
      link.setAttribute('data-chatbot-widget-styles', 'true');
      
      // Apply nonce if provided
      if (config.nonce) {
        link.setAttribute('nonce', config.nonce);
      }
      
      link.onload = () => {
        setCSSVariables();
        resolve();
      };
      
      link.onerror = () => {
        reject(new Error('Failed to load external CSS'));
      };
      
      document.head.appendChild(link);
    });
  }

  // Inject inline styles with nonce support
  function injectInlineStyles() {
    const styleSheet = document.createElement('style');
    styleSheet.setAttribute('data-chatbot-widget-styles', 'true');
    
    // Apply nonce if provided for CSP compliance
    if (config.nonce) {
      styleSheet.setAttribute('nonce', config.nonce);
    }
    
    styleSheet.textContent = getFullCSS();
    document.head.appendChild(styleSheet);
    setCSSVariables();
  }

  // Get full CSS content
  function getFullCSS() {
    return `
      .chatbot-widget-bubble {
        position: fixed;
        width: 60px;
        height: 60px;
        background: var(--chatbot-primary-color, ${config.primaryColor});
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: var(--chatbot-z-index, ${config.zIndex});
        transition: all 0.3s ease;
        user-select: none;
      }

      .chatbot-widget-bubble.position-bottom-right {
        right: 20px;
        bottom: 20px;
      }

      .chatbot-widget-bubble.position-bottom-left {
        left: 20px;
        bottom: 20px;
      }

      .chatbot-widget-bubble.position-top-right {
        right: 20px;
        top: 20px;
      }

      .chatbot-widget-bubble.position-top-left {
        left: 20px;
        top: 20px;
      }

      .chatbot-widget-bubble.view-sidesheet {
        top: 50%;
        transform: translateY(-50%);
      }

      .chatbot-widget-bubble.view-sidesheet.position-right {
        right: 20px;
      }

      .chatbot-widget-bubble.view-sidesheet.position-left {
        left: 20px;
      }

      .chatbot-widget-bubble:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
      }

      .chatbot-widget-bubble.view-sidesheet:hover {
        transform: translateY(-50%) scale(1.1);
      }

      .chatbot-widget-bubble-icon {
        width: 24px;
        height: 24px;
        fill: white;
      }

      .chatbot-widget-window {
        position: fixed;
        background: white;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
        z-index: calc(var(--chatbot-z-index, ${config.zIndex}) + 1);
        display: none;
        flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        line-height: 1.4;
        overflow: hidden;
        animation: chatbot-widget-slideIn 0.3s ease-out;
      }

      .chatbot-widget-window.view-bubble {
        width: var(--chatbot-width, ${config.width});
        max-height: var(--chatbot-max-height, ${config.maxHeight});
        border-radius: 12px;
      }

      .chatbot-widget-window.view-bubble.position-bottom-right {
        right: 20px;
        bottom: 90px;
      }

      .chatbot-widget-window.view-bubble.position-bottom-left {
        left: 20px;
        bottom: 90px;
      }

      .chatbot-widget-window.view-bubble.position-top-right {
        right: 20px;
        top: 90px;
      }

      .chatbot-widget-window.view-bubble.position-top-left {
        left: 20px;
        top: 90px;
      }

      .chatbot-widget-window.view-sidesheet {
        top: 0;
        height: 100vh;
        width: 400px;
        border-radius: 0;
        animation: chatbot-widget-slideInSide 0.3s ease-out;
      }

      .chatbot-widget-window.view-sidesheet.position-right {
        right: 0;
      }

      .chatbot-widget-window.view-sidesheet.position-left {
        left: 0;
      }

      @keyframes chatbot-widget-slideIn {
        from {
          opacity: 0;
          transform: translateY(20px) scale(0.95);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @keyframes chatbot-widget-slideInSide {
        from {
          opacity: 0;
          transform: translateX(100%);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }

      @keyframes chatbot-widget-slideInSideLeft {
        from {
          opacity: 0;
          transform: translateX(-100%);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }

      .chatbot-widget-window.view-sidesheet.position-left {
        animation: chatbot-widget-slideInSideLeft 0.3s ease-out;
      }

      .chatbot-widget-header {
        background: var(--chatbot-primary-color, ${config.primaryColor});
        color: white;
        padding: 16px 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-weight: 600;
      }

      .chatbot-widget-header-content {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .chatbot-widget-header-icon {
        width: 20px;
        height: 20px;
        border-radius: 4px;
      }

      .chatbot-widget-header-actions {
        display: flex;
        align-items: center;
        gap: 2px;
      }

      .chatbot-widget-header-btn {
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        font-size: 10px;
        padding: 3px 6px;
        border-radius: 4px;
        transition: background-color 0.2s;
        opacity: 0.8;
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 20px;
        height: 20px;
      }

      .chatbot-widget-header-btn svg {
        width: 12px;
        height: 12px;
      }

      .chatbot-widget-header-btn:hover {
        background-color: rgba(255, 255, 255, 0.1);
        opacity: 1;
      }

      .chatbot-widget-close {
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        font-size: 18px;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: background-color 0.2s;
        margin-left: 4px;
      }

      .chatbot-widget-close:hover {
        background-color: rgba(255, 255, 255, 0.1);
      }

      .chatbot-widget-messages {
        flex: 1;
        padding: 20px;
        overflow-y: auto;
        max-height: 300px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .chatbot-widget-window.view-sidesheet .chatbot-widget-messages {
        max-height: none;
      }

      .chatbot-widget-message {
        max-width: 80%;
        padding: 12px 16px;
        border-radius: 18px;
        word-wrap: break-word;
        animation: chatbot-widget-messageIn 0.3s ease-out;
      }

      @keyframes chatbot-widget-messageIn {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .chatbot-widget-message.user {
        background: var(--chatbot-primary-color, ${config.primaryColor});
        color: white;
        align-self: flex-end;
        margin-left: auto;
      }

      .chatbot-widget-message.bot {
        background: #f1f5f9;
        color: #334155;
        align-self: flex-start;
      }

      /* Markdown styles for bot messages */
      .chatbot-widget-message.bot p {
        margin: 0 0 8px 0;
        line-height: 1.5;
      }

      .chatbot-widget-message.bot p:last-child {
        margin-bottom: 0;
      }

      .chatbot-widget-message.bot strong {
        font-weight: 600;
        color: #1e293b;
      }

      .chatbot-widget-message.bot em {
        font-style: italic;
        color: #475569;
      }

      .chatbot-widget-message.bot code {
        background: #e2e8f0;
        color: #1e293b;
        padding: 2px 4px;
        border-radius: 3px;
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        font-size: 0.85em;
      }

      .chatbot-widget-message.bot pre {
        background: #1e293b;
        color: #e2e8f0;
        padding: 12px;
        border-radius: 6px;
        overflow-x: auto;
        margin: 8px 0;
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        font-size: 0.85em;
        line-height: 1.4;
      }

      .chatbot-widget-message.bot pre code {
        background: none;
        color: inherit;
        padding: 0;
        border-radius: 0;
        font-size: inherit;
      }

      .chatbot-widget-message.bot ul,
      .chatbot-widget-message.bot ol {
        margin: 8px 0;
        padding-left: 20px;
      }

      .chatbot-widget-message.bot li {
        margin: 4px 0;
        line-height: 1.4;
      }

      .chatbot-widget-message.bot h1,
      .chatbot-widget-message.bot h2,
      .chatbot-widget-message.bot h3 {
        margin: 12px 0 8px 0;
        font-weight: 600;
        color: #1e293b;
        line-height: 1.3;
      }

      .chatbot-widget-message.bot h1 {
        font-size: 1.25em;
      }

      .chatbot-widget-message.bot h2 {
        font-size: 1.15em;
      }

      .chatbot-widget-message.bot h3 {
        font-size: 1.1em;
      }

      .chatbot-widget-message.bot a {
        color: var(--chatbot-primary-color, ${config.primaryColor});
        text-decoration: none;
        border-bottom: 1px solid transparent;
        transition: border-color 0.2s;
      }

      .chatbot-widget-message.bot a:hover {
        border-bottom-color: var(--chatbot-primary-color, ${config.primaryColor});
      }

      .chatbot-widget-message.bot blockquote {
        border-left: 3px solid var(--chatbot-primary-color, ${config.primaryColor});
        padding-left: 12px;
        margin: 8px 0;
        color: #64748b;
        font-style: italic;
      }

      .chatbot-widget-typing {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 12px 16px;
        background: #f1f5f9;
        border-radius: 18px;
        max-width: 80px;
        align-self: flex-start;
      }

      .chatbot-widget-typing-dot {
        width: 6px;
        height: 6px;
        background: #94a3b8;
        border-radius: 50%;
        animation: chatbot-widget-typing 1.4s infinite ease-in-out;
      }

      .chatbot-widget-typing-dot:nth-child(1) { 
        animation-delay: -0.32s; 
      }

      .chatbot-widget-typing-dot:nth-child(2) { 
        animation-delay: -0.16s; 
      }

      @keyframes chatbot-widget-typing {
        0%, 80%, 100% {
          transform: scale(0.8);
          opacity: 0.5;
        }
        40% {
          transform: scale(1);
          opacity: 1;
        }
      }

      .chatbot-widget-input-container {
        padding: 20px;
        border-top: 1px solid #e2e8f0;
        display: flex;
        gap: 12px;
        align-items: flex-end;
      }

      .chatbot-widget-input {
        flex: 1;
        border: 1px solid #e2e8f0;
        border-radius: 20px;
        padding: 12px 16px;
        font-size: 14px;
        outline: none;
        resize: none;
        max-height: 100px;
        min-height: 20px;
        font-family: inherit;
        transition: border-color 0.2s;
      }

      .chatbot-widget-input:focus {
        border-color: var(--chatbot-primary-color, ${config.primaryColor});
      }

      .chatbot-widget-send {
        background: var(--chatbot-primary-color, ${config.primaryColor});
        border: none;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        flex-shrink: 0;
      }

      .chatbot-widget-send:hover {
        transform: scale(1.05);
      }

      .chatbot-widget-send:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
      }

      .chatbot-widget-send-icon {
        width: 16px;
        height: 16px;
        fill: white;
      }

      .chatbot-widget-history-view {
        flex: 1;
        padding: 20px;
        overflow-y: auto;
        max-height: 300px;
      }

      .chatbot-widget-window.view-sidesheet .chatbot-widget-history-view {
        max-height: none;
      }

      .chatbot-widget-history-item {
        padding: 12px;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        margin-bottom: 8px;
        cursor: pointer;
        transition: all 0.2s;
      }

      .chatbot-widget-history-item:hover {
        background: #f8f9fa;
        border-color: var(--chatbot-primary-color, ${config.primaryColor});
      }

      .chatbot-widget-history-title {
        font-weight: 600;
        font-size: 13px;
        color: #343a40;
        margin-bottom: 4px;
      }

      .chatbot-widget-history-preview {
        font-size: 12px;
        color: #6c757d;
        line-height: 1.3;
      }

      .chatbot-widget-history-date {
        font-size: 11px;
        color: #adb5bd;
        margin-top: 4px;
      }

      .chatbot-widget-no-history {
        text-align: center;
        color: #6c757d;
        font-size: 14px;
        padding: 40px 20px;
      }

      /* Mobile responsiveness */
      @media (max-width: 480px) {
        .chatbot-widget-window.view-bubble {
          width: calc(100vw - 40px) !important;
          max-width: none;
          left: 20px !important;
          right: 20px !important;
        }
        
        .chatbot-widget-window.view-sidesheet {
          width: 100vw !important;
          left: 0 !important;
          right: 0 !important;
        }
        
        .chatbot-widget-bubble.view-sidesheet {
          right: 20px !important;
          left: auto !important;
        }
      }
    `;
  }

  // Set CSS custom properties for dynamic theming
  function setCSSVariables() {
    const root = document.documentElement;
    root.style.setProperty('--chatbot-primary-color', config.primaryColor);
    root.style.setProperty('--chatbot-z-index', config.zIndex);
    root.style.setProperty('--chatbot-width', config.width);
    root.style.setProperty('--chatbot-max-height', config.maxHeight);
  }

  // Create chat bubble
  function createChatBubble() {
    chatBubble = document.createElement('div');
    
    // Add base class and position/view classes
    let bubbleClasses = ['chatbot-widget-bubble'];
    bubbleClasses.push(`view-${config.view}`);
    
    if (config.view === 'sidesheet') {
      bubbleClasses.push(config.position.includes('right') ? 'position-right' : 'position-left');
    } else {
      bubbleClasses.push(`position-${config.position}`);
    }
    
    chatBubble.className = bubbleClasses.join(' ');
    chatBubble.innerHTML = `
      <svg class="chatbot-widget-bubble-icon" viewBox="0 0 24 24">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4l4 4 4-4h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
      </svg>
    `;
    
    chatBubble.addEventListener('click', toggleChat);
    document.body.appendChild(chatBubble);
  }

  // Create chat window
  function createChatWindow() {
    chatWindow = document.createElement('div');
    
    // Add base class and position/view classes
    let windowClasses = ['chatbot-widget-window'];
    windowClasses.push(`view-${config.view}`);
    
    if (config.view === 'sidesheet') {
      windowClasses.push(config.position.includes('right') ? 'position-right' : 'position-left');
    } else {
      windowClasses.push(`position-${config.position}`);
    }
    
    chatWindow.className = windowClasses.join(' ');
    
    chatWindow.innerHTML = `
      <div class="chatbot-widget-header">
        <div class="chatbot-widget-header-content">
          <img src="${config.icon}" alt="Chat Icon" class="chatbot-widget-header-icon" />
          <span>${config.title}</span>
        </div>
        <div class="chatbot-widget-header-actions">
          <button class="chatbot-widget-header-btn" id="chatbot-new-conversation" title="New Conversation">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
          </button>
          <button class="chatbot-widget-header-btn" id="chatbot-show-history" title="Conversation History">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
            </svg>
          </button>
          <button class="chatbot-widget-header-btn" id="chatbot-toggle-view" title="Toggle View">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/>
            </svg>
          </button>
          <button class="chatbot-widget-close" type="button">×</button>
        </div>
      </div>
      <div class="chatbot-widget-messages"></div>
      <div class="chatbot-widget-history-view" style="display: none;"></div>
      <div class="chatbot-widget-input-container">
        <textarea class="chatbot-widget-input" placeholder="${config.placeholder}" rows="1"></textarea>
        <button class="chatbot-widget-send" type="button">
          <svg class="chatbot-widget-send-icon" viewBox="0 0 24 24">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </button>
      </div>
    `;

    messagesContainer = chatWindow.querySelector('.chatbot-widget-messages');
    messageInput = chatWindow.querySelector('.chatbot-widget-input');
    sendButton = chatWindow.querySelector('.chatbot-widget-send');

    // Event listeners
    chatWindow.querySelector('.chatbot-widget-close').addEventListener('click', toggleChat);
    sendButton.addEventListener('click', sendMessage);
    messageInput.addEventListener('keydown', handleKeyDown);
    messageInput.addEventListener('input', autoResize);
    
    // Action button listeners
    chatWindow.querySelector('#chatbot-new-conversation').addEventListener('click', startNewConversation);
    chatWindow.querySelector('#chatbot-show-history').addEventListener('click', toggleHistoryView);
    chatWindow.querySelector('#chatbot-toggle-view').addEventListener('click', toggleView);

    // Initialize toggle button icon
    updateToggleButtonIcon();

    document.body.appendChild(chatWindow);
  }

  // Toggle chat window
  function toggleChat() {
    isOpen = !isOpen;
    chatWindow.style.display = isOpen ? 'flex' : 'none';
    
    if (isOpen && messageHistory.length === 0) {
      addMessage(config.welcomeMessage, 'bot');
    }
    
    if (isOpen) {
      messageInput.focus();
      scrollToBottom();
    }
  }

  // Auto-resize textarea
  function autoResize() {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 100) + 'px';
  }

  // Handle key down events
  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  // Send message
  async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message || isTyping) return;

    // Add user message
    addMessage(message, 'user');
    messageInput.value = '';
    autoResize();

    // Show typing indicator
    showTyping();

    try {
      // Prepare request body
      const requestBody = {
        message: message,
        history: messageHistory
      };

      // Include threadId if we have one
      if (currentThreadId) {
        requestBody.threadId = currentThreadId;
      }

      // Send to API
      const response = await fetch(config.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      hideTyping();
      
      // Store thread ID from response
      if (data.threadId) {
        currentThreadId = data.threadId;
      }

      // Store conversation ID from response
      if (data.conversationId) {
        currentConversationId = data.conversationId;
      }
      
      // Add bot response
      const botMessage = data.message || data.response || 'Sorry, I didn\'t understand that.';
      addMessage(botMessage, 'bot');

    } catch (error) {
      console.error('Chatbot API error:', error);
      hideTyping();
      addMessage('Sorry, I\'m having trouble connecting right now. Please try again later.', 'bot');
    }
  }

  // Simple markdown parser for common elements
  function parseMarkdown(text) {
    // Escape HTML to prevent XSS
    text = text.replace(/&/g, '&amp;')
               .replace(/</g, '&lt;')
               .replace(/>/g, '&gt;')
               .replace(/"/g, '&quot;')
               .replace(/'/g, '&#39;');

    // Parse markdown elements
    // Bold text **text** or __text__
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__(.*?)__/g, '<strong>$1</strong>');
    
    // Italic text *text* or _text_
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    text = text.replace(/_(.*?)_/g, '<em>$1</em>');

    // Code blocks ```code```
    text = text.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    
    // Inline code `code`
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Links [text](url)
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    
    // Line breaks (double newline becomes paragraph break)
    text = text.replace(/\n\n/g, '</p><p>');
    text = '<p>' + text + '</p>';
    
    // Single line breaks become <br>
    text = text.replace(/\n/g, '<br>');
    
    // Handle lists
    // Unordered lists - * item or - item
    text = text.replace(/^[\*\-]\s+(.+)$/gm, '<li>$1</li>');
    text = text.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    
    // Ordered lists - 1. item
    text = text.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');
    // This is a simple approach - in practice you'd want more sophisticated list handling
    
    // Headers
    text = text.replace(/^### (.*$)/gm, '<h3>$1</h3>');
    text = text.replace(/^## (.*$)/gm, '<h2>$1</h2>');
    text = text.replace(/^# (.*$)/gm, '<h1>$1</h1>');
    
    // Clean up empty paragraphs
    text = text.replace(/<p><\/p>/g, '');
    text = text.replace(/<p>\s*<\/p>/g, '');
    
    return text;
  }

  // Add message to chat
  function addMessage(text, sender) {
    const messageElement = document.createElement('div');
    messageElement.className = `chatbot-widget-message ${sender}`;
    
    // Parse markdown for bot messages, keep plain text for user messages
    if (sender === 'bot') {
      messageElement.innerHTML = parseMarkdown(text);
    } else {
      messageElement.textContent = text;
    }
    
    messagesContainer.appendChild(messageElement);
    messageHistory.push({ text, sender, timestamp: Date.now() });
    
    scrollToBottom();
  }

  // Show typing indicator
  function showTyping() {
    if (isTyping) return;
    
    isTyping = true;
    const typingElement = document.createElement('div');
    typingElement.className = 'chatbot-widget-typing';
    typingElement.innerHTML = `
      <div class="chatbot-widget-typing-dot"></div>
      <div class="chatbot-widget-typing-dot"></div>
      <div class="chatbot-widget-typing-dot"></div>
    `;
    
    messagesContainer.appendChild(typingElement);
    scrollToBottom();
  }

  // Hide typing indicator
  function hideTyping() {
    if (!isTyping) return;
    
    isTyping = false;
    const typingElement = messagesContainer.querySelector('.chatbot-widget-typing');
    if (typingElement) {
      typingElement.remove();
    }
  }

  // Scroll to bottom
  function scrollToBottom() {
    setTimeout(() => {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 100);
  }

  // Save current conversation to history
  function saveCurrentConversation() {
    if (messageHistory.length > 1) { // Only save if there are actual messages beyond welcome
      const conversationId = currentConversationId || Date.now().toString();
      const firstUserMessage = messageHistory.find(msg => msg.sender === 'user');
      const title = firstUserMessage ? firstUserMessage.text.substring(0, 50) + '...' : 'New Conversation';
      
      const existingIndex = conversationHistory.findIndex(conv => conv.id === conversationId);
      const conversation = {
        id: conversationId,
        title: title,
        messages: [...messageHistory],
        timestamp: Date.now()
      };
      
      if (existingIndex >= 0) {
        conversationHistory[existingIndex] = conversation;
      } else {
        conversationHistory.unshift(conversation);
      }
      
      // Keep only last 10 conversations
      if (conversationHistory.length > 10) {
        conversationHistory = conversationHistory.slice(0, 10);
      }
      
      currentConversationId = conversationId;
    }
  }

  // Start new conversation
  function startNewConversation() {
    // Save current conversation if it has content
    saveCurrentConversation();
    
    // Reset current conversation
    messageHistory = [];
    currentConversationId = null;
    currentThreadId = null; // Reset thread ID for new conversation
    messagesContainer.innerHTML = '';
    
    // Show chat view and hide history
    showChatView();
    
    // Add welcome message
    addMessage(config.welcomeMessage, 'bot');
    messageInput.focus();
  }

  // Toggle history view
  function toggleHistoryView() {
    if (showingHistory) {
      showChatView();
    } else {
      showHistoryView();
    }
  }

  // Show chat view
  function showChatView() {
    showingHistory = false;
    messagesContainer.style.display = 'flex';
    chatWindow.querySelector('.chatbot-widget-history-view').style.display = 'none';
    chatWindow.querySelector('.chatbot-widget-input-container').style.display = 'flex';
    
    // Update history button icon and title
    const historyButton = chatWindow.querySelector('#chatbot-show-history');
    historyButton.title = 'Conversation History';
    historyButton.querySelector('svg').innerHTML = '<path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>';
  }

  // Show history view
  async function showHistoryView() {
    // Save current conversation before showing history
    saveCurrentConversation();
    
    showingHistory = true;
    messagesContainer.style.display = 'none';
    chatWindow.querySelector('.chatbot-widget-input-container').style.display = 'none';
    
    const historyView = chatWindow.querySelector('.chatbot-widget-history-view');
    historyView.style.display = 'block';
    
    // Update history button icon and title to show "back" state
    const historyButton = chatWindow.querySelector('#chatbot-show-history');
    historyButton.title = 'Back to Chat';
    historyButton.querySelector('svg').innerHTML = '<path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>';
    
    await renderHistoryList();
  }

  // Render history list
  async function renderHistoryList() {
    const historyView = chatWindow.querySelector('.chatbot-widget-history-view');
    
    // Show loading state
    historyView.innerHTML = '<div class="chatbot-widget-no-history">Loading conversation history...</div>';
    
    try {
      // Get user ID (using IP as user identifier for now)
      const userId = '::ffff:127.0.0.1';
      // const userId = '::1';
      
      // Fetch conversations from backend
      const apiBaseUrl = config.apiUrl.replace('/chat', '');
      const response = await fetch(`${apiBaseUrl}/users/${userId}/conversations?limit=20`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch conversation history');
      }
      
      const data = await response.json();
      const conversations = data.conversations || [];
      
      if (conversations.length === 0) {
        historyView.innerHTML = '<div class="chatbot-widget-no-history">No conversation history yet.</div>';
        return;
      }
      
      let historyHTML = '';
      conversations.forEach(conversation => {
        const date = new Date(conversation.lastActivity).toLocaleDateString();
        const title = `Conversation ${conversation.id.substring(0, 8)}...`;
        const preview = `${conversation.messageCount} messages`;
        
        historyHTML += `
          <div class="chatbot-widget-history-item" data-thread-id="${conversation.threadId}">
            <div class="chatbot-widget-history-title">${title}</div>
            <div class="chatbot-widget-history-preview">${preview}</div>
            <div class="chatbot-widget-history-date">${date}</div>
          </div>
        `;
      });
      
      historyView.innerHTML = historyHTML;
      
      // Add click listeners to history items
      historyView.querySelectorAll('.chatbot-widget-history-item').forEach(item => {
        item.addEventListener('click', () => {
          const threadId = item.dataset.threadId;
          if (threadId) {
            loadConversationByThread(threadId);
          }
        });
      });
      
    } catch (error) {
      console.error('Error loading conversation history:', error);
      historyView.innerHTML = '<div class="chatbot-widget-no-history">Failed to load conversation history.</div>';
    }
  }

  // Load a conversation from history by thread ID
  async function loadConversationByThread(threadId) {
    try {
      // Show loading state
      messagesContainer.innerHTML = '<div class="chatbot-widget-no-history">Loading conversation...</div>';
      
      // Fetch conversation from backend
      const apiBaseUrl = config.apiUrl.replace('/chat', '');
      const response = await fetch(`${apiBaseUrl}/threads/${threadId}/conversation`);
      
      if (!response.ok) {
        throw new Error('Failed to load conversation');
      }
      
      const conversation = await response.json();
      
      // Set current conversation state
      currentConversationId = conversation.id;
      currentThreadId = conversation.threadId;
      messageHistory = conversation.messages || [];
      
      // Clear and rebuild messages container
      messagesContainer.innerHTML = '';
      messageHistory.forEach(msg => {
        const messageElement = document.createElement('div');
        messageElement.className = `chatbot-widget-message ${msg.sender}`;
        
        // Parse markdown for bot messages, keep plain text for user messages
        if (msg.sender === 'bot') {
          messageElement.innerHTML = parseMarkdown(msg.text);
        } else {
          messageElement.textContent = msg.text;
        }
        
        messagesContainer.appendChild(messageElement);
      });
      
      // Switch back to chat view
      showChatView();
      scrollToBottom();
      messageInput.focus();
      
    } catch (error) {
      console.error('Error loading conversation:', error);
      messagesContainer.innerHTML = '';
      addMessage('Failed to load conversation. Please try again.', 'bot');
      showChatView();
    }
  }

  // Load a conversation from local history (fallback)
  function loadConversation(conversationId) {
    const conversation = conversationHistory.find(conv => conv.id === conversationId);
    if (!conversation) return;
    
    // Load the conversation
    messageHistory = [...conversation.messages];
    currentConversationId = conversationId;
    
    // Clear and rebuild messages container
    messagesContainer.innerHTML = '';
    messageHistory.forEach(msg => {
      const messageElement = document.createElement('div');
      messageElement.className = `chatbot-widget-message ${msg.sender}`;
      
      // Parse markdown for bot messages, keep plain text for user messages
      if (msg.sender === 'bot') {
        messageElement.innerHTML = parseMarkdown(msg.text);
      } else {
        messageElement.textContent = msg.text;
      }
      
      messagesContainer.appendChild(messageElement);
    });
    
    // Switch back to chat view
    showChatView();
    scrollToBottom();
    messageInput.focus();
  }

  // Toggle view between bubble and sidesheet
  function toggleView() {
    // Switch the view
    config.view = config.view === 'bubble' ? 'sidesheet' : 'bubble';
    
    // Update bubble classes
    updateElementClasses(chatBubble);
    
    // Update window classes
    updateElementClasses(chatWindow);
    
    // Update toggle button icon
    updateToggleButtonIcon();
  }

  // Update element classes based on current view
  function updateElementClasses(element) {
    // Remove old view classes
    element.classList.remove('view-bubble', 'view-sidesheet');
    element.classList.remove('position-bottom-right', 'position-bottom-left', 'position-top-right', 'position-top-left');
    element.classList.remove('position-right', 'position-left');
    
    // Add new view class
    element.classList.add(`view-${config.view}`);
    
    // Add appropriate position classes
    if (config.view === 'sidesheet') {
      element.classList.add(config.position.includes('right') ? 'position-right' : 'position-left');
    } else {
      element.classList.add(`position-${config.position}`);
    }
  }

  // Update toggle button icon based on current view
  function updateToggleButtonIcon() {
    const toggleButton = chatWindow.querySelector('#chatbot-toggle-view');
    const svg = toggleButton.querySelector('svg');
    
    if (config.view === 'bubble') {
      // Show sidesheet icon (expand/sidebar icon)
      svg.innerHTML = '<path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>';
    } else {
      // Show bubble icon (compress/window icon)
      svg.innerHTML = '<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>';
    }
  }

  // Initialize widget
  async function init() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }

    // Load styles first, then create the widget elements
    try {
      await loadStyles();
      createChatBubble();
      createChatWindow();
    } catch (error) {
      console.error('Failed to initialize chatbot widget:', error);
      // Still try to create the widget with fallback styles
      createChatBubble();
      createChatWindow();
    }
  }

  // Public API
  window.ChatbotWidget = {
    open: () => {
      if (!isOpen) toggleChat();
    },
    close: () => {
      if (isOpen) toggleChat();
    },
    sendMessage: (message) => {
      if (typeof message === 'string' && message.trim()) {
        // Set the input value and trigger send
        messageInput.value = message.trim();
        sendMessage();
      }
    },
    clearHistory: () => {
      messageHistory = [];
      messagesContainer.innerHTML = '';
      addMessage(config.welcomeMessage, 'bot');
    }
  };

  // Initialize
  init();

})();
