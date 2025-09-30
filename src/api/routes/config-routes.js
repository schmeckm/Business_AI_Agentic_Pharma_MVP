/**
 * ========================================================================
 * DATEI: src/api/routes/index.js - HAUPTROUTER MIT ALLEN SUB-ROUTES
 * ========================================================================
 * 
 * Kombiniert alle Route-Module zu einem zentralen API-Router
 * Verwendet separate Dateien für bessere Wartbarkeit
 * 
 * @version 2.1.0
 * ========================================================================
 */

import express from "express";
import { readFileSync, promises as fs } from "fs";  
import path from "path";                            
import jsyaml from "js-yaml";                      
import logger from "../../utils/logger.js";

// ========================================================================
// SUB-ROUTE IMPORTS
// ========================================================================
import { createChatRoutes } from "./chatRoutes.js";
import { createDataRoutes } from "./dataRoutes.js";
import { createOEERoutes } from "./oeeRoutes.js";
import { createConfigRoutes } from "./config-routes.js";


// Package version laden
let packageJson;
try {
  packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));
  logger.info(`Application version: ${packageJson.version}`);
} catch (error) {
  packageJson = { version: "2.1.0" };
  logger.warn('Could not read package.json, using default version');
}

// ========================================================================
// HAUPTFUNKTION - API ROUTES ERSTELLEN
// ========================================================================

/**
 * Hauptfunktion für API-Routen
 * Kombiniert alle Sub-Route-Module zu einem Router
 * 
 * @param {Object} agentManager - Agent Manager Instanz
 * @param {Object} dataManager - Data Manager Instanz
 * @param {Object} eventBusManager - Event Bus Manager Instanz
 * @param {Object} auditLogger - Audit Logger Instanz
 * @param {Object} a2aManager - Agent-to-Agent Manager Instanz
 * @returns {express.Router} Konfigurierter Express Router
 */
export function createAPIRoutes(agentManager, dataManager, eventBusManager, auditLogger, a2aManager) {
  const router = express.Router();

  logger.info('Initializing API routes...');

  try {
    // Chat Routes (aus chatRoutes.js)
    router.use("/chat", createChatRoutes(agentManager, auditLogger, eventBusManager));
    logger.debug('Chat routes registered: /api/chat');

    // Agent Routes (inline definiert, siehe unten)
    router.use("/agents", createAgentRoutes(agentManager));
    logger.debug('Agent routes registered: /api/agents');

    // Data Routes (aus dataRoutes.js)
    router.use("/data", createDataRoutes(dataManager, eventBusManager));
    logger.debug('Data routes registered: /api/data');

    // OEE Routes (aus oeeRoutes.js)
    router.use("/oee", createOEERoutes(dataManager, eventBusManager));
    logger.debug('OEE routes registered: /api/oee');

    // Event Routes (inline definiert)
    router.use("/events", createEventRoutes(eventBusManager));
    logger.debug('Event routes registered: /api/events');

    // Audit Routes (inline definiert)
    router.use("/audit", createAuditRoutes(auditLogger));
    logger.debug('Audit routes registered: /api/audit');

    // System Routes (inline definiert)
    router.use("/system", createSystemRoutes(agentManager, dataManager, eventBusManager));
    logger.debug('System routes registered: /api/system');

    // Workflow Routes (inline definiert)
    router.use("/workflows", createWorkflowRoutes(agentManager));
    logger.debug('Workflow routes registered: /api/workflows');

    // A2A Routes (inline definiert)
    router.use("/a2a", createA2ARoutes(agentManager));
    logger.debug('A2A routes registered: /api/a2a');

    // ⭐ Config Routes (aus config-routes.js) - NEU!
    router.use("/config", createConfigRoutes(agentManager));
    logger.info('✅ Config routes registered: /api/config');

    logger.info('✅ All API routes initialized successfully');

  } catch (error) {
    logger.error(`Failed to initialize API routes: ${error.message}`, { stack: error.stack });
    throw error;
  }

  return router;
}

// ========================================================================
// ROOT-LEVEL ROUTES FÜR FRONTEND-KOMPATIBILITÄT
// ========================================================================

