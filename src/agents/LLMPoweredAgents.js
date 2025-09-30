/**
 * ========================================================================
 * LLM-POWERED MULTI-TYPE AGENTS WITH WHAT-IF ANALYSIS
 * ========================================================================
 * 
 * Professional agent system with automatic type classification and
 * scenario analysis capabilities for pharmaceutical manufacturing.
 * 
 * Features:
 * - Automatic agent type classification (5 types)
 * - What-If scenario analysis with multi-agent perspectives
 * - Professional Winston logging
 * - No separate business rule engine - all via Claude LLM
 * - Full integration with existing YAML configuration
 * 
 * Agent Types:
 * - data_collection: Collects and monitors data
 * - rule_based: Applies rules via LLM interpretation
 * - collaborative: Coordinates with other agents
 * - proactive: Goal-oriented planning and optimization
 * - learning: Learns from historical patterns
 * 
 * @module LLMPoweredAgents
 * @version 2.0.0
 * @author Markus Schmeckenbecher
 * ========================================================================
 */

import { EventEmitter } from 'events';
import logger from '../utils/logger.js';

// ========================================================================
// AGENT TYPE CLASSIFIER
// ========================================================================

/**
 * Classifies agents based on their behavior patterns
 * 
 * Automatically determines agent type by analyzing:
 * - Agent ID patterns
 * - Configuration structure
 * - Prompt template content
 * - Data source usage
 */
export class AgentTypeClassifier {
  /**
   * @param {Object} agentManager - The AgentManager instance
   */
  constructor(agentManager) {
    this.agentManager = agentManager;
    this.agents = new Map();
  }

  /**
   * Classify a single agent based on its characteristics
   * 
   * @param {Object} agent - Agent configuration from YAML
   * @returns {Object} Classification result with type and characteristics
   */
  classifyAgent(agent) {
    const agentId = agent.id;
    let type = 'basic';
    let characteristics = [];
    
    // Check for explicit type definition in YAML
    if (agent.agentType) {
      type = agent.agentType;
      characteristics.push(`Explicitly defined as ${type}`);
      logger.debug(`Agent ${agentId}: Using explicit type '${type}'`);
    }
    // Automatic classification based on behavior patterns
    else if (this.isDataCollector(agent)) {
      type = 'data_collection';
      characteristics.push('Collects and monitors data');
      characteristics.push('No decision logic');
    }
    else if (this.isRuleBased(agent)) {
      type = 'rule_based';
      characteristics.push('Follows clear rules via LLM');
      characteristics.push('Deterministic decisions');
    }
    else if (this.isCollaborative(agent)) {
      type = 'collaborative';
      characteristics.push('Coordinates with other agents via LLM');
      characteristics.push('Multi-agent workflows');
    }
    else if (this.isProactive(agent)) {
      type = 'proactive';
      characteristics.push('Goal-oriented with LLM planning');
      characteristics.push('Creates alternatives');
    }
    else if (this.isLearning(agent)) {
      type = 'learning';
      characteristics.push('Learns from outcomes via LLM');
      characteristics.push('Pattern recognition');
    }
    
    this.agents.set(agentId, {
      agent: agent,
      type: type,
      characteristics: characteristics
    });
    
    logger.debug(`Agent ${agentId} classified as '${type}'`);
    return { type, characteristics };
  }

  /**
   * Check if agent is a data collector
   * @private
   */
  isDataCollector(agent) {
    const indicators = [
      agent.id?.includes('monitor'),
      agent.id?.includes('status'),
      agent.name?.toLowerCase().includes('monitoring'),
      agent.description?.toLowerCase().includes('collect'),
      agent.description?.toLowerCase().includes('track')
    ];
    return indicators.filter(Boolean).length >= 2;
  }

  /**
   * Check if agent is rule-based
   * @private
   */
  isRuleBased(agent) {
    const indicators = [
      agent.id?.includes('compliance'),
      agent.id?.includes('assessment'),
      agent.id?.includes('alert'),
      agent.promptTemplate?.toLowerCase().includes('rule'),
      agent.promptTemplate?.toLowerCase().includes('if '),
      agent.promptTemplate?.toLowerCase().includes('threshold')
    ];
    return indicators.filter(Boolean).length >= 2;
  }

