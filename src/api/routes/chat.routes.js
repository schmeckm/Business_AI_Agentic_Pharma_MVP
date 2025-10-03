import express from "express";

import logger from '../../utils/logger.js';

export function createChatRoutes(agentManager, auditLogger, eventBusManager) {
  const router = express.Router();

  /**
   * POST /api/chat
   * Main agent execution endpoint
   */
  router.post('/', async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { message } = req.body;

      if (!message || typeof message !== 'string' || message.trim() === '') {
        return res.status(400).json({
          success: false,
          error: 'Message is required and must be a non-empty string'
        });
      }

      logger.info(`Chat request: "${message.substring(0, 100)}..."`);

      // Find matching agent
      const agent = agentManager.findAgent(message);

      let response;
      let agentUsed = null;
      let oeeEnabled = false;

      if (agent) {
        // Agent found - use it
        agentUsed = agent.id;
        oeeEnabled = agent.oeeEnabled || false;
        
        logger.info(`Agent matched: ${agent.id} (OEE: ${oeeEnabled})`);
        
        // Execute agent
        response = await agentManager.processAgent(agent, message, false);
        console.log('🔍 DEBUG - Response from processAgent:', typeof response, response?.substring?.(0, 100));
        
        // Publish events if configured
        if (agent.events && agent.events.publishes && Array.isArray(agent.events.publishes)) {
          agent.events.publishes.forEach(topic => {
            eventBusManager.publishEvent(topic, {
              agentId: agent.id,
              message,
              timestamp: new Date().toISOString()
            }, agent.id);
          });
        }
      } else {
        // No agent found - use generic query
        logger.info(`No specific agent found - using generic LLM`);
        response = await agentManager.processGenericQuery(message);
      }

      const duration = Date.now() - startTime;

      // Log execution
      if (auditLogger && typeof auditLogger.logAgentExecution === 'function') {
        auditLogger.logAgentExecution(agentUsed || 'generic', message, response);
      }

      // Return response with metadata
      return res.json({
        success: true,
        response: response,
        agentUsed,
        oeeEnabled,
        eventChainTriggered: agent?.events?.publishes || [],
        duration,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error(`Chat error: ${error.message}`, { stack: error.stack });

      return res.status(500).json({
        success: false,
        error: error.message,
        duration,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * POST /api/chat/whatif
   * What-If scenario analysis
   */
  router.post('/whatif', async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { message } = req.body;

      if (!message) {
        return res.status(400).json({
          success: false,
          error: 'Message is required for what-if analysis'
        });
      }

      logger.info(`What-If request: "${message}"`);

      // Use What-If analyzer if available
      let response;
      const whatIfAnalyzer = req.app.locals.whatIfAnalyzer;
      
      if (whatIfAnalyzer && typeof whatIfAnalyzer.analyzeWhatIf === 'function') {
        response = await whatIfAnalyzer.analyzeWhatIf(message);
      } else {
        logger.warn('What-If analyzer not available, using generic query');
        response = await agentManager.processGenericQuery(`What-If Scenario: ${message}`);
      }

      const duration = Date.now() - startTime;

      return res.json({
        success: true,
        response: response,
        type: 'whatif',
        duration,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error(`What-If error: ${error.message}`, { stack: error.stack });

      return res.status(500).json({
        success: false,
        error: error.message,
        duration,
        timestamp: new Date().toISOString()
      });
    }
  });

  return router;
}