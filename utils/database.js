const sqlite3 = require('sqlite3').verbose();
const path = require('path');

/**
 * Database Manager for SQLite
 * Handles conversation and message persistence
 */
class DatabaseManager {
  constructor() {
    this.db = null;
    this.dbPath = path.join(__dirname, '..', 'data', 'conversations.db');
  }

  /**
   * Initialize the database connection and create tables
   */
  async initialize() {
    return new Promise((resolve, reject) => {
      // Create data directory if it doesn't exist
      const fs = require('fs');
      const dataDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('Error opening database:', err);
          reject(err);
          return;
        }
        
        console.log('✅ Connected to SQLite database');
        this.createTables()
          .then(() => resolve())
          .catch(reject);
      });
    });
  }

  /**
   * Create necessary tables
   */
  async createTables() {
    return new Promise((resolve, reject) => {
      const createConversationsTable = `
        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          thread_id TEXT,
          name TEXT,
          provider TEXT DEFAULT 'openai',
          assistant_id TEXT,
          assistant_type TEXT DEFAULT 'default',
          created_at INTEGER,
          last_activity INTEGER,
          message_count INTEGER DEFAULT 0,
          metadata TEXT,
          metabase_question_url TEXT,
          total_input_tokens INTEGER DEFAULT 0,
          total_output_tokens INTEGER DEFAULT 0,
          total_cost REAL DEFAULT 0.0,
          model_name TEXT
        )
      `;

      const createMessagesTable = `
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          conversation_id TEXT,
          text TEXT NOT NULL,
          sender TEXT NOT NULL,
          timestamp INTEGER,
          metadata TEXT,
          input_tokens INTEGER DEFAULT 0,
          output_tokens INTEGER DEFAULT 0,
          model_name TEXT,
          token_cost REAL DEFAULT 0.0,
          FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE
        )
      `;

      const createIndexes = `
        CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
        CREATE INDEX IF NOT EXISTS idx_conversations_thread_id ON conversations(thread_id);
        CREATE INDEX IF NOT EXISTS idx_conversations_last_activity ON conversations(last_activity);
        CREATE INDEX IF NOT EXISTS idx_conversations_metabase_url ON conversations(metabase_question_url);
        CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
        CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
      `;

      this.db.exec(createConversationsTable, (err) => {
        if (err) {
          reject(err);
          return;
        }

        this.db.exec(createMessagesTable, (err) => {
          if (err) {
            reject(err);
            return;
          }

          this.db.exec(createIndexes, (err) => {
            if (err) {
              reject(err);
              return;
            }

            // Add the metabase_question_url column if it doesn't exist (migration)
            this.db.run(`
              ALTER TABLE conversations ADD COLUMN metabase_question_url TEXT
            `, (alterErr) => {
              // Ignore error if column already exists
              if (alterErr && !alterErr.message.includes('duplicate column name')) {
                console.warn('Warning adding metabase_question_url column:', alterErr.message);
              }
              
              // Add the name column if it doesn't exist (migration)
              this.db.run(`
                ALTER TABLE conversations ADD COLUMN name TEXT
              `, (nameAlterErr) => {
                // Ignore error if column already exists
                if (nameAlterErr && !nameAlterErr.message.includes('duplicate column name')) {
                  console.warn('Warning adding name column:', nameAlterErr.message);
                }
                
                // Add rating columns to messages table (migration)
                this.db.run(`
                  ALTER TABLE messages ADD COLUMN rating TEXT CHECK (rating IN ('thumbs_up', 'thumbs_down', NULL))
                `, (ratingErr) => {
                  // Ignore error if column already exists
                  if (ratingErr && !ratingErr.message.includes('duplicate column name')) {
                    console.warn('Warning adding rating column:', ratingErr.message);
                  }
                  
                  this.db.run(`
                    ALTER TABLE messages ADD COLUMN rating_comment TEXT
                  `, (commentErr) => {
                    // Ignore error if column already exists
                    if (commentErr && !commentErr.message.includes('duplicate column name')) {
                      console.warn('Warning adding rating_comment column:', commentErr.message);
                    }
                    
                    this.db.run(`
                      ALTER TABLE messages ADD COLUMN rating_timestamp INTEGER
                    `, (timestampErr) => {
                      // Ignore error if column already exists
                      if (timestampErr && !timestampErr.message.includes('duplicate column name')) {
                        console.warn('Warning adding rating_timestamp column:', timestampErr.message);
                      }
                      
                      // Create index for rating column
                      this.db.run(`
                        CREATE INDEX IF NOT EXISTS idx_messages_rating ON messages(rating)
                      `, (indexErr) => {
                        if (indexErr) {
                          console.warn('Warning creating rating index:', indexErr.message);
                        }
                        
                        // Add token tracking columns to conversations table (migration)
                        this.db.run(`
                          ALTER TABLE conversations ADD COLUMN total_input_tokens INTEGER DEFAULT 0
                        `, (tokenErr1) => {
                          if (tokenErr1 && !tokenErr1.message.includes('duplicate column name')) {
                            console.warn('Warning adding total_input_tokens column:', tokenErr1.message);
                          }
                          
                          this.db.run(`
                            ALTER TABLE conversations ADD COLUMN total_output_tokens INTEGER DEFAULT 0
                          `, (tokenErr2) => {
                            if (tokenErr2 && !tokenErr2.message.includes('duplicate column name')) {
                              console.warn('Warning adding total_output_tokens column:', tokenErr2.message);
                            }
                            
                            this.db.run(`
                              ALTER TABLE conversations ADD COLUMN total_cost REAL DEFAULT 0.0
                            `, (tokenErr3) => {
                              if (tokenErr3 && !tokenErr3.message.includes('duplicate column name')) {
                                console.warn('Warning adding total_cost column:', tokenErr3.message);
                              }
                              
                              this.db.run(`
                                ALTER TABLE conversations ADD COLUMN model_name TEXT
                              `, (tokenErr4) => {
                                if (tokenErr4 && !tokenErr4.message.includes('duplicate column name')) {
                                  console.warn('Warning adding model_name column to conversations:', tokenErr4.message);
                                }
                                
                                // Add token tracking columns to messages table (migration)
                                this.db.run(`
                                  ALTER TABLE messages ADD COLUMN input_tokens INTEGER DEFAULT 0
                                `, (msgTokenErr1) => {
                                  if (msgTokenErr1 && !msgTokenErr1.message.includes('duplicate column name')) {
                                    console.warn('Warning adding input_tokens column:', msgTokenErr1.message);
                                  }
                                  
                                  this.db.run(`
                                    ALTER TABLE messages ADD COLUMN output_tokens INTEGER DEFAULT 0
                                  `, (msgTokenErr2) => {
                                    if (msgTokenErr2 && !msgTokenErr2.message.includes('duplicate column name')) {
                                      console.warn('Warning adding output_tokens column:', msgTokenErr2.message);
                                    }
                                    
                                    this.db.run(`
                                      ALTER TABLE messages ADD COLUMN model_name TEXT
                                    `, (msgTokenErr3) => {
                                      if (msgTokenErr3 && !msgTokenErr3.message.includes('duplicate column name')) {
                                        console.warn('Warning adding model_name column to messages:', msgTokenErr3.message);
                                      }
                                      
                                      this.db.run(`
                                        ALTER TABLE messages ADD COLUMN token_cost REAL DEFAULT 0.0
                                      `, (msgTokenErr4) => {
                                        if (msgTokenErr4 && !msgTokenErr4.message.includes('duplicate column name')) {
                                          console.warn('Warning adding token_cost column:', msgTokenErr4.message);
                                        }
                                        
                                        console.log('✅ Database tables created successfully');
                                        resolve();
                                      });
                                    });
                                  });
                                });
                              });
                            });
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  }

  /**
   * Create a new conversation
   */
  async createConversation(conversationId, userId = null, metadata = {}, metabaseQuestionUrl = null, name = null) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO conversations (
          id, user_id, name, created_at, last_activity, metadata, metabase_question_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const now = Date.now();
      stmt.run([
        conversationId,
        userId,
        name,
        now,
        now,
        JSON.stringify(metadata),
        metabaseQuestionUrl
      ], function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(conversationId);
      });

      stmt.finalize();
    });
  }

  /**
   * Get conversation by ID
   */
  async getConversation(conversationId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM conversations WHERE id = ?',
        [conversationId],
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }

          if (!row) {
            resolve(null);
            return;
          }

          // Parse metadata
          try {
            row.metadata = JSON.parse(row.metadata || '{}');
          } catch (e) {
            row.metadata = {};
          }

          resolve(row);
        }
      );
    });
  }

  /**
   * Update conversation thread ID
   */
  async updateConversationThread(conversationId, threadId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE conversations SET thread_id = ?, last_activity = ? WHERE id = ?',
        [threadId, Date.now(), conversationId],
        function(err) {
          if (err) {
            reject(err);
            return;
          }
          resolve(this.changes > 0);
        }
      );
    });
  }

  /**
   * Update conversation metadata
   */
  async updateConversationMetadata(conversationId, metadata) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE conversations SET metadata = ?, last_activity = ? WHERE id = ?',
        [JSON.stringify(metadata), Date.now(), conversationId],
        function(err) {
          if (err) {
            reject(err);
            return;
          }
          resolve(this.changes > 0);
        }
      );
    });
  }

  /**
   * Update conversation name
   */
  async updateConversationName(conversationId, name) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE conversations SET name = ?, last_activity = ? WHERE id = ?',
        [name, Date.now(), conversationId],
        function(err) {
          if (err) {
            reject(err);
            return;
          }
          resolve(this.changes > 0);
        }
      );
    });
  }

  /**
   * Generate conversation name from first user message
   */
  generateConversationName(firstUserMessage) {
    if (!firstUserMessage || typeof firstUserMessage !== 'string') {
      return 'New Conversation';
    }

    // Clean the message
    let name = firstUserMessage.trim();
    
    // Remove common question words and phrases
    name = name.replace(/^(what|how|why|when|where|who|can|could|would|should|is|are|do|does|did|tell me|help me|explain|show me)\s+/i, '');
    
    // Remove special characters and extra spaces
    name = name.replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Capitalize first letter
    name = name.charAt(0).toUpperCase() + name.slice(1);
    
    // Limit length and add ellipsis if needed
    if (name.length > 50) {
      name = name.substring(0, 47) + '...';
    }
    
    // Fallback if name is too short or empty
    if (name.length < 3) {
      return 'New Conversation';
    }
    
    return name;
  }

  /**
   * Add message to conversation
   */
  async addMessage(conversationId, text, sender, metadata = {}) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO messages (conversation_id, text, sender, timestamp, metadata)
        VALUES (?, ?, ?, ?, ?)
      `);

      const timestamp = Date.now();
      const db = this.db; // Store reference to db before entering callback
      
      stmt.run([
        conversationId,
        text,
        sender,
        timestamp,
        JSON.stringify(metadata)
      ], function(err) {
        if (err) {
          reject(err);
          return;
        }

        // Update conversation message count and last activity
        const updateStmt = db.prepare(`
          UPDATE conversations 
          SET message_count = message_count + 1, last_activity = ?
          WHERE id = ?
        `);

        updateStmt.run([timestamp, conversationId], (updateErr) => {
          if (updateErr) {
            console.error('Error updating conversation stats:', updateErr);
          }
        });

        updateStmt.finalize();
        resolve(this.lastID);
      });

      stmt.finalize();
    });
  }

  /**
   * Get conversation messages
   */
  async getMessages(conversationId, limit = null, offset = 0) {
    return new Promise((resolve, reject) => {
      let query = 'SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC';
      const params = [conversationId];

      if (limit) {
        query += ' LIMIT ? OFFSET ?';
        params.push(limit, offset);
      }

      this.db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
          return;
        }

        // Parse metadata for each message
        const messages = rows.map(row => {
          try {
            row.metadata = JSON.parse(row.metadata || '{}');
          } catch (e) {
            row.metadata = {};
          }
          return row;
        });

        resolve(messages);
      });
    });
  }

  /**
   * Get conversations for a user
   */
  async getUserConversations(userId, limit = 10, offset = 0) {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT * FROM conversations 
        WHERE user_id = ? 
        ORDER BY last_activity DESC 
        LIMIT ? OFFSET ?
      `, [userId, limit, offset], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }

        // Parse metadata for each conversation
        const conversations = rows.map(row => {
          try {
            row.metadata = JSON.parse(row.metadata || '{}');
          } catch (e) {
            row.metadata = {};
          }
          return row;
        });

        resolve(conversations);
      });
    });
  }

  /**
   * Get conversation by thread ID
   */
  async getConversationByThreadId(threadId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM conversations WHERE thread_id = ?',
        [threadId],
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }

          if (!row) {
            resolve(null);
            return;
          }

          // Parse metadata
          try {
            row.metadata = JSON.parse(row.metadata || '{}');
          } catch (e) {
            row.metadata = {};
          }

          resolve(row);
        }
      );
    });
  }

  /**
   * Delete conversation and its messages
   */
  async deleteConversation(conversationId) {
    return new Promise((resolve, reject) => {
      this.db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          reject(err);
          return;
        }

        // Delete messages first
        this.db.run('DELETE FROM messages WHERE conversation_id = ?', [conversationId], (err) => {
          if (err) {
            this.db.run('ROLLBACK');
            reject(err);
            return;
          }

          // Delete conversation
          this.db.run('DELETE FROM conversations WHERE id = ?', [conversationId], function(err) {
            if (err) {
              this.db.run('ROLLBACK');
              reject(err);
              return;
            }

            this.db.run('COMMIT', (err) => {
              if (err) {
                reject(err);
                return;
              }
              resolve(this.changes > 0);
            });
          });
        });
      });
    });
  }

  /**
   * Clean up old conversations
   */
  async cleanupOldConversations(maxAge = 24 * 60 * 60 * 1000) {
    return new Promise((resolve, reject) => {
      const cutoffTime = Date.now() - maxAge;
      const db = this.db; // Store reference to db before entering callbacks
      
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          reject(err);
          return;
        }

        // Delete old messages first
        db.run(`
          DELETE FROM messages 
          WHERE conversation_id IN (
            SELECT id FROM conversations WHERE last_activity < ?
          )
        `, [cutoffTime], (err) => {
          if (err) {
            db.run('ROLLBACK');
            reject(err);
            return;
          }

          // Delete old conversations
          db.run(
            'DELETE FROM conversations WHERE last_activity < ?',
            [cutoffTime],
            function(err) {
              if (err) {
                db.run('ROLLBACK');
                reject(err);
                return;
              }

              db.run('COMMIT', (err) => {
                if (err) {
                  reject(err);
                  return;
                }
                resolve(this.changes);
              });
            }
          );
        });
      });
    });
  }

  /**
   * Update message rating
   */
  async updateMessageRating(messageId, rating, comment = null) {
    return new Promise((resolve, reject) => {
      const timestamp = Date.now();
      this.db.run(
        'UPDATE messages SET rating = ?, rating_comment = ?, rating_timestamp = ? WHERE id = ?',
        [rating, comment, timestamp, messageId],
        function(err) {
          if (err) {
            reject(err);
            return;
          }
          resolve(this.changes > 0);
        }
      );
    });
  }

  /**
   * Get message rating
   */
  async getMessageRating(messageId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT rating, rating_comment, rating_timestamp FROM messages WHERE id = ?',
        [messageId],
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(row);
        }
      );
    });
  }

  /**
   * Clear message rating
   */
  async clearMessageRating(messageId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE messages SET rating = NULL, rating_comment = NULL, rating_timestamp = NULL WHERE id = ?',
        [messageId],
        function(err) {
          if (err) {
            reject(err);
            return;
          }
          resolve(this.changes > 0);
        }
      );
    });
  }

  /**
   * Get message by ID
   */
  async getMessageById(messageId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM messages WHERE id = ?',
        [messageId],
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }

          if (!row) {
            resolve(null);
            return;
          }

          // Parse metadata
          try {
            row.metadata = JSON.parse(row.metadata || '{}');
          } catch (e) {
            row.metadata = {};
          }

          resolve(row);
        }
      );
    });
  }

  /**
   * Get database statistics
   */
  async getStats() {
    return new Promise((resolve, reject) => {
      const queries = [
        'SELECT COUNT(*) as total_conversations FROM conversations',
        'SELECT COUNT(*) as total_messages FROM messages',
        'SELECT COUNT(*) as active_conversations FROM conversations WHERE last_activity > ?',
        'SELECT COUNT(*) as rated_messages FROM messages WHERE rating IS NOT NULL',
        'SELECT COUNT(*) as thumbs_up FROM messages WHERE rating = "thumbs_up"',
        'SELECT COUNT(*) as thumbs_down FROM messages WHERE rating = "thumbs_down"'
      ];

      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      
      Promise.all([
        new Promise((res, rej) => {
          this.db.get(queries[0], (err, row) => err ? rej(err) : res(row.total_conversations));
        }),
        new Promise((res, rej) => {
          this.db.get(queries[1], (err, row) => err ? rej(err) : res(row.total_messages));
        }),
        new Promise((res, rej) => {
          this.db.get(queries[2], [oneHourAgo], (err, row) => err ? rej(err) : res(row.active_conversations));
        }),
        new Promise((res, rej) => {
          this.db.get(queries[3], (err, row) => err ? rej(err) : res(row.rated_messages));
        }),
        new Promise((res, rej) => {
          this.db.get(queries[4], (err, row) => err ? rej(err) : res(row.thumbs_up));
        }),
        new Promise((res, rej) => {
          this.db.get(queries[5], (err, row) => err ? rej(err) : res(row.thumbs_down));
        })
      ]).then(([totalConversations, totalMessages, activeConversations, ratedMessages, thumbsUp, thumbsDown]) => {
        resolve({
          totalConversations,
          totalMessages,
          activeConversations,
          ratedMessages,
          thumbsUp,
          thumbsDown
        });
      }).catch(reject);
    });
  }

  /**
   * Add message with token data
   */
  async addMessageWithTokens(conversationId, text, sender, metadata = {}, tokenData = {}) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO messages (
          conversation_id, text, sender, timestamp, metadata,
          input_tokens, output_tokens, model_name, token_cost
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const timestamp = Date.now();
      const db = this.db; // Store reference to db before entering callback
      
      stmt.run([
        conversationId,
        text,
        sender,
        timestamp,
        JSON.stringify(metadata),
        tokenData.inputTokens || 0,
        tokenData.outputTokens || 0,
        tokenData.modelName || null,
        tokenData.cost || 0.0
      ], function(err) {
        if (err) {
          reject(err);
          return;
        }

        const messageId = this.lastID;

        // Update conversation totals and stats
        const updateStmt = db.prepare(`
          UPDATE conversations 
          SET message_count = message_count + 1, 
              last_activity = ?,
              total_input_tokens = total_input_tokens + ?,
              total_output_tokens = total_output_tokens + ?,
              total_cost = total_cost + ?,
              model_name = COALESCE(?, model_name)
          WHERE id = ?
        `);

        updateStmt.run([
          timestamp, 
          tokenData.inputTokens || 0,
          tokenData.outputTokens || 0,
          tokenData.cost || 0.0,
          tokenData.modelName,
          conversationId
        ], (updateErr) => {
          if (updateErr) {
            console.error('Error updating conversation stats:', updateErr);
          }
        });

        updateStmt.finalize();
        resolve(messageId);
      });

      stmt.finalize();
    });
  }

  /**
   * Update conversation token totals
   */
  async updateConversationTokens(conversationId, inputTokens, outputTokens, cost, modelName = null) {
    return new Promise((resolve, reject) => {
      this.db.run(`
        UPDATE conversations 
        SET total_input_tokens = total_input_tokens + ?,
            total_output_tokens = total_output_tokens + ?,
            total_cost = total_cost + ?,
            model_name = COALESCE(?, model_name),
            last_activity = ?
        WHERE id = ?
      `, [inputTokens, outputTokens, cost, modelName, Date.now(), conversationId], function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.changes > 0);
      });
    });
  }

  /**
   * Get conversation token usage
   */
  async getConversationTokenUsage(conversationId) {
    return new Promise((resolve, reject) => {
      this.db.get(`
        SELECT total_input_tokens, total_output_tokens, total_cost, model_name
        FROM conversations 
        WHERE id = ?
      `, [conversationId], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row || {
          total_input_tokens: 0,
          total_output_tokens: 0,
          total_cost: 0.0,
          model_name: null
        });
      });
    });
  }

  /**
   * Get user token usage statistics
   */
  async getUserTokenUsage(userId, timeframe = null) {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT 
          SUM(total_input_tokens) as total_input_tokens,
          SUM(total_output_tokens) as total_output_tokens,
          SUM(total_cost) as total_cost,
          COUNT(*) as conversation_count
        FROM conversations 
        WHERE user_id = ?
      `;
      
      const params = [userId];
      
      if (timeframe) {
        query += ' AND created_at > ?';
        params.push(Date.now() - timeframe);
      }

      this.db.get(query, params, (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row || {
          total_input_tokens: 0,
          total_output_tokens: 0,
          total_cost: 0.0,
          conversation_count: 0
        });
      });
    });
  }

  /**
   * Get token usage by model
   */
  async getTokenUsageByModel(userId = null, timeframe = null) {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT 
          model_name,
          SUM(total_input_tokens) as total_input_tokens,
          SUM(total_output_tokens) as total_output_tokens,
          SUM(total_cost) as total_cost,
          COUNT(*) as conversation_count
        FROM conversations 
        WHERE model_name IS NOT NULL
      `;
      
      const params = [];
      
      if (userId) {
        query += ' AND user_id = ?';
        params.push(userId);
      }
      
      if (timeframe) {
        query += ' AND created_at > ?';
        params.push(Date.now() - timeframe);
      }
      
      query += ' GROUP BY model_name ORDER BY total_cost DESC';

      this.db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows || []);
      });
    });
  }

  /**
   * Get message token details
   */
  async getMessageTokens(messageId) {
    return new Promise((resolve, reject) => {
      this.db.get(`
        SELECT input_tokens, output_tokens, model_name, token_cost
        FROM messages 
        WHERE id = ?
      `, [messageId], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row || {
          input_tokens: 0,
          output_tokens: 0,
          model_name: null,
          token_cost: 0.0
        });
      });
    });
  }

  /**
   * Update message token data
   */
  async updateMessageTokens(messageId, inputTokens, outputTokens, modelName, cost) {
    return new Promise((resolve, reject) => {
      this.db.run(`
        UPDATE messages 
        SET input_tokens = ?, output_tokens = ?, model_name = ?, token_cost = ?
        WHERE id = ?
      `, [inputTokens, outputTokens, modelName, cost, messageId], function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.changes > 0);
      });
    });
  }

  /**
   * Get enhanced database statistics including token usage
   */
  async getEnhancedStats() {
    return new Promise((resolve, reject) => {
      const queries = [
        'SELECT COUNT(*) as total_conversations FROM conversations',
        'SELECT COUNT(*) as total_messages FROM messages',
        'SELECT COUNT(*) as active_conversations FROM conversations WHERE last_activity > ?',
        'SELECT COUNT(*) as rated_messages FROM messages WHERE rating IS NOT NULL',
        'SELECT COUNT(*) as thumbs_up FROM messages WHERE rating = "thumbs_up"',
        'SELECT COUNT(*) as thumbs_down FROM messages WHERE rating = "thumbs_down"',
        'SELECT SUM(total_input_tokens) as total_input_tokens FROM conversations',
        'SELECT SUM(total_output_tokens) as total_output_tokens FROM conversations',
        'SELECT SUM(total_cost) as total_cost FROM conversations'
      ];

      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      
      Promise.all([
        new Promise((res, rej) => {
          this.db.get(queries[0], (err, row) => err ? rej(err) : res(row.total_conversations));
        }),
        new Promise((res, rej) => {
          this.db.get(queries[1], (err, row) => err ? rej(err) : res(row.total_messages));
        }),
        new Promise((res, rej) => {
          this.db.get(queries[2], [oneHourAgo], (err, row) => err ? rej(err) : res(row.active_conversations));
        }),
        new Promise((res, rej) => {
          this.db.get(queries[3], (err, row) => err ? rej(err) : res(row.rated_messages));
        }),
        new Promise((res, rej) => {
          this.db.get(queries[4], (err, row) => err ? rej(err) : res(row.thumbs_up));
        }),
        new Promise((res, rej) => {
          this.db.get(queries[5], (err, row) => err ? rej(err) : res(row.thumbs_down));
        }),
        new Promise((res, rej) => {
          this.db.get(queries[6], (err, row) => err ? rej(err) : res(row.total_input_tokens || 0));
        }),
        new Promise((res, rej) => {
          this.db.get(queries[7], (err, row) => err ? rej(err) : res(row.total_output_tokens || 0));
        }),
        new Promise((res, rej) => {
          this.db.get(queries[8], (err, row) => err ? rej(err) : res(row.total_cost || 0));
        })
      ]).then(([totalConversations, totalMessages, activeConversations, ratedMessages, thumbsUp, thumbsDown, totalInputTokens, totalOutputTokens, totalCost]) => {
        resolve({
          totalConversations,
          totalMessages,
          activeConversations,
          ratedMessages,
          thumbsUp,
          thumbsDown,
          totalInputTokens,
          totalOutputTokens,
          totalCost
        });
      }).catch(reject);
    });
  }

  /**
   * Close database connection
   */
  async close() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          console.log('✅ Database connection closed');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

// Export singleton instance
module.exports = new DatabaseManager();
