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
    view: 'sidesheet', // 'bubble' or 'sidesheet'
    enableStreaming: true, // Enable/disable streaming responses
    // CSP Configuration
    nonce: null, // CSP nonce for scripts and styles (e.g., 'abc123')
    disableExternalCSS: false, // Force inline styles for strict CSP
    disableExternalScripts: false, // Force fallback parsing for strict CSP
    cssUrl: null // Custom CSS URL (auto-detected if not provided)
  };

  // Merge user config with defaults
  const config = Object.assign({}, defaultConfig, window.ChatbotWidgetConfig || {});

  // Extract base URL from config.apiUrl, fallback to window.location.origin
  let baseUrl;
  try {
    baseUrl = new URL(config.apiUrl).origin;
  } catch (error) {
    console.warn('Invalid apiUrl in config, falling back to window.location.origin:', error);
    baseUrl = window.location.origin;
  }

  // Widget state
  let isOpen = false;
  let isMinimized = false;
  let messageHistory = [];
  let conversationHistory = []; // Store multiple conversations
  let currentConversationId = null;
  let currentThreadId = null; // Track current thread ID
  let isTyping = false;
  let showingHistory = false;

  // Metabase integration state
  let metabaseQuestionId = null;
  let metabaseQuestionData = null;
  let metabaseQuestionUrl = null;
  let isMetabasePage = false;
  let includeMetabaseQuery = false;

  // DOM elements
  let chatBubble, chatWindow, messagesContainer, messageInput, sendButton;

  // Load marked library
  function loadMarkedLibrary() {
    return new Promise((resolve, reject) => {
      // Check if marked is already loaded
      if (window.marked) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://llm-bot.progfin.com/js/marked.umd.js';
      script.onload = () => {
        // Configure marked for security
        if (window.marked && window.marked.setOptions) {
          window.marked.setOptions({
            sanitize: false, // We'll handle sanitization ourselves
            breaks: true,    // Convert \n to <br>
            gfm: true       // GitHub Flavored Markdown
          });
        }
        resolve();
      };
      script.onerror = () => {
        console.warn('Failed to load marked library, falling back to simple parsing');
        resolve(); // Don't reject, we'll use fallback
      };
      
      // Apply nonce if provided for CSP compliance
      if (config.nonce) {
        script.setAttribute('nonce', config.nonce);
      }
      
      document.head.appendChild(script);
    });
  }

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
        background: var(--chatbot-primary-color, #4F46E5);
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: var(--chatbot-z-index, 10000);
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
        z-index: calc(var(--chatbot-z-index, 10000) + 1);
        display: none;
        flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        line-height: 1.4;
        overflow: hidden;
        animation: chatbot-widget-slideIn 0.3s ease-out;
      }

      .chatbot-widget-window.view-bubble {
        width: var(--chatbot-width, 500px);
        max-height: var(--chatbot-max-height, 500px);
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
        width: 50%;
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
        background: var(--chatbot-primary-color, #4F46E5);
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
        background: var(--chatbot-primary-color, #4F46E5);
        color: white;
        align-self: flex-end;
        margin-left: auto;
      }

      .chatbot-widget-message.bot {
        background: #f1f5f9;
        color: #334155;
        align-self: flex-start;
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
        border-color: var(--chatbot-primary-color, #4F46E5);
      }

      /* Streaming cursor animation */
      .streaming-cursor {
        color: var(--chatbot-primary-color, #4F46E5);
        animation: chatbot-widget-blink 1s infinite;
        font-weight: bold;
        margin-left: 2px;
      }

      @keyframes chatbot-widget-blink {
        0%, 50% {
          opacity: 1;
        }
        51%, 100% {
          opacity: 0;
        }
      }

      .chatbot-widget-message.streaming {
        position: relative;
      }

      .chatbot-widget-send {
        background: var(--chatbot-primary-color, #4F46E5);
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
        border-color: var(--chatbot-primary-color, #4F46E5);
      }

      .chatbot-widget-history-title {
        font-weight: 600;
        font-size: 14px;
        color: #1f2937;
        margin-bottom: 4px;
        line-height: 1.3;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .chatbot-widget-history-preview {
        font-size: 12px;
        color: #6b7280;
        line-height: 1.3;
        display: flex;
        align-items: center;
        gap: 4px;
      }

            .chatbot-widget-history-date {
              font-size: 11px;
              color: #adb5bd;
              margin-top: 4px;
            }

            .chatbot-widget-history-metabase {
              margin: 4px 0;
            }

            .chatbot-widget-history-metabase a {
              color: #4F46E5;
              text-decoration: none;
              font-size: 11px;
              font-weight: 500;
              display: inline-flex;
              align-items: center;
              gap: 4px;
              padding: 2px 6px;
              border-radius: 4px;
              background: #f0f9ff;
              border: 1px solid #e0f2fe;
              transition: all 0.2s;
            }

            .chatbot-widget-history-metabase a:hover {
              background: #e0f2fe;
              border-color: #4F46E5;
              transform: translateY(-1px);
            }

      .chatbot-widget-no-history {
        text-align: center;
        color: #6c757d;
        font-size: 14px;
        padding: 40px 20px;
      }

      /* Enhanced message content styling */
      .chatbot-widget-message.bot {
        line-height: 1.6;
      }

      /* Code block styling */
      .chatbot-code-block {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        margin: 8px 0;
        overflow: hidden;
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace;
        font-size: 13px;
      }

      .chatbot-code-header {
        background: #e2e8f0;
        padding: 8px 12px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #cbd5e1;
      }

      .chatbot-code-language {
        font-size: 11px;
        font-weight: 600;
        color: #475569;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .chatbot-code-actions {
        display: flex;
        gap: 4px;
        align-items: center;
      }

      .chatbot-code-copy,
      .chatbot-code-run,
      .chatbot-code-paste {
        background: none;
        border: none;
        color: #64748b;
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .chatbot-code-copy:hover,
      .chatbot-code-run:hover
      .chatbot-code-paste:hover {
        background: #cbd5e1;
        color: #334155;
      }

      .chatbot-code-run {
        color: #059669;
      }

      .chatbot-code-run:hover {
        background: #d1fae5;
        color: #047857;
      }

      .chatbot-code-run:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .chatbot-code-paste {
        color: #7c3aed;
      }

      .chatbot-code-paste:hover {
        background: #e9d5ff;
        color: #6b21a8;
      }

      .chatbot-code-paste:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .chatbot-code-content {
        padding: 12px;
        margin: 0;
        overflow-x: auto;
        background: #ffffff;
        white-space: pre;
        line-height: 1.5;
      }

      .chatbot-code-content code {
        font-family: inherit;
        font-size: inherit;
        background: none;
        padding: 0;
        border: none;
      }

      /* SQL Results Styling */
      .chatbot-sql-results {
        border-top: 1px solid #e2e8f0;
        background: #f8fafc;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      .chatbot-sql-results-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        background: #f1f5f9;
        border-bottom: 1px solid #e2e8f0;
      }

      .chatbot-sql-results-header.chatbot-sql-error-header {
        background: #fef2f2;
        border-bottom-color: #fecaca;
      }

      .chatbot-sql-results-info {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
      }

      .chatbot-sql-success-icon {
        color: #059669;
        font-weight: bold;
        font-size: 14px;
      }

      .chatbot-sql-error-icon {
        color: #dc2626;
        font-weight: bold;
        font-size: 14px;
      }

      .chatbot-sql-meta {
        color: #6b7280;
        font-size: 11px;
      }

      .chatbot-sql-toggle {
        background: none;
        border: none;
        color: #6b7280;
        cursor: pointer;
        font-size: 12px;
        padding: 2px 4px;
        border-radius: 3px;
        transition: all 0.2s;
      }

      .chatbot-sql-toggle:hover {
        background: #e5e7eb;
        color: #374151;
      }

      .chatbot-sql-results-content {
        padding: 12px;
      }

      .chatbot-sql-table-container {
        overflow-x: auto;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        background: white;
      }

      .chatbot-sql-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace;
      }

      .chatbot-sql-table th {
        background: #f9fafb;
        padding: 8px 12px;
        text-align: left;
        font-weight: 600;
        color: #374151;
        border-bottom: 1px solid #e5e7eb;
        border-right: 1px solid #e5e7eb;
      }

      .chatbot-sql-table th:last-child {
        border-right: none;
      }

      .chatbot-sql-table td {
        padding: 6px 12px;
        border-bottom: 1px solid #f3f4f6;
        border-right: 1px solid #f3f4f6;
        color: #1f2937;
        vertical-align: top;
      }

      .chatbot-sql-table td:last-child {
        border-right: none;
      }

      .chatbot-sql-table tr:last-child td {
        border-bottom: none;
      }

      .chatbot-sql-table tr:hover {
        background: #f9fafb;
      }

      .chatbot-sql-table em {
        color: #9ca3af;
        font-style: italic;
      }

      .chatbot-sql-empty {
        text-align: center;
        color: #6b7280;
        font-style: italic;
        padding: 20px;
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
      }

      .chatbot-sql-warning {
        background: #fef3c7;
        color: #92400e;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 11px;
        margin-top: 8px;
        border: 1px solid #fde68a;
      }

      .chatbot-sql-error-message {
        background: #fee2e2;
        color: #991b1b;
        padding: 12px;
        border-radius: 6px;
        font-size: 12px;
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace;
        border: 1px solid #fecaca;
        white-space: pre-wrap;
        word-break: break-word;
      }

      .chatbot-sql-error-actions {
        margin-top: 12px;
        display: flex;
        justify-content: flex-end;
      }

      .chatbot-sql-fix-btn {
        background: #dc2626;
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        font-size: 11px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4px;
        transition: all 0.2s;
        font-weight: 500;
      }

      .chatbot-sql-fix-btn:hover {
        background: #b91c1c;
        transform: translateY(-1px);
      }

      .chatbot-sql-fix-btn svg {
        width: 12px;
        height: 12px;
      }

      /* Inline code styling */
      .chatbot-inline-code {
        background: #f1f5f9;
        color: #e11d48;
        padding: 2px 6px;
        border-radius: 4px;
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace;
        font-size: 12px;
        border: 1px solid #e2e8f0;
      }

      /* Typography styling */
      .chatbot-widget-message.bot strong {
        font-weight: 600;
        color: #1e293b;
      }

      .chatbot-widget-message.bot em {
        font-style: italic;
        color: #475569;
      }

      /* List styling */
      .chatbot-list {
        margin: 8px 0;
        padding-left: 0;
        list-style: none;
      }

      .chatbot-list-item {
        margin: 4px 0;
        padding-left: 20px;
        position: relative;
        line-height: 1.5;
      }

      .chatbot-list .chatbot-list-item:before {
        content: '•';
        color: #64748b;
        font-weight: bold;
        position: absolute;
        left: 8px;
      }

      .chatbot-numbered-list .chatbot-list-item {
        counter-increment: list-counter;
      }

      .chatbot-numbered-list {
        counter-reset: list-counter;
      }

      .chatbot-numbered-list .chatbot-list-item:before {
        content: counter(list-counter) '.';
        color: #64748b;
        font-weight: 600;
        position: absolute;
        left: 0;
        width: 16px;
        text-align: right;
      }

      /* Link styling */
      .chatbot-link {
        color: #3b82f6;
        text-decoration: none;
        border-bottom: 1px solid transparent;
        transition: all 0.2s;
      }

      .chatbot-link:hover {
        color: #1d4ed8;
        border-bottom-color: #3b82f6;
      }

      /* Paragraph styling */
      .chatbot-paragraph {
        margin: 8px 0;
        line-height: 1.6;
      }

      .chatbot-paragraph:first-child {
        margin-top: 0;
      }

      .chatbot-paragraph:last-child {
        margin-bottom: 0;
      }

      /* Syntax highlighting colors */
      /* SQL */
      .chatbot-sql-keyword {
        color: #7c3aed;
        font-weight: 600;
      }

      .chatbot-sql-string {
        color: #059669;
      }

      .chatbot-sql-number {
        color: #dc2626;
      }

      /* JavaScript */
      .chatbot-js-keyword {
        color: #7c3aed;
        font-weight: 600;
      }

      .chatbot-js-string {
        color: #059669;
      }

      .chatbot-js-comment {
        color: #6b7280;
        font-style: italic;
      }

      /* Python */
      .chatbot-python-keyword {
        color: #7c3aed;
        font-weight: 600;
      }

      .chatbot-python-string {
        color: #059669;
      }

      .chatbot-python-comment {
        color: #6b7280;
        font-style: italic;
      }

      /* HTML */
      .chatbot-html-tag {
        color: #dc2626;
        font-weight: 600;
      }

      .chatbot-html-attr {
        color: #7c3aed;
      }

      /* CSS */
      .chatbot-css-selector {
        color: #dc2626;
        font-weight: 600;
      }

      .chatbot-css-property {
        color: #7c3aed;
      }

      .chatbot-css-value {
        color: #059669;
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
        overflow-x: auto;
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
        color: var(--chatbot-primary-color, #4F46E5);
        text-decoration: none;
        border-bottom: 1px solid transparent;
        transition: border-color 0.2s;
      }

      .chatbot-widget-message.bot a:hover {
        border-bottom-color: var(--chatbot-primary-color, #4F46E5);
      }

      .chatbot-widget-message.bot blockquote {
        border-left: 3px solid var(--chatbot-primary-color, #4F46E5);
        padding-left: 12px;
        margin: 8px 0;
        color: #64748b;
        font-style: italic;
      }

      /* Metabase integration styles */
      .chatbot-metabase-checkbox {
        padding: 8px 20px 12px 20px;
        border-top: 1px solid #e2e8f0;
        background: #f8fafc;
        font-size: 13px;
        flex-shrink: 0;
      }

      .chatbot-metabase-label {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        user-select: none;
      }

      .chatbot-metabase-input {
        width: 16px;
        height: 16px;
        cursor: pointer;
        accent-color: var(--chatbot-primary-color, #4F46E5);
        flex-shrink: 0;
      }

      .chatbot-metabase-text {
        font-weight: 500;
        color: #374151;
        flex-shrink: 0;
      }

      .chatbot-metabase-info {
        color: #6b7280;
        font-size: 12px;
        margin-left: auto;
        max-width: 200px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex-shrink: 1;
      }

      .chatbot-metabase-label:hover .chatbot-metabase-text {
        color: var(--chatbot-primary-color, #4F46E5);
      }

      /* Ensure input container maintains proper sizing */
      .chatbot-widget-input-container {
        padding: 20px;
        border-top: 1px solid #e2e8f0;
        display: flex;
        gap: 12px;
        align-items: flex-end;
        flex-shrink: 0;
        min-height: 80px; /* Ensure minimum height */
      }

      /* Ensure input maintains proper size */
      .chatbot-widget-input {
        flex: 1;
        border: 1px solid #e2e8f0;
        border-radius: 20px;
        padding: 12px 16px;
        font-size: 14px;
        outline: none;
        resize: none;
        max-height: 100px;
        min-height: 44px; /* Ensure minimum height for input */
        font-family: inherit;
        transition: border-color 0.2s;
        box-sizing: border-box;
      }

      /* Mobile responsiveness */
      @media (max-width: 480px) {
        .chatbot-widget-window.view-bubble {
          width: 100vw !important;
          height: 100vh !important;
          max-width: none !important;
          max-height: none !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          border-radius: 0 !important;
        }
        
        .chatbot-widget-window.view-sidesheet {
          width: 100vw !important;
          height: 100vh !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          border-radius: 0 !important;
        }
        
        .chatbot-widget-bubble.view-sidesheet {
          right: 20px !important;
          left: auto !important;
        }
        
        /* Ensure messages container takes available space in full-screen */
        .chatbot-widget-messages {
          max-height: none !important;
          flex: 1 !important;
        }
        
        /* Ensure history view also takes full available space */
        .chatbot-widget-history-view {
          max-height: none !important;
          flex: 1 !important;
        }
        
        /* Mobile-specific code block adjustments */
        .chatbot-code-block {
          font-size: 12px;
        }
        
        .chatbot-code-content {
          padding: 8px;
        }
        
        .chatbot-code-header {
          padding: 6px 8px;
        }
        
        /* Adjust inline code for mobile */
        .chatbot-inline-code {
          font-size: 11px;
          padding: 1px 4px;
        }
        
        /* Adjust list spacing for mobile */
        .chatbot-list-item {
          padding-left: 16px;
        }
        
        .chatbot-numbered-list .chatbot-list-item:before {
          width: 14px;
        }
        
        /* Mobile adjustments for Metabase checkbox */
        .chatbot-metabase-checkbox {
          padding: 6px 15px 10px 15px;
        }
        
        .chatbot-metabase-info {
          max-width: 120px;
          font-size: 11px;
        }
        
        .chatbot-metabase-text {
          font-size: 12px;
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
          <button class="chatbot-widget-header-btn" id="chatbot-share-conversation" title="Share Conversation" style="display: none;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
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
    chatWindow.querySelector('#chatbot-share-conversation').addEventListener('click', shareConversation);
    chatWindow.querySelector('#chatbot-toggle-view').addEventListener('click', toggleView);

    // Initialize toggle button icon
    updateToggleButtonIcon();
    
    // Update share button visibility
    updateShareButtonVisibility();

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
      // Create Metabase checkbox if on Metabase page
      createMetabaseCheckbox();
      
      // Update paste button visibility when chat opens
      setTimeout(() => {
        updatePasteButtonVisibility();
      }, 100);
      
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

    // Enhance message with Metabase query if needed
    const enhancedMessage = enhanceMessageWithMetabase(message);

    // Add user message (display original message to user)
    addMessage(message, 'user');
    messageInput.value = '';
    autoResize();

    // Try streaming first, fallback to regular API if it fails
    const streamingSupported = typeof ReadableStream !== 'undefined' && 
                              typeof TextDecoder !== 'undefined' && 
                              config.enableStreaming !== false; // Allow disabling streaming via config
    
    if (streamingSupported) {
      try {
        await sendMessageStreaming(enhancedMessage);
        return;
      } catch (error) {
        console.warn('Streaming failed, falling back to regular API:', error);
        // Continue to regular API below
      }
    }

    // Fallback to regular API
    await sendMessageRegular(enhancedMessage);
  }

  // Send message with streaming
  async function sendMessageStreaming(enhancedMessage) {
    return new Promise((resolve, reject) => {
      // Show typing indicator
      showTyping();

      // Prepare request body
      const requestBody = {
        message: enhancedMessage,
        history: messageHistory
      };

      // Include threadId if we have one
      if (currentThreadId) {
        requestBody.threadId = currentThreadId;
      }

      // Include Metabase question URL if we have one and this is a new conversation
      if (metabaseQuestionUrl && !currentConversationId) {
        requestBody.metabaseQuestionUrl = metabaseQuestionUrl;
      }

      let streamingMessageElement = null;
      let accumulatedContent = '';
      let hasStarted = false;

      // Use fetch with streaming response
      fetch(config.apiUrl + '?stream=true', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        if (!response.body) {
          throw new Error('ReadableStream not supported');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        function readStream() {
          return reader.read().then(({ done, value }) => {
            if (done) {
              // Stream complete
              if (hasStarted) {
                resolve();
              } else {
                reject(new Error('Stream ended without data'));
              }
              return;
            }

            // Decode the chunk
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.trim() === '') continue;
              
              // Parse Server-Sent Events format
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  
                  switch (data.type) {
                    case 'connected':
                      console.log('Streaming connected');
                      break;
                      
                    case 'message_start':
                      hideTyping();
                      streamingMessageElement = createStreamingMessage();
                      hasStarted = true;
                      
                      // Store thread ID from response
                      if (data.threadId) {
                        currentThreadId = data.threadId;
                      }
                      break;
                      
                    case 'progress':
                      // Show progress indicator
                      updateStreamingProgress(data);
                      break;
                      
                    case 'message_delta':
                      if (streamingMessageElement && data.content) {
                        accumulatedContent = data.content;
                        updateStreamingMessage(streamingMessageElement, accumulatedContent);
                      }
                      break;
                      
                    case 'message_complete':
                      if (streamingMessageElement && data.content) {
                        accumulatedContent = data.content;
                        finalizeStreamingMessage(streamingMessageElement, accumulatedContent);
                        
                        // Add to message history
                        messageHistory.push({ 
                          text: accumulatedContent, 
                          sender: 'bot', 
                          timestamp: Date.now() 
                        });
                      }
                      
                      // Store thread ID from response
                      if (data.threadId) {
                        currentThreadId = data.threadId;
                      }
                      break;
                      
                    case 'done':
                      // Store conversation and thread IDs
                      if (data.conversationId) {
                        currentConversationId = data.conversationId;
                      }
                      if (data.threadId) {
                        currentThreadId = data.threadId;
                      }
                      
                      // Update share button visibility
                      updateShareButtonVisibility();
                      
                      resolve();
                      return;
                      
                    case 'error':
                      console.error('Streaming error:', data.error);
                      hideTyping();
                      
                      if (!hasStarted) {
                        // If streaming never started, reject to trigger fallback
                        reject(new Error(data.error));
                      } else {
                        // If streaming was in progress, show error message
                        addMessage('Sorry, there was an error processing your request.', 'bot');
                        resolve();
                      }
                      return;
                  }
                } catch (parseError) {
                  console.error('Error parsing streaming data:', parseError);
                }
              }
            }

            // Continue reading
            return readStream();
          });
        }

        return readStream();
      })
      .catch(error => {
        console.error('Streaming request error:', error);
        hideTyping();
        
        if (!hasStarted) {
          reject(error);
        } else {
          addMessage('Connection lost. Please try again.', 'bot');
          resolve();
        }
      });
    });
  }

  // Send message with regular API (fallback)
  async function sendMessageRegular(enhancedMessage) {
    // Show typing indicator
    showTyping();

    try {
      // Prepare request body
      const requestBody = {
        message: enhancedMessage,
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

  // Create streaming message element
  function createStreamingMessage() {
    const messageElement = document.createElement('div');
    messageElement.className = 'chatbot-widget-message bot streaming';
    messageElement.innerHTML = `
      <div style="display: flex; align-items: center; gap: 4px;">
        <div class="chatbot-widget-typing-dot"></div>
        <div class="chatbot-widget-typing-dot"></div>
        <div class="chatbot-widget-typing-dot"></div>
      </div>
    `;
    
    messagesContainer.appendChild(messageElement);
    scrollToBottom();
    
    return messageElement;
  }

  // Update streaming message content
  function updateStreamingMessage(messageElement, content) {
    if (!messageElement) return;
    
    // Parse markdown and add three dots
    const parsedContent = parseMarkdown(content);
    messageElement.innerHTML = parsedContent + `
      <div style="display: flex; align-items: center; gap: 4px;">
        <div class="chatbot-widget-typing-dot"></div>
        <div class="chatbot-widget-typing-dot"></div>
        <div class="chatbot-widget-typing-dot"></div>
      </div>
    `;
    
    scrollToBottom();
  }

  // Finalize streaming message
  function finalizeStreamingMessage(messageElement, content) {
    if (!messageElement) return;
    
    // Remove streaming class and cursor
    messageElement.classList.remove('streaming');
    messageElement.innerHTML = parseMarkdown(content);
    
    // Add event listeners for code blocks
    setTimeout(() => {
      const copyButtons = messageElement.querySelectorAll('.chatbot-code-copy');
      copyButtons.forEach(button => {
        button.addEventListener('click', (e) => {
          e.preventDefault();
          const codeId = button.getAttribute('data-code-id');
          if (codeId) {
            copyCodeToClipboard(codeId, button);
          }
        });
      });
      
      const runButtons = messageElement.querySelectorAll('.chatbot-code-run');
      runButtons.forEach(button => {
        button.addEventListener('click', (e) => {
          e.preventDefault();
          const codeId = button.getAttribute('data-code-id');
          if (codeId) {
            executeSQLQuery(codeId, button);
          }
        });
      });
      
      const pasteButtons = messageElement.querySelectorAll('.chatbot-code-paste');
      pasteButtons.forEach(button => {
        button.addEventListener('click', (e) => {
          e.preventDefault();
          const codeId = button.getAttribute('data-code-id');
          if (codeId) {
            pasteToCodeMirror(codeId, button);
          }
        });
      });
      
      updatePasteButtonVisibility();

      // Update share button visibility
      updateShareButtonVisibility();
    }, 0);
    
    scrollToBottom();
  }

  // Update streaming progress (optional visual feedback)
  function updateStreamingProgress(progressData) {
    // Could add progress indicator here if desired
    console.log('Streaming progress:', progressData);
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
      const languageMatch = codeClasses.match(/language-(\w+)/);
      if (languageMatch) {
        language = languageMatch[1];
      }
      
      // Get the code content
      const codeContent = code.textContent || code.innerText || '';
      
      // Check if this is a SQL code block
      const isSQLBlock = ['sql', 'postgres', 'postgresql', 'mysql', 'sqlite'].includes(language.toLowerCase());
      
      // Create enhanced code block structure
      const codeBlockId = `chatbot-code-${Date.now()}-${index}`;
      const enhancedCodeBlock = document.createElement('div');
      enhancedCodeBlock.className = 'chatbot-code-block';
      
      // Create header buttons HTML
      let headerButtons = `
        <button class="chatbot-code-copy" data-code-id="${codeBlockId}" title="Copy code">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
          </svg>
        </button>
      `;
      
      // Add run button and paste to editor button for SQL blocks
      if (isSQLBlock) {
        headerButtons = `
          <button class="chatbot-code-run" data-code-id="${codeBlockId}" title="Run SQL query">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </button>
          <button class="chatbot-code-paste" data-code-id="${codeBlockId}" title="Paste to CodeMirror editor" style="display: none;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 2h-4.18C14.4.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 18H5V4h2v3h10V4h2v16z"/>
            </svg>
          </button>
        ` + headerButtons;
      }
      
      enhancedCodeBlock.innerHTML = `
        <div class="chatbot-code-header">
          <span class="chatbot-code-language">${language}</span>
          <div class="chatbot-code-actions">
            ${headerButtons}
          </div>
        </div>
        <pre class="chatbot-code-content" id="${codeBlockId}"><code>${codeContent}</code></pre>
        <div class="chatbot-sql-results" id="${codeBlockId}-results" style="display: none;"></div>
      `;
      
      // Replace the original pre element
      pre.parentNode.replaceChild(enhancedCodeBlock, pre);
    });
    
    return temp.innerHTML;
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
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__(.*?)__/g, '<strong>$1</strong>');
    
    // Italic text *text* or _text_
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    text = text.replace(/\b_([^\s_]+)_\b/g, '<em>$1</em>');

    // Code blocks with language detection ```language\ncode```
    text = text.replace(/```(\w+)?\n?([\s\S]*?)```/g, (match, lang, code) => {
      const language = lang || 'text';
      const codeBlockId = `chatbot-code-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      return `<div class="chatbot-code-block">
        <div class="chatbot-code-header">
          <span class="chatbot-code-language">${language}</span>
          <button class="chatbot-code-copy" data-code-id="${codeBlockId}" title="Copy code">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
            </svg>
          </button>
        </div>
        <pre class="chatbot-code-content" id="${codeBlockId}"><code>${code.trim()}</code></pre>
      </div>`;
    });
    
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
    text = text.replace(/^[\*\-]\s+(.+)$/gm, '<li>$1</li>');
    text = text.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    
    // Ordered lists
    text = text.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');
    
    // Headers
    text = text.replace(/^### (.*$)/gm, '<h3>$1</h3>');
    text = text.replace(/^## (.*$)/gm, '<h2>$1</h2>');
    text = text.replace(/^# (.*$)/gm, '<h1>$1</h1>');
    
    // Clean up empty paragraphs
    text = text.replace(/<p><\/p>/g, '');
    text = text.replace(/<p>\s*<\/p>/g, '');
    
    return text;
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
      button.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
        </svg>
      `;
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
      button.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      `;
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
      button.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/>
          <path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" fill="none"/>
        </svg>
      `;
      button.disabled = true;
      button.style.color = '#6b7280';
      
      // Get results container
      const resultsContainer = document.getElementById(`${codeId}-results`);
      if (resultsContainer) {
        resultsContainer.style.display = 'none';
        resultsContainer.innerHTML = '';
      }
      
      // Determine SQL API URL
      const apiBaseUrl = config.apiUrl.replace('/chat', '');
      const sqlApiUrl = `${apiBaseUrl}/sql/execute`;
      
      // Execute SQL query
      const response = await fetch(sqlApiUrl, {
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
        // Show error with fix button
        const errorMessage = result.message + ': ' + result.details?.[0] || 'Unknown SQL error';
        showSQLError(errorMessage, sqlQuery, codeId);
      }
      
    } catch (error) {
      console.error('SQL execution error:', error);
      
      // Reset button
      const originalContent = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z"/>
        </svg>
      `;
      button.innerHTML = originalContent;
      button.disabled = false;
      button.style.color = '';
      
      // Show error
      const codeElement = document.getElementById(codeId);
      const codeContent = codeElement?.querySelector('code');
      const sqlQuery = codeContent ? codeContent.textContent.trim() : '';
      showSQLError(error.message || 'Failed to execute SQL query', sqlQuery, codeId);
    }
  }

  // Show SQL results
  function showSQLResults(result, codeId) {
    const resultsContainer = document.getElementById(`${codeId}-results`);
    if (!resultsContainer) return;
    
    const { data, rowCount, executionTime, truncated } = result;
    
    let resultsHTML = `
      <div class="chatbot-sql-results-header">
        <div class="chatbot-sql-results-info">
          <span class="chatbot-sql-success-icon">✓</span>
          <span>Query executed successfully</span>
          <span class="chatbot-sql-meta">${rowCount} rows in ${executionTime}ms</span>
        </div>
        <button class="chatbot-sql-toggle" data-toggle-target="${codeId}-results-content">▼</button>
      </div>
      <div class="chatbot-sql-results-content" id="${codeId}-results-content">
    `;
    
    if (data && data.length > 0) {
      // Create table
      const columns = Object.keys(data[0]);
      resultsHTML += `
        <div class="chatbot-sql-table-container">
          <table class="chatbot-sql-table">
            <thead>
              <tr>
                ${columns.map(col => `<th>${col}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${data.map(row => `
                <tr>
                  ${columns.map(col => `<td>${row[col] !== null ? String(row[col]) : '<em>null</em>'}</td>`).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
      
      if (truncated) {
        resultsHTML += `<div class="chatbot-sql-warning">Results truncated to ${data.length} rows</div>`;
      }
    } else {
      resultsHTML += `<div class="chatbot-sql-empty">No data returned</div>`;
    }
    
    resultsHTML += `</div>`;
    
    resultsContainer.innerHTML = resultsHTML;
    resultsContainer.style.display = 'block';
  }

  // Show SQL error with fix button
  function showSQLError(errorMessage, originalQuery, codeId) {
    const resultsContainer = document.getElementById(`${codeId}-results`);
    if (!resultsContainer) return;
    
    const resultsHTML = `
      <div class="chatbot-sql-results-header chatbot-sql-error-header">
        <div class="chatbot-sql-results-info">
          <span class="chatbot-sql-error-icon">✗</span>
          <span>Query failed</span>
        </div>
        <button class="chatbot-sql-toggle" data-toggle-target="${codeId}-results-content">▼</button>
      </div>
      <div class="chatbot-sql-results-content" id="${codeId}-results-content">
        <div class="chatbot-sql-error-message">${errorMessage}</div>
        <div class="chatbot-sql-error-actions">
          <button class="chatbot-sql-fix-btn" data-error="${encodeURIComponent(errorMessage)}" data-query="${encodeURIComponent(originalQuery)}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            Fix Error
          </button>
        </div>
      </div>
    `;
    
    resultsContainer.innerHTML = resultsHTML;
    resultsContainer.style.display = 'block';
    
    // Add event listener for fix button using event delegation
    setupSQLResultsEventListeners(resultsContainer);
  }

  // Setup event listeners for SQL results using event delegation
  function setupSQLResultsEventListeners(container) {
    // Use event delegation to handle clicks on dynamically created elements
    container.addEventListener('click', (e) => {
      // Handle SQL toggle buttons
      if (e.target.matches('.chatbot-sql-toggle')) {
        e.preventDefault();
        const toggleButton = e.target;
        const targetId = toggleButton.getAttribute('data-toggle-target');
        const targetElement = document.getElementById(targetId);
        
        if (targetElement) {
          const isVisible = targetElement.style.display !== 'none';
          targetElement.style.display = isVisible ? 'none' : 'block';
          toggleButton.textContent = isVisible ? '▼' : '▲';
        }
      }
      
      // Handle SQL fix buttons
      if (e.target.matches('.chatbot-sql-fix-btn') || e.target.closest('.chatbot-sql-fix-btn')) {
        e.preventDefault();
        const fixButton = e.target.matches('.chatbot-sql-fix-btn') ? e.target : e.target.closest('.chatbot-sql-fix-btn');
        const error = decodeURIComponent(fixButton.getAttribute('data-error'));
        const query = decodeURIComponent(fixButton.getAttribute('data-query'));
        handleFixError(error, query);
      }
    });
  }

  // Paste SQL code to CodeMirror editor
  async function pasteToCodeMirror(codeId, button) {
    try {
      const codeElement = document.getElementById(codeId);
      if (!codeElement) {
        console.error('Code element not found:', codeId);
        return;
      }
      
      const codeContent = codeElement.querySelector('code');
      const sqlCode = codeContent ? codeContent.textContent.trim() : '';
      
      if (!sqlCode) {
        console.error('No SQL code found');
        return;
      }
      
      // Check if CodeMirror is available
      let codeMirrorEditor = null;
      
      // Try different ways to access CodeMirror editor
      if (window.editor && typeof window.editor.setValue === 'function') {
        codeMirrorEditor = window.editor;
      } else if (window.demoHelpers && typeof window.demoHelpers.setEditorContent === 'function') {
        // Use demo helpers if available
        window.demoHelpers.setEditorContent(sqlCode);
        window.demoHelpers.setLanguage('sql');
        
        // Show success feedback
        showPasteSuccess(button);
        return;
      }
      
      if (!codeMirrorEditor) {
        // Show error feedback
        showPasteError(button, 'CodeMirror editor not found');
        return;
      }
      
      // Set SQL mode if available
      if (typeof codeMirrorEditor.setOption === 'function') {
        codeMirrorEditor.setOption('mode', 'sql');
      }
      
      // Set the SQL code
      codeMirrorEditor.setValue(sqlCode);
      
      // Focus the editor if possible
      if (typeof codeMirrorEditor.focus === 'function') {
        codeMirrorEditor.focus();
      }
      
      // Show success feedback
      showPasteSuccess(button);
      
    } catch (error) {
      console.error('Failed to paste to CodeMirror:', error);
      showPasteError(button, error.message);
    }
  }
  
  // Show paste success feedback
  function showPasteSuccess(button) {
    const originalContent = button.innerHTML;
    button.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
      </svg>
    `;
    button.style.color = '#10b981';
    
    // Reset button after 2 seconds
    setTimeout(() => {
      button.innerHTML = originalContent;
      button.style.color = '';
    }, 2000);
  }
  
  // Show paste error feedback
  function showPasteError(button, errorMessage) {
    const originalContent = button.innerHTML;
    button.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
      </svg>
    `;
    button.style.color = '#ef4444';
    button.title = `Error: ${errorMessage}`;
    
    // Reset button after 3 seconds
    setTimeout(() => {
      button.innerHTML = originalContent;
      button.style.color = '';
      button.title = 'Paste to CodeMirror editor';
    }, 3000);
  }
  
  // Check if CodeMirror is available on the page
  function isCodeMirrorAvailable() {
    return (window.editor && typeof window.editor.setValue === 'function') ||
           (window.demoHelpers && typeof window.demoHelpers.setEditorContent === 'function') ||
           (window.CodeMirror && typeof window.CodeMirror === 'function');
  }
  
  // Show/hide paste buttons based on CodeMirror availability
  function updatePasteButtonVisibility() {
    const pasteButtons = document.querySelectorAll('.chatbot-code-paste');
    const isAvailable = isCodeMirrorAvailable();
    
    pasteButtons.forEach(button => {
      button.style.display = isAvailable ? 'flex' : 'none';
    });
  }

  // Handle fix error - send error context to chat
  function handleFixError(errorMessage, originalQuery) {
    const fixMessage = `I got this SQL error: "${errorMessage}" when running this query:

\`\`\`sql
${originalQuery}
\`\`\`

Please help me fix it.`;
    
    // Set the message in the input and send it
    messageInput.value = fixMessage;
    sendMessage();
    
    // Focus on the input for continued conversation
    setTimeout(() => {
      messageInput.focus();
    }, 100);
  }

  // Add message to chat
  function addMessage(text, sender) {
    const messageElement = document.createElement('div');
    messageElement.className = `chatbot-widget-message ${sender}`;
    
    // Parse markdown for bot messages, keep plain text for user messages
    if (sender === 'bot') {
      messageElement.innerHTML = parseMarkdown(text);
      
      // Add event listeners for copy and run buttons after adding the message
      setTimeout(() => {
        const copyButtons = messageElement.querySelectorAll('.chatbot-code-copy');
        copyButtons.forEach(button => {
          button.addEventListener('click', (e) => {
            e.preventDefault();
            const codeId = button.getAttribute('data-code-id');
            if (codeId) {
              copyCodeToClipboard(codeId, button);
            }
          });
        });
        
        const runButtons = messageElement.querySelectorAll('.chatbot-code-run');
        runButtons.forEach(button => {
          button.addEventListener('click', (e) => {
            e.preventDefault();
            const codeId = button.getAttribute('data-code-id');
            if (codeId) {
              executeSQLQuery(codeId, button);
            }
          });
        });
        
        const pasteButtons = messageElement.querySelectorAll('.chatbot-code-paste');
        pasteButtons.forEach(button => {
          button.addEventListener('click', (e) => {
            e.preventDefault();
            const codeId = button.getAttribute('data-code-id');
            if (codeId) {
              pasteToCodeMirror(codeId, button);
            }
          });
        });
        
        // Update paste button visibility
        updatePasteButtonVisibility();
      }, 0);
    } else {
      messageElement.textContent = text;
    }
    
    messagesContainer.appendChild(messageElement);
    messageHistory.push({ text, sender, timestamp: Date.now() });
    
    // Update share button visibility when messages are added
    updateShareButtonVisibility();
    
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
    
    // Remove existing Metabase checkbox
    removeMetabaseCheckbox();
    
    // Re-initialize Metabase integration for new conversation
    initializeMetabaseIntegration().then(() => {
      // Create checkbox if needed after initialization
      createMetabaseCheckbox();
    });
    
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
        const time = new Date(conversation.lastActivity).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const title = conversation.name || 'Untitled Conversation';
        let preview = `${conversation.messageCount} message${conversation.messageCount !== 1 ? 's' : ''}`;
        
        // Add time to preview if it's from today
        const today = new Date().toDateString();
        const conversationDate = new Date(conversation.lastActivity).toDateString();
        if (today === conversationDate) {
          preview += ` • ${time}`;
        }
        
        // Add Metabase question link if available
        let metabaseLink = '';
        if (conversation.metabaseQuestionUrl) {
          metabaseLink = `<div class="chatbot-widget-history-metabase">
            <a href="${conversation.metabaseQuestionUrl}" target="_blank" rel="noopener noreferrer" title="View Metabase Question">
              📊 Metabase Question
            </a>
          </div>`;
        }
        
        historyHTML += `
          <div class="chatbot-widget-history-item" data-thread-id="${conversation.threadId}" data-conversation-id="${conversation.id}">
            <div class="chatbot-widget-history-title">${title}</div>
            <div class="chatbot-widget-history-preview">${preview}</div>
            ${metabaseLink}
            <div class="chatbot-widget-history-date">${date}</div>
          </div>
        `;
      });
      
      historyView.innerHTML = historyHTML;
      
      // Add click listeners to history items
      historyView.querySelectorAll('.chatbot-widget-history-item').forEach(item => {
        item.addEventListener('click', () => {
          const threadId = item.dataset.threadId;
          const conversationId = item.dataset.conversationId;
          if (threadId) {
            loadConversationByThread(threadId);
          } else if (conversationId) {
            // Fallback to loading by conversation ID if no thread ID
            loadConversationById(conversationId);
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
          
          // Add event listeners for copy and run buttons
          setTimeout(() => {
            const copyButtons = messageElement.querySelectorAll('.chatbot-code-copy');
            copyButtons.forEach(button => {
              button.addEventListener('click', (e) => {
                e.preventDefault();
                const codeId = button.getAttribute('data-code-id');
                if (codeId) {
                  copyCodeToClipboard(codeId, button);
                }
              });
            });
            
            const runButtons = messageElement.querySelectorAll('.chatbot-code-run');
            runButtons.forEach(button => {
              button.addEventListener('click', (e) => {
                e.preventDefault();
                const codeId = button.getAttribute('data-code-id');
                if (codeId) {
                  executeSQLQuery(codeId, button);
                }
              });
            });
            

            const pasteButtons = messageElement.querySelectorAll('.chatbot-code-paste');
            pasteButtons.forEach(button => {
              button.addEventListener('click', (e) => {
                e.preventDefault();
                const codeId = button.getAttribute('data-code-id');
                if (codeId) {
                  pasteToCodeMirror(codeId, button);
                }
              });
            });

            updatePasteButtonVisibility();

            // Update share button visibility
            updateShareButtonVisibility();
          }, 0);
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

  // Load a conversation by conversation ID (fallback when no thread ID)
  async function loadConversationById(conversationId) {
    try {
      // Show loading state
      messagesContainer.innerHTML = '<div class="chatbot-widget-no-history">Loading conversation...</div>';
      
      // Fetch conversation from backend
      const apiBaseUrl = config.apiUrl.replace('/chat', '');
      const response = await fetch(`${apiBaseUrl}/conversations/${conversationId}`);
      
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
          
          // Add event listeners for copy and run buttons
          setTimeout(() => {
            const copyButtons = messageElement.querySelectorAll('.chatbot-code-copy');
            copyButtons.forEach(button => {
              button.addEventListener('click', (e) => {
                e.preventDefault();
                const codeId = button.getAttribute('data-code-id');
                if (codeId) {
                  copyCodeToClipboard(codeId, button);
                }
              });
            });
            
            const runButtons = messageElement.querySelectorAll('.chatbot-code-run');
            runButtons.forEach(button => {
              button.addEventListener('click', (e) => {
                e.preventDefault();
                const codeId = button.getAttribute('data-code-id');
                if (codeId) {
                  executeSQLQuery(codeId, button);
                }
              });
            });
            
            const pasteButtons = messageElement.querySelectorAll('.chatbot-code-paste');
            pasteButtons.forEach(button => {
              button.addEventListener('click', (e) => {
                e.preventDefault();
                const codeId = button.getAttribute('data-code-id');
                if (codeId) {
                  pasteToCodeMirror(codeId, button);
                }
              });
            });

            updatePasteButtonVisibility();

            // Update share button visibility
            updateShareButtonVisibility();
          }, 0);
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
      console.error('Error loading conversation by ID:', error);
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
        
        // Add event listeners for copy buttons
        setTimeout(() => {
          const copyButtons = messageElement.querySelectorAll('.chatbot-code-copy');
          copyButtons.forEach(button => {
            button.addEventListener('click', (e) => {
              e.preventDefault();
              const codeId = button.getAttribute('data-code-id');
              if (codeId) {
                copyCodeToClipboard(codeId, button);
              }
            });
          });
        }, 0);
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

  // Metabase integration functions
  
  // Detect if current page is a Metabase question page
  function detectMetabasePage() {
    const currentUrl = window.location.href;
    const metabasePattern = /\/question\/(\d+)(?:-|$)/;
    const match = currentUrl.match(metabasePattern);
    
    if (match) {
      metabaseQuestionId = match[1];
      metabaseQuestionUrl = currentUrl;
      isMetabasePage = true;
      console.log(`🔍 Detected Metabase question page: ${metabaseQuestionId}`);
      console.log(`🔗 Metabase question URL: ${metabaseQuestionUrl}`);
      return true;
    }
    
    isMetabasePage = false;
    metabaseQuestionId = null;
    metabaseQuestionUrl = null;
    return false;
  }

  // Fetch Metabase question data
  async function fetchMetabaseQuestion(questionId) {
    try {
      const apiBaseUrl = config.apiUrl.replace('/chat', '');
      const response = await fetch(`${apiBaseUrl}/metabase/question/${questionId}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch question: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.question) {
        metabaseQuestionData = data.question;
        console.log(`✅ Fetched Metabase question: "${data.question.name}"`);
        return data.question;
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error('❌ Error fetching Metabase question:', error);
      return null;
    }
  }

  // Create Metabase checkbox UI
  function createMetabaseCheckbox() {
    if (!isMetabasePage || !metabaseQuestionData) return;
    
    // Check if checkbox already exists
    if (chatWindow.querySelector('.chatbot-metabase-checkbox')) return;
    
    const inputContainer = chatWindow.querySelector('.chatbot-widget-input-container');
    if (!inputContainer) return;
    
    const checkboxContainer = document.createElement('div');
    checkboxContainer.className = 'chatbot-metabase-checkbox';
    checkboxContainer.innerHTML = `
      <label class="chatbot-metabase-label">
        <input type="checkbox" class="chatbot-metabase-input" ${includeMetabaseQuery ? 'checked' : ''}>
        <span class="chatbot-metabase-text">Include question query</span>
        <span class="chatbot-metabase-info" title="${metabaseQuestionData.name || 'Metabase Question'}">
          📊 ${metabaseQuestionData.name ? metabaseQuestionData.name.substring(0, 30) + '...' : 'Question ' + metabaseQuestionId}
        </span>
      </label>
    `;
    
    // Insert before input container
    inputContainer.parentNode.insertBefore(checkboxContainer, inputContainer);
    
    // Add event listener
    const checkbox = checkboxContainer.querySelector('.chatbot-metabase-input');
    checkbox.addEventListener('change', (e) => {
      includeMetabaseQuery = e.target.checked;
      console.log(`📋 Metabase query inclusion: ${includeMetabaseQuery ? 'enabled' : 'disabled'}`);
    });
  }

  // Remove Metabase checkbox
  function removeMetabaseCheckbox() {
    const checkbox = chatWindow?.querySelector('.chatbot-metabase-checkbox');
    if (checkbox) {
      checkbox.remove();
    }
  }

  // Enhance message with Metabase query if needed
  function enhanceMessageWithMetabase(message) {
    if (!includeMetabaseQuery || !metabaseQuestionData || !metabaseQuestionData.query) {
      return message;
    }
    
    const enhancedMessage = `${message}

[Metabase Question: ${metabaseQuestionData.name || 'Question ' + metabaseQuestionId}]
\`\`\`sql
${metabaseQuestionData.query}
\`\`\``;
    
    console.log('📊 Enhanced message with Metabase query');
    return enhancedMessage;
  }

  // Share conversation
  async function shareConversation() {
    if (!currentConversationId) {
      // Show error message
      addMessage('No conversation to share. Start a conversation first!', 'bot');
      return;
    }

    try {
      // Generate share URL
      const shareUrl = `${baseUrl}/chat/${currentConversationId}`;
      
      // Copy to clipboard
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = shareUrl;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      
      // Show success feedback
      const shareButton = chatWindow.querySelector('#chatbot-share-conversation');
      const originalContent = shareButton.innerHTML;
      shareButton.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
        </svg>
      `;
      shareButton.style.color = '#10b981';
      shareButton.title = 'Link copied to clipboard!';
      
      // Reset button after 3 seconds
      setTimeout(() => {
        shareButton.innerHTML = originalContent;
        shareButton.style.color = '';
        shareButton.title = 'Share Conversation';
      }, 3000);
      
      // Also show a temporary message
      addMessage(`✅ Conversation link copied to clipboard!\n\nShare this link: ${shareUrl}`, 'bot');
      
    } catch (error) {
      console.error('Failed to share conversation:', error);
      
      // Show error feedback
      const shareButton = chatWindow.querySelector('#chatbot-share-conversation');
      const originalContent = shareButton.innerHTML;
      shareButton.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      `;
      shareButton.style.color = '#ef4444';
      shareButton.title = 'Failed to copy link';
      
      // Reset button after 3 seconds
      setTimeout(() => {
        shareButton.innerHTML = originalContent;
        shareButton.style.color = '';
        shareButton.title = 'Share Conversation';
      }, 3000);
      
      addMessage('❌ Failed to copy share link. Please try again.', 'bot');
    }
  }

  // Update share button visibility
  function updateShareButtonVisibility() {
    const shareButton = chatWindow.querySelector('#chatbot-share-conversation');
    if (shareButton) {
      // Show share button only if we have a conversation with messages
      const hasConversation = currentConversationId && messageHistory.length > 1;
      shareButton.style.display = hasConversation ? 'flex' : 'none';
    }
  }

  // Initialize Metabase integration
  async function initializeMetabaseIntegration() {
    if (detectMetabasePage()) {
      try {
        await fetchMetabaseQuestion(metabaseQuestionId);
        // Checkbox will be created when chat window is opened
      } catch (error) {
        console.error('Failed to initialize Metabase integration:', error);
      }
    }
  }

  // Initialize widget
  async function init() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }

    // Load dependencies and create the widget elements
    try {
      // Load styles and marked library in parallel
      await Promise.all([
        loadStyles(),
        loadMarkedLibrary()
      ]);
      
      createChatBubble();
      createChatWindow();
      
      // Initialize Metabase integration
      await initializeMetabaseIntegration();
      
    } catch (error) {
      console.error('Failed to initialize chatbot widget:', error);
      // Still try to create the widget with fallback
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
