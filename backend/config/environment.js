require('dotenv').config();

const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // OpenAI Configuration
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    defaultAssistantId: process.env.OPENAI_ASSISTANT_ID
  },
  
  // CORS Configuration
  cors: {
    allowedOrigins: process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
      : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:8080', 'http://127.0.0.1:8080']
  },
  
  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
  }
};

// Validation
function validateConfig() {
  const errors = [];
  
  if (!config.openai.apiKey) {
    errors.push('OPENAI_API_KEY is required');
  }
  
  if (!config.openai.defaultAssistantId) {
    errors.push('OPENAI_ASSISTANT_ID is required');
  }
  
  if (errors.length > 0) {
    console.error('Configuration errors:');
    errors.forEach(error => console.error(`- ${error}`));
    
    if (config.nodeEnv === 'production') {
      process.exit(1);
    } else {
      console.warn('Running in development mode with missing configuration');
    }
  }
}

validateConfig();

module.exports = config;
