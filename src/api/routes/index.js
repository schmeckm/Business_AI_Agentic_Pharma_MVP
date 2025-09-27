/**
 * ========================================================================
 * API ROUTES - COMPREHENSIVE ROUTING SYSTEM
 * ========================================================================
 * 
 * Complete routing system for pharmaceutical manufacturing agent framework
 * Supports frontend integration, OEE monitoring, and A2A workflows
 * Includes Server-Sent Events for real-time monitoring
 * 
 * Features:
 * - Modular route organization for maintainability
 * - Frontend compatibility routes (/templates, /events)
 * - Real-time event streaming for monitoring dashboard
 * - OEE data integration and analytics endpoints
 * - A2A workflow management endpoints
 * - Comprehensive audit logging endpoints
 * - System health and status monitoring
 * - GMP compliance and validation endpoints
 * 
 * Developer: Markus Schmeckenbecher
 * Version: 2.1.0 - Frontend Integration + OEE Support
 * ========================================================================
 */

import express from "express";
import { readFileSync } from "fs";

// Dynamic versioning from package.json
let packageJson;
try {
  packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));
} catch (error) {
  packageJson = { version: "2.1.0" }; // Fallback version
}

// ========================================================================
// MAIN ROUTER FACTORY
// ========================================================================

/**
 * Creates the complete API routing structure
 * Registers all route modules with proper middleware and error handling
 * 
 * @param {AgentManager} agentManager - Agent lifecycle and execution manager
 * @param {DataManager} dataManager - Data source and cache manager
 * @param {EventBusManager} eventBusManager - Event-driven communication manager
 * @param {AuditLogger} auditLogger - GMP compliance audit logging
 * @returns {express.Router} Complete API router
 */
export function createRoutes(agentManager, dataManager, eventBusManager, auditLogger) {
  const router = express.Router();

  // Register modular route systems
  router.use("/chat", createChatRoutes(agentManager, auditLogger, eventBusManager));
  router.use("/agents", createAgentRoutes(agentManager));
  router.use("/data", createDataRoutes(dataManager));
  router.use("/events", createEventRoutes(eventBusManager));
  router.use("/audit", createAuditRoutes(auditLogger));
  router.use("/system", createSystemRoutes(agentManager, dataManager, eventBusManager));
  router.use("/workflows", createWorkflowRoutes(agentManager));
  router.use("/a2a", createA2ARoutes(agentManager));
  router.use("/oee", createOEERoutes(dataManager, eventBusManager)); // NEW: Dedicated OEE endpoints

  return router;
}

/**
 * Creates root-level routes for frontend compatibility
 * Provides direct access to frequently used endpoints without /api prefix
 * 
 * @param {AgentManager} agentManager - Agent manager instance
 * @param {EventBusManager} eventBusManager - Event manager for real-time streams
 * @returns {express.Router} Root-level router
 */
