# PostgreSQL SQL API

A secure, read-only SQL API for executing PostgreSQL queries with comprehensive safety checks and monitoring.

## Features

✅ **Security First**
- Only SELECT statements allowed
- SQL injection protection with query parsing
- Whitelist-based keyword validation
- System table access prevention
- Query complexity analysis

✅ **Resource Protection**
- Query timeout limits (30 seconds default)
- Result set size limits (1000 rows default)
- Connection pooling with limits
- Request size limits (50KB max)

✅ **Rate Limiting**
- 20 requests per 15-minute window per IP
- Separate rate limiting for SQL endpoints
- IP + User-Agent based limiting

✅ **Comprehensive Logging**
- Complete audit trail for all queries
- Security violation logging
- Performance monitoring
- Error tracking

## Quick Start

### 1. Environment Configuration

Update your `.env` file with PostgreSQL connection details:

```env
# PostgreSQL Configuration
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=your_database_name
POSTGRES_USER=your_username
POSTGRES_PASSWORD=your_password
POSTGRES_MAX_CONNECTIONS=10
POSTGRES_IDLE_TIMEOUT=30000

# SQL API Security
SQL_QUERY_TIMEOUT=30000
SQL_MAX_ROWS=1000
SQL_RATE_LIMIT_WINDOW=900000
SQL_RATE_LIMIT_MAX=20
```

### 2. Start the Server

```bash
npm start
```

The SQL API will be available at `/api/sql/*` endpoints.

## API Endpoints

### Execute SQL Query
**POST** `/api/sql/execute`

Execute a SELECT SQL query against the PostgreSQL database.

**Request Body:**
```json
{
  "query": "SELECT id, name, email FROM users WHERE active = $1 LIMIT 10",
  "params": [true],
  "timeout": 15000,
  "limit": 100
}
```

**Parameters:**
- `query` (string, required): SQL SELECT query to execute
- `params` (array, optional): Query parameters for parameterized queries
- `timeout` (number, optional): Query timeout in milliseconds (1000-300000)
- `limit` (number, optional): Maximum rows to return (1-10000)

**Response:**
```json
{
  "success": true,
  "data": [
    {"id": 1, "name": "John Doe", "email": "john@example.com"},
    {"id": 2, "name": "Jane Smith", "email": "jane@example.com"}
  ],
  "rowCount": 2,
  "executionTime": 45,
  "query": "SELECT id, name, email FROM users WHERE active = $1 LIMIT 10",
  "tables": ["users"],
  "truncated": false,
  "fields": [
    {"name": "id", "type": 23},
    {"name": "name", "type": 1043},
    {"name": "email", "type": 1043}
  ],
  "warnings": [],
  "complexity": {
    "score": 2,
    "issues": []
  }
}
```

### Test Database Connection
**GET** `/api/sql/test`

Test the PostgreSQL database connection.

**Response:**
```json
{
  "success": true,
  "message": "Database connection successful",
  "timestamp": "2025-01-31T06:30:00.000Z",
  "version": "PostgreSQL 14.5 on x86_64-pc-linux-gnu",
  "poolStats": {
    "status": "active",
    "totalCount": 2,
    "idleCount": 2,
    "waitingCount": 0,
    "maxConnections": 10
  }
}
```

### Validate SQL Query
**POST** `/api/sql/validate`

Validate a SQL query without executing it.

**Request Body:**
```json
{
  "query": "SELECT name, email FROM users WHERE created_at > NOW() - INTERVAL '1 day'"
}
```

**Response:**
```json
{
  "success": true,
  "valid": true,
  "query": "SELECT name, email FROM users WHERE created_at > NOW() - INTERVAL '1 day'",
  "tables": ["users"],
  "validation": {
    "errors": [],
    "warnings": [],
    "normalizedQuery": "SELECT NAME, EMAIL FROM USERS WHERE CREATED_AT > NOW() - INTERVAL '1 DAY'"
  },
  "complexity": {
    "score": 1,
    "isComplex": false,
    "issues": []
  },
  "estimatedSafety": {
    "level": "high",
    "recommendations": []
  }
}
```

### Get Pool Statistics
**GET** `/api/sql/stats`

Get database connection pool statistics and configuration.

**Response:**
```json
{
  "success": true,
  "poolStats": {
    "status": "active",
    "totalCount": 3,
    "idleCount": 2,
    "waitingCount": 0,
    "maxConnections": 10
  },
  "configuration": {
    "maxConnections": 10,
    "queryTimeout": 30000,
    "maxRows": 1000,
    "rateLimitWindow": 900000,
    "rateLimitMax": 20
  },
  "timestamp": "2025-01-31T06:30:00.000Z"
}
```

### API Documentation
**GET** `/api/sql/docs`

Get comprehensive API documentation with examples and security information.

## Security Features

### Query Validation
- **SELECT Only**: Only SELECT statements are permitted
- **Keyword Filtering**: Dangerous keywords (INSERT, UPDATE, DELETE, DROP, etc.) are blocked
- **System Access Prevention**: Access to system tables and schemas is blocked
- **Comment Blocking**: SQL comments are not allowed to prevent injection
- **Multiple Statement Prevention**: Only single statements are allowed

### Dangerous Keywords Blocked
```
INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, TRUNCATE,
EXEC, EXECUTE, CALL, PROCEDURE, FUNCTION,
COPY, LOAD, OUTFILE, INFILE, IMPORT, EXPORT,
GRANT, REVOKE, SET, RESET, SHOW,
BEGIN, COMMIT, ROLLBACK, SAVEPOINT,
PG_READ_FILE, PG_WRITE_FILE, PG_EXECUTE
```

