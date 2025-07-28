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
    width: '350px',
    zIndex: 10000
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

  // CSS styles
  const styles = `
    .chatbot-widget-bubble {
      position: fixed;
      ${config.position.includes('right') ? 'right: 20px;' : 'left: 20px;'}
      ${config.position.includes('bottom') ? 'bottom: 20px;' : 'top: 20px;'}
      width: 60px;
      height: 60px;
      background: ${config.primaryColor};
      border-radius: 50%;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: ${config.zIndex};
      transition: all 0.3s ease;
      user-select: none;
    }

    .chatbot-widget-bubble:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
    }

    .chatbot-widget-bubble-icon {
      width: 24px;
      height: 24px;
      fill: white;
    }

    .chatbot-widget-window {
      position: fixed;
      ${config.position.includes('right') ? 'right: 20px;' : 'left: 20px;'}
      ${config.position.includes('bottom') ? 'bottom: 90px;' : 'top: 90px;'}
      width: ${config.width};
      max-height: ${config.maxHeight};
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
      z-index: ${config.zIndex + 1};
      display: none;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.4;
      overflow: hidden;
      animation: chatbot-widget-slideIn 0.3s ease-out;
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

    .chatbot-widget-header {
      background: ${config.primaryColor};
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
      gap: 4px;
    }

    .chatbot-widget-header-btn {
      background: none;
      border: none;
      color: white;
      cursor: pointer;
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 4px;
      transition: background-color 0.2s;
      opacity: 0.8;
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
      background: ${config.primaryColor};
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

    .chatbot-widget-typing-dot:nth-child(1) { animation-delay: -0.32s; }
    .chatbot-widget-typing-dot:nth-child(2) { animation-delay: -0.16s; }

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
      border-color: ${config.primaryColor};
    }

    .chatbot-widget-send {
      background: ${config.primaryColor};
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
      border-color: ${config.primaryColor};
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
      .chatbot-widget-window {
        width: calc(100vw - 40px);
        max-width: none;
        left: 20px !important;
        right: 20px !important;
      }
    }
  `;

  // Inject CSS
  function injectStyles() {
    const styleSheet = document.createElement('style');
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
  }

  // Create chat bubble
  function createChatBubble() {
    chatBubble = document.createElement('div');
    chatBubble.className = 'chatbot-widget-bubble';
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
    chatWindow.className = 'chatbot-widget-window';
    
    chatWindow.innerHTML = `
      <div class="chatbot-widget-header">
        <div class="chatbot-widget-header-content">
          <img src="${config.icon}" alt="Chat Icon" class="chatbot-widget-header-icon" />
          <span>${config.title}</span>
        </div>
        <div class="chatbot-widget-header-actions">
          <button class="chatbot-widget-header-btn" id="chatbot-new-conversation">New</button>
          <button class="chatbot-widget-header-btn" id="chatbot-show-history">History</button>
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

  // Add message to chat
  function addMessage(text, sender) {
    const messageElement = document.createElement('div');
    messageElement.className = `chatbot-widget-message ${sender}`;
    messageElement.textContent = text;
    
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
    chatWindow.querySelector('#chatbot-show-history').textContent = 'History';
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
    chatWindow.querySelector('#chatbot-show-history').textContent = 'Back to Chat';
    
    await renderHistoryList();
  }

  // Render history list
  async function renderHistoryList() {
    const historyView = chatWindow.querySelector('.chatbot-widget-history-view');
    
    // Show loading state
    historyView.innerHTML = '<div class="chatbot-widget-no-history">Loading conversation history...</div>';
    
    try {
      // Get user ID (using IP as user identifier for now)
      const userId = '::1'; // You can make this more sophisticated
      
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
        messageElement.textContent = msg.text;
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
      messageElement.textContent = msg.text;
      messagesContainer.appendChild(messageElement);
    });
    
    // Switch back to chat view
    showChatView();
    scrollToBottom();
    messageInput.focus();
  }

  // Initialize widget
  function init() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }

    injectStyles();
    createChatBubble();
    createChatWindow();
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
