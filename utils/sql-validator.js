/**
 * SQL Query Validator
 * Provides comprehensive security validation for SQL queries
 * Only allows safe SELECT statements with multiple layers of protection
 */

/**
 * Dangerous SQL keywords that should be blocked
 */
const DANGEROUS_KEYWORDS = [
  // Data modification
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER', 'TRUNCATE',
  // System functions
  'EXEC', 'EXECUTE', 'CALL', 'PROCEDURE', 'FUNCTION',
  // File operations
  'COPY', 'LOAD', 'OUTFILE', 'INFILE', 'IMPORT', 'EXPORT',
  // System access
  'GRANT', 'REVOKE', 'SET', 'RESET', 'SHOW',
  // Transaction control
  'BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT',
  // Database structure
  'DESCRIBE', 'EXPLAIN', 'ANALYZE',
  // PostgreSQL specific dangerous functions
  'PG_READ_FILE', 'PG_WRITE_FILE', 'PG_EXECUTE',
  // System catalogs (partial list)
  'PG_SHADOW', 'PG_USER', 'PG_DATABASE', 'PG_TABLES'
];

/**
 * Dangerous system tables and schemas
 */
const DANGEROUS_TABLES = [
  'information_schema',
  'pg_catalog',
  'pg_shadow',
  'pg_user',
  'pg_database',
  'pg_tables',
  'pg_views',
  'pg_indexes',
  'pg_stat_',
  'pg_settings',
  'pg_roles',
  'pg_authid'
];

/**
 * Validate SQL query for security compliance
 * @param {string} query - SQL query to validate
 * @returns {Object} Validation result
 */
function validateSQLQuery(query) {
  const errors = [];
  const warnings = [];

  // Basic input validation
  if (!query || typeof query !== 'string') {
    return {
      isValid: false,
      errors: ['Query must be a non-empty string'],
      warnings: []
    };
  }

  // Normalize query for analysis
  const normalizedQuery = query.trim().toUpperCase();
  const originalQuery = query.trim();

  // Check query length
  if (originalQuery.length > 10000) {
    errors.push('Query exceeds maximum length of 10,000 characters');
  }

  // Must start with SELECT
  if (!normalizedQuery.startsWith('SELECT')) {
    errors.push('Only SELECT statements are allowed');
  }

  // Check for dangerous keywords
  const foundDangerousKeywords = DANGEROUS_KEYWORDS.filter(keyword => 
    normalizedQuery.includes(keyword)
  );
  
  if (foundDangerousKeywords.length > 0) {
    errors.push(`Dangerous keywords detected: ${foundDangerousKeywords.join(', ')}`);
  }

  // Check for multiple statements (semicolon separation)
  const statements = originalQuery.split(';').filter(s => s.trim().length > 0);
  if (statements.length > 1) {
    errors.push('Multiple statements are not allowed');
  }

  // Check for comments (potential SQL injection vector)
  if (originalQuery.includes('--') || originalQuery.includes('/*') || originalQuery.includes('*/')) {
    errors.push('Comments are not allowed in queries');
  }

  // Check for dangerous system tables
  const foundDangerousTables = DANGEROUS_TABLES.filter(table => 
    normalizedQuery.includes(table.toUpperCase())
  );
  
  if (foundDangerousTables.length > 0) {
    errors.push(`Access to system tables/schemas is not allowed: ${foundDangerousTables.join(', ')}`);
  }

  // Check for UNION attacks
  if (normalizedQuery.includes('UNION')) {
    errors.push('UNION statements are not allowed');
  }

  // Check for subqueries that might access system information
  if (normalizedQuery.includes('(SELECT') && 
      (normalizedQuery.includes('INFORMATION_SCHEMA') || 
       normalizedQuery.includes('PG_CATALOG') ||
       normalizedQuery.includes('PG_'))) {
    errors.push('Subqueries accessing system information are not allowed');
  }

  // Check for potential function calls that could be dangerous
  const dangerousFunctions = [
    'PG_READ_FILE', 'PG_WRITE_FILE', 'PG_EXECUTE', 'COPY_FROM_PROGRAM',
    'DBLINK', 'PG_STAT_FILE', 'PG_LS_DIR', 'PG_READ_BINARY_FILE'
  ];
  
  const foundDangerousFunctions = dangerousFunctions.filter(func => 
    normalizedQuery.includes(func)
  );
  
  if (foundDangerousFunctions.length > 0) {
    errors.push(`Dangerous functions detected: ${foundDangerousFunctions.join(', ')}`);
  }

  // Warn about potentially expensive operations
  if (normalizedQuery.includes('CROSS JOIN')) {
    warnings.push('CROSS JOIN detected - this may be expensive');
  }

  if (normalizedQuery.includes('ORDER BY') && !normalizedQuery.includes('LIMIT')) {
    warnings.push('ORDER BY without LIMIT may be expensive for large datasets');
  }

  // Check for potential regex DoS
  if (normalizedQuery.includes('~') || normalizedQuery.includes('SIMILAR TO')) {
    warnings.push('Regular expressions detected - ensure they are not complex');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    normalizedQuery: normalizedQuery,
    statementCount: statements.length
  };
}

