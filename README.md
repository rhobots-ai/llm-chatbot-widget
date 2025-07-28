# 🤖 Embeddable Chatbot Widget with OpenAI Assistants

A lightweight, self-contained chatbot widget that can be embedded into any website with a simple script tag. Now powered by OpenAI's Assistants API with a provider-agnostic backend architecture. Built with vanilla JavaScript and CSS - no external dependencies required.

## ✨ Features

- 🤖 **OpenAI Assistants Integration** - Powered by OpenAI's advanced Assistants API
- 🔌 **Provider-Agnostic Backend** - Easy to add support for other AI providers
- 🎨 **Modern UI/UX** - Clean design with smooth animations and transitions
- 📱 **Fully Responsive** - Works perfectly on desktop and mobile devices
- 🔧 **Easy Configuration** - Customize colors, position, messages, and more
- 🌐 **Framework Agnostic** - Works with React, Vue, Angular, or plain HTML
- 🚫 **No Dependencies** - Pure vanilla JavaScript and CSS
- ⚡ **Async Loading** - Won't block your page load
- 🎯 **Scoped Styles** - Won't interfere with your existing CSS
- 💬 **Real-time Features** - Typing indicators and smooth message animations
- 🛡️ **Secure Backend** - API keys never exposed to client-side
- 📝 **Conversation Management** - Persistent conversations with OpenAI threads
- 🚀 **Production Ready** - Rate limiting, error handling, monitoring

## 🚀 Quick Start

### 1. Set Up the Backend (Required)

The widget now requires a backend service to handle OpenAI Assistants API integration:

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your OpenAI API key and Assistant ID

# Start the backend server
npm run dev
```

See the [Backend README](backend/README.md) for detailed setup instructions.

### 2. Widget Integration

Add these two script tags to your HTML:

```html
<!-- Configure the widget -->
<script>
  window.ChatbotWidgetConfig = {
    apiUrl: 'http://localhost:3000/api/chat', // Your backend endpoint
    primaryColor: '#4F46E5',
    position: 'bottom-right',
    title: 'AI Assistant',
    assistantType: 'default' // Maps to backend assistant configuration
  };
</script>

<!-- Load the widget -->
<script src="./chatbot.js" async></script>
```

That's it! The chatbot will appear as a floating bubble powered by OpenAI Assistants.

## ⚙️ Configuration Options

All configuration is done via the global `window.ChatbotWidgetConfig` object:

```javascript
window.ChatbotWidgetConfig = {
  // API endpoint for chat messages (required)
  apiUrl: 'https://yourdomain.com/api/chat',
  
  // Visual customization
  primaryColor: '#4F46E5',        // Theme color (hex)
  position: 'bottom-right',       // 'bottom-right', 'bottom-left', 'top-right', 'top-left'
  width: '350px',                 // Chat window width
  maxHeight: '500px',             // Maximum chat window height
  zIndex: 10000,                  // CSS z-index for the widget
  
  // Content customization
  title: 'Chat Support',          // Header title
  icon: 'https://rhobots.ai/images/icon.svg', // Header icon URL
  welcomeMessage: 'Hello! How can I help you today?',
  placeholder: 'Type your message...',
};
```

### Configuration Details

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiUrl` | string | `'https://yourdomain.com/api/chat'` | **Required.** Your chat API endpoint |
| `primaryColor` | string | `'#4F46E5'` | Primary theme color (hex format) |
| `position` | string | `'bottom-right'` | Widget position on screen |
| `title` | string | `'Chat Support'` | Chat window header title |
| `icon` | string | `'https://rhobots.ai/images/icon.svg'` | Header icon URL |
| `welcomeMessage` | string | `'Hello! How can I help you today?'` | Initial bot message |
| `placeholder` | string | `'Type your message...'` | Input field placeholder |
| `width` | string | `'350px'` | Chat window width |
| `maxHeight` | string | `'500px'` | Maximum chat window height |
| `zIndex` | number | `10000` | CSS z-index for layering |

## 🔌 API Integration

### Request Format

The widget sends POST requests to your `apiUrl` with this JSON structure:

```javascript
{
  "message": "User's message text",
  "history": [
    {
      "text": "Previous message",
      "sender": "user", // or "bot"
      "timestamp": 1642678800000
    }
    // ... more messages
  ]
}
```

### Expected Response

Your API should return JSON in one of these formats:

```javascript
// Option 1: Simple response
{
  "message": "Bot's response message"
}

// Option 2: Alternative key
{
  "response": "Bot's response message"
}
```

### Error Handling

If your API returns an error or is unreachable, the widget will display a fallback message: *"Sorry, I'm having trouble connecting right now. Please try again later."*

## 🎮 JavaScript API

The widget exposes a global `ChatbotWidget` object with these methods:

```javascript
// Open the chat window
ChatbotWidget.open();

// Close the chat window
ChatbotWidget.close();

// Add a message to the chat (as user)
ChatbotWidget.sendMessage('Hello from JavaScript!');

// Clear chat history and reset
ChatbotWidget.clearHistory();
```

## 📱 Mobile Support

The widget is fully responsive and includes special handling for mobile devices:

- Automatically adjusts width on screens smaller than 480px
- Touch-friendly interface elements
- Proper viewport handling
- Smooth animations optimized for mobile

## 🎨 Customization Examples

### Different Positions

```javascript
// Bottom left corner
window.ChatbotWidgetConfig = {
  position: 'bottom-left',
  // ... other options
};

// Top right corner
window.ChatbotWidgetConfig = {
  position: 'top-right',
  // ... other options
};
```

### Custom Styling

```javascript
// Purple theme
window.ChatbotWidgetConfig = {
  primaryColor: '#8B5CF6',
  title: 'Purple Support',
  // ... other options
};

// Larger widget
window.ChatbotWidgetConfig = {
  width: '400px',
  maxHeight: '600px',
  // ... other options
};
```

## 🔧 Development

### File Structure

```
chatbot-widget/
├── chatbot.js      # Main widget file
├── demo.html       # Demo page
└── README.md       # This file
```

### Testing Locally

1. Clone or download the files
2. Open `demo.html` in your browser
3. The demo uses `httpbin.org` as a mock API endpoint

### Building for Production

The `chatbot.js` file is production-ready as-is. Simply:

1. Host the file on your CDN or server
2. Update the script src in your integration code
3. Configure your API endpoint

## 🌐 Browser Support

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

The widget uses modern JavaScript features (ES6+) and CSS features. For older browser support, you may need to add polyfills.

## 🔒 Security Considerations

- All user input is sanitized before display
- API requests use HTTPS (recommended)
- No sensitive data is stored in localStorage
- XSS protection through proper DOM manipulation

## 📝 License

This project is open source. Feel free to modify and use in your projects.

## 🤝 Contributing

Found a bug or want to add a feature? Contributions are welcome!

## 📞 Support

For issues or questions about integration, please check the demo page first to see the widget in action.

---

**Made with ❤️ using vanilla JavaScript and CSS**