/**
 * Root-Level Routen für direkten Frontend-Zugriff
 * Templates und SSE Events
 * 
 * @param {Object} agentManager - Agent Manager Instanz
 * @param {Object} eventBusManager - Event Bus Manager Instanz
 * @returns {express.Router} Root-Level Router
 */
export function createRootRoutes(agentManager, eventBusManager) {
  const router = express.Router();

  logger.debug('Initializing root-level routes...');

  // === Templates Endpoint ===
  const templatesHandler = (req, res) => {
    try {
      const templates = agentManager.getTemplates();
      res.json({ 
        templates,
        count: templates.length,
        timestamp: new Date().toISOString()
      });
      logger.debug(`Templates endpoint called: ${templates.length} templates returned`);
    } catch (error) {
      logger.error(`Templates endpoint error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  };

  // === Events (SSE) Endpoint ===
  const eventsHandler = (req, res) => {
    const clientIp = req.ip || req.connection.remoteAddress;
    logger.info(`SSE connection established from ${clientIp}`);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Initial connect message
    res.write(`data: ${JSON.stringify({
      type: 'connection',
      message: 'Real-time event stream connected',
      timestamp: new Date().toISOString()
    })}\n\n`);

    // EventBus listener
    const eventHandler = (eventData) => {
      res.write(`data: ${JSON.stringify(eventData)}\n\n`);
    };
    eventBusManager.on('event', eventHandler);

    // Cleanup on client disconnect
    req.on('close', () => {
      eventBusManager.removeListener('event', eventHandler);
      logger.info(`SSE connection closed from ${clientIp}`);
    });

    // Keep alive ping
    const keepAlive = setInterval(() => {
      res.write(`data: ${JSON.stringify({
        type: 'ping',
        timestamp: new Date().toISOString()
      })}\n\n`);
    }, 30000);

    req.on('close', () => clearInterval(keepAlive));
  };

  // Register endpoints
  router.get("/templates", templatesHandler);
  router.get("/events", eventsHandler);
  router.get("/api/templates", templatesHandler);
  router.get("/api/events", eventsHandler);

  logger.debug('Root-level routes initialized');

  return router;
}

// ========================================================================
// AGENT ROUTES - Inline definiert (TODO: In separate Datei auslagern)
// ========================================================================

function createAgentRoutes(agentManager) {
  const router = express.Router();

  /**
   * GET /api/agents - Liste aller Agents
   */
  router.get("/", (req, res) => {
    try {
      const agents = agentManager.getAllAgents();
      const stats = agentManager.getStats();
      
      res.json({ 
        agents, 
        stats,
        oeeIntegration: {
          enabled: stats.oeeIntegrationEnabled,
          oeeEnabledAgents: stats.oeeEnabledAgents,
          oeeEnhancedAgents: stats.oeeEnhancedAgents
        },
        timestamp: new Date().toISOString() 
      });

      logger.debug(`Agent list requested: ${agents.length} agents returned`);
    } catch (error) {
      logger.error(`Agent list error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/agents/templates - Agent Templates
   */
  router.get("/templates", (req, res) => {
    try {
      const templates = agentManager.getTemplates();
      res.json({ 
        templates, 
        count: templates.length,
        oeeSupported: templates.filter(t => t.oeeEnabled).length,
        timestamp: new Date().toISOString() 
      });

      logger.debug(`Templates requested: ${templates.length} templates`);
    } catch (error) {
      logger.error(`Templates error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/agents/oee - OEE-fähige Agents
   */
  router.get("/oee", (req, res) => {
    try {
      const oeeAgents = agentManager.getOEEEnabledAgents();
      res.json({
        agents: oeeAgents,
        count: oeeAgents.length,
        capabilities: oeeAgents.map(a => ({
          id: a.id,
          name: a.name,
          oeeEnhanced: a.oeeEnhanced || false,
          a2aCapabilities: a.a2aCapabilities || []
        })),
        timestamp: new Date().toISOString()
      });

      logger.debug(`OEE agents requested: ${oeeAgents.length} agents`);
    } catch (error) {
      logger.error(`OEE agents error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/agents/reload - Agents neu laden
   */
  router.post("/reload", (req, res) => {
    try {
      logger.info('Reloading agent configuration...');
      const success = agentManager.reloadAgents();
      
      const stats = agentManager.getStats();
      logger.info(`Agent reload ${success ? 'successful' : 'failed'}: ${stats.loaded} agents loaded`);

      res.json({ 
        status: success ? "success" : "failed", 
        stats,
        message: success ? "Agents reloaded successfully" : "Failed to reload agents",
        timestamp: new Date().toISOString() 
      });
    } catch (error) {
      logger.error(`Agent reload error: ${error.message}`);
      res.status(500).json({ 
        status: "error", 
        message: error.message,
        timestamp: new Date().toISOString() 
      });
    }
  });

  /**
   * POST /api/agents/:agentId/oee - OEE für Agent aktivieren/deaktivieren
   */
  router.post("/:agentId/oee", (req, res) => {
    const { agentId } = req.params;
    const { enabled } = req.body;
    
    try {
      logger.info(`Toggling OEE for agent ${agentId}: ${enabled ? 'enable' : 'disable'}`);
      const success = agentManager.toggleAgentOEE(agentId, enabled);
      
      res.json({
        success,
        agentId,
        oeeEnabled: enabled,
        message: success 
          ? `OEE ${enabled ? 'enabled' : 'disabled'} for ${agentId}` 
          : `Agent ${agentId} not found`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error(`Toggle OEE error for ${agentId}: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

// ========================================================================
// EVENT ROUTES
// ========================================================================

function createEventRoutes(eventBusManager) {
  const router = express.Router();

  /**
   * GET /api/events/subscriptions - Event Subscriptions
   */
  router.get("/subscriptions", (req, res) => {
    try {
      const subscriptions = eventBusManager.getEventSubscriptions();
      res.json(subscriptions);
      logger.debug('Event subscriptions requested');
    } catch (error) {
      logger.error(`Event subscriptions error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/events/oee - OEE Event History
   */
  router.get("/oee", (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 20;
      const history = eventBusManager.getOEEEventHistory(limit);
      res.json(history);
      logger.debug(`OEE event history requested: ${limit} events`);
    } catch (error) {
      logger.error(`OEE event history error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/events/oee/stats - OEE Statistics
   */
  router.get("/oee/stats", (req, res) => {
    try {
      const stats = eventBusManager.getOEEStatistics();
      res.json(stats);
      logger.debug('OEE statistics requested');
    } catch (error) {
      logger.error(`OEE stats error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/events/oee - Publish OEE Event
   */
  router.post("/oee", async (req, res) => {
    try {
      const { eventType, oeeData, sourceAgent } = req.body;
      
      logger.info(`Publishing OEE event: ${eventType || 'updated'} from ${sourceAgent || 'api'}`);

      await eventBusManager.publishOEEEvent(
        eventType || 'updated',
        oeeData,
        sourceAgent || 'api'
      );
      
      res.json({
        success: true,
        eventType: eventType || 'updated',
        published: true,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error(`OEE event publish error: ${error.message}`);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * DELETE /api/events/oee/history - Clear OEE History
   */
  router.delete("/oee/history", (req, res) => {
    try {
      const clearedCount = eventBusManager.clearOEEHistory();
      logger.info(`OEE history cleared: ${clearedCount} events`);
      
      res.json({
        success: true,
        clearedEvents: clearedCount,
        message: `Cleared ${clearedCount} OEE events from history`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error(`Clear OEE history error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

/**
 * ========================================================================
 * DATEI: src/api/routes/index.js - HAUPTROUTER MIT ALLEN SUB-ROUTES
 * ========================================================================
 * 
 * Kombiniert alle Route-Module zu einem zentralen API-Router
 * Verwendet separate Dateien für bessere Wartbarkeit
 * 
 * @version 2.1.0
 * ========================================================================
 */

import express from "express";
import { readFileSync } from "fs";
import logger from "../../utils/logger.js";

// ========================================================================
// SUB-ROUTE IMPORTS
// ========================================================================
import { createChatRoutes } from "./chatRoutes.js";
import { createDataRoutes } from "./dataRoutes.js";
import { createOEERoutes } from "./oeeRoutes.js";
import { createConfigRoutes } from "./config-routes.js";

// Package version laden
let packageJson;
try {
  packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));
  logger.info(`Application version: ${packageJson.version}`);
} catch (error) {
  packageJson = { version: "2.1.0" };
  logger.warn('Could not read package.json, using default version');
}

// ========================================================================
// HAUPTFUNKTION - API ROUTES ERSTELLEN
// ========================================================================

/**
 * Hauptfunktion für API-Routen
 * Kombiniert alle Sub-Route-Module zu einem Router
 * 
 * @param {Object} agentManager - Agent Manager Instanz
 * @param {Object} dataManager - Data Manager Instanz
 * @param {Object} eventBusManager - Event Bus Manager Instanz
 * @param {Object} auditLogger - Audit Logger Instanz
 * @param {Object} a2aManager - Agent-to-Agent Manager Instanz
 * @returns {express.Router} Konfigurierter Express Router
 */
export function createAPIRoutes(agentManager, dataManager, eventBusManager, auditLogger, a2aManager) {
  const router = express.Router();

  logger.info('Initializing API routes...');

  try {
    // Chat Routes (aus chatRoutes.js)
    router.use("/chat", createChatRoutes(agentManager, auditLogger, eventBusManager));
    logger.debug('Chat routes registered: /api/chat');

    // Agent Routes (inline definiert, siehe unten)
    router.use("/agents", createAgentRoutes(agentManager));
    logger.debug('Agent routes registered: /api/agents');

    // Data Routes (aus dataRoutes.js)
    router.use("/data", createDataRoutes(dataManager, eventBusManager));
    logger.debug('Data routes registered: /api/data');

    // OEE Routes (aus oeeRoutes.js)
    router.use("/oee", createOEERoutes(dataManager, eventBusManager));
    logger.debug('OEE routes registered: /api/oee');

    // Event Routes (inline definiert)
    router.use("/events", createEventRoutes(eventBusManager));
    logger.debug('Event routes registered: /api/events');

    // Audit Routes (inline definiert)
    router.use("/audit", createAuditRoutes(auditLogger));
    logger.debug('Audit routes registered: /api/audit');

    // System Routes (inline definiert)
    router.use("/system", createSystemRoutes(agentManager, dataManager, eventBusManager));
    logger.debug('System routes registered: /api/system');

    // Workflow Routes (inline definiert)
    router.use("/workflows", createWorkflowRoutes(agentManager));
    logger.debug('Workflow routes registered: /api/workflows');

    // A2A Routes (inline definiert)
    router.use("/a2a", createA2ARoutes(agentManager));
    logger.debug('A2A routes registered: /api/a2a');

    // ⭐ Config Routes (aus config-routes.js) - NEU!
    router.use("/config", createConfigRoutes(agentManager));
    logger.info('✅ Config routes registered: /api/config');

    logger.info('✅ All API routes initialized successfully');

  } catch (error) {
    logger.error(`Failed to initialize API routes: ${error.message}`, { stack: error.stack });
    throw error;
  }

  return router;
}

// ========================================================================
// ROOT-LEVEL ROUTES FÜR FRONTEND-KOMPATIBILITÄT
// ========================================================================

/**
 * Root-Level Routen für direkten Frontend-Zugriff
 * Templates und SSE Events
 * 
 * @param {Object} agentManager - Agent Manager Instanz
 * @param {Object} eventBusManager - Event Bus Manager Instanz
 * @returns {express.Router} Root-Level Router
 */
export function createRootRoutes(agentManager, eventBusManager) {
  const router = express.Router();

  logger.debug('Initializing root-level routes...');

  // === Templates Endpoint ===
  const templatesHandler = (req, res) => {
    try {
      const templates = agentManager.getTemplates();
      res.json({ 
        templates,
        count: templates.length,
        timestamp: new Date().toISOString()
      });
      logger.debug(`Templates endpoint called: ${templates.length} templates returned`);
    } catch (error) {
      logger.error(`Templates endpoint error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  };

  // === Events (SSE) Endpoint ===
  const eventsHandler = (req, res) => {
    const clientIp = req.ip || req.connection.remoteAddress;
    logger.info(`SSE connection established from ${clientIp}`);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Initial connect message
    res.write(`data: ${JSON.stringify({
      type: 'connection',
      message: 'Real-time event stream connected',
      timestamp: new Date().toISOString()
    })}\n\n`);

    // EventBus listener
    const eventHandler = (eventData) => {
      res.write(`data: ${JSON.stringify(eventData)}\n\n`);
    };
    eventBusManager.on('event', eventHandler);

    // Cleanup on client disconnect
    req.on('close', () => {
      eventBusManager.removeListener('event', eventHandler);
      logger.info(`SSE connection closed from ${clientIp}`);
    });

    // Keep alive ping
    const keepAlive = setInterval(() => {
      res.write(`data: ${JSON.stringify({
        type: 'ping',
        timestamp: new Date().toISOString()
      })}\n\n`);
    }, 30000);

    req.on('close', () => clearInterval(keepAlive));
  };

  // Register endpoints
  router.get("/templates", templatesHandler);
  router.get("/events", eventsHandler);
  router.get("/api/templates", templatesHandler);
  router.get("/api/events", eventsHandler);

  logger.debug('Root-level routes initialized');

  return router;
}

// ========================================================================
// AGENT ROUTES - Inline definiert (TODO: In separate Datei auslagern)
// ========================================================================

function createAgentRoutes(agentManager) {
  const router = express.Router();

  /**
   * GET /api/agents - Liste aller Agents
   */
  router.get("/", (req, res) => {
    try {
      const agents = agentManager.getAllAgents();
      const stats = agentManager.getStats();
      
      res.json({ 
        agents, 
        stats,
        oeeIntegration: {
          enabled: stats.oeeIntegrationEnabled,
          oeeEnabledAgents: stats.oeeEnabledAgents,
          oeeEnhancedAgents: stats.oeeEnhancedAgents
        },
        timestamp: new Date().toISOString() 
      });

      logger.debug(`Agent list requested: ${agents.length} agents returned`);
    } catch (error) {
      logger.error(`Agent list error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/agents/templates - Agent Templates
   */
  router.get("/templates", (req, res) => {
    try {
      const templates = agentManager.getTemplates();
      res.json({ 
        templates, 
        count: templates.length,
        oeeSupported: templates.filter(t => t.oeeEnabled).length,
        timestamp: new Date().toISOString() 
      });

      logger.debug(`Templates requested: ${templates.length} templates`);
    } catch (error) {
      logger.error(`Templates error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/agents/oee - OEE-fähige Agents
   */
  router.get("/oee", (req, res) => {
    try {
      const oeeAgents = agentManager.getOEEEnabledAgents();
      res.json({
        agents: oeeAgents,
        count: oeeAgents.length,
        capabilities: oeeAgents.map(a => ({
          id: a.id,
          name: a.name,
          oeeEnhanced: a.oeeEnhanced || false,
          a2aCapabilities: a.a2aCapabilities || []
        })),
        timestamp: new Date().toISOString()
      });

      logger.debug(`OEE agents requested: ${oeeAgents.length} agents`);
    } catch (error) {
      logger.error(`OEE agents error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/agents/reload - Agents neu laden
   */
  router.post("/reload", (req, res) => {
    try {
      logger.info('Reloading agent configuration...');
      const success = agentManager.reloadAgents();
      
      const stats = agentManager.getStats();
      logger.info(`Agent reload ${success ? 'successful' : 'failed'}: ${stats.loaded} agents loaded`);

      res.json({ 
        status: success ? "success" : "failed", 
        stats,
        message: success ? "Agents reloaded successfully" : "Failed to reload agents",
        timestamp: new Date().toISOString() 
      });
    } catch (error) {
      logger.error(`Agent reload error: ${error.message}`);
      res.status(500).json({ 
        status: "error", 
        message: error.message,
        timestamp: new Date().toISOString() 
      });
    }
  });

  /**
   * POST /api/agents/:agentId/oee - OEE für Agent aktivieren/deaktivieren
   */
  router.post("/:agentId/oee", (req, res) => {
    const { agentId } = req.params;
    const { enabled } = req.body;
    
    try {
      logger.info(`Toggling OEE for agent ${agentId}: ${enabled ? 'enable' : 'disable'}`);
      const success = agentManager.toggleAgentOEE(agentId, enabled);
      
      res.json({
        success,
        agentId,
        oeeEnabled: enabled,
        message: success 
          ? `OEE ${enabled ? 'enabled' : 'disabled'} for ${agentId}` 
          : `Agent ${agentId} not found`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error(`Toggle OEE error for ${agentId}: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

// ========================================================================
// EVENT ROUTES
// ========================================================================

function createEventRoutes(eventBusManager) {
  const router = express.Router();

  /**
   * GET /api/events/subscriptions - Event Subscriptions
   */
  router.get("/subscriptions", (req, res) => {
    try {
      const subscriptions = eventBusManager.getEventSubscriptions();
      res.json(subscriptions);
      logger.debug('Event subscriptions requested');
    } catch (error) {
      logger.error(`Event subscriptions error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/events/oee - OEE Event History
   */
  router.get("/oee", (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 20;
      const history = eventBusManager.getOEEEventHistory(limit);
      res.json(history);
      logger.debug(`OEE event history requested: ${limit} events`);
    } catch (error) {
      logger.error(`OEE event history error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/events/oee/stats - OEE Statistics
   */
  router.get("/oee/stats", (req, res) => {
    try {
      const stats = eventBusManager.getOEEStatistics();
      res.json(stats);
      logger.debug('OEE statistics requested');
    } catch (error) {
      logger.error(`OEE stats error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/events/oee - Publish OEE Event
   */
  router.post("/oee", async (req, res) => {
    try {
      const { eventType, oeeData, sourceAgent } = req.body;
      
      logger.info(`Publishing OEE event: ${eventType || 'updated'} from ${sourceAgent || 'api'}`);

      await eventBusManager.publishOEEEvent(
        eventType || 'updated',
        oeeData,
        sourceAgent || 'api'
      );
      
      res.json({
        success: true,
        eventType: eventType || 'updated',
        published: true,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error(`OEE event publish error: ${error.message}`);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * DELETE /api/events/oee/history - Clear OEE History
   */
  router.delete("/oee/history", (req, res) => {
    try {
      const clearedCount = eventBusManager.clearOEEHistory();
      logger.info(`OEE history cleared: ${clearedCount} events`);
      
      res.json({
        success: true,
        clearedEvents: clearedCount,
        message: `Cleared ${clearedCount} OEE events from history`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error(`Clear OEE history error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

// ========================================================================
// AUDIT ROUTES
// ========================================================================

function createAuditRoutes(auditLogger) {
  const router = express.Router();

  /**
   * GET /api/audit - Audit Log
   */
  router.get("/", (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit) : 100;
      const filter = {};

      if (req.query.type) filter.type = req.query.type;
      if (req.query.agent) filter.agent = req.query.agent;
      if (req.query.startDate) filter.startDate = req.query.startDate;
      if (req.query.endDate) filter.endDate = req.query.endDate;

      const auditLog = auditLogger.getAuditLog(
        Object.keys(filter).length > 0 ? filter : null,
        limit
      );

      res.json({
        entries: auditLog,
        count: auditLog.length,
        filters: { ...filter, limit },
        timestamp: new Date().toISOString()
      });

      logger.debug(`Audit log requested: ${auditLog.length} entries with filters:`, filter);
    } catch (error) {
      logger.error(`Audit log error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/audit/summary - Audit Summary
   */
  router.get("/summary", (req, res) => {
    try {
      const summary = auditLogger.getAuditSummary();
      res.json(summary);
      logger.debug('Audit summary requested');
    } catch (error) {
      logger.error(`Audit summary error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

// ========================================================================
// SYSTEM ROUTES
// ========================================================================

function createSystemRoutes(agentManager, dataManager, eventBusManager) {
  const router = express.Router();

  /**
   * GET /api/system/health - System Health Check
   */
  router.get("/health", (req, res) => {
    try {
      const health = {
        status: "healthy",
        version: packageJson.version,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        agents: agentManager.getStats(),
        data: dataManager.getDataStats(),
        events: eventBusManager.getA2AStatus(),
        oee: {
          integrationEnabled: agentManager.oeeIntegrationEnabled,
          eventHistory: eventBusManager.getOEEStatistics(),
          dataAvailable: !!dataManager.getCachedData("oee")
        },
        timestamp: new Date().toISOString()
      };
      
      res.json(health);
      logger.debug('Health check performed');
    } catch (error) {
      logger.error(`Health check error: ${error.message}`);
      res.status(500).json({
        status: "unhealthy",
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * GET /api/system/status - Detailed System Status
   */
  router.get("/status", (req, res) => {
    try {
      res.json({
        application: {
          name: "Pharmaceutical Manufacturing Agent Framework",
          version: packageJson.version,
          environment: process.env.NODE_ENV || 'development',
          architecture: "Modular Agent-based System"
        },
        runtime: {
          nodeVersion: process.version,
          platform: process.platform,
          uptime: process.uptime(),
          memory: process.memoryUsage()
        },
        components: {
          agentManager: agentManager.getStats(),
          dataManager: dataManager.getDataStats(),
          eventBusManager: eventBusManager.getA2AStatus()
        },
        features: {
          oeeIntegration: agentManager.oeeIntegrationEnabled,
          a2aWorkflows: !!agentManager.a2aManager,
          eventDrivenArchitecture: true,
          gmpCompliance: true
        },
        timestamp: new Date().toISOString()
      });

      logger.debug('System status requested');
    } catch (error) {
      logger.error(`System status error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

// ========================================================================
// WORKFLOW ROUTES
// ========================================================================

function createWorkflowRoutes(agentManager) {
  const router = express.Router();

  /**
   * GET /api/workflows - Available Workflows
   */
  router.get("/", (req, res) => {
    try {
      const workflows = {
        available: !!agentManager.productionWorkflow,
        productionWorkflow: {
          active: !!agentManager.productionWorkflow,
          description: "Pharmaceutical production order analysis workflow"
        },
        agents: agentManager.getA2AEnabledAgents().map(a => ({
          id: a.id,
          name: a.name,
          capabilities: a.a2aCapabilities
        }))
      };
      
      res.json(workflows);
      logger.debug('Workflows requested');
    } catch (error) {
      logger.error(`Workflows error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

// ========================================================================
// A2A (AGENT-TO-AGENT) ROUTES
// ========================================================================

function createA2ARoutes(agentManager) {
  const router = express.Router();

  /**
   * GET /api/a2a/registry - A2A Service Registry
   */
  router.get("/registry", (req, res) => {
    try {
      const registry = agentManager.getA2AServiceRegistry();
      res.json({
        services: registry,
        enabled: !!agentManager.a2aManager,
        timestamp: new Date().toISOString()
      });
      logger.debug('A2A registry requested');
    } catch (error) {
      logger.error(`A2A registry error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/a2a/request - A2A Request
   */
  router.post("/request", async (req, res) => {
    try {
      const { agentId, action, params } = req.body;
      
      logger.info(`A2A request: ${agentId} -> ${action}`);

      if (!agentManager.a2aManager) {
        return res.status(400).json({
          error: "A2A communication not enabled",
          timestamp: new Date().toISOString()
        });
      }

      const result = await agentManager.handleA2ARequest(agentId, action, params);
      
      res.json({
        success: true,
        result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error(`A2A request error: ${error.message}`);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  return router;
}

// ========================================================================
// AUDIT ROUTES
// ========================================================================

function createAuditRoutes(auditLogger) {
  const router = express.Router();

  /**
   * GET /api/audit - Audit Log
   */
  router.get("/", (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit) : 100;
      const filter = {};

      if (req.query.type) filter.type = req.query.type;
      if (req.query.agent) filter.agent = req.query.agent;
      if (req.query.startDate) filter.startDate = req.query.startDate;
      if (req.query.endDate) filter.endDate = req.query.endDate;

      const auditLog = auditLogger.getAuditLog(
        Object.keys(filter).length > 0 ? filter : null,
        limit
      );

      res.json({
        entries: auditLog,
        count: auditLog.length,
        filters: { ...filter, limit },
        timestamp: new Date().toISOString()
      });

      logger.debug(`Audit log requested: ${auditLog.length} entries with filters:`, filter);
    } catch (error) {
      logger.error(`Audit log error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/audit/summary - Audit Summary
   */
  router.get("/summary", (req, res) => {
    try {
      const summary = auditLogger.getAuditSummary();
      res.json(summary);
      logger.debug('Audit summary requested');
    } catch (error) {
      logger.error(`Audit summary error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

// ========================================================================
// SYSTEM ROUTES
// ========================================================================

function createSystemRoutes(agentManager, dataManager, eventBusManager) {
  const router = express.Router();

  /**
   * GET /api/system/health - System Health Check
   */
  router.get("/health", (req, res) => {
    try {
      const health = {
        status: "healthy",
        version: packageJson.version,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        agents: agentManager.getStats(),
        data: dataManager.getDataStats(),
        events: eventBusManager.getA2AStatus(),
        oee: {
          integrationEnabled: agentManager.oeeIntegrationEnabled,
          eventHistory: eventBusManager.getOEEStatistics(),
          dataAvailable: !!dataManager.getCachedData("oee")
        },
        timestamp: new Date().toISOString()
      };
      
      res.json(health);
      logger.debug('Health check performed');
    } catch (error) {
      logger.error(`Health check error: ${error.message}`);
      res.status(500).json({
        status: "unhealthy",
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * GET /api/system/status - Detailed System Status
   */
  router.get("/status", (req, res) => {
    try {
      res.json({
        application: {
          name: "Pharmaceutical Manufacturing Agent Framework",
          version: packageJson.version,
          environment: process.env.NODE_ENV || 'development',
          architecture: "Modular Agent-based System"
        },
        runtime: {
          nodeVersion: process.version,
          platform: process.platform,
          uptime: process.uptime(),
          memory: process.memoryUsage()
        },
        components: {
          agentManager: agentManager.getStats(),
          dataManager: dataManager.getDataStats(),
          eventBusManager: eventBusManager.getA2AStatus()
        },
        features: {
          oeeIntegration: agentManager.oeeIntegrationEnabled,
          a2aWorkflows: !!agentManager.a2aManager,
          eventDrivenArchitecture: true,
          gmpCompliance: true
        },
        timestamp: new Date().toISOString()
      });

      logger.debug('System status requested');
    } catch (error) {
      logger.error(`System status error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

// ========================================================================
// WORKFLOW ROUTES
// ========================================================================

function createWorkflowRoutes(agentManager) {
  const router = express.Router();

  /**
   * GET /api/workflows - Available Workflows
   */
  router.get("/", (req, res) => {
    try {
      const workflows = {
        available: !!agentManager.productionWorkflow,
        productionWorkflow: {
          active: !!agentManager.productionWorkflow,
          description: "Pharmaceutical production order analysis workflow"
        },
        agents: agentManager.getA2AEnabledAgents().map(a => ({
          id: a.id,
          name: a.name,
          capabilities: a.a2aCapabilities
        }))
      };
      
      res.json(workflows);
      logger.debug('Workflows requested');
    } catch (error) {
      logger.error(`Workflows error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

// ========================================================================
// A2A (AGENT-TO-AGENT) ROUTES
// ========================================================================

function createA2ARoutes(agentManager) {
  const router = express.Router();

  /**
   * GET /api/a2a/registry - A2A Service Registry
   */
  router.get("/registry", (req, res) => {
    try {
      const registry = agentManager.getA2AServiceRegistry();
      res.json({
        services: registry,
        enabled: !!agentManager.a2aManager,
        timestamp: new Date().toISOString()
      });
      logger.debug('A2A registry requested');
    } catch (error) {
      logger.error(`A2A registry error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/a2a/request - A2A Request
   */
  router.post("/request", async (req, res) => {
    try {
      const { agentId, action, params } = req.body;
      
      logger.info(`A2A request: ${agentId} -> ${action}`);

      if (!agentManager.a2aManager) {
        return res.status(400).json({
          error: "A2A communication not enabled",
          timestamp: new Date().toISOString()
        });
      }

      const result = await agentManager.handleA2ARequest(agentId, action, params);
      
      res.json({
        success: true,
        result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error(`A2A request error: ${error.message}`);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  return router;
}