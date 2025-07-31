const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

// Import utilities
const metabaseClient = require('../utils/metabase-client');
const { createErrorResponse } = require('../utils/validation');

// Rate limiting for Metabase API calls
const metabaseRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 30 requests per windowMs
  message: {
    error: true,
    message: 'Too many Metabase API requests, please try again later.',
    statusCode: 429
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use IP + User-Agent for more granular rate limiting
    return `${req.ip}-${req.get('User-Agent') || 'unknown'}`;
  }
});

// Apply rate limiting to all Metabase routes
router.use(metabaseRateLimit);

// Security headers middleware
router.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  next();
});

/**
 * Get Metabase Question Data
 * GET /api/metabase/question/:questionId
 */
router.get('/question/:questionId', async (req, res) => {
  try {
    const { questionId } = req.params;

    // Validate question ID format
    if (!questionId || !/^\d+$/.test(questionId)) {
      return res.status(400).json(createErrorResponse(
        'Invalid question ID',
        ['Question ID must be a positive integer'],
        400,
        'INVALID_QUESTION_ID'
      ));
    }

    console.log(`🔍 Metabase API request for question ${questionId} from ${req.ip}`);

    // Fetch question from Metabase
    const questionData = await metabaseClient.getQuestion(questionId);

    if (!questionData) {
      return res.status(404).json(createErrorResponse(
        'Question not found',
        [`Question ${questionId} does not exist or is not accessible`],
        404,
        'QUESTION_NOT_FOUND'
      ));
    }

    // Prepare response
    const response = {
      success: true,
      question: {
        id: questionData.id,
        name: questionData.name,
        description: questionData.description,
        query: questionData.query,
        database: questionData.database,
        created: questionData.created,
        updated: questionData.updated,
        hasQuery: !!questionData.query
      },
      metadata: {
        fetchedAt: new Date().toISOString(),
        cached: false // This would be true if returned from cache
      }
    };

    res.json(response);

  } catch (error) {
    console.error('Metabase API Error:', error);

    // Determine error type and status code
    let statusCode = 500;
    let errorCode = 'METABASE_API_ERROR';
    let errorMessage = 'Failed to fetch question from Metabase';

    if (error.message.includes('not found')) {
      statusCode = 404;
      errorCode = 'QUESTION_NOT_FOUND';
      errorMessage = 'Question not found';
    } else if (error.message.includes('Access denied')) {
      statusCode = 403;
      errorCode = 'ACCESS_DENIED';
      errorMessage = 'Access denied to Metabase question';
    } else if (error.message.includes('Authentication required')) {
      statusCode = 401;
      errorCode = 'AUTHENTICATION_REQUIRED';
      errorMessage = 'Authentication required for Metabase API';
    } else if (error.message.includes('timeout')) {
      statusCode = 408;
      errorCode = 'REQUEST_TIMEOUT';
      errorMessage = 'Request to Metabase API timed out';
    } else if (error.message.includes('Invalid question ID')) {
      statusCode = 400;
      errorCode = 'INVALID_QUESTION_ID';
      errorMessage = 'Invalid question ID format';
    }

    res.status(statusCode).json(createErrorResponse(
      errorMessage,
      [error.message],
      statusCode,
      errorCode,
      {
        questionId: req.params.questionId,
        timestamp: new Date().toISOString()
      }
    ));
  }
});

/**
 * Extract Question ID from Metabase URL
 * POST /api/metabase/extract-id
 */
router.post('/extract-id', (req, res) => {
  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json(createErrorResponse(
        'Invalid URL',
        ['URL is required and must be a string'],
        400,
        'INVALID_URL'
      ));
    }

    // Extract question ID from Metabase URL
    // Pattern: https://metabase2.progfin.com/question/20259-insurance-issues-tracker-daily
    const questionIdMatch = url.match(/\/question\/(\d+)(?:-|$)/);
    
    if (!questionIdMatch) {
      return res.status(400).json(createErrorResponse(
        'Invalid Metabase URL',
        ['URL does not match expected Metabase question pattern'],
        400,
        'INVALID_METABASE_URL'
      ));
    }

    const questionId = questionIdMatch[1];

    res.json({
      success: true,
      questionId: questionId,
      url: url,
      pattern: 'question/{id}-{name}',
      extracted: new Date().toISOString()
    });

  } catch (error) {
    console.error('URL extraction error:', error);
    res.status(500).json(createErrorResponse(
      'Failed to extract question ID',
      [error.message],
      500
    ));
  }
});

/**
 * Test Metabase Connection
 * GET /api/metabase/test
 */