export function createRootRoutes(agentManager, eventBusManager) {
  const router = express.Router();

  // Frontend compatibility routes
  router.get("/templates", (req, res) => {
    try {
      const templates = agentManager.getTemplates();
      res.json(templates);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Server-Sent Events stream for frontend real-time monitoring
  router.get("/events", (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Send initial connection confirmation
    res.write(`data: ${JSON.stringify({
      type: 'connection',
      message: 'Real-time event stream connected',
      timestamp: new Date().toISOString()
    })}\n\n`);

    // Register event listener for all system events
    const eventHandler = (eventData) => {
      res.write(`data: ${JSON.stringify(eventData)}\n\n`);
    };

    eventBusManager.on('event', eventHandler);

    // Cleanup on client disconnect
    req.on('close', () => {
      eventBusManager.removeListener('event', eventHandler);
      console.log('Event stream client disconnected');
    });

    // Keep-alive mechanism to prevent timeout
    const keepAlive = setInterval(() => {
      res.write(`data: ${JSON.stringify({
        type: 'ping',
        timestamp: new Date().toISOString()
      })}\n\n`);
    }, 30000);

    // Clear keep-alive on disconnect
    req.on('close', () => {
      clearInterval(keepAlive);
    });
  });

  return router;
}

export default createRoutes;

// ========================================================================
// CHAT ROUTES - Agent Interaction Interface
// ========================================================================

/**
 * Creates chat-related routes for agent interaction
 * Handles user commands and triggers appropriate agents
 * 
 * @param {AgentManager} agentManager - Agent execution manager
 * @param {AuditLogger} auditLogger - Audit logging for GMP compliance
 * @param {EventBusManager} eventBusManager - Event system for agent communication
 * @returns {express.Router} Chat router
 */
function createChatRoutes(agentManager, auditLogger, eventBusManager) {
  const router = express.Router();

  /**
   * POST /api/chat
   * Main chat interface for processing user commands
   * Finds appropriate agent and executes manufacturing commands
   * 
   * Request Body:
   * - message: Manufacturing command (e.g., "ask-today-orders")
   * - user: User identifier for audit logging
   * 
   * Response:
   * - response: Agent-generated response text
   * - agentUsed: ID of agent that processed the command
   * - eventChainTriggered: Array of events published by the agent
   * - timestamp: ISO timestamp of processing
   */
  router.post("/", async (req, res) => {
    const { message, user } = req.body;
    let agentUsed = null;
    let responseText = "";

    try {
      // Find agent capable of handling the command
      const agent = agentManager.findAgent(message);

if (agent) {
  agentUsed = agent.id;
  responseText = await agentManager.processAgent(agent, message);
} else {
  // Fallback für Freitext mit Daten-Constraint
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
   * GET /api/chat/history
   * Retrieves recent chat interactions for audit purposes
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

// ========================================================================
// AGENT ROUTES - Agent Management and Configuration
// ========================================================================

/**
 * Creates agent management routes
 * Provides agent registry, templates, and configuration endpoints
 * 
 * @param {AgentManager} agentManager - Agent lifecycle manager
 * @returns {express.Router} Agent management router
 */
function createAgentRoutes(agentManager) {
  const router = express.Router();

  /**
   * GET /api/agents
   * Returns complete agent registry with capabilities and statistics
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
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/agents/templates
   * Returns agent command templates for frontend dropdown
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
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/agents/oee
   * Returns OEE-enabled agents and their capabilities
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
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/agents/reload
   * Reloads agent configuration from agents.yaml
   */
  router.post("/reload", (req, res) => {
    try {
      console.log('Reloading agent configuration...');
      const success = agentManager.reloadAgents();
      
      res.json({ 
        status: success ? "success" : "failed", 
        stats: agentManager.getStats(),
        message: success ? "Agents reloaded successfully" : "Failed to reload agents",
        timestamp: new Date().toISOString() 
      });
    } catch (error) {
      res.status(500).json({ 
        status: "error", 
        message: error.message,
        timestamp: new Date().toISOString() 
      });
    }
  });

  /**
   * POST /api/agents/:agentId/oee
   * Toggle OEE integration for specific agent
   */
  router.post("/:agentId/oee", (req, res) => {
    const { agentId } = req.params;
    const { enabled } = req.body;
    
    try {
      const success = agentManager.toggleAgentOEE(agentId, enabled);
      res.json({
        success,
        agentId,
        oeeEnabled: enabled,
        message: success ? `OEE ${enabled ? 'enabled' : 'disabled'} for ${agentId}` : `Agent ${agentId} not found`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

// ========================================================================
// DATA ROUTES - Data Management and Analytics
// ========================================================================

/**
 * Creates data management routes
 * Provides access to production data, OEE metrics, and analytics
 * 
 * @param {DataManager} dataManager - Data source manager
 * @returns {express.Router} Data management router
 */
function createDataRoutes(dataManager) {
  const router = express.Router();

  /**
   * GET /api/data
   * Returns data overview and statistics
   */
  router.get("/", (req, res) => {
    try {
      const includeFullData = req.query.full === 'true';
      const overview = dataManager.getDataOverview(includeFullData);
      res.json(overview);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/data/stats
   * Returns detailed data statistics and cache status
   */
  router.get("/stats", (req, res) => {
    try {
      res.json({
        stats: dataManager.getDataStats(),
        loaded: dataManager.getLoadedDataKeys(),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/data/validate
   * Validates data integrity and completeness
   */
  router.get("/validate", (req, res) => {
    try {
      const requiredFiles = req.query.required ? req.query.required.split(',') : undefined;
      const validation = dataManager.validateDataIntegrity(requiredFiles);
      res.json(validation);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/data/reload
   * Reloads all data sources from files
   */
  router.post("/reload", (req, res) => {
    try {
      console.log('Reloading data sources...');
      const success = dataManager.reloadData();
      res.json({
        status: success ? "success" : "failed",
        loaded: dataManager.getLoadedDataKeys(),
        message: success ? "Data reloaded successfully" : "Failed to reload data",
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        status: "error",
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * GET /api/data/oee
   * Returns current OEE metrics and equipment status
   */
  router.get("/oee", async (req, res) => {
    try {
      const data = await dataManager.getCachedData("oee", true);
      res.json({ 
        success: true, 
        data, 
        count: Array.isArray(data) ? data.length : 0,
        timestamp: new Date().toISOString() 
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error.message, 
        timestamp: new Date().toISOString() 
      });
    }
  });

  /**
   * GET /api/data/orders-oee
   * Returns production orders enriched with OEE data
   */
  router.get("/orders-oee", async (req, res) => {
    try {
      const data = await dataManager.getOrdersWithOEE();
      res.json({
        success: true,
        orders: data,
        count: data.length,
        enhanced: true,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Orders+OEE endpoint error:", error.message);
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
// EVENT ROUTES - Real-time Event Management
// ========================================================================

/**
 * Creates event management routes
 * Provides event subscriptions, history, and real-time monitoring
 * 
 * @param {EventBusManager} eventBusManager - Event system manager
 * @returns {express.Router} Event management router
 */
function createEventRoutes(eventBusManager) {
  const router = express.Router();

  /**
   * GET /api/events/subscriptions
   * Returns event subscription mappings and agent assignments
   */
  router.get("/subscriptions", (req, res) => {
    try {
      const subscriptions = eventBusManager.getEventSubscriptions();
      res.json(subscriptions);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/events/oee
   * Returns OEE event history and analytics
   */
  router.get("/oee", (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 20;
      const history = eventBusManager.getOEEEventHistory(limit);
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/events/oee/stats
   * Returns OEE event statistics and trends
   */
  router.get("/oee/stats", (req, res) => {
    try {
      const stats = eventBusManager.getOEEStatistics();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/events/oee
   * Publishes OEE event to trigger agent workflows
   */
  router.post("/oee", async (req, res) => {
    try {
      const { eventType, oeeData, sourceAgent } = req.body;
      
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
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * DELETE /api/events/oee/history
   * Clears OEE event history for maintenance
   */
  router.delete("/oee/history", (req, res) => {
    try {
      const clearedCount = eventBusManager.clearOEEHistory();
      res.json({
        success: true,
        clearedEvents: clearedCount,
        message: `Cleared ${clearedCount} OEE events from history`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

// ========================================================================
// OEE ROUTES - Dedicated Equipment Effectiveness Endpoints
// ========================================================================

/**
 * Creates dedicated OEE management routes
 * Provides specialized endpoints for equipment effectiveness monitoring
 * 
 * @param {DataManager} dataManager - Data source manager
 * @param {EventBusManager} eventBusManager - Event system for OEE updates
 * @returns {express.Router} OEE management router
 */
function createOEERoutes(dataManager, eventBusManager) {
  const router = express.Router();

  /**
   * GET /api/oee
   * Returns current OEE dashboard data
   */
  router.get("/", async (req, res) => {
    try {
      const oeeData = await dataManager.getCachedData("oee", true);
      const oeeStats = eventBusManager.getOEEStatistics();
      
      res.json({
        success: true,
        metrics: oeeData,
        statistics: oeeStats,
        dashboard: {
          totalEquipment: Array.isArray(oeeData) ? oeeData.length : 0,
          activeEvents: oeeStats.totalOEEEvents,
          subscribers: oeeStats.oeeSubscriberCount
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * POST /api/oee/refresh
   * Forces refresh of OEE data cache
   */
  router.post("/refresh", (req, res) => {
    try {
      // Trigger data refresh if method exists
      if (typeof dataManager.refreshOEECache === 'function') {
        dataManager.refreshOEECache();
      }
      
      // Publish refresh event
      eventBusManager.publishOEEEvent('cache_refreshed', {
        triggeredBy: 'api',
        timestamp: new Date().toISOString()
      }, 'system');
      
      res.json({
        success: true,
        message: "OEE cache refresh triggered",
        timestamp: new Date().toISOString()
      });
    } catch (error) {
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
// AUDIT ROUTES - GMP Compliance and Audit Logging
// ========================================================================

/**
 * Creates audit and compliance routes
 * Provides GMP-compliant audit trails and validation reports
 * 
 * @param {AuditLogger} auditLogger - Audit logging system
 * @returns {express.Router} Audit management router
 */
function createAuditRoutes(auditLogger) {
  const router = express.Router();

  /**
   * GET /api/audit
   * Returns audit log entries with filtering options
   */
router.get("/", (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : 100;
    const filter = {};

    if (req.query.type) filter.type = req.query.type;
    if (req.query.agent) filter.agent = req.query.agent;
    if (req.query.startDate) filter.startDate = req.query.startDate;
    if (req.query.endDate) filter.endDate = req.query.endDate;

    // 👉 Nutze die Methode, die dein AuditLogger wirklich hat
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
  } catch (error) {
    console.error("❌ Audit route error:", error);
    res.status(500).json({ error: error.message });
  }
});


  /**
   * GET /api/audit/summary
   * Returns audit summary and compliance metrics
   */
  router.get("/summary", (req, res) => {
    try {
      const summary = auditLogger.getAuditSummary();
      res.json(summary);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

// ========================================================================
// SYSTEM ROUTES - Health and Status Monitoring
// ========================================================================

/**
 * Creates system monitoring routes
 * Provides health checks, status monitoring, and version information
 * 
 * @param {AgentManager} agentManager - Agent system manager
 * @param {DataManager} dataManager - Data system manager
 * @param {EventBusManager} eventBusManager - Event system manager
 * @returns {express.Router} System monitoring router
 */
function createSystemRoutes(agentManager, dataManager, eventBusManager) {
  const router = express.Router();

  /**
   * GET /api/system/health
   * Returns comprehensive system health status
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
    } catch (error) {
      res.status(500).json({
        status: "unhealthy",
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * GET /api/system/status
   * Returns detailed system status and configuration
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
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

// ========================================================================
// WORKFLOW ROUTES - A2A Workflow Management
// ========================================================================

/**
 * Creates A2A workflow management routes
 * Provides endpoints for Agent-to-Agent workflow execution
 * 
 * @param {AgentManager} agentManager - Agent system with A2A capabilities
 * @returns {express.Router} Workflow management router
 */
function createWorkflowRoutes(agentManager) {
  const router = express.Router();

  /**
   * GET /api/workflows
   * Returns available A2A workflows and their status
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
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

// ========================================================================
// A2A ROUTES - Agent-to-Agent Communication
// ========================================================================

/**
 * Creates A2A communication routes
 * Provides direct Agent-to-Agent communication endpoints
 * 
 * @param {AgentManager} agentManager - Agent system with A2A support
 * @returns {express.Router} A2A communication router
 */
function createA2ARoutes(agentManager) {
  const router = express.Router();

  /**
   * GET /api/a2a/registry
   * Returns A2A service registry and capabilities
   */
  router.get("/registry", (req, res) => {
    try {
      const registry = agentManager.getA2AServiceRegistry();
      res.json({
        services: registry,
        enabled: !!agentManager.a2aManager,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/a2a/request
   * Executes A2A request between agents
   */
  router.post("/request", async (req, res) => {
    try {
      const { agentId, action, params } = req.body;
      
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
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  return router;
}