/**
 * Sanitize query parameters to prevent injection
 * @param {Array} params - Query parameters
 * @returns {Array} Sanitized parameters
 */
function sanitizeParameters(params) {
  if (!Array.isArray(params)) {
    return [];
  }

  return params.map(param => {
    // Convert to string and limit length
    if (param === null || param === undefined) {
      return null;
    }
    
    const stringParam = String(param);
    
    // Limit parameter length
    if (stringParam.length > 1000) {
      throw new Error('Parameter exceeds maximum length of 1000 characters');
    }
    
    return stringParam;
  });
}

/**
 * Extract table names from SELECT query (basic implementation)
 * @param {string} query - SQL query
 * @returns {Array} Array of table names
 */
function extractTableNames(query) {
  const tables = [];
  const normalizedQuery = query.toUpperCase();
  
  // Simple regex to find table names after FROM and JOIN
  const fromMatches = normalizedQuery.match(/FROM\s+([a-zA-Z_][a-zA-Z0-9_]*)/g);
  const joinMatches = normalizedQuery.match(/JOIN\s+([a-zA-Z_][a-zA-Z0-9_]*)/g);
  
  if (fromMatches) {
    fromMatches.forEach(match => {
      const tableName = match.replace(/FROM\s+/, '').trim();
      if (tableName && !tables.includes(tableName)) {
        tables.push(tableName);
      }
    });
  }
  
  if (joinMatches) {
    joinMatches.forEach(match => {
      const tableName = match.replace(/JOIN\s+/, '').trim();
      if (tableName && !tables.includes(tableName)) {
        tables.push(tableName);
      }
    });
  }
  
  return tables;
}

/**
 * Validate query complexity to prevent resource exhaustion
 * @param {string} query - SQL query
 * @returns {Object} Complexity analysis
 */
function analyzeQueryComplexity(query) {
  const normalizedQuery = query.toUpperCase();
  let complexity = 0;
  const issues = [];
  
  // Count JOINs (each JOIN increases complexity)
  const joinCount = (normalizedQuery.match(/JOIN/g) || []).length;
  complexity += joinCount * 2;
  
  if (joinCount > 5) {
    issues.push(`High number of JOINs detected: ${joinCount}`);
  }
  
  // Count subqueries
  const subqueryCount = (normalizedQuery.match(/\(SELECT/g) || []).length;
  complexity += subqueryCount * 3;
  
  if (subqueryCount > 3) {
    issues.push(`High number of subqueries detected: ${subqueryCount}`);
  }
  
  // Check for LIKE with leading wildcards (expensive)
  if (normalizedQuery.includes("LIKE '%")) {
    complexity += 5;
    issues.push('LIKE with leading wildcard detected - may be slow');
  }
  
  // Check for functions that might be expensive
  const expensiveFunctions = ['REGEXP', 'SIMILAR TO', 'SUBSTRING', 'POSITION'];
  expensiveFunctions.forEach(func => {
    if (normalizedQuery.includes(func)) {
      complexity += 2;
      issues.push(`Potentially expensive function detected: ${func}`);
    }
  });
  
  return {
    complexity,
    issues,
    isComplex: complexity > 10
  };
}

module.exports = {
  validateSQLQuery,
  sanitizeParameters,
  extractTableNames,
  analyzeQueryComplexity,
  DANGEROUS_KEYWORDS,
  DANGEROUS_TABLES
};
