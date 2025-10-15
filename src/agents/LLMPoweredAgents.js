/**
 * ========================================================================
 * LLM-POWERED AGENTS - CONFIGURATION-DRIVEN VERSION
 * ========================================================================
 * NO hardcoded business logic - all behavior from configuration
 * ========================================================================
 */

import { EventEmitter } from 'events';
import logger from '../utils/logger.js';

// ========================================================================
// AGENT TYPE ENHANCER - CONFIGURATION-DRIVEN
// ========================================================================

export class AgentTypeEnhancer {
  constructor(agentManager) {
    this.agentManager = agentManager;
    this.platformEngine = null;
  }

  setPlatformEngine(platformEngine) {
    this.platformEngine = platformEngine;
    logger.info('Agent Type Enhancer linked to Platform Engine');
  }

  getAgentTypeInfo(agentId) {
    const agent = this.agentManager.agents.find(a => a.id === agentId);
    if (!agent) return undefined;

    if (this.platformEngine) {
      return this.platformEngine.classifyAgent(agent);
    }

    // Fallback
    return {
      type: agent.agentType || 'basic',
      source: 'fallback'
    };
  }
}

// ========================================================================
// WHAT-IF ANALYZER - CONFIGURATION-DRIVEN
// ========================================================================

export class WhatIfAnalyzer {
  /**
   * @param {Object} agentManager - The AgentManager instance
   * @param {Object} agentEnhancer - The AgentTypeEnhancer instance
   */
  constructor(agentManager, agentEnhancer) {
    this.agentManager = agentManager;
    this.agentEnhancer = agentEnhancer;
    this.platformEngine = null;
    logger.info('What-If Analyzer initialized');
  }

  setPlatformEngine(platformEngine) {
    this.platformEngine = platformEngine;
    logger.info('What-If Analyzer linked to Platform Engine');
  }

  isWhatIfQuery(message) {
    if (this.platformEngine) {
      return this.platformEngine.isWhatIfQuery(message);
    }

    logger.warn('PlatformEngine not available, using fallback What-If detection');
    const fallbackPatterns = [/what\s+if/i, /scenario/i, /alternative/i];
    return fallbackPatterns.some(p => p.test(message));
  }

  extractScenario(message) {
  const availableAgents = this.agentManager.agents;

  if (this.platformEngine) {
    return this.platformEngine.extractScenario(message, availableAgents);
  }

  logger.warn('PlatformEngine not available, using fallback scenario extraction');
  
  // IMPROVED: Smart agent selection based on query content
  let selectedAgents = [];
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('oee') || lowerMessage.includes('line-01') || lowerMessage.includes('equipment efficiency')) {
    const oeeAgent = availableAgents.find(a => a.id === 'oeeAgent');
    if (oeeAgent) selectedAgents.push(oeeAgent);
  }
  
  // Fallback: use first 2 agents if no specific matches
  if (selectedAgents.length === 0) {
    selectedAgents = availableAgents.slice(0, 2);
  }
  
  return {
    original: message,
    type: 'general',
    affectedAgents: selectedAgents
  };
}

  async analyzeWhatIf(message) {
    const startTime = Date.now();
    
    logger.info('='.repeat(70));
    logger.info('WHAT-IF ANALYSIS STARTED');
    logger.info(`Question: "${message}"`);
    logger.info('='.repeat(70));

    const scenario = this.extractScenario(message);
    logger.info(`Scenario Type: ${scenario.type}`);
    logger.info(`Affected Agents: ${scenario.affectedAgents.map(a => a.id).join(', ')}`);

    const analyses = [];

    const parallelProcessing = this.platformEngine?.getBehaviorSetting('whatIfAnalysis.parallelProcessing', false);

    if (parallelProcessing) {
      logger.info('Using parallel processing mode');
      analyses.push(...await this.analyzeParallel(message, scenario));
    } else {
      logger.info('Using sequential processing mode');
      analyses.push(...await this.analyzeSequential(message, scenario));
    }

    const duration = Date.now() - startTime;
    logger.info('='.repeat(70));
    logger.info(`WHAT-IF ANALYSIS COMPLETED in ${duration}ms with ${analyses.length} agents`);
    logger.info('='.repeat(70));

    return this.synthesizeAnalyses(message, scenario, analyses);
  }

  /**
   * Analyze with agents sequentially (FIXED VERSION)
   */
