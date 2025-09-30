// src/api/routes/index.js
import express from "express";
import logger from "../../utils/logger.js";

// ✅ Optionale Imports (werden nur geladen, wenn vorhanden)
let helmet, cors, rateLimit;
try {
  helmet = await import("helmet");
  cors = await import("cors");
  rateLimit = await import("express-rate-limit");
} catch (e) {
  logger.warn("⚠️ Security modules not installed, skipping Helmet/CORS/RateLimit");
}

// ✅ Eigene Route-Dateien
import { createChatRoutes } from "./chat.routes.js";
import { createAuditRoutes } from "./audit.routes.js";
import { createDataRoutes } from "./data.routes.js";
import { createHealthRoutes } from "./health.routes.js";
import { createOEERoutes } from "./oee.routes.js";

/**
 * Zentraler Router
 */
export function createRoutes(agentManager, dataManager, eventBusManager, auditLogger, a2aManager) {
  const router = express.Router();

  // ================================
  // Security Middleware (optional)
  // ================================
  if (helmet && cors && rateLimit) {
    router.use(
      helmet.default({
        contentSecurityPolicy: false,
      })
    );
    router.use(
      cors.default({
        origin: "*",
        credentials: true,
      })
    );
    router.use(
      rateLimit.default({
        windowMs: 15 * 60 * 1000, // 15 Minuten
        max: 100,
      })
    );
    logger.info("✅ Security middleware enabled (Helmet, CORS, RateLimit)");
  } else {
    logger.warn("⚠️ Security middleware skipped (modules not installed)");
  }

  // ================================
  // Subroutes
  // ================================
  router.use("/chat", createChatRoutes(agentManager, auditLogger, eventBusManager));
  router.use("/agents", createAgentRoutes(agentManager));
  router.use("/audit", createAuditRoutes(auditLogger));
  router.use("/data", createDataRoutes(dataManager));
  router.use("/health", createHealthRoutes(agentManager, dataManager, eventBusManager));

  if (a2aManager) {
    router.use("/a2a", createA2ARoutes(a2aManager));
  }

  return router;
}