router.get('/test', async (req, res) => {
  try {
    const testResult = await metabaseClient.testConnection();
    
    if (testResult.success) {
      res.json({
        success: true,
        message: 'Metabase connection successful',
        connection: {
          baseUrl: testResult.baseUrl,
          status: testResult.status,
          hasApiKey: testResult.hasApiKey,
          timestamp: new Date().toISOString()
        },
        cache: metabaseClient.getCacheStats()
      });
    } else {
      res.status(503).json(createErrorResponse(
        'Metabase connection failed',
        [testResult.error],
        503,
        'METABASE_CONNECTION_FAILED',
        {
          baseUrl: testResult.baseUrl,
          hasApiKey: testResult.hasApiKey
        }
      ));
    }
  } catch (error) {
    console.error('Metabase connection test error:', error);
    res.status(500).json(createErrorResponse(
      'Metabase connection test failed',
      [error.message],
      500
    ));
  }
});

/**
 * Get Metabase Cache Statistics
 * GET /api/metabase/cache/stats
 */
router.get('/cache/stats', (req, res) => {
  try {
    const stats = metabaseClient.getCacheStats();
    
    res.json({
      success: true,
      cache: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cache stats error:', error);
    res.status(500).json(createErrorResponse(
      'Failed to retrieve cache statistics',
      [error.message],
      500
    ));
  }
});

/**
 * Clear Metabase Cache
 * DELETE /api/metabase/cache
 */
router.delete('/cache', (req, res) => {
  try {
    metabaseClient.clearCache();
    
    res.json({
      success: true,
      message: 'Metabase cache cleared',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cache clear error:', error);
    res.status(500).json(createErrorResponse(
      'Failed to clear cache',
      [error.message],
      500
    ));
  }
});

/**
 * Get Metabase API Documentation
 * GET /api/metabase/docs
 */
router.get('/docs', (req, res) => {
  const documentation = {
    title: 'Metabase Integration API Documentation',
    version: '1.0.0',
    description: 'API for integrating with Metabase questions and queries',
    baseUrl: `${req.protocol}://${req.get('host')}/api/metabase`,
    
    endpoints: {
      'GET /question/:questionId': {
        description: 'Fetch question data and SQL query from Metabase',
        parameters: {
          questionId: {
            type: 'string',
            required: true,
            description: 'Numeric ID of the Metabase question',
            example: '20259'
          }
        },
        response: {
          success: true,
          question: {
            id: 20259,
            name: 'Insurance Issues Tracker Daily',
            description: 'Daily tracking of insurance issues',
            query: 'SELECT * FROM insurance_issues WHERE date >= CURRENT_DATE',
            database: 1,
            hasQuery: true
          }
        }
      },
      
      'POST /extract-id': {
        description: 'Extract question ID from Metabase URL',
        parameters: {
          url: {
            type: 'string',
            required: true,
            description: 'Full Metabase question URL',
            example: 'https://metabase2.progfin.com/question/20259-insurance-issues-tracker-daily'
          }
        },
        response: {
          success: true,
          questionId: '20259',
          url: 'https://metabase2.progfin.com/question/20259-insurance-issues-tracker-daily'
        }
      },
      
      'GET /test': {
        description: 'Test connection to Metabase API',
        parameters: {},
        response: {
          success: true,
          connection: {
            baseUrl: 'https://metabase2.progfin.com',
            status: 200,
            hasApiKey: false
          }
        }
      },
      
      'GET /cache/stats': {
        description: 'Get cache statistics',
        parameters: {},
        response: {
          success: true,
          cache: {
            size: 5,
            timeout: 300000,
            entries: ['question_20259', 'question_20260']
          }
        }
      },
      
      'DELETE /cache': {
        description: 'Clear all cached question data',
        parameters: {},
        response: {
          success: true,
          message: 'Metabase cache cleared'
        }
      }
    },
    
    urlPatterns: {
      'Metabase Question URL': 'https://metabase2.progfin.com/question/{id}-{name}',
      'Question ID Extraction': 'Regex: /\\/question\\/(\\d+)(?:-|$)/',
      'Examples': [
        'https://metabase2.progfin.com/question/20259-insurance-issues-tracker-daily',
        'https://metabase2.progfin.com/question/12345',
        'https://metabase2.progfin.com/question/98765-sales-report-monthly'
      ]
    },
    
    rateLimiting: {
      window: '15 minutes',
      maxRequests: 30,
      description: 'Rate limiting is applied per IP address and User-Agent'
    },
    
    caching: {
      timeout: '5 minutes',
      description: 'Question data is cached to reduce API calls to Metabase',
      automatic: true
    },
    
    errorCodes: {
      'INVALID_QUESTION_ID': 'Question ID format is invalid',
      'QUESTION_NOT_FOUND': 'Question does not exist or is not accessible',
      'ACCESS_DENIED': 'Access denied to Metabase question',
      'AUTHENTICATION_REQUIRED': 'Metabase API requires authentication',
      'REQUEST_TIMEOUT': 'Request to Metabase API timed out',
      'METABASE_CONNECTION_FAILED': 'Cannot connect to Metabase API',
      'INVALID_METABASE_URL': 'URL does not match Metabase question pattern'
    }
  };

  res.json(documentation);
});

module.exports = router;