async analyzeSequential(message, scenario) {
   logger.info(`🔍 ENTERING analyzeSequential with ${scenario.affectedAgents.length} agents`);
  const analyses = [];

  for (const agent of scenario.affectedAgents) {
    logger.info(`🔍 PROCESSING AGENT: ${agent.id}`);
    const agentTypeInfo = this.agentEnhancer.getAgentTypeInfo(agent.id);
    const agentType = agentTypeInfo?.type || 'basic';

    logger.info(`Analyzing with ${agent.id} (${agentType})...`);

    try {
      // FIX: Use same data method as regular chat
      const baseData = this.agentManager.dataManager.getMockDataForAgent(agent);
      const enrichedData = await this.agentManager.enrichAgentDataWithOEE(agent, baseData);
      
      // Use simple prompt
      const whatIfPrompt = this.createWhatIfPromptWithData(message, agentType, enrichedData);

      const analysis = await this.agentManager.processAgent(
        agent,
        whatIfPrompt,
        false
      );

      // ADD DEBUG LINE HERE:
      logger.info(`🔍 What-If DEBUG - Analysis result: ${typeof analysis} - Length: ${analysis?.length} - Content: ${analysis?.substring(0, 200)}...`);

      analyses.push({
        agentId: agent.id,
        agentType,
        analysis
      });
      logger.info(`🔍 PUSHED TO ANALYSES - ${agent.id}: ${analysis ? `HAS ${analysis.length} chars` : 'NO CONTENT'} - Preview: ${analysis?.substring(0, 100)}...`);
      
    } catch (error) {
      logger.error(`Error analyzing with ${agent.id}: ${error.message}`);
    }
  }

  return analyses;
}

  /**
   * Analyze with agents in parallel (FIXED VERSION)
   */
async analyzeParallel(message, scenario) {
  const promises = scenario.affectedAgents.map(async (agent) => {
    const agentTypeInfo = this.agentEnhancer.getAgentTypeInfo(agent.id);
    const agentType = agentTypeInfo?.type || 'basic';

    logger.info(`Analyzing with ${agent.id} (${agentType})...`);

    try {
      // FIX: Use same data method as regular chat
      const baseData = this.agentManager.dataManager.getMockDataForAgent(agent);
      const enrichedData = await this.agentManager.enrichAgentDataWithOEE(agent, baseData);
      
      const whatIfPrompt = this.createWhatIfPromptWithData(message, agentType, enrichedData);

      const analysis = await this.agentManager.processAgent(
        agent,
        whatIfPrompt,
        false
      );

      logger.info(`🔍 What-If DEBUG - Analysis result: ${typeof analysis} - Length: ${analysis?.length} - Content: ${analysis?.substring(0, 200)}...`);

      logger.info(`${agent.id} analysis complete`);

      return {
        agentId: agent.id,
        agentType,
        analysis
      };
      
    } catch (error) {
      logger.error(`Error analyzing with ${agent.id}: ${error.message}`);
      return null;
    }
  });

  const results = await Promise.all(promises);
  return results.filter(r => r !== null);
}
  /**
   * Create What-If prompt based on agent type (LEGACY - without data)
   */
  createWhatIfPrompt(message, agentType) {
    if (this.platformEngine) {
      return this.platformEngine.getWhatIfPrompt(agentType, message);
    }

    logger.warn('PlatformEngine not available, using basic prompt');
    return `WHAT-IF SCENARIO ANALYSIS\n\nQuestion: ${message}\n\nAnalyze this scenario and provide insights.`;
  }

  /**
   * Create What-If prompt WITH actual data included (NEW - FIXED)
   */
