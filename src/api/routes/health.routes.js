// src/api/routes/health.routes.js
import express from "express";

export function createHealthRoutes(agentManager, dataManager, eventBusManager) {
  const router = express.Router();

  router.get("/", (req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      agents: agentManager?.getStats?.() || {},
      data: dataManager?.getDataStats?.() || {},
      events: eventBusManager?.getA2AStatus?.() || {},
    });
  });

  return router;
}
