# Chatbot Widget Backend

A provider-agnostic backend service for the chatbot widget with OpenAI Assistants API integration.

## Features

- 🤖 **OpenAI Assistants API Integration** - Full support for OpenAI's Assistants API
- 🔌 **Provider-Agnostic Architecture** - Easy to add new AI providers (Anthropic, Google, etc.)
- 🛡️ **Security First** - Rate limiting, input validation, CORS protection
- 💬 **Conversation Management** - Thread mapping and conversation persistence
- 🗄️ **SQLite Database** - Persistent conversation history across sessions and machines
- 📊 **Monitoring** - Health checks and usage statistics
- 🚀 **Production Ready** - Error handling, logging, graceful shutdown

## Quick Start

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment

Copy the example environment file and configure your settings:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_ASSISTANT_ID=your_assistant_id_here

# Server Configuration
PORT=3000
NODE_ENV=development

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

### 3. Start the Server

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:3000` (or your configured port).

## API Endpoints

### Chat Endpoint

**POST** `/api/chat`

Send a message to the AI assistant.

**Request Body:**
```json
{
  "message": "Hello, how can you help me?",
  "history": [
    {
      "text": "Previous message",
      "sender": "user",
      "timestamp": 1642678800000
    }
  ],
  "provider": "openai",
  "assistantType": "default",
  "conversationId": "optional_conversation_id",
  "threadId": "optional_thread_id"
}
```

**Response:**
```json
{
  "message": "Hello! I'm here to help you with any questions you have.",
  "conversationId": "generated_conversation_id",
  "threadId": "openai_thread_id",
  "provider": "openai",
  "assistantId": "asst_xxx"
}
```

### Health Check

**GET** `/health`

Get server health status and statistics.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600,
  "memory": {...},
  "stats": {
    "totalConversations": 10,
    "totalMessages": 50,
    "activeConversations": 3
  },
  "providers": ["openai"]
}
```

### Get Providers

**GET** `/api/providers`

Get available AI providers and their capabilities.

### Get Assistants

**GET** `/api/assistants`

Get available assistant configurations.

### Conversation Management

**GET** `/api/conversations/:id` - Get conversation details
**DELETE** `/api/conversations/:id` - Delete a conversation

## Configuration

### Assistant Configuration

Edit `config/assistants.json` to configure different assistant types:

```json
{
  "default": {
    "provider": "openai",
    "assistantId": "asst_your_assistant_id",
    "name": "Default Support Assistant",
    "description": "General customer support assistant"
  },
  "technical": {
    "provider": "openai",
    "assistantId": "asst_technical_assistant",
    "name": "Technical Support Assistant",
    "description": "Technical troubleshooting and support"
  }
}
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | Your OpenAI API key | Required |
| `OPENAI_ASSISTANT_ID` | Default OpenAI Assistant ID | Required |
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment (development/production) | development |
| `ALLOWED_ORIGINS` | CORS allowed origins (comma-separated) | localhost origins |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window in milliseconds | 900000 (15 min) |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | 100 |

## Adding New AI Providers

The backend is designed to easily support multiple AI providers. To add a new provider:

### 1. Create Provider Class

Create a new file in `providers/` (e.g., `anthropic.js`):

```javascript
const BaseProvider = require('./base-provider');

class AnthropicProvider extends BaseProvider {
  constructor(config) {
    super(config);
  }

  async initialize(config) {
    // Initialize Anthropic client
  }

  async sendMessage(message, history, options) {
    // Implement Anthropic API call
  }

  // Implement other required methods...
}

module.exports = AnthropicProvider;
```

### 2. Register Provider

Add the provider to `providers/index.js`:

```javascript
const AnthropicProvider = require('./anthropic');

// In the constructor:
this.registeredProviders = {
  'openai': OpenAIProvider,
  'anthropic': AnthropicProvider  // Add this line
};
```

### 3. Update Validation

Add the provider to the valid providers list in `utils/validation.js`:

```javascript
function isValidProvider(provider) {
  const validProviders = ['openai', 'anthropic']; // Add 'anthropic'
  return validProviders.includes(provider.toLowerCase());
}
```

## Deployment

### Using Docker

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000
CMD ["npm", "start"]
```

### Using Vercel

Create `vercel.json`:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "server.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/server.js"
    }
  ]
}
```

### Using Railway

1. Connect your GitHub repository to Railway
2. Set environment variables in Railway dashboard
3. Deploy automatically on push

## Security Considerations

- **API Keys**: Never expose API keys in client-side code
- **Rate Limiting**: Configured to prevent abuse
- **Input Validation**: All inputs are validated and sanitized
- **CORS**: Properly configured for your domains
- **Helmet**: Security headers applied
- **Error Handling**: Sensitive information not leaked in errors

## Monitoring and Logging

The server provides comprehensive logging and monitoring:

- Request logging with timestamps and IP addresses
- Error logging with stack traces (development only)
- Health check endpoint with system metrics
- Conversation statistics and usage tracking

## Troubleshooting

### Common Issues

1. **"OpenAI API key is required"**
   - Make sure `OPENAI_API_KEY` is set in your `.env` file

2. **"Assistant not found"**
   - Verify your `OPENAI_ASSISTANT_ID` is correct
   - Check that the assistant exists in your OpenAI account

3. **CORS errors**
   - Add your frontend domain to `ALLOWED_ORIGINS`
   - Make sure the format is correct (include protocol)

4. **Rate limit exceeded**
   - Adjust `RATE_LIMIT_MAX_REQUESTS` if needed
   - Consider implementing user-specific rate limiting

### Debug Mode

Set `NODE_ENV=development` to enable:
- Detailed error messages
- Request/response logging
- Configuration validation warnings

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