createWhatIfPromptWithData(message, agentType, enrichedData) {
  // Check if we have the agent available
  const agent = this.agentManager.agents.find(a => a.agentType === agentType);
  
  if (agent && agent.promptTemplates && agent.promptTemplates.whatIf) {
    // Use the agent's What-If template
    let prompt = agent.promptTemplates.whatIf;
    prompt = prompt.replace(/{userMessage}/g, message);
    prompt = prompt.replace(/{timestamp}/g, new Date().toISOString());
    prompt = prompt.replace(/{data.oee_hot}/g, JSON.stringify(enrichedData.oee_hot || {}, null, 2));
    prompt = prompt.replace(/{data.oee_history}/g, JSON.stringify(enrichedData.oee_history || {}, null, 2));
    return prompt;
  }
  
  // Fallback to simple message
  return message;

}

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
    // After grouping
    logger.info(`🔍 GROUPED ANALYSES: ${JSON.stringify(Object.keys(grouped))} - data_collection count: ${grouped['data_collection']?.length || 0}`);

    // Present results by priority
    const typeOrder = ['proactive', 'collaborative', 'learning', 'rule_based', 'data_collector', 'basic'];
    const typeLabels = {
      proactive: '🎯 Strategic Solutions (Proactive Agents)',
      collaborative: '🤝 System-Wide Impact (Collaborative Agents)',
      learning: '🧠 Historical Predictions (Learning Agents)',
      rule_based: '⚖️ Compliance Assessment (Rule-Based Agents)',
      data_collector: '📊 Baseline Data (Data Collection Agents)'
    };

    // Simple direct output of all analyses
for (const a of analyses) {
  result += `## 📊 ${a.agentId} Analysis (${a.agentType})\n\n`;
  result += `${a.analysis || 'No analysis content'}\n\n`;
}
    result += `---\n\n`;
    result += `## 💡 Recommendation\n\n`;
    result += `This scenario was evaluated from ${analyses.length} different perspectives `;
    result += `(${Object.keys(grouped).join(', ')} agents). `;
    result += `Review the analyses above to make an informed decision.\n`;

    logger.debug('Synthesis complete');
    logger.info(`🔍 FINAL RESULT LENGTH: ${result.length} - Content preview: ${result.substring(0, 500)}...`);
    return result;
  }
}

// ========================================================================
// SERVER INTEGRATION
// ========================================================================

export function enhanceServerWithAgentTypes(app, agentManager) {
  logger.info('Installing agent type classification...');
  
  const enhancer = new AgentTypeEnhancer(agentManager);
  
  if (agentManager.platformEngine) {
    enhancer.setPlatformEngine(agentManager.platformEngine);
  }
  
  logger.info('✅ Agent type classification installed');
  return enhancer;
}

export function enhanceServerWithWhatIf(app, agentManager, agentEnhancer) {
  logger.info('Installing What-If analysis capabilities...');
  
  const whatIfAnalyzer = new WhatIfAnalyzer(agentManager, agentEnhancer);
  
  if (agentManager.platformEngine) {
    whatIfAnalyzer.setPlatformEngine(agentManager.platformEngine);
  }

  app.post('/api/chat/whatif', async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { message } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: 'Message is required' });
      }

      logger.info(`What-If API request: "${message}"`);

      const result = await whatIfAnalyzer.analyzeWhatIf(message);
      const duration = Date.now() - startTime;

res.json({
  success: true,
  response: result,  // ← Now matches regular chat API
  duration,
  timestamp: new Date().toISOString()
});

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`What-If API error: ${error.message}`);
      
      res.status(500).json({
        success: false,
        error: error.message,
        duration
      });
    }
  });

  logger.info('✅ What-If analysis installed');
  return { whatIfAnalyzer }; // Return as object for app.locals
}