  /**
   * Check if agent is collaborative
   * @private
   */
  isCollaborative(agent) {
    const indicators = [
      agent.id?.includes('briefing'),
      agent.id?.includes('coordination'),
      agent.events?.publishes?.length > 0,
      agent.a2aCapabilities?.length > 0,
      agent.dataSource?.length > 2,
      agent.promptTemplate?.toLowerCase().includes('coordinate')
    ];
    return indicators.filter(Boolean).length >= 2;
  }

  /**
   * Check if agent is proactive
   * @private
   */
  isProactive(agent) {
    const indicators = [
      agent.id?.includes('scheduler'),
      agent.id?.includes('planner'),
      agent.id?.includes('order'),
      agent.id?.includes('optimizer'),
      agent.promptTemplate?.toLowerCase().includes('optimize'),
      agent.promptTemplate?.toLowerCase().includes('recommend'),
      agent.promptTemplate?.toLowerCase().includes('alternative')
    ];
    return indicators.filter(Boolean).length >= 2;
  }

  /**
   * Check if agent is learning
   * @private
   */
  isLearning(agent) {
    const indicators = [
      agent.id?.includes('predict'),
      agent.id?.includes('learn'),
      agent.promptTemplate?.toLowerCase().includes('learn from'),
      agent.promptTemplate?.toLowerCase().includes('historical'),
      agent.promptTemplate?.toLowerCase().includes('pattern'),
      agent.description?.toLowerCase().includes('adaptive')
    ];
    return indicators.filter(Boolean).length >= 2;
  }

  /**
   * Get statistics about agent type distribution
   * 
   * @returns {Object} Statistics object with counts per type
   */
  getStatistics() {
    const stats = {
      total: this.agents.size,
      data_collection: 0,
      rule_based: 0,
      collaborative: 0,
      proactive: 0,
      learning: 0,
      basic: 0
    };
    
    for (const [_, { type }] of this.agents) {
      stats[type]++;
    }
    
    return stats;
  }
}

// ========================================================================
// AGENT TYPE ENHANCER
// ========================================================================

/**
 * Enhances AgentManager with type-aware capabilities
 * 
 * Provides methods to classify agents, query by type,
 * and get detailed type information.
 */
export class AgentTypeEnhancer {
  /**
   * @param {Object} agentManager - The AgentManager instance
   */
  constructor(agentManager) {
    this.agentManager = agentManager;
    this.classifier = new AgentTypeClassifier(agentManager);
  }

  /**
   * Classify all loaded agents and log results
   */
  classifyAllAgents() {
    logger.info('Starting agent type classification...');
    
    for (const agent of this.agentManager.agents) {
      const classification = this.classifier.classifyAgent(agent);
      
      logger.info(`Agent: ${agent.id} | Type: ${classification.type} | ${classification.characteristics.join(', ')}`);
    }
    
    const stats = this.classifier.getStatistics();
    logger.info('Agent Type Distribution:');
    logger.info(`  Total: ${stats.total}`);
    logger.info(`  Data Collection: ${stats.data_collection}`);
    logger.info(`  Rule-Based: ${stats.rule_based}`);
    logger.info(`  Collaborative: ${stats.collaborative}`);
    logger.info(`  Proactive: ${stats.proactive}`);
    logger.info(`  Learning: ${stats.learning}`);
    logger.info(`  Basic: ${stats.basic}`);
  }

  /**
   * Get type information for a specific agent
   * 
   * @param {string} agentId - The agent ID
   * @returns {Object|undefined} Agent type info or undefined
   */
  getAgentTypeInfo(agentId) {
    return this.classifier.agents.get(agentId);
  }

