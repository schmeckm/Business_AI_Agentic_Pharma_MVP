/**
 * ========================================================================
 * PLATFORM ENGINE - CONFIGURATION-DRIVEN LOGIC
 * ========================================================================
 * Replaces ALL hardcoded business logic with configuration-driven behavior
 * This is the heart of the open platform - no domain logic in code!
 * ========================================================================
 */

import logger from '../utils/logger.js';
import { ConfigurationLoader } from './ConfigurationLoader.js';

export class PlatformEngine {
  constructor(configPath) {
    this.configLoader = new ConfigurationLoader(configPath);
    this.config = null;
    this.initialized = false;
  }

  /**
   * Initialize platform engine
   */
  async initialize() {
    if (this.initialized) {
      logger.debug('Platform engine already initialized');
      return;
    }

    await this.configLoader.loadConfiguration();
    this.config = this.configLoader.getPlatformInfo();
    this.initialized = true;
    
    logger.info('✅ Platform Engine initialized');
    logger.info(`   Platform: ${this.config.name}`);
    logger.info(`   Domain: ${this.config.domain}`);
  }

  /**
   * Ensure platform is initialized
   */
  ensureInitialized() {
    if (!this.initialized) {
      throw new Error('Platform engine not initialized. Call initialize() first.');
    }
  }

  /**
   * Classify agent based on configuration
   * REPLACES: Hardcoded AgentTypeClassifier.classifyAgent()
   */
  classifyAgent(agent) {
    this.ensureInitialized();

    // If agent explicitly declares type, use it
    if (agent.agentType) {
      const typeConfig = this.configLoader.getAgentType(agent.agentType);
      if (typeConfig) {
        logger.debug(`Agent ${agent.id}: Using explicit type '${agent.agentType}'`);
        return {
          type: agent.agentType,
          config: typeConfig,
          source: 'explicit'
        };
      } else {
        logger.warn(`Agent ${agent.id}: Unknown agent type '${agent.agentType}', using fallback`);
      }
    }

    // Fallback to data_collector as default
    const fallbackType = 'data_collector';
    const fallbackConfig = this.configLoader.getAgentType(fallbackType);
    
    logger.debug(`Agent ${agent.id}: Using fallback type '${fallbackType}'`);
    
    return {
      type: fallbackType,
      config: fallbackConfig,
      source: 'fallback'
    };
  }

  /**
   * Check if message is a What-If query
   * REPLACES: Hardcoded WhatIfAnalyzer.isWhatIfQuery()
   */
  isWhatIfQuery(message) {
    this.ensureInitialized();

    const triggers = this.configLoader.getWhatIfTriggers().user;
    
    for (const trigger of triggers) {
      if (trigger.compiledRegex.test(message)) {
        logger.debug(`What-If detected via pattern: ${trigger.pattern} (${trigger.language})`);
        return true;
      }
    }
    
    return false;
  }

  /**
   * Extract scenario from message
   * REPLACES: Hardcoded WhatIfAnalyzer.extractScenario()
   */
  extractScenario(message, availableAgents) {
    this.ensureInitialized();

    const patterns = this.configLoader.getScenarioPatterns();
    
    // Try to match against configured patterns
    for (const pattern of patterns) {
      if (pattern.compiledRegex && pattern.compiledRegex.test(message)) {
        const affectedAgents = this.selectAgentsForScenario(pattern, availableAgents);
        
        logger.info(`✅ Scenario matched: ${pattern.name}`);
        logger.debug(`   Selected agents: ${affectedAgents.map(a => a.id).join(', ')}`);
        
        return {
          type: pattern.name,
          original: message,
          pattern: pattern,
          affectedAgents: affectedAgents
        };
      }
    }

    // No pattern matched - use general fallback
    const generalPattern = patterns.find(p => p.name === 'general');
    const affectedAgents = this.selectAgentsForScenario(
      generalPattern || { agentSelection: { fallback: 'all', maxAgents: 2 } },
      availableAgents
    );
    
    logger.info('No specific pattern matched, using general scenario');
    logger.debug(`   Selected agents: ${affectedAgents.map(a => a.id).join(', ')}`);
    
    return {
      type: 'general',
      original: message,
      pattern: generalPattern,
      affectedAgents: affectedAgents
    };
  }

