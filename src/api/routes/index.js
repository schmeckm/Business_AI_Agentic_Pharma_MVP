/**
 * ========================================================================
 * DATEI: src/api/routes/index.js - VEREINFACHTE MIGRATION
 * ========================================================================
 * 
 * Schrittweise Migration: Verwendet Ihre bestehende routes.js Logik
 * mit den neuen OEE-Features, ohne alle Module auf einmal zu erstellen
 * ========================================================================
 */

import express from "express";
import { readFileSync } from "fs";

// Package version
let packageJson;
try {
  packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));
} catch (error) {
  packageJson = { version: "2.1.0" };
}

/**
 * Hauptfunktion für API-Routen (Ersetzt createRoutes)
 * Kombiniert Ihre bestehende Logik mit neuen OEE-Features
 */
export function createAPIRoutes(agentManager, dataManager, eventBusManager, auditLogger, a2aManager) {
  const router = express.Router();

  // Chat Routes - Ihre bestehende Logik
  router.use("/chat", createChatRoutes(agentManager, auditLogger, eventBusManager));
  
  // Agent Routes - Ihre bestehende Logik
  router.use("/agents", createAgentRoutes(agentManager));
  
  // Data Routes - Erweitert mit OEE
  router.use("/data", createDataRoutes(dataManager, eventBusManager));
  
  // Neue dedizierte OEE Routes
  router.use("/oee", createOEERoutes(dataManager, eventBusManager));
  
  // Event Routes - Ihre bestehende Logik
  router.use("/events", createEventRoutes(eventBusManager));
  
  // Audit Routes - Ihre bestehende Logik
  router.use("/audit", createAuditRoutes(auditLogger));
  
  // System Routes - Ihre bestehende Logik
  router.use("/system", createSystemRoutes(agentManager, dataManager, eventBusManager));
  
  // Workflow Routes - Ihre bestehende Logik
  router.use("/workflows", createWorkflowRoutes(agentManager));
  
  // A2A Routes - Ihre bestehende Logik
  router.use("/a2a", createA2ARoutes(agentManager));

  return router;
}

/**
 * Root-Level Routen für Frontend-Kompatibilität
 */