  /**
   * Get all agents of a specific type
   * 
   * @param {string} type - The agent type to filter by
   * @returns {Array} Array of agents matching the type
   */
  getAgentsByType(type) {
    const agents = [];
    
    for (const [agentId, info] of this.classifier.agents) {
      if (info.type === type) {
        agents.push({
          id: agentId,
          name: info.agent.name,
          characteristics: info.characteristics
        });
      }
    }
    
    logger.debug(`Found ${agents.length} agents of type '${type}'`);
    return agents;
  }
}

// ========================================================================
// WHAT-IF ANALYZER
// ========================================================================

/**
 * What-If Scenario Analyzer
 * 
 * Analyzes hypothetical scenarios using multiple agents
 * to provide comprehensive multi-perspective assessments.
 * 
 * Supported scenario types:
 * - Production delays
 * - Material shortages
 * - Process parameter changes
 * - Quality issues
 * - Compliance scenarios
 */
export class WhatIfAnalyzer {
  /**
   * @param {Object} agentManager - The AgentManager instance
   * @param {Object} agentEnhancer - The AgentTypeEnhancer instance
   */
  constructor(agentManager, agentEnhancer) {
    this.agentManager = agentManager;
    this.agentEnhancer = agentEnhancer;
    logger.info('What-If Analyzer initialized');
  }

  /**
   * Check if a message is a What-If query
   * 
   * @param {string} message - User message to check
   * @returns {boolean} True if message is a what-if query
   */
  isWhatIfQuery(message) {
    const patterns = [
      /what\s+if/i,
      /was\s+wäre\s+wenn/i,
      /suppose/i,
      /angenommen/i,
      /scenario/i,
      /szenario/i,
      /alternative/i
    ];
    
    const isWhatIf = patterns.some(p => p.test(message));
    
    if (isWhatIf) {
      logger.debug(`What-If query detected: "${message}"`);
    }
    
    return isWhatIf;
  }

  /**
   * Extract scenario type and affected agents from message
   * 
   * @param {string} message - User message
   * @returns {Object} Scenario information
   */
  extractScenario(message) {
    const scenario = {
      original: message,
      type: 'general',
      affectedAgents: []
    };

    // Get all available agent IDs dynamically
    const availableAgents = this.agentManager.agents.map(a => a.id);
    logger.debug(`Available agents: ${availableAgents.join(', ')}`);

    // Classify scenario type based on keywords
    if (/oee|equipment\s+effectiveness|availability|performance/i.test(message)) {
      scenario.type = 'oee_issue';
      // Look for OEE-related agents
      scenario.affectedAgents = availableAgents.filter(id => 
        id.includes('oee') || id.includes('equipment')
      );
      logger.debug('Scenario type: oee_issue');
    }
    else if (/delay|postpone|verschieben|verschoben|schedule/i.test(message)) {
      scenario.type = 'delay';
      // Look for planning/production agents
      scenario.affectedAgents = availableAgents.filter(id => 
        id.includes('order') || id.includes('planning') || id.includes('production') || id.includes('briefing')
      );
      logger.debug('Scenario type: delay');
    }
    else if (/material|inventory|bestand|shortage|mangel/i.test(message)) {
      scenario.type = 'material_shortage';
      // Look for order/planning/compliance agents
      scenario.affectedAgents = availableAgents.filter(id => 
        id.includes('order') || id.includes('planning') || id.includes('compliance') || id.includes('production')
      );
      logger.debug('Scenario type: material_shortage');
    }
    else if (/temperature|pressure|parameter|prozess|process/i.test(message)) {
      scenario.type = 'process_change';
      // Look for quality/assessment agents
      scenario.affectedAgents = availableAgents.filter(id => 
        id.includes('assessment') || id.includes('quality') || id.includes('qa')
      );
      logger.debug('Scenario type: process_change');
    }
    else if (/quality|defect|fehler|contamination|qa/i.test(message)) {
      scenario.type = 'quality_issue';
      // Look for quality/compliance agents
      scenario.affectedAgents = availableAgents.filter(id => 
        id.includes('quality') || id.includes('compliance') || id.includes('assessment') || id.includes('qa')
      );
      logger.debug('Scenario type: quality_issue');
    }
    else if (/capacity|increase|decrease|production/i.test(message)) {
      scenario.type = 'capacity_change';
      // Look for production/planning agents
      scenario.affectedAgents = availableAgents.filter(id => 
        id.includes('order') || id.includes('planning') || id.includes('production') || id.includes('briefing')
      );
      logger.debug('Scenario type: capacity_change');
    }
    else if (/equipment|machine|maintenance|breakdown|failure/i.test(message)) {
      scenario.type = 'equipment_issue';
      // Look for equipment/oee agents
      scenario.affectedAgents = availableAgents.filter(id => 
        id.includes('equipment') || id.includes('oee') || id.includes('maintenance')
      );
      logger.debug('Scenario type: equipment_issue');
    }
    else {
      // Default: Use proactive agents (planning/production)
      scenario.affectedAgents = availableAgents.filter(id => 
        id.includes('planning') || id.includes('production') || id.includes('order')
      );
      
      // If no proactive agents found, use first 2 agents
      if (scenario.affectedAgents.length === 0) {
        scenario.affectedAgents = availableAgents.slice(0, 2);
      }
      
      logger.debug('Scenario type: general');
    }

    // Ensure we have at least one agent
    if (scenario.affectedAgents.length === 0) {
      logger.warn('No matching agents found, using first available agent');
      scenario.affectedAgents = availableAgents.slice(0, 1);
    }

    logger.debug(`Selected agents: ${scenario.affectedAgents.join(', ')}`);
    return scenario;
  }

