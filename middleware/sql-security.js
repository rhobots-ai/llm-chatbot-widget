const rateLimit = require('express-rate-limit');
const { validateSQLQuery, sanitizeParameters, analyzeQueryComplexity } = require('../utils/sql-validator');
const { createErrorResponse } = require('../utils/validation');

/**
 * SQL-specific rate limiter
 * More restrictive than general API rate limiting
 */
const sqlRateLimit = rateLimit({
  windowMs: parseInt(process.env.SQL_RATE_LIMIT_WINDOW) || 900000, // 15 minutes
  max: parseInt(process.env.SQL_RATE_LIMIT_MAX) || 20, // 20 requests per window
  message: {
    error: true,
    message: 'Too many SQL requests, please try again later.',
    statusCode: 429,
    retryAfter: Math.ceil((parseInt(process.env.SQL_RATE_LIMIT_WINDOW) || 900000) / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Use IP + User-Agent for more granular limiting
  keyGenerator: (req) => {
    return `${req.ip}-${req.get('User-Agent') || 'unknown'}`;
  },
  // Skip successful requests from rate limiting (optional)
  skipSuccessfulRequests: false,
  // Skip failed requests from rate limiting
  skipFailedRequests: false
});

/**
 * Validate SQL request body
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function validateSQLRequest(req, res, next) {
  try {
    const { query, params, timeout, limit } = req.body;

    // Validate required fields
    if (!query) {
      return res.status(400).json(createErrorResponse(
        'Missing required field: query',
        ['Query parameter is required'],
        400
      ));
    }

    if (typeof query !== 'string') {
      return res.status(400).json(createErrorResponse(
        'Invalid query format',
        ['Query must be a string'],
        400
      ));
    }

    // Validate optional parameters
    if (params && !Array.isArray(params)) {
      return res.status(400).json(createErrorResponse(
        'Invalid parameters format',
        ['Parameters must be an array'],
        400
      ));
    }

    if (timeout && (typeof timeout !== 'number' || timeout < 1000 || timeout > 300000)) {
      return res.status(400).json(createErrorResponse(
        'Invalid timeout value',
        ['Timeout must be a number between 1000 and 300000 milliseconds'],
        400
      ));
    }

    if (limit && (typeof limit !== 'number' || limit < 1 || limit > 10000)) {
      return res.status(400).json(createErrorResponse(
        'Invalid limit value',
        ['Limit must be a number between 1 and 10000'],
        400
      ));
    }

    // Sanitize parameters
    try {
      req.body.sanitizedParams = sanitizeParameters(params || []);
    } catch (error) {
      return res.status(400).json(createErrorResponse(
        'Parameter validation failed',
        [error.message],
        400
      ));
    }

    next();
  } catch (error) {
    console.error('SQL request validation error:', error);
    return res.status(500).json(createErrorResponse(
      'Request validation failed',
      ['Internal validation error'],
      500
    ));
  }
}

/**
 * Validate SQL query security
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function validateSQLSecurity(req, res, next) {
  try {
    const { query } = req.body;

    // Validate SQL query
    const validation = validateSQLQuery(query);
    
    if (!validation.isValid) {
      console.warn(`🚨 SQL Security violation from ${req.ip}: ${validation.errors.join(', ')}`);
      
      return res.status(400).json(createErrorResponse(
        'SQL query validation failed',
        validation.errors,
        400,
        'INVALID_SQL_QUERY'
      ));
    }

    // Analyze query complexity
    const complexity = analyzeQueryComplexity(query);
    
    if (complexity.isComplex) {
      console.warn(`⚠️ Complex SQL query from ${req.ip}: complexity score ${complexity.complexity}`);
      
      // Log complex queries for monitoring
      req.queryComplexity = complexity;
      
      // Optionally reject very complex queries
      if (complexity.complexity > 20) {
        return res.status(400).json(createErrorResponse(
          'Query too complex',
          ['Query complexity exceeds maximum allowed threshold', ...complexity.issues],
          400,
          'QUERY_TOO_COMPLEX'
        ));
      }
    }

    // Add validation results to request for logging
    req.sqlValidation = validation;
    req.queryComplexity = complexity;

    // Log warnings if any
    if (validation.warnings.length > 0) {
      console.warn(`⚠️ SQL Query warnings from ${req.ip}: ${validation.warnings.join(', ')}`);
    }

    next();
  } catch (error) {
    console.error('SQL security validation error:', error);
    return res.status(500).json(createErrorResponse(
      'Security validation failed',
      ['Internal security validation error'],
      500
    ));
  }
}

/**
 * Log SQL requests for audit trail
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function logSQLRequest(req, res, next) {
  const timestamp = new Date().toISOString();
  const { query, sanitizedParams } = req.body;
  const complexity = req.queryComplexity || { complexity: 0 };
  
  // Create audit log entry
  const auditLog = {
    timestamp,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    query: query.substring(0, 500), // Truncate long queries for logging
    paramCount: sanitizedParams ? sanitizedParams.length : 0,
    complexity: complexity.complexity,
    warnings: req.sqlValidation ? req.sqlValidation.warnings : []
  };

  console.log(`📝 SQL Audit Log: ${JSON.stringify(auditLog)}`);

  // Store original response.json to capture response data
  const originalJson = res.json;
  res.json = function(data) {
    // Log response status and execution time when response is sent
    const responseLog = {
      timestamp: new Date().toISOString(),
      ip: req.ip,
      success: !data.error,
      statusCode: res.statusCode,
      executionTime: data.executionTime || null,
      rowCount: data.rowCount || null,
      error: data.error ? data.message : null
    };
    
    console.log(`📊 SQL Response Log: ${JSON.stringify(responseLog)}`);
    
    // Call original json method
    return originalJson.call(this, data);
  };

  next();
}

/**
 * Security headers middleware for SQL endpoints
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function setSQLSecurityHeaders(req, res, next) {
  // Additional security headers for SQL endpoints
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  
  next();
}

/**
 * Request size limiter for SQL endpoints
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function limitRequestSize(req, res, next) {
  const contentLength = parseInt(req.get('Content-Length') || '0');
  const maxSize = 50 * 1024; // 50KB max request size
  
  if (contentLength > maxSize) {
    return res.status(413).json(createErrorResponse(
      'Request too large',
      [`Request size ${contentLength} bytes exceeds maximum allowed size of ${maxSize} bytes`],
      413,
      'REQUEST_TOO_LARGE'
    ));
  }
  
  next();
}

module.exports = {
  sqlRateLimit,
  validateSQLRequest,
  validateSQLSecurity,
  logSQLRequest,
  setSQLSecurityHeaders,
  limitRequestSize
};
