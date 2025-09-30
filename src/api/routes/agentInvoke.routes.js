import express from "express";

export function createAgentRoutes(agentManager, auditLogger) {
  const router = express.Router();

  // GET /api/agents – Liste aller Agents
  router.get("/", (req, res) => {
    try {
      const agents = agentManager.getAllAgents();
      res.json({ success: true, agents });
    } catch (error) {
      auditLogger.logError("agent_list_error", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/agents – neuen Agent hinzufügen
  router.post("/", (req, res) => {
    try {
      const config = req.body;
      const agent = agentManager.addAgent(config);
      auditLogger.logEvent("agent_created", { name: agent.name });
      res.status(201).json({ success: true, agent });
    } catch (error) {
      auditLogger.logError("agent_create_error", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
