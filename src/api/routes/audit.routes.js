// src/api/routes/audit.routes.js
import express from "express";

export function createAuditRoutes(auditLogger) {
  const router = express.Router();

  // GET /api/audit - Alle Audit Logs abrufen
  router.get("/", (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || null;
      const logs = auditLogger.getAuditLog(null, limit);
      res.json({ entries: logs });   // angepasst für Frontend
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/audit/stats - Statistik der Audit Logs
  router.get("/stats", (req, res) => {
    try {
      const stats = auditLogger.getAuditStats();
      res.json({ stats });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/audit/chat-history - Chat-Verlauf aus Audit Logs
  router.get("/chat-history", (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      if (typeof auditLogger.getChatHistory === "function") {
        const history = auditLogger.getChatHistory(limit);
        res.json({ entries: history }); // angepasst für Frontend
      } else {
        res.status(501).json({ error: "getChatHistory not implemented" });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
