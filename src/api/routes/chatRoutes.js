import express from "express";

export function createChatRoutes(agentManager, auditLogger, eventBusManager) {
  const router = express.Router();

  /**
   * POST /api/chat - Main Chat Interface
   */
  router.post("/", async (req, res) => {
    const { message, user } = req.body;
    let agentUsed = null;
    let responseText = "";

    try {
      const agent = agentManager.findAgent(message);

      if (agent) {
        agentUsed = agent.id;
        responseText = await agentManager.processAgent(agent, message);
      } else {
        console.log(`No specific agent found for: "${message}" - using constrained generic LLM`);
        responseText = await agentManager.processGenericQuery(message);
        agentUsed = "generic-constrained";
      }

      res.json({ 
        response: responseText, 
        agentUsed, 
        eventChainTriggered: agent?.events?.publishes || [],
        oeeEnabled: agent?.oeeEnabled || false,
        timestamp: new Date().toISOString() 
      });

    } catch (error) {
      console.error('Chat processing error:', error);
      auditLogger.logError('chat_error', error.message, { message, user });
      
      res.status(500).json({ 
        error: error.message, 
        agentUsed,
        timestamp: new Date().toISOString() 
      });
    }
  });

  /**
   * GET /api/chat/history - Chat History
   */
  router.get("/history", (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    try {
      const history = auditLogger.getChatHistory(limit);
      res.json({
        history,
        count: history.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}