  /**
   * Analyze a What-If scenario using multiple agents
   * 
   * @param {string} message - The what-if question
   * @param {Object} user - User information (optional)
   * @returns {Promise<string>} Synthesized analysis from multiple agents
   */
  async analyzeWhatIf(message, user = {}) {
    logger.info(`What-If Analysis started: "${message}"`);
    const startTime = Date.now();

    const scenario = this.extractScenario(message);
    logger.info(`Scenario Type: ${scenario.type}`);
    logger.info(`Affected Agents: ${scenario.affectedAgents.join(', ')}`);

    const analyses = [];

    // Analyze with each relevant agent
    for (const agentId of scenario.affectedAgents) {
      const agent = this.agentManager.agents.find(a => a.id === agentId);
      
      if (!agent) {
        logger.warn(`Agent ${agentId} not found, skipping`);
        continue;
      }

      const agentTypeInfo = this.agentEnhancer.getAgentTypeInfo(agentId);
      const agentType = agentTypeInfo?.type || 'basic';

      logger.info(`Analyzing with ${agentId} (${agentType})...`);

      const whatIfPrompt = this.createWhatIfPrompt(message, agentType);

      try {
        const analysis = await this.agentManager.processAgent(
          agent,
          whatIfPrompt,
          false
        );

        analyses.push({
          agentId,
          agentType,
          analysis
        });

        logger.info(`${agentId} analysis complete`);
        
      } catch (error) {
        logger.error(`Error analyzing with ${agentId}: ${error.message}`);
      }
    }

    const duration = Date.now() - startTime;
    logger.info(`What-If Analysis completed in ${duration}ms with ${analyses.length} agents`);

    return this.synthesizeAnalyses(message, scenario, analyses);
  }

