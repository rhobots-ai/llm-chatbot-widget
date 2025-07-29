# 🚀 OpenAI Assistants Integration Guide

This guide walks you through integrating the chatbot widget with OpenAI's Assistants API.

## 📋 Prerequisites

- Node.js 18+ installed
- OpenAI API account with credits
- Basic knowledge of JavaScript and APIs

## 🎯 Step-by-Step Setup

### 1. Quick Setup (Recommended)

Run the automated setup script:

```bash
./setup.sh
```

This script will:
- Check Node.js installation
- Install backend dependencies
- Create environment configuration
- Guide you through OpenAI setup

### 2. Manual Setup

If you prefer manual setup:

#### Backend Setup

```bash
# Navigate to backend
cd backend

# Install dependencies
npm install

# Create environment file
cp .env.example .env
```

#### Configure OpenAI

Edit `backend/.env`:

```env
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_ASSISTANT_ID=your_assistant_id_here
PORT=3000
NODE_ENV=development
```

### 3. Create OpenAI Assistant

1. Go to [OpenAI Assistants](https://platform.openai.com/assistants)
2. Click "Create Assistant"
3. Configure your assistant:
   - **Name**: Your assistant name
   - **Instructions**: Define the assistant's behavior
   - **Model**: Choose GPT-4 or GPT-3.5-turbo
   - **Tools**: Enable as needed (Code Interpreter, Retrieval, etc.)
4. Copy the Assistant ID (starts with `asst_`)

### 4. Start the Backend

```bash
cd backend
npm run dev
```

The server will start on `http://localhost:3000`

### 5. Test the Integration

Open `demo.html` in your browser and test the chatbot.

## 🔧 Configuration Options

### Assistant Types

Edit `backend/config/assistants.json` to configure different assistant types:

```json
{
  "default": {
    "provider": "openai",
    "assistantId": "asst_your_default_assistant",
    "name": "Default Support Assistant",
    "description": "General customer support"
  },
  "technical": {
    "provider": "openai",
    "assistantId": "asst_technical_assistant",
    "name": "Technical Support",
    "description": "Technical troubleshooting"
  }
}
```

### Widget Configuration

Configure the widget in your HTML:

```html
<script>
  window.ChatbotWidgetConfig = {
    apiUrl: 'http://localhost:3000/api/chat',
    assistantType: 'default', // or 'technical'
    primaryColor: '#4F46E5',
    title: 'AI Assistant',
    welcomeMessage: 'Hello! How can I help you today?'
  };
</script>
<script src="./chatbot.js" async></script>
```

**Important**: The widget now uses external CSS for better CSP compliance. Make sure both `chatbot.js` and `chatbot.css` are accessible from the same directory. The widget will automatically load the CSS file from the same location as the JavaScript file.

### File Structure

Your widget files should be organized like this:

```
your-website/
├── chatbot.js      # Widget JavaScript
├── chatbot.css     # Widget styles (auto-loaded)
└── index.html      # Your page
```

The widget automatically detects the CSS file location and loads it dynamically. If the CSS file fails to load, it falls back to minimal inline styles to ensure functionality.

## 🚀 Deployment

### Option 1: Vercel (Recommended)

1. Push your code to GitHub
2. Connect to Vercel
3. Set environment variables in Vercel dashboard:
   - `OPENAI_API_KEY`
   - `OPENAI_ASSISTANT_ID`
   - `ALLOWED_ORIGINS` (your domain)
4. Deploy

### Option 2: Docker

```bash
cd backend
docker build -t chatbot-backend .
docker run -p 3000:3000 --env-file .env chatbot-backend
```

### Option 3: Railway

1. Connect GitHub repository to Railway
2. Set environment variables
3. Deploy automatically

## 🔍 Testing & Debugging

### Health Check

Test if the backend is running:

```bash
curl http://localhost:3000/health
```

### API Test

Test the chat endpoint:

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, how are you?"}'
```

### Common Issues

1. **"OpenAI API key is required"**
   - Check your `.env` file
   - Ensure `OPENAI_API_KEY` is set correctly

2. **"Assistant not found"**
   - Verify your Assistant ID
   - Check the assistant exists in your OpenAI account

3. **CORS errors**
   - Add your domain to `ALLOWED_ORIGINS` in backend/.env
   - Format: `https://yourdomain.com`
   - For local development, include: `http://127.0.0.1:8080,http://localhost:8080`
   - Restart the backend server after changing CORS settings

4. **Widget not loading**
   - Check browser console for errors
   - Verify `apiUrl` points to your backend

## 🎨 Customization

### Custom Assistant Instructions

When creating your OpenAI Assistant, use detailed instructions:

```
You are a helpful customer support assistant for [Company Name]. 

Your role:
- Answer questions about our products and services
- Help troubleshoot common issues
- Escalate complex problems to human agents
- Be friendly, professional, and concise

Guidelines:
- Always greet users warmly
- Ask clarifying questions when needed
- Provide step-by-step solutions
- If you can't help, offer to connect them with a human agent

Company context:
[Add your company-specific information here]
```

### Multiple Assistants

You can configure different assistants for different use cases:

```javascript
// Customer support
window.ChatbotWidgetConfig = {
  assistantType: 'default',
  title: 'Customer Support'
};

// Technical support
window.ChatbotWidgetConfig = {
  assistantType: 'technical',
  title: 'Technical Help'
};

// Sales assistant
window.ChatbotWidgetConfig = {
  assistantType: 'sales',
  title: 'Sales Assistant'
};
```

## 📊 Monitoring

### Backend Logs

The backend provides detailed logging:

```bash
# View logs in development
npm run dev

# View logs in production
pm2 logs chatbot-backend
```

### Usage Statistics

Check usage via the health endpoint:

```bash
curl http://localhost:3000/health
```

Response includes:
- Total conversations
- Active conversations
- Message count
- Memory usage

## 🔒 Security Best Practices

1. **Environment Variables**
   - Never commit `.env` files
   - Use different API keys for development/production
   - Rotate API keys regularly

2. **CORS Configuration**
   - Only allow your domains
   - Don't use wildcards in production

3. **Rate Limiting**
   - Configure appropriate limits
   - Monitor for abuse

4. **Input Validation**
   - All inputs are validated by default
   - Monitor for malicious content

## 🆘 Support

### Getting Help

1. Check the [Backend README](backend/README.md)
2. Review the [main README](README.md)
3. Test with the demo page first
4. Check browser console for errors

### Common Resources

- [OpenAI Assistants Documentation](https://platform.openai.com/docs/assistants/overview)
- [OpenAI API Keys](https://platform.openai.com/api-keys)
- [OpenAI Assistants Dashboard](https://platform.openai.com/assistants)

## 🎉 Success!

Once everything is set up, you'll have:

- ✅ A secure backend handling OpenAI integration
- ✅ A beautiful, responsive chatbot widget
- ✅ Conversation persistence with OpenAI threads
- ✅ Production-ready deployment
- ✅ Easy customization and scaling

Your users can now chat with your AI assistant directly on your website!
