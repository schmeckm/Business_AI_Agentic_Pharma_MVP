/**
 * ========================================================================
 * PHARMACEUTICAL MANUFACTURING AGENT SYSTEM - ROUTES.JS
 * ========================================================================
 *
 * Unified API Routes
 * Version: 1.2.7
 *
 * ========================================================================
 */

import express from "express";
import logger from "../utils/logger.js";

export function createRoutes(agentManager, dataManager, eventBusManager, auditLogger, a2aManager) {
  const router = express.Router();

  // ======================================================
  // CHAT ROUTES
  // ======================================================
  router.post("/chat", async (req, res) => {
    try {
      const { userId, message } = req.body;
      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      logger.info(`💬 Chat request from ${userId || "anonymous"}: ${message}`);

      const response = await agentManager.handleChat(userId, message);
      res.json({ success: true, response });
    } catch (error) {
      logger.error(`❌ Chat route error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  // ======================================================
  // AGENT ROUTES
  // ======================================================
  router.get("/agents", (req, res) => {
    try {
      const agents = agentManager.getAllAgents()
      logger.info(`📋 Listing agents: ${agents.length}`);
      res.json({ agents });
    } catch (error) {
      logger.error(`❌ Agents route error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/agents", (req, res) => {
    try {
      const agentConfig = req.body;
      const agent = agentManager.addAgent(agentConfig);
      logger.info(`✅ Agent created: ${agent.name}`);
      res.status(201).json({ success: true, agent });
    } catch (error) {
      logger.error(`❌ Create agent error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  // ======================================================
  // DATA ROUTES
  // ======================================================
  router.get("/data/:source", async (req, res) => {
    try {
      const source = req.params.source;
      const data = await dataManager.getCachedData(source);
      logger.info(`📊 Data requested from source: ${source}`);
      res.json({ success: true, data });
    } catch (error) {
      logger.error(`❌ Data route error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  // ======================================================
  // AUDIT LOG ROUTES
  // ======================================================
 // ======================================================
// AUDIT LOG ROUTES
// ======================================================
router.get("/audit", (req, res) => {
  try {
    const limit = parseInt(req.query.limit || "100", 10);

    // Hole die Einträge mit der neuen Methode
    const entries = auditLogger.getEntries(limit);

    logger.info(`📜 Audit logs retrieved: ${entries.length}`);
    res.json({ entries });
  } catch (error) {
    logger.error(`❌ Audit logs error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

router.get("/audit/stats", (req, res) => {
  try {
    const stats = auditLogger.getAuditStats();
    res.json(stats);
  } catch (error) {
    logger.error(`❌ Audit stats error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});;

  // ======================================================
  // A2A ROUTES
  // ======================================================
  if (a2aManager) {
    router.post("/a2a/test", (req, res) => {
      try {
        const { fromAgent, toAgent, payload } = req.body;
        const result = a2aManager.sendMessage(fromAgent, toAgent, payload);
        logger.info(`🔗 A2A test message: ${fromAgent} → ${toAgent}`);
        res.json({ success: true, result });
      } catch (error) {
        logger.error(`❌ A2A test error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    router.get("/a2a/status", (req, res) => {
      try {
        const status = a2aManager.getStatus();
        logger.info("📡 A2A status requested");
        res.json({ success: true, status });
      } catch (error) {
        logger.error(`❌ A2A status error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });
  }

  return router;
}