  /**
   * Create What-If prompt based on agent type
   * 
   * @private
   * @param {string} message - Original what-if question
   * @param {string} agentType - Type of agent
   * @returns {string} Customized what-if prompt
   */
  createWhatIfPrompt(message, agentType) {
    const base = `WHAT-IF SCENARIO ANALYSIS\n\nQuestion: ${message}\n\n`;

    const typePrompts = {
      proactive: `**Your Task as Proactive Agent:**
You are goal-oriented and can create alternative plans.

1. Analyze how this scenario affects your goals
2. Create 2-3 alternative plans to handle this scenario
3. Evaluate each alternative against objectives
4. Recommend the best option with clear rationale
5. Explain trade-offs and risks

**Remember:** Be proactive - suggest solutions, not just problems.

Use all available data: {data}
OEE Data for capacity planning: {realtimeOEE}`,

      collaborative: `**Your Task as Collaborative Agent:**
You coordinate information from multiple sources.

1. Analyze impact across all areas:
   - Production orders
   - Quality assurance
   - Compliance
   - Material availability
2. Identify which other agents/systems would be affected
3. Suggest coordination steps needed
4. Provide comprehensive impact assessment

**Remember:** Consider the entire system, not just one area.

Available data from multiple sources: {data}`,

      rule_based: `**Your Task as Rule-Based Agent:**
You apply rules and regulations using LLM interpretation.

1. Identify which rules/regulations apply to this scenario
2. Determine if the scenario violates any rules
3. Assess compliance risk level (low/medium/high/critical)
4. Suggest how to modify scenario to stay compliant
5. Provide clear pass/fail assessment with reasoning

**Remember:** Apply rules but use LLM to interpret complex cases.

Compliance data: {data}`,

      learning: `**Your Task as Learning Agent:**
You learn from historical data to predict outcomes.

1. Search historical data for similar scenarios
2. Analyze outcomes from past similar situations
3. Predict likely outcome of this scenario
4. Provide confidence level based on historical patterns
5. Suggest adjustments based on learned patterns

**Remember:** Use historical data to make informed predictions.

Historical data: {data}
Previous patterns: {previousPredictions}`,

      data_collection: `**Your Task as Data Collection Agent:**
You provide current data relevant to the scenario.

1. Show current baseline data (before scenario)
2. Estimate what data would change under this scenario
3. Highlight key metrics that would be affected
4. Present data clearly for decision-making

**Remember:** Focus on data presentation, not recommendations.

Current data: {data}
Real-time metrics: {realtimeOEE}`
    };

    const prompt = base + (typePrompts[agentType] || 'Analyze this scenario using available data: {data}');
    
    logger.debug(`Created ${agentType} what-if prompt (${prompt.length} chars)`);
    return prompt;
  }

  /**
   * Synthesize analyses from multiple agents into comprehensive report
   * 
   * @private
   * @param {string} message - Original question
   * @param {Object} scenario - Scenario information
   * @param {Array} analyses - Array of agent analyses
   * @returns {string} Synthesized markdown report
   */
  synthesizeAnalyses(message, scenario, analyses) {
    logger.debug('Synthesizing analyses from multiple agents');
    
    let result = `# What-If Analysis: ${message}\n\n`;
    result += `**Scenario Type:** ${scenario.type}\n`;
    result += `**Analyzed by:** ${analyses.length} specialized agents\n\n`;
    result += `---\n\n`;

    // Group analyses by agent type
    const grouped = {};
    for (const a of analyses) {
      if (!grouped[a.agentType]) grouped[a.agentType] = [];
      grouped[a.agentType].push(a);
    }

    // Present results by priority: Proactive > Collaborative > Learning > Rule-Based > Data

    // Proactive agents first (have solutions)
    if (grouped['proactive']) {
      result += `## 🎯 Strategic Solutions (Proactive Agents)\n\n`;
      for (const a of grouped['proactive']) {
        result += `### ${a.agentId}\n${a.analysis}\n\n`;
      }
    }

    // Collaborative agents (system-wide view)
    if (grouped['collaborative']) {
      result += `## 🤝 System-Wide Impact (Collaborative Agents)\n\n`;
      for (const a of grouped['collaborative']) {
        result += `### ${a.agentId}\n${a.analysis}\n\n`;
      }
    }

    // Learning agents (predictions)
    if (grouped['learning']) {
      result += `## 🧠 Historical Predictions (Learning Agents)\n\n`;
      for (const a of grouped['learning']) {
        result += `### ${a.agentId}\n${a.analysis}\n\n`;
      }
    }

    // Rule-based agents (compliance)
    if (grouped['rule_based']) {
      result += `## ⚖️ Compliance Assessment (Rule-Based Agents)\n\n`;
      for (const a of grouped['rule_based']) {
        result += `### ${a.agentId}\n${a.analysis}\n\n`;
      }
    }

    // Data collection agents (baseline)
    if (grouped['data_collection']) {
      result += `## 📊 Baseline Data (Data Collection Agents)\n\n`;
      for (const a of grouped['data_collection']) {
        result += `### ${a.agentId}\n${a.analysis}\n\n`;
      }
    }

    result += `---\n\n`;
    result += `## 💡 Recommendation\n\n`;
    result += `This scenario was evaluated from ${analyses.length} different perspectives `;
    result += `(${Object.keys(grouped).join(', ')} agents). `;
    result += `Review the analyses above to make an informed decision.\n`;

    logger.debug('Synthesis complete');
    return result;
  }
}

