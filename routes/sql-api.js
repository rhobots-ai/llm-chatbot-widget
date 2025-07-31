const express = require('express');
const router = express.Router();

// Import utilities and middleware
const postgresManager = require('../utils/postgres');
const { extractTableNames } = require('../utils/sql-validator');
const { createErrorResponse } = require('../utils/validation');
const {
  sqlRateLimit,
  validateSQLRequest,
  validateSQLSecurity,
  logSQLRequest,
  setSQLSecurityHeaders,
  limitRequestSize
} = require('../middleware/sql-security');

// Apply middleware to all SQL routes
router.use(setSQLSecurityHeaders);
router.use(limitRequestSize);
router.use(sqlRateLimit);

/**
 * Execute SQL Query Endpoint
 * POST /api/sql/execute
 */
router.post('/execute', 
  validateSQLRequest,
  validateSQLSecurity,
  logSQLRequest,
  async (req, res) => {
    try {
      const { query, sanitizedParams, timeout, limit } = req.body;
      
      // Extract table names for logging
      const tableNames = extractTableNames(query);
      console.log(`🔍 SQL Query accessing tables: ${tableNames.join(', ') || 'none detected'}`);

      // Prepare query options
      const queryOptions = {
        timeout: timeout || parseInt(process.env.SQL_QUERY_TIMEOUT) || 30000,
        maxRows: limit || parseInt(process.env.SQL_MAX_ROWS) || 1000
      };

      // Execute query
      const result = await postgresManager.executeQuery(query, sanitizedParams, queryOptions);

      // Prepare response
      const response = {
        success: true,
        data: result.data,
        rowCount: result.rowCount,
        executionTime: result.executionTime,
        query: query,
        tables: tableNames,
        truncated: result.truncated,
        fields: result.fields,
        warnings: req.sqlValidation ? req.sqlValidation.warnings : [],
        complexity: req.queryComplexity ? {
          score: req.queryComplexity.complexity,
          issues: req.queryComplexity.issues
        } : null
      };

      // Add metadata if query was truncated
      if (result.truncated) {
        response.message = `Results truncated to ${queryOptions.maxRows} rows`;
      }

      res.json(response);

    } catch (error) {
      console.error('SQL execution error:', error);

      // Determine error status code
      let statusCode = 500;
      let errorCode = 'SQL_EXECUTION_ERROR';

      if (error.message && error.message.includes('timeout')) {
        statusCode = 408;
        errorCode = 'QUERY_TIMEOUT';
      } else if (error.message && error.message.includes('permission')) {
        statusCode = 403;
        errorCode = 'PERMISSION_DENIED';
      } else if (error.message && error.message.includes('syntax')) {
        statusCode = 400;
        errorCode = 'SYNTAX_ERROR';
      } else if (error.message && error.message.includes('connection')) {
        statusCode = 503;
        errorCode = 'DATABASE_UNAVAILABLE';
      }

      res.status(statusCode).json(createErrorResponse(
        'SQL query execution failed',
        [error.message || 'Unknown database error'],
        statusCode,
        errorCode,
        {
          executionTime: error.executionTime || null,
          query: req.body.query
        }
      ));
    }
  }
);

/**
 * Test Database Connection Endpoint
 * GET /api/sql/test
 */
router.get('/test', async (req, res) => {
  try {
    const testResult = await postgresManager.testConnection();
    
    if (testResult.success) {
      res.json({
        success: true,
        message: 'Database connection successful',
        timestamp: testResult.timestamp,
        version: testResult.version,
        poolStats: testResult.poolStats
      });
    } else {
      res.status(503).json(createErrorResponse(
        'Database connection failed',
        [testResult.error],
        503,
        'DATABASE_CONNECTION_FAILED',
        {
          poolStats: testResult.poolStats
        }
      ));
    }
  } catch (error) {
    console.error('Database test error:', error);
    res.status(500).json(createErrorResponse(
      'Database test failed',
      [error.message],
      500
    ));
  }
});

/**
 * Get Database Pool Statistics
 * GET /api/sql/stats
 */
