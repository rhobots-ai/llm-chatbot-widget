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
          provider TEXT DEFAULT 'openai',
          assistant_id TEXT,
          assistant_type TEXT DEFAULT 'default',
          created_at INTEGER,
          last_activity INTEGER,
          message_count INTEGER DEFAULT 0,
          metadata TEXT
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
          FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE
        )
      `;

      const createIndexes = `
        CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
        CREATE INDEX IF NOT EXISTS idx_conversations_thread_id ON conversations(thread_id);
        CREATE INDEX IF NOT EXISTS idx_conversations_last_activity ON conversations(last_activity);
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

            console.log('✅ Database tables created successfully');
            resolve();
          });
        });
      });
    });
  }

  /**
   * Create a new conversation
   */
  async createConversation(conversationId, userId = null, metadata = {}) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO conversations (
          id, user_id, created_at, last_activity, metadata
        ) VALUES (?, ?, ?, ?, ?)
      `);

      const now = Date.now();
      stmt.run([
        conversationId,
        userId,
        now,
        now,
        JSON.stringify(metadata)
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
   * Get database statistics
   */
  async getStats() {
    return new Promise((resolve, reject) => {
      const queries = [
        'SELECT COUNT(*) as total_conversations FROM conversations',
        'SELECT COUNT(*) as total_messages FROM messages',
        'SELECT COUNT(*) as active_conversations FROM conversations WHERE last_activity > ?'
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
        })
      ]).then(([totalConversations, totalMessages, activeConversations]) => {
        resolve({
          totalConversations,
          totalMessages,
          activeConversations
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