// ========================================================================
// SERVER INTEGRATION FUNCTIONS
// ========================================================================

/**
 * Enhance server with agent type classification
 * 
 * Adds API endpoints:
 * - GET /api/agents/types - Get all agent types
 * - GET /api/agents/types/:type - Get agents by type
 * 
 * @param {Object} app - Express app instance
 * @param {Object} agentManager - AgentManager instance
 * @returns {AgentTypeEnhancer} The enhancer instance
 */
export function enhanceServerWithAgentTypes(app, agentManager) {
  logger.info('Installing agent type classification...');
  
  const enhancer = new AgentTypeEnhancer(agentManager);
  
  // Classify all agents
  enhancer.classifyAllAgents();
  
  // API Endpoint: Get all agent types
  app.get('/api/agents/types', (req, res) => {
    logger.debug('GET /api/agents/types');
    
    const stats = enhancer.classifier.getStatistics();
    const agentList = [];
    
    for (const [agentId, info] of enhancer.classifier.agents) {
      agentList.push({
        id: agentId,
        name: info.agent.name,
        type: info.type,
        characteristics: info.characteristics
      });
    }
    
    res.json({
      success: true,
      statistics: stats,
      agents: agentList
    });
  });
  
  // API Endpoint: Get agents by type
  app.get('/api/agents/types/:type', (req, res) => {
    const type = req.params.type;
    logger.debug(`GET /api/agents/types/${type}`);
    
    const agents = enhancer.getAgentsByType(type);
    
    res.json({
      success: true,
      type: type,
      count: agents.length,
      agents: agents
    });
  });
  
  logger.info('Agent type classification installed successfully');
  return enhancer;
}

/**
 * Enhance server with What-If analysis capabilities
 * 
 * Adds API endpoint:
 * - POST /api/chat/whatif - Analyze what-if scenarios
 * 
 * @param {Object} app - Express app instance
 * @param {Object} agentManager - AgentManager instance
 * @param {Object} agentEnhancer - AgentTypeEnhancer instance
 * @returns {WhatIfAnalyzer} The analyzer instance
 */
export function enhanceServerWithWhatIf(app, agentManager, agentEnhancer) {
  logger.info('Installing What-If analysis capabilities...');
  
  const whatIfAnalyzer = new WhatIfAnalyzer(agentManager, agentEnhancer);

  // API Endpoint: What-If Analysis
  app.post('/api/chat/whatif', async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { message, user } = req.body;

      if (!message) {
        logger.warn('What-If request without message');
        return res.status(400).json({
          success: false,
          error: 'Message is required'
        });
      }

      logger.info(`What-If API called: "${message.substring(0, 50)}..."`);

      const analysis = await whatIfAnalyzer.analyzeWhatIf(message, user);

      const duration = Date.now() - startTime;
      logger.info(`What-If API completed in ${duration}ms`);

      res.json({
        success: true,
        response: analysis,
        type: 'whatif',
        timestamp: new Date().toISOString(),
        duration: `${duration}ms`
      });

    } catch (error) {
      logger.error(`What-If API error: ${error.message}`, { stack: error.stack });
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  logger.info('What-If analysis capabilities installed successfully');
  return whatIfAnalyzer;
}

// ========================================================================
// EXPORTS
// ========================================================================
// Note: Classes are already exported individually above with 'export class'
// No need to re-export them here