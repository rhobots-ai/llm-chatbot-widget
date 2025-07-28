const OpenAIProvider = require('./openai');

/**
 * Provider Factory
 * Manages creation and initialization of AI providers
 */
class ProviderFactory {
  constructor() {
    this.providers = new Map();
    this.registeredProviders = {
      'openai': OpenAIProvider
    };
  }

  /**
   * Register a new provider class
   * @param {string} name - Provider name
   * @param {Class} ProviderClass - Provider class
   */
  registerProvider(name, ProviderClass) {
    this.registeredProviders[name] = ProviderClass;
  }

  /**
   * Create and initialize a provider
   * @param {string} providerName - Name of the provider
   * @param {Object} config - Provider configuration
   * @returns {Promise<BaseProvider>} - Initialized provider instance
   */
  async createProvider(providerName, config) {
    const ProviderClass = this.registeredProviders[providerName];
    
    if (!ProviderClass) {
      throw new Error(`Unknown provider: ${providerName}`);
    }

    // Check if provider is already initialized
    const cacheKey = `${providerName}_${JSON.stringify(config)}`;
    if (this.providers.has(cacheKey)) {
      return this.providers.get(cacheKey);
    }

    // Create and initialize new provider
    const provider = new ProviderClass(config);
    await provider.initialize(config);
    
    // Cache the provider
    this.providers.set(cacheKey, provider);
    
    return provider;
  }

  /**
   * Get available provider names
   * @returns {Array<string>} - List of available provider names
   */
  getAvailableProviders() {
    return Object.keys(this.registeredProviders);
  }

  /**
   * Get provider capabilities
   * @param {string} providerName - Provider name
   * @returns {Object} - Provider capabilities
   */
  getProviderCapabilities(providerName) {
    const ProviderClass = this.registeredProviders[providerName];
    if (!ProviderClass) {
      throw new Error(`Unknown provider: ${providerName}`);
    }

    // Create temporary instance to get capabilities
    const tempProvider = new ProviderClass({});
    return tempProvider.getCapabilities();
  }

  /**
   * Clear provider cache
   */
  clearCache() {
    this.providers.clear();
  }
}

// Export singleton instance
module.exports = new ProviderFactory();
