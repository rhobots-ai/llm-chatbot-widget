const { Pool } = require('pg');

/**
 * PostgreSQL Connection Manager
 * Handles secure database connections with connection pooling
 */
class PostgreSQLManager {
  constructor() {
    this.pool = null;
    this.isInitialized = false;
  }

  /**
   * Initialize the PostgreSQL connection pool
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      // Validate required environment variables
      const requiredVars = ['POSTGRES_HOST', 'POSTGRES_PORT', 'POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD'];
      const missingVars = requiredVars.filter(varName => !process.env[varName]);
      
      if (missingVars.length > 0) {
        throw new Error(`Missing required PostgreSQL environment variables: ${missingVars.join(', ')}`);
      }

      // Create connection pool with security settings
      this.pool = new Pool({
        host: process.env.POSTGRES_HOST,
        port: parseInt(process.env.POSTGRES_PORT) || 5432,
        database: process.env.POSTGRES_DB,
        user: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD,
        max: parseInt(process.env.POSTGRES_MAX_CONNECTIONS) || 10,
        idleTimeoutMillis: parseInt(process.env.POSTGRES_IDLE_TIMEOUT) || 30000,
        connectionTimeoutMillis: 10000,
        // Security settings
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        statement_timeout: parseInt(process.env.SQL_QUERY_TIMEOUT) || 30000,
        query_timeout: parseInt(process.env.SQL_QUERY_TIMEOUT) || 30000,
      });

      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      this.isInitialized = true;
      console.log('✅ PostgreSQL connection pool initialized successfully');
      
      // Log pool events for monitoring
      this.pool.on('connect', () => {
        console.log('🔗 New PostgreSQL client connected');
      });

      this.pool.on('error', (err) => {
        console.error('❌ PostgreSQL pool error:', err);
      });

    } catch (error) {
      console.error('❌ Failed to initialize PostgreSQL connection:', error.message);
      throw error;
    }
  }

  /**
   * Execute a SQL query with safety checks
   * @param {string} query - SQL query to execute
   * @param {Array} params - Query parameters (optional)
   * @param {Object} options - Query options
   * @returns {Object} Query result
   */
  async executeQuery(query, params = [], options = {}) {
    if (!this.isInitialized) {
      throw new Error('PostgreSQL manager not initialized');
    }

    const startTime = Date.now();
    const client = await this.pool.connect();
    
    try {
      // Set query timeout
      const timeout = options.timeout || parseInt(process.env.SQL_QUERY_TIMEOUT) || 30000;
      await client.query(`SET statement_timeout = ${timeout}`);

      // Execute query
      const result = await client.query(query, params);
      const executionTime = Date.now() - startTime;

      // Check result size limits
      const maxRows = options.maxRows || parseInt(process.env.SQL_MAX_ROWS) || 1000;
      if (result.rows && result.rows.length > maxRows) {
        console.warn(`Query returned ${result.rows.length} rows, truncating to ${maxRows}`);
        result.rows = result.rows.slice(0, maxRows);
        result.truncated = true;
      }

      // Log query execution
      console.log(`📊 SQL Query executed in ${executionTime}ms, returned ${result.rowCount || 0} rows`);

      return {
        success: true,
        data: result.rows,
        rowCount: result.rowCount,
        executionTime,
        truncated: result.truncated || false,
        fields: result.fields ? result.fields.map(f => ({ name: f.name, type: f.dataTypeID })) : []
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error(`❌ SQL Query failed after ${executionTime}ms:`, error.message);
      
      // Return sanitized error (don't expose sensitive database info)
      throw {
        message: this.sanitizeError(error.message),
        code: error.code,
        executionTime
      };
    } finally {
      client.release();
    }
  }

  /**
   * Sanitize error messages to prevent information disclosure
   * @param {string} errorMessage - Original error message
   * @returns {string} Sanitized error message
   */
  sanitizeError(errorMessage) {
    // Remove sensitive information from error messages
    const sensitivePatterns = [
      /password/gi,
      /connection string/gi,
      /host.*port/gi,
      /database.*user/gi
    ];

    let sanitized = errorMessage;
    sensitivePatterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    });

    // Common PostgreSQL errors with user-friendly messages
    if (sanitized.includes('syntax error')) {
      return 'SQL syntax error in query';
    }
    if (sanitized.includes('relation') && sanitized.includes('does not exist')) {
      return 'Table or column does not exist';
    }
    if (sanitized.includes('permission denied')) {
      return 'Insufficient database permissions';
    }
    if (sanitized.includes('timeout')) {
      return 'Query execution timeout';
    }
    if (sanitized.includes('connection')) {
      return 'Database connection error';
    }

    return sanitized;
  }

  /**
   * Get connection pool statistics
   * @returns {Object} Pool statistics
   */
  getPoolStats() {
    if (!this.pool) {
      return { status: 'not_initialized' };
    }

    return {
      status: 'active',
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
      maxConnections: this.pool.options.max
    };
  }

  /**
   * Test database connectivity
   * @returns {Object} Connection test result
   */
  async testConnection() {
    try {
      const result = await this.executeQuery('SELECT NOW() as current_time, version() as version');
      return {
        success: true,
        timestamp: result.data[0].current_time,
        version: result.data[0].version,
        poolStats: this.getPoolStats()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        poolStats: this.getPoolStats()
      };
    }
  }

  /**
   * Close all connections and clean up
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.isInitialized = false;
      console.log('✅ PostgreSQL connection pool closed');
    }
  }
}

// Export singleton instance
module.exports = new PostgreSQLManager();