  /**
   * Select agents for scenario based on configuration
   */
  selectAgentsForScenario(pattern, availableAgents) {
    const selection = pattern.agentSelection || {};
    let selectedAgents = [];

    // Method 1: Tag matching
    if (selection.method === 'tag_match' && selection.tags) {
      selectedAgents = availableAgents.filter(agent => {
        const agentTags = agent.tags || [];
        return selection.tags.some(tag => agentTags.includes(tag));
      });
      
      logger.debug(`Tag match found ${selectedAgents.length} agents`);
    }

    // Method 2: Proactive first (find proactive agents)
    if (selection.method === 'proactive_first' && selectedAgents.length === 0) {
      selectedAgents = availableAgents.filter(agent => {
        const classification = this.classifyAgent(agent);
        return classification.type === 'proactive';
      });
      
      logger.debug(`Proactive-first found ${selectedAgents.length} agents`);
    }

    // Fallback 1: Use specific agent IDs
    if (selectedAgents.length === 0 && Array.isArray(selection.fallback)) {
      selectedAgents = availableAgents.filter(agent => 
        selection.fallback.includes(agent.id)
      );
      
      logger.debug(`Fallback agent IDs matched ${selectedAgents.length} agents`);
    }

    // Fallback 2: Use all agents (or first N)
    if (selectedAgents.length === 0 && selection.fallback === 'all') {
      selectedAgents = availableAgents;
      logger.debug('Using all available agents as fallback');
    }

    // Apply max agents limit
    const maxAgents = selection.maxAgents || this.getBehaviorSetting('whatIfAnalysis.maxAgentsPerAnalysis', 5);
    if (selectedAgents.length > maxAgents) {
      selectedAgents = selectedAgents.slice(0, maxAgents);
      logger.debug(`Limited to ${maxAgents} agents`);
    }

    // Ensure minimum agents
    const minAgents = this.getBehaviorSetting('whatIfAnalysis.minAgents', 1);
    if (selectedAgents.length === 0 && availableAgents.length > 0) {
      selectedAgents = availableAgents.slice(0, minAgents);
      logger.warn(`No agents matched, using first ${minAgents} agent(s) as emergency fallback`);
    }

    return selectedAgents;
  }

  /**
   * Get What-If prompt for agent type
   * REPLACES: Hardcoded What-If prompts
   */
  getWhatIfPrompt(agentType, scenario, data = {}) {
    this.ensureInitialized();

    const typeConfig = this.configLoader.getAgentType(agentType);
    
    if (!typeConfig || !typeConfig.whatIfPrompt) {
      logger.warn(`No What-If prompt found for agent type: ${agentType}`);
      return `Analyze this scenario: ${scenario}\n\nAvailable data: ${JSON.stringify(data)}`;
    }

    // Replace template variables
    let prompt = typeConfig.whatIfPrompt
      .replace(/{scenario}/g, scenario)
      .replace(/{data}/g, JSON.stringify(data, null, 2))
      .replace(/{realtimeOEE}/g, JSON.stringify(data.realtimeOEE || {}, null, 2))
      .replace(/{previousPredictions}/g, JSON.stringify(data.previousPredictions || {}, null, 2));

    return prompt;
  }

  /**
   * Get behavior setting with fallback
   */
  getBehaviorSetting(path, defaultValue) {
    const behavior = this.configLoader.getBehaviorSettings();
    
    // Support dot notation (e.g., "whatIfAnalysis.maxAgentsPerAnalysis")
    const keys = path.split('.');
    let value = behavior;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return defaultValue;
      }
    }
    
    return value !== undefined ? value : defaultValue;
  }

  /**
   * Get all configuration (for debugging/API)
   */
  getConfiguration() {
    this.ensureInitialized();
    
    return {
      platform: this.config,
      agentTypes: this.configLoader.getAllAgentTypes(),
      scenarioPatterns: this.configLoader.getScenarioPatterns().map(p => p.name),
      behavior: this.configLoader.getBehaviorSettings()
    };
  }

  /**
   * Reload configuration (for runtime updates)
   */
  async reload() {
    logger.info('Reloading platform configuration...');
    await this.configLoader.reload();
    this.config = this.configLoader.getPlatformInfo();
    logger.info('✅ Platform configuration reloaded');
  }
}