export function createRootRoutes(agentManager, eventBusManager) {
  const router = express.Router();

  // Frontend Templates
  router.get("/templates", (req, res) => {
    try {
      const templates = agentManager.getTemplates();
      res.json({ 
        templates,
        count: templates.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Server-Sent Events
  router.get("/events", (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    res.write(`data: ${JSON.stringify({
      type: 'connection',
      message: 'Real-time event stream connected',
      timestamp: new Date().toISOString()
    })}\n\n`);

    const eventHandler = (eventData) => {
      res.write(`data: ${JSON.stringify(eventData)}\n\n`);
    };

    eventBusManager.on('event', eventHandler);

    req.on('close', () => {
      eventBusManager.removeListener('event', eventHandler);
      console.log('Event stream client disconnected');
    });

    const keepAlive = setInterval(() => {
      res.write(`data: ${JSON.stringify({
        type: 'ping',
        timestamp: new Date().toISOString()
      })}\n\n`);
    }, 30000);

    req.on('close', () => clearInterval(keepAlive));
  });

  return router;
}

// ========================================================================
// CHAT ROUTES - Ihre bestehende Logik
// ========================================================================

function createChatRoutes(agentManager, auditLogger, eventBusManager) {
  const router = express.Router();

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

router.get("/history", async (req, res) => {
  try {
    const { limit = 100, lineId, startDate, endDate } = req.query;
    let historyData = [];

    // 1) Versuche EventBus
    if (eventBusManager && typeof eventBusManager.getOEEEventHistory === 'function') {
      historyData = eventBusManager.getOEEEventHistory(parseInt(limit));
    }

    // 2) Fallback: oee_history.json lesen
    if (!historyData || historyData.length === 0) {
      const filePath = path.join(process.cwd(), "oee_history.json");
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, "utf8");
        const fileData = JSON.parse(raw);
        historyData = fileData.slice(-limit); // nur die letzten n Einträge
        console.log(`📂 Loaded ${historyData.length} OEE records from oee_history.json`);
      }
    }

    // Filter anwenden
    if (lineId) {
      historyData = historyData.filter(item =>
        item.line === lineId || item.lineId === lineId
      );
    }
    if (startDate) {
      const start = new Date(startDate);
      historyData = historyData.filter(item => new Date(item.timestamp) >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      historyData = historyData.filter(item => new Date(item.timestamp) <= end);
    }

    res.json({
      success: true,
      history: historyData,
      count: historyData.length,
      parameters: { limit: parseInt(limit), lineId, startDate, endDate },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ OEE History endpoint error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

  return router;
}

// ========================================================================
// AGENT ROUTES - Ihre bestehende Logik
// ========================================================================

function createAgentRoutes(agentManager) {
  const router = express.Router();

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
// DATA ROUTES - ERWEITERT MIT OEE
// ========================================================================

function createDataRoutes(dataManager, eventBusManager) {
  const router = express.Router();

  router.get("/", (req, res) => {
    try {
      const includeFullData = req.query.full === 'true';
      const overview = dataManager.getDataOverview(includeFullData);
      res.json(overview);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

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

  // DER GESUCHTE ENDPUNKT!
  router.get("/oee_history", (req, res) => {
    // Redirect zum neuen OEE History Endpunkt
    const queryString = new URLSearchParams(req.query).toString();
    const redirectUrl = `/api/oee/history${queryString ? '?' + queryString : ''}`;
    
    console.log(`Redirecting /api/data/oee_history to ${redirectUrl}`);
    res.redirect(redirectUrl);
  });

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

  return router;
}

// ========================================================================
// NEUE OEE ROUTES - IHR GESUCHTER ENDPUNKT
// ========================================================================

function createOEERoutes(dataManager, eventBusManager) {
  const router = express.Router();

  router.get("/history", async (req, res) => {
    try {
      const { limit = 100, lineId, startDate, endDate } = req.query;
      let historyData = [];

      // 1) EventBus versuchen
      if (eventBusManager && typeof eventBusManager.getOEEEventHistory === "function") {
        historyData = eventBusManager.getOEEEventHistory(parseInt(limit));
        console.log(`Loaded ${historyData.length} OEE events from EventBus`);
      }

      // 2) Fallback: Datei oee_history.json einlesen
      if (!historyData || historyData.length === 0) {
        const filePath = path.join(process.cwd(), "oee_history.json");
        if (fs.existsSync(filePath)) {
          const raw = fs.readFileSync(filePath, "utf8");
          const fileData = JSON.parse(raw);
          historyData = Array.isArray(fileData) ? fileData.slice(-limit) : [];
          console.log(`📂 Loaded ${historyData.length} OEE records from oee_history.json`);
        }
      }

      // 3) Wenn immer noch leer → Mockdaten
      if (!historyData || historyData.length === 0) {
        historyData = generateOEEHistory(parseInt(limit), lineId);
        console.log(`Generated ${historyData.length} mock OEE history records`);
      }

      // Filter anwenden
      if (lineId && historyData.length > 0) {
        historyData = historyData.filter(item => item.line === lineId || item.lineId === lineId);
      }
      if (startDate && historyData.length > 0) {
        const start = new Date(startDate);
        historyData = historyData.filter(item => new Date(item.timestamp) >= start);
      }
      if (endDate && historyData.length > 0) {
        const end = new Date(endDate);
        historyData = historyData.filter(item => new Date(item.timestamp) <= end);
      }

      res.json({
        success: true,
        history: historyData,
        count: historyData.length,
        parameters: { limit: parseInt(limit), lineId, startDate, endDate },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error("❌ OEE History endpoint error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
        endpoint: "/api/oee/history",
        timestamp: new Date().toISOString()
      });
    }
  });

  return router;
}

// Helper function für Mock OEE History
function generateOEEHistory(limit, lineId) {
  const mockData = [];
  const lines = lineId ? [lineId] : ['LINE-01', 'LINE-02', 'LINE-03'];
  
  for (let i = 0; i < limit; i++) {
    const selectedLine = lines[i % lines.length];
    const minutesAgo = i * 3;
    
    mockData.push({
      timestamp: new Date(Date.now() - (minutesAgo * 60000)).toISOString(),
      lineId: selectedLine,
      lineName: `Production Line ${selectedLine.split('-')[1]}`,
      oee: Math.round((85 + Math.random() * 10) * 100) / 100,
      availability: Math.round((90 + Math.random() * 8) * 100) / 100,
      performance: Math.round((88 + Math.random() * 10) * 100) / 100,
      quality: Math.round((95 + Math.random() * 4) * 100) / 100,
      status: Math.random() > 0.9 ? 'maintenance' : 'running',
      eventType: 'oee_update',
      source: 'mock_generator'
    });
  }
  
  return mockData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

// ========================================================================
// ALLE ANDEREN ROUTES - Ihre bestehende Logik
// ========================================================================

function createEventRoutes(eventBusManager) {
  const router = express.Router();

  router.get("/subscriptions", (req, res) => {
    try {
      const subscriptions = eventBusManager.getEventSubscriptions();
      res.json(subscriptions);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/oee", (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 20;
      const history = eventBusManager.getOEEEventHistory(limit);
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/oee/stats", (req, res) => {
    try {
      const stats = eventBusManager.getOEEStatistics();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

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

function createAuditRoutes(auditLogger) {
  const router = express.Router();

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
    } catch (error) {
      console.error("Audit route error:", error);
      res.status(500).json({ error: error.message });
    }
  });

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

function createSystemRoutes(agentManager, dataManager, eventBusManager) {
  const router = express.Router();

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

function createWorkflowRoutes(agentManager) {
  const router = express.Router();

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

function createA2ARoutes(agentManager) {
  const router = express.Router();

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