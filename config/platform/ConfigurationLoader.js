/**
 * ========================================================================
 * CONFIGURATION LOADER - ZERO HARDCODED LOGIC
 * ========================================================================
 * Loads all platform configuration from YAML files
 * Enables domain-specific customization without code changes
 * ========================================================================
 */

import fs from 'fs';
import yaml from 'js-yaml';
import logger from '../utils/logger.js';

export class ConfigurationLoader {
  constructor(configPath = './config/platform.yaml') {
    this.configPath = configPath;
    this.platformConfig = null;
    this.agentTypes = new Map();
    this.scenarioPatterns = [];
    this.whatIfTriggers = { user: [], autonomous: [] };
    this.behavior = {};
  }

  /**
   * Load all configuration from YAML
   */
  async loadConfiguration() {
    logger.info('Loading platform configuration...');
    
    try {
      // Check if config file exists
      if (!fs.existsSync(this.configPath)) {
        throw new Error(`Configuration file not found: ${this.configPath}`);
      }

      // Load and parse YAML
      const fileContent = fs.readFileSync(this.configPath, 'utf8');
      this.platformConfig = yaml.load(fileContent);
      
      // Validate configuration structure
      this.validateConfiguration();
      
      // Load agent types
      this.loadAgentTypes();
      
      // Load scenario patterns
      this.loadScenarioPatterns();
      
      // Load What-If triggers
      this.loadWhatIfTriggers();
      
      // Load behavior settings
      this.loadBehaviorSettings();
      
      logger.info('✅ Platform configuration loaded successfully');
      logger.info(`   Domain: ${this.platformConfig.platform.domain}`);
      logger.info(`   Agent Types: ${this.agentTypes.size}`);
      logger.info(`   Scenario Patterns: ${this.scenarioPatterns.length}`);
      logger.info(`   What-If Triggers: ${this.whatIfTriggers.user.length} user, ${this.whatIfTriggers.autonomous.length} autonomous`);
      
      return true;
      
    } catch (error) {
      logger.error(`Failed to load platform configuration: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate configuration structure
   */
  validateConfiguration() {
    if (!this.platformConfig) {
      throw new Error('Configuration is empty');
    }

    if (!this.platformConfig.platform) {
      throw new Error('Missing "platform" section in configuration');
    }

    if (!this.platformConfig.agentTypes) {
      throw new Error('Missing "agentTypes" section in configuration');
    }

    logger.debug('Configuration structure validated');
  }

  /**
   * Load agent type definitions
   */
  loadAgentTypes() {
    const agentTypes = this.platformConfig.agentTypes || {};
    
    for (const [typeName, typeConfig] of Object.entries(agentTypes)) {
      this.agentTypes.set(typeName, {
        name: typeName,
        description: typeConfig.description || '',
        capabilities: typeConfig.capabilities || [],
        whatIfPrompt: typeConfig.whatIfPrompt || ''
      });
      
      logger.debug(`Loaded agent type: ${typeName}`);
    }
  }

  /**
   * Load scenario pattern definitions
   */
  loadScenarioPatterns() {
    this.scenarioPatterns = this.platformConfig.scenarioPatterns || [];
    
    // Compile regex patterns for performance
    this.scenarioPatterns.forEach(pattern => {
      if (pattern.keywords && pattern.keywords.length > 0) {
        pattern.compiledRegex = new RegExp(pattern.keywords.join('|'), 'i');
      }
    });
    
    logger.debug(`Loaded ${this.scenarioPatterns.length} scenario patterns`);
  }

  /**
   * Load What-If trigger patterns
   */
  loadWhatIfTriggers() {
    const triggers = this.platformConfig.whatIfTriggers || {};
    
    this.whatIfTriggers.user = (triggers.userPatterns || []).map(t => ({
      pattern: t.pattern,
      language: t.language || 'en',
      description: t.description || '',
      compiledRegex: new RegExp(t.pattern, 'i')
    }));
    
    this.whatIfTriggers.autonomous = triggers.autonomousRules || [];
    
    logger.debug(`Loaded ${this.whatIfTriggers.user.length} user trigger patterns`);
  }

  /**
   * Load behavior settings
   */
  loadBehaviorSettings() {
    this.behavior = this.platformConfig.behavior || {};
    logger.debug('Loaded behavior settings');
  }

  /**
   * Get agent type configuration
   */
  getAgentType(typeName) {
    return this.agentTypes.get(typeName);
  }

  /**
   * Get all agent types
   */
  getAllAgentTypes() {
    return Array.from(this.agentTypes.keys());
  }

  /**
   * Get scenario patterns
   */
  getScenarioPatterns() {
    return this.scenarioPatterns;
  }

  /**
   * Get What-If triggers
   */
  getWhatIfTriggers() {
    return this.whatIfTriggers;
  }

  /**
   * Get behavior settings
   */
  getBehaviorSettings() {
    return this.behavior;
  }

  /**
   * Get platform info
   */
  getPlatformInfo() {
    return this.platformConfig.platform;
  }

  /**
   * Reload configuration (for runtime updates)
   */
  async reload() {
    logger.info('Reloading platform configuration...');
    return await this.loadConfiguration();
  }
}