router.get('/stats', (req, res) => {
  try {
    const poolStats = postgresManager.getPoolStats();
    
    res.json({
      success: true,
      poolStats: poolStats,
      configuration: {
        maxConnections: parseInt(process.env.POSTGRES_MAX_CONNECTIONS) || 10,
        queryTimeout: parseInt(process.env.SQL_QUERY_TIMEOUT) || 30000,
        maxRows: parseInt(process.env.SQL_MAX_ROWS) || 1000,
        rateLimitWindow: parseInt(process.env.SQL_RATE_LIMIT_WINDOW) || 900000,
        rateLimitMax: parseInt(process.env.SQL_RATE_LIMIT_MAX) || 20
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Stats retrieval error:', error);
    res.status(500).json(createErrorResponse(
      'Failed to retrieve statistics',
      [error.message],
      500
    ));
  }
});

/**
 * Validate SQL Query (without execution)
 * POST /api/sql/validate
 */
router.post('/validate',
  validateSQLRequest,
  validateSQLSecurity,
  (req, res) => {
    try {
      const { query } = req.body;
      const validation = req.sqlValidation;
      const complexity = req.queryComplexity;
      const tableNames = extractTableNames(query);

      res.json({
        success: true,
        valid: validation.isValid,
        query: query,
        tables: tableNames,
        validation: {
          errors: validation.errors,
          warnings: validation.warnings,
          normalizedQuery: validation.normalizedQuery
        },
        complexity: {
          score: complexity.complexity,
          isComplex: complexity.isComplex,
          issues: complexity.issues
        },
        estimatedSafety: {
          level: validation.errors.length === 0 ? 
            (complexity.isComplex ? 'medium' : 'high') : 'low',
          recommendations: [
            ...validation.warnings,
            ...complexity.issues
          ]
        }
      });
    } catch (error) {
      console.error('Query validation error:', error);
      res.status(500).json(createErrorResponse(
        'Query validation failed',
        [error.message],
        500
      ));
    }
  }
);

/**
 * Get SQL API Documentation
 * GET /api/sql/docs
 */
router.get('/docs', (req, res) => {
  const documentation = {
    title: 'PostgreSQL SQL API Documentation',
    version: '1.0.0',
    description: 'Secure read-only SQL API for PostgreSQL database queries',
    baseUrl: `${req.protocol}://${req.get('host')}/api/sql`,
    
    endpoints: {
      'POST /execute': {
        description: 'Execute a SELECT SQL query',
        parameters: {
          query: {
            type: 'string',
            required: true,
            description: 'SQL SELECT query to execute'
          },
          params: {
            type: 'array',
            required: false,
            description: 'Query parameters for parameterized queries'
          },
          timeout: {
            type: 'number',
            required: false,
            description: 'Query timeout in milliseconds (1000-300000)',
            default: 30000
          },
          limit: {
            type: 'number',
            required: false,
            description: 'Maximum number of rows to return (1-10000)',
            default: 1000
          }
        },
        example: {
          query: 'SELECT * FROM users WHERE active = $1 LIMIT 10',
          params: [true],
          timeout: 15000,
          limit: 10
        }
      },
      
      'GET /test': {
        description: 'Test database connection',
        parameters: {},
        example: 'GET /api/sql/test'
      },
      
      'GET /stats': {
        description: 'Get database pool statistics and configuration',
        parameters: {},
        example: 'GET /api/sql/stats'
      },
      
      'POST /validate': {
        description: 'Validate SQL query without execution',
        parameters: {
          query: {
            type: 'string',
            required: true,
            description: 'SQL query to validate'
          }
        },
        example: {
          query: 'SELECT name, email FROM users WHERE created_at > NOW() - INTERVAL \'1 day\''
        }
      }
    },
    
    security: {
      'Query Restrictions': [
        'Only SELECT statements are allowed',
        'No access to system tables or schemas',
        'No UNION, subqueries with system access, or dangerous functions',
        'Query complexity limits to prevent resource exhaustion'
      ],
      'Rate Limiting': {
        window: '15 minutes',
        maxRequests: 20,
        description: 'Rate limiting is applied per IP address and User-Agent'
      },
      'Request Limits': {
        maxQueryLength: '10,000 characters',
        maxRequestSize: '50KB',
        maxParameterLength: '1,000 characters per parameter'
      },
      'Response Limits': {
        maxRows: 1000,
        maxTimeout: '5 minutes',
        description: 'Results are automatically truncated if they exceed limits'
      }
    },
    
    errorCodes: {
      'INVALID_SQL_QUERY': 'Query failed security validation',
      'QUERY_TOO_COMPLEX': 'Query complexity exceeds allowed threshold',
      'SYNTAX_ERROR': 'SQL syntax error in query',
      'QUERY_TIMEOUT': 'Query execution timeout',
      'PERMISSION_DENIED': 'Insufficient database permissions',
      'DATABASE_UNAVAILABLE': 'Database connection unavailable',
      'REQUEST_TOO_LARGE': 'Request size exceeds maximum allowed'
    },
    
    examples: {
      'Simple Query': {
        request: {
          query: 'SELECT id, name, email FROM users LIMIT 5'
        },
        response: {
          success: true,
          data: [
            { id: 1, name: 'John Doe', email: 'john@example.com' },
            { id: 2, name: 'Jane Smith', email: 'jane@example.com' }
          ],
          rowCount: 2,
          executionTime: 45,
          truncated: false
        }
      },
      
      'Parameterized Query': {
        request: {
          query: 'SELECT * FROM products WHERE category = $1 AND price > $2',
          params: ['electronics', 100]
        },
        response: {
          success: true,
          data: [],
          rowCount: 0,
          executionTime: 23,
          truncated: false
        }
      },
      
      'Error Response': {
        response: {
          error: true,
          message: 'SQL query validation failed',
          details: ['Only SELECT statements are allowed'],
          statusCode: 400,
          code: 'INVALID_SQL_QUERY'
        }
      }
    }
  };

  res.json(documentation);
});

module.exports = router;
