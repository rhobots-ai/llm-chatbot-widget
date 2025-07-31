const config = require('../config/environment');

/**
 * Metabase API Client
 * Handles communication with Metabase API to fetch question queries
 */
class MetabaseClient {
  constructor() {
    this.baseUrl = process.env.METABASE_BASE_URL || 'https://metabase2.progfin.com';
    this.apiKey = process.env.METABASE_API_KEY || null;
    this.cache = new Map(); // Simple in-memory cache
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Fetch question data from Metabase API
   * @param {string|number} questionId - The question ID from the URL
   * @returns {Promise<Object>} Question data with query
   */
  async getQuestion(questionId) {
    try {
      // Validate question ID
      const id = parseInt(questionId);
      if (isNaN(id) || id <= 0) {
        throw new Error('Invalid question ID format');
      }

      // Check cache first
      const cacheKey = `question_${id}`;
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        console.log(`📋 Returning cached Metabase question ${id}`);
        return cached.data;
      }

      console.log(`🔍 Fetching Metabase question ${id} from API`);

      // Prepare request headers
      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'ChatbotWidget/1.0'
      };

      // Add API key if available
      if (this.apiKey) {
        headers['X-Metabase-Session'] = this.apiKey;
      }

      // Make API request
      const url = `${this.baseUrl}/api/card/${id}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: headers,
        timeout: 10000 // 10 second timeout
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Question ${id} not found`);
        } else if (response.status === 403) {
          throw new Error('Access denied to Metabase question');
        } else if (response.status === 401) {
          throw new Error('Authentication required for Metabase API');
        } else {
          throw new Error(`Metabase API error: ${response.status} ${response.statusText}`);
        }
      }

      const data = await response.json();

      // Extract query from response
      const query = this.extractQuery(data);
      
      const result = {
        id: data.id,
        name: data.name,
        description: data.description,
        query: query,
        database: data.database_id,
        created: data.created_at,
        updated: data.updated_at
      };

      // Cache the result
      this.cache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });

      // Clean up old cache entries
      this.cleanupCache();

      console.log(`✅ Successfully fetched Metabase question ${id}: "${data.name}"`);
      return result;

    } catch (error) {
      console.error(`❌ Error fetching Metabase question ${questionId}:`, error.message);
      throw error;
    }
  }

  /**
   * Extract SQL query from Metabase question data
   * @param {Object} questionData - Raw question data from Metabase API
   * @returns {string|null} SQL query or null if not found
   */
  extractQuery(questionData) {
    try {
      // Check for native query (SQL)
      if (questionData.dataset_query && 
          questionData.dataset_query.native && 
          questionData.dataset_query.native.query) {
        return questionData.dataset_query.native.query.trim();
      }

      // Check for structured query (GUI-built queries)
      if (questionData.dataset_query && 
          questionData.dataset_query.query) {
        // For structured queries, we can't easily convert to SQL
        // Return a description instead
        return `-- This is a structured query built using Metabase's GUI
-- Query type: ${questionData.dataset_query.type || 'query'}
-- Database: ${questionData.database_id}
-- Table: ${questionData.dataset_query.query.source_table || 'unknown'}`;
      }

      return null;
    } catch (error) {
      console.error('Error extracting query from Metabase data:', error);
      return null;
    }
  }

  /**
   * Clean up old cache entries
   */
  cleanupCache() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.cacheTimeout) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cached data
   */
  clearCache() {
    this.cache.clear();
    console.log('🧹 Metabase cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      timeout: this.cacheTimeout,
      entries: Array.from(this.cache.keys())
    };
  }

  /**
   * Test connection to Metabase API
   */
  async testConnection() {
    try {
      const url = `${this.baseUrl}/api/health`;
      const response = await fetch(url, {
        method: 'GET',
        timeout: 5000
      });

      return {
        success: response.ok,
        status: response.status,
        baseUrl: this.baseUrl,
        hasApiKey: !!this.apiKey
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        baseUrl: this.baseUrl,
        hasApiKey: !!this.apiKey
      };
    }
  }
}

// Create singleton instance
const metabaseClient = new MetabaseClient();

module.exports = metabaseClient;