### System Tables Blocked
```
information_schema, pg_catalog, pg_shadow, pg_user,
pg_database, pg_tables, pg_views, pg_indexes,
pg_stat_*, pg_settings, pg_roles, pg_authid
```

### Query Complexity Analysis
- **JOIN Counting**: Each JOIN increases complexity score
- **Subquery Detection**: Subqueries add to complexity
- **Expensive Operations**: LIKE with leading wildcards, regex operations
- **Complexity Threshold**: Queries with score > 20 are rejected

### Rate Limiting
- **Window**: 15 minutes (configurable)
- **Limit**: 20 requests per window (configurable)
- **Granularity**: Per IP address + User-Agent
- **Headers**: Standard rate limit headers included

## Error Codes

| Code | Description |
|------|-------------|
| `INVALID_SQL_QUERY` | Query failed security validation |
| `QUERY_TOO_COMPLEX` | Query complexity exceeds threshold |
| `SYNTAX_ERROR` | SQL syntax error |
| `QUERY_TIMEOUT` | Query execution timeout |
| `PERMISSION_DENIED` | Insufficient database permissions |
| `DATABASE_UNAVAILABLE` | Database connection unavailable |
| `REQUEST_TOO_LARGE` | Request size exceeds limit |

## Example Usage

### Basic Query
```bash
curl -X POST http://localhost:3000/api/sql/execute \
  -H "Content-Type: application/json" \
  -d '{
    "query": "SELECT id, name FROM users LIMIT 5"
  }'
```

### Parameterized Query
```bash
curl -X POST http://localhost:3000/api/sql/execute \
  -H "Content-Type: application/json" \
  -d '{
    "query": "SELECT * FROM products WHERE category = $1 AND price > $2",
    "params": ["electronics", 100],
    "limit": 50
  }'
```

### Query with Custom Timeout
```bash
curl -X POST http://localhost:3000/api/sql/execute \
  -H "Content-Type: application/json" \
  -d '{
    "query": "SELECT COUNT(*) FROM large_table",
    "timeout": 60000
  }'
```

## Monitoring and Logging

### Audit Logs
All SQL queries are logged with:
- Timestamp and IP address
- User-Agent information
- Query text (truncated for long queries)
- Parameter count
- Complexity score
- Validation warnings

### Response Logs
Query execution results are logged with:
- Success/failure status
- Execution time
- Row count returned
- Error messages (if any)

### Security Logs
Security violations are logged with:
- IP address of requester
- Specific validation errors
- Blocked query attempts

## Best Practices

### Database User Setup
Create a dedicated read-only database user:

```sql
-- Create read-only user
CREATE USER sql_api_user WITH PASSWORD 'secure_password';

-- Grant connect permission
GRANT CONNECT ON DATABASE your_database TO sql_api_user;

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO sql_api_user;

-- Grant select on specific tables
GRANT SELECT ON ALL TABLES IN SCHEMA public TO sql_api_user;

-- For future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
GRANT SELECT ON TABLES TO sql_api_user;
```

### Query Optimization
- Use LIMIT clauses to prevent large result sets
- Add appropriate WHERE clauses to filter data
- Use indexes on frequently queried columns
- Avoid complex JOINs when possible

### Security Recommendations
- Use parameterized queries to prevent injection
- Keep queries simple and focused
- Monitor logs for suspicious activity
- Regularly review and update access permissions
- Use HTTPS in production environments

## Configuration Options

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_HOST` | localhost | PostgreSQL host |
| `POSTGRES_PORT` | 5432 | PostgreSQL port |
| `POSTGRES_DB` | - | Database name |
| `POSTGRES_USER` | - | Database username |
| `POSTGRES_PASSWORD` | - | Database password |
| `POSTGRES_MAX_CONNECTIONS` | 10 | Max connection pool size |
| `POSTGRES_IDLE_TIMEOUT` | 30000 | Connection idle timeout (ms) |
| `SQL_QUERY_TIMEOUT` | 30000 | Query execution timeout (ms) |
| `SQL_MAX_ROWS` | 1000 | Maximum rows returned |
| `SQL_RATE_LIMIT_WINDOW` | 900000 | Rate limit window (ms) |
| `SQL_RATE_LIMIT_MAX` | 20 | Max requests per window |

## Troubleshooting

### Common Issues

**Connection Failed**
- Verify PostgreSQL is running
- Check connection parameters in .env
- Ensure database user has proper permissions
- Check firewall settings

**Query Validation Failed**
- Ensure query starts with SELECT
- Remove any dangerous keywords
- Avoid system table access
- Simplify complex queries

**Rate Limited**
- Wait for rate limit window to reset
- Reduce query frequency
- Consider caching results

**Query Timeout**
- Optimize query performance
- Add appropriate indexes
- Increase timeout limit
- Reduce result set size

### Debug Mode
Set `NODE_ENV=development` for detailed error messages and logging.

## Security Considerations

- **Network Security**: Use VPN or private networks in production
- **Database Permissions**: Use minimal required permissions
- **Input Validation**: All inputs are validated and sanitized
- **Error Handling**: Sensitive information is not exposed in errors
- **Audit Trail**: Complete logging for security monitoring
- **Rate Limiting**: Prevents abuse and DoS attacks

## License

This SQL API is part of the chatbot widget backend and follows the same MIT license.
