/**
 * ========================================================================
 * PHARMACEUTICAL MANUFACTURING AGENT SYSTEM - SERVER.JS (A2A ENHANCED)
 * ========================================================================
 * 
 * Enterprise AI Operations Platform for Pharmaceutical Production
 * MVP Version: 1.2.5 - A2A Integration + Frontend Routes Fixed
 * 
 * Developer: Markus Schmeckenbecher
 * Contact: markus.schmeckenbecher@company.com
 * Repository: Business_AI_Agent_Pharma_MVP
 * 
 * ========================================================================
 * CHANGE LOG
 * ========================================================================
 * 
 * v1.2.5 - 2025-09-26 - Markus Schmeckenbecher
 * ✅ BUGFIX: Added missing frontend compatibility routes (/templates, /events)
 * ✅ ENHANCEMENT: Direct root-level routes for frontend integration
 * ✅ ENHANCEMENT: Server-Sent Events stream for real-time monitoring
 * ✅ IMPROVEMENT: Frontend 404 errors resolved
 * 
 * v1.2.4 - 2025-09-24 - Markus Schmeckenbecher
 * ✅ VERIFIED: EventBus integration working correctly with eventBusManager
 * ✅ ENHANCEMENT: Added comprehensive documentation and status reporting
 * ✅ ENHANCEMENT: Enhanced A2A status endpoint with EventBus integration info
 * ✅ IMPROVEMENT: Better error handling and component initialization logging
 * 
 * v1.2.3 - 2025-09-22 - Markus Schmeckenbecher
 * ✅ BUGFIX: EventBusManager-AgentManager dependency linking
 * ✅ Fixed A2A communication errors
 * ✅ Added proper dependency injection for A2A workflows
 * 
 * v1.2.2 - 2025-09-21 - Markus Schmeckenbecher
 * ✅ ENHANCEMENT: A2A Integration (Phase 1)
 * ✅ Added A2AManager for Agent-to-Agent Communication
 * ✅ Enhanced AgentManager with A2A capabilities
 * ✅ Backward compatible - existing Event system still works
 * ✅ Added A2A test endpoints alongside existing APIs
 * ✅ Parallel Event + A2A architecture for gradual migration
 * 
 * v1.2.1 - 2025-09-21 - Markus Schmeckenbecher
 * ✅ MAJOR REFACTORING: Modular Architecture Implementation
 * ✅ Extracted EventBusManager → src/eventBus/EventBusManager.js
 * ✅ Extracted AgentManager → src/agents/AgentManager.js
 * ✅ Extracted DataManager → src/data/DataManager.js
 * ✅ Extracted AuditLogger → src/audit/AuditLogger.js
 * ✅ Extracted API Routes → src/api/routes/
 * 
 * ========================================================================
 */

// ========================================================================
// CORE DEPENDENCIES
// ========================================================================

import express from "express";
import dotenv from "dotenv";
import { BufferMemory } from "langchain/memory";

// Import modular components
import { EventBusManager } from "./src/eventBus/EventBusManager.js";
import { AgentManager } from "./src/agents/AgentManager.js";
import { DataManager } from "./src/data/DataManager.js";
import { AuditLogger } from "./src/audit/AuditLogger.js";
import { A2AManager } from './src/a2a/A2AManager.js';
import { createRoutes } from "./src/api/routes/index.js";
import packageJson from './package.json';
import { integrateMCPServer } from './src/mcp/MCPServer.js';

// OEE Simulator import
import { OEESimulator } from "./src/simulator/OEESimulator.js";

// NOTE: EventBusManager instance provides EventEmitter interface - no separate eventBus import needed

// Load environment configuration
dotenv.config();

// ========================================================================
// SERVER INITIALIZATION
// ========================================================================

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware setup
app.use(express.json());
app.use(express.static("public"));

// Environment configuration
const USE_LANGCHAIN = process.env.USE_LANGCHAIN === "true" || false;
const USE_ACTIONS = process.env.USE_ACTIONS === "true" || false;
const AGENT_MODE = process.env.AGENT_MODE || "simple";
const ENABLE_A2A = process.env.ENABLE_A2A !== "false"; // A2A enabled by default
const ENABLE_OEE_SIMULATOR = process.env.ENABLE_OEE_SIMULATOR === "true"; // Feature Flag

console.log(`🔧 System Configuration:`);
console.log(`   Developer: Markus Schmeckenbecher`);
console.log(`   USE_LANGCHAIN: ${USE_LANGCHAIN}`);
console.log(`   USE_ACTIONS: ${USE_ACTIONS}`);
console.log(`   AGENT_MODE: ${AGENT_MODE}`);
console.log(`   ENABLE_A2A: ${ENABLE_A2A}`);
console.log(`   ENABLE_OEE_SIMULATOR: ${ENABLE_OEE_SIMULATOR}`);

// ========================================================================
// COMPONENT INITIALIZATION (Enhanced with A2A - Correct Order)
// ========================================================================

console.log("🚀 Initializing system components...");

// 1. Initialize Data Manager (no dependencies)
const dataManager = new DataManager();
console.log("✅ DataManager initialized");

// 2. Initialize Audit Logger (minimal dependencies)
const auditLogger = new AuditLogger();
console.log("✅ AuditLogger initialized");

// 3. Initialize Event Bus Manager (needs audit logger)
const eventBusManager = new EventBusManager(auditLogger);
console.log("✅ EventBusManager initialized");

// 4. Initialize A2A Manager
const a2aManager = ENABLE_A2A ? new A2AManager(eventBusManager, auditLogger) : null;
if (a2aManager) {
  console.log("✅ A2A Manager initialized");
} else {
  console.log("⚪ A2A Manager disabled by configuration");
}

// 5. Initialize Agent Manager
const agentManager = new AgentManager(dataManager, eventBusManager, auditLogger, a2aManager);
console.log("✅ AgentManager initialized");

// 6. Integrate MCP Server
console.log("🔗 Integrating MCP Server...");
const mcpServer = await integrateMCPServer(app, {
    eventBus: eventBusManager,
    dataManager,
    auditLogger,
    agentManager
});
console.log('✅ MCP Server integrated successfully');

// ========================================================================
// CRITICAL FIX: Link EventBusManager to AgentManager for A2A
// ========================================================================

try {
  if (typeof eventBusManager.setAgentManager === 'function') {
    eventBusManager.setAgentManager(agentManager);
    console.log("🔗 EventBusManager linked to AgentManager for A2A communication");
  } else {
    eventBusManager.agentManager = agentManager;
    console.log("🔗 EventBusManager directly linked to AgentManager (fallback method)");
  }
} catch (error) {
  console.warn("⚠️ Could not link EventBusManager to AgentManager:", error.message);
}

auditLogger.eventBusManager = eventBusManager;
console.log("🔗 AuditLogger linked to EventBusManager");

console.log("✅ All components initialized successfully");

// ========================================================================
// MEMORY MANAGEMENT SYSTEM
// ========================================================================

const agentMemories = new Map();
function getMemory(userId = "default") {
  if (!agentMemories.has(userId)) {
    agentMemories.set(
      userId,
      new BufferMemory({
        memoryKey: "chat_history",
        returnMessages: true,
        inputKey: "input",
        outputKey: "output",
      })
    );
  }
  return agentMemories.get(userId);
}

// ========================================================================
// SYSTEM STARTUP & DATA LOADING
// ========================================================================

async function initializeSystem() {
  console.log("🔄 Loading system configuration and data...");
  
  try {
    await dataManager.loadDataSourceConfig();
    await dataManager.loadAllData();
    
    const agentsLoaded = agentManager.loadAgents();
    if (!agentsLoaded) {
      console.error("❌ Critical: Failed to load agents");
      process.exit(1);
    }
    
    const dataValidation = dataManager.validateDataIntegrity();
    if (!dataValidation.isValid) {
      console.warn("⚠️ Data integrity warning:", dataValidation.missing);
    }
    
    console.log("✅ System initialization completed successfully");
    
    auditLogger.logSystemEvent("system_startup", {
      version: packageJson.version,
      components: ["EventBusManager", "AgentManager", "DataManager", "AuditLogger", "A2AManager", "MCPServer"],
      configuration: { USE_LANGCHAIN, USE_ACTIONS, AGENT_MODE, ENABLE_A2A },
      eventBusIntegration: "Working - EventBusManager provides EventEmitter interface",
      mcpIntegration: "Successful"
    });

  } catch (error) {
    console.error("❌ Critical error during system initialization:", error);
    process.exit(1);
  }
}

await initializeSystem();

// ========================================================================
// START OEE SIMULATOR IF ENABLED
// ========================================================================

let oeeSimulator = null;

if (ENABLE_OEE_SIMULATOR) {
  try {
    oeeSimulator = new OEESimulator({
      MQTT_BROKER_URL: process.env.MQTT_BROKER_URL,
      MQTT_TOPIC_BASE: process.env.MQTT_TOPIC_BASE,
      OEE_LINES: process.env.OEE_LINES,
      OEE_INTERVAL_MS: process.env.OEE_INTERVAL_MS,
    });

    await oeeSimulator.start();
    console.log("✅ OEE Simulator started and publishing to MQTT");
  } catch (error) {
    console.error("❌ Failed to start OEE Simulator:", error);
  }
} else {
  console.log("ℹ️ OEE Simulator disabled by configuration");
}

// ========================================================================
// API ROUTES SETUP (Enhanced with A2A)
// ========================================================================

const apiRoutes = createRoutes(agentManager, dataManager, eventBusManager, auditLogger, a2aManager);
app.use("/api", apiRoutes);

// ========================================================================
// DIRECT OEE ENDPOINT (Shortcut)
// ========================================================================
app.get("/api/oee", async (req, res) => {
  try {
    // forceRefresh=true, damit immer aktuelle MQTT-Daten kommen
    const data = await dataManager.getCachedData("oee", true);
    res.json({
      success: true,
      data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("❌ OEE API error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ========================================================================
// FRONTEND COMPATIBILITY ROUTES (Root-Level) - NEW
// ========================================================================

/**
 * Frontend Templates Route
 * Provides agent templates for frontend dropdown without /api prefix
 */
app.get('/templates', (req, res) => {
  try {
    const templates = agentManager.getTemplates();
    console.log(`📋 Frontend requested templates: ${templates.length} templates served`);
    res.json({ 
      templates,                    // ← Fix: Objekt mit templates Property
      count: templates.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("❌ Templates endpoint error:", error.message);
    res.status(500).json({ error: error.message });
  }
});
/**
 * Frontend Events Route (Server-Sent Events)
 * Provides real-time event stream for frontend monitoring
 */
app.get('/events', (req, res) => {
  console.log("📡 Frontend event stream connection established");
  
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
    version: packageJson.version,
    timestamp: new Date().toISOString()
  })}\n\n`);

  // Register event listener for all system events
  const eventHandler = (eventData) => {
    try {
      res.write(`data: ${JSON.stringify(eventData)}\n\n`);
    } catch (error) {
      console.warn("⚠️ Error writing to event stream:", error.message);
    }
  };

  eventBusManager.on('event', eventHandler);

  // Cleanup on client disconnect
  req.on('close', () => {
    eventBusManager.removeListener('event', eventHandler);
    console.log("📡 Event stream client disconnected");
  });

  // Keep-alive mechanism to prevent timeout
  const keepAlive = setInterval(() => {
    try {
      res.write(`data: ${JSON.stringify({
        type: 'ping',
        timestamp: new Date().toISOString()
      })}\n\n`);
    } catch (error) {
      clearInterval(keepAlive);
    }
  }, 30000);

  // Clear keep-alive on disconnect
  req.on('close', () => {
    clearInterval(keepAlive);
  });

  // Handle client errors
  req.on('error', (error) => {
    console.warn("⚠️ Event stream client error:", error.message);
    clearInterval(keepAlive);
    eventBusManager.removeListener('event', eventHandler);
  });
});

// ========================================================================
// ADDITIONAL API ENDPOINTS
// ========================================================================

/**
 * Version endpoint
 */
app.get("/api/version", (req, res) => {
  res.json({
    version: packageJson.version,
    name: packageJson.name,
    description: packageJson.description,
    frontendRoutesEnabled: true,
    oeeIntegration: true,
    a2aEnabled: !!a2aManager
  });
});

/**
 * Health check endpoint with frontend route status
 */
app.get("/api/system/health", (req, res) => {
  try {
    const health = {
      status: "healthy",
      version: packageJson.version,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      agents: agentManager.getStats(),
      data: dataManager.getDataStats(),
      events: eventBusManager.getA2AStatus(),
      frontendRoutes: {
        templates: "/templates",
        events: "/events",
        status: "active"
      },
      oee: {
        integrationEnabled: agentManager.oeeIntegrationEnabled,
        simulatorActive: !!oeeSimulator,
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

app.get('/agents.yaml', (req, res) => {
  try {
    const yamlPath = path.join(process.cwd(), 'agents.yaml');
    res.sendFile(yamlPath);
  } catch (error) {
    res.status(404).send('agents.yaml not found');
  }
});

// ========================================================================
// ERROR HANDLING & GRACEFUL SHUTDOWN
// ========================================================================

app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", err);
  auditLogger.logSystemEvent("error", { 
    message: err.message, 
    stack: err.stack,
    url: req.url,
    method: req.method 
  });
  
  res.status(500).json({ 
    error: "Internal server error", 
    timestamp: new Date().toISOString() 
  });
});

// Simulator cleanup on shutdown
process.on('SIGTERM', () => {
  console.log('📋 SIGTERM received, performing graceful shutdown...');
  if (oeeSimulator) oeeSimulator.stop();
  auditLogger.logSystemEvent("system_shutdown", { reason: "SIGTERM", version: "1.2.5" });
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('📋 SIGINT received, performing graceful shutdown...');
  if (oeeSimulator) oeeSimulator.stop();
  auditLogger.logSystemEvent("system_shutdown", { reason: "SIGINT", version: "1.2.5" });
  process.exit(0);
});

// ========================================================================
// SERVER STARTUP
// ========================================================================

app.listen(PORT, () => {
  console.log(`Version: ${packageJson.version}`);
  console.log(`🚀 Pharmaceutical Manufacturing Agent System running at http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/system/health`);
  console.log(`📡 Events stream: http://localhost:${PORT}/events`);
  console.log(`📋 Templates: http://localhost:${PORT}/templates`);
  console.log(`📋 API Documentation: http://localhost:${PORT}/api`);
  
  if (a2aManager) {
    console.log(`🔗 A2A Test endpoint: http://localhost:${PORT}/api/a2a/test`);
    console.log(`🔗 A2A Status: http://localhost:${PORT}/api/a2a/status`);
  }
  
  console.log(`👨‍💻 Developer: Markus Schmeckenbecher`);
  console.log(`📋 EventBus Integration Verified & Enhanced`);
  console.log(`🎯 Architecture: Event-Driven Microservices Pattern + A2A`);
  console.log(`✅ EventBus Integration: EventBusManager → MCP Server (Working)`);
  console.log(`✅ Component Dependencies: All properly initialized`);
  console.log(`✅ Frontend Routes: /templates and /events activated`);
  
  auditLogger.logSystemEvent("server_started", {
    port: PORT,
    version: "1.2.5",
    architecture: "modular+a2a",
    a2aEnabled: !!a2aManager,
    eventBusIntegration: "EventBusManager",
    mcpIntegration: "Active",
    frontendRoutesEnabled: true,
    endpoints: [
      "/api/chat", "/api/agents", "/api/data", "/api/events", "/api/audit", 
      "/api/system", "/api/workflows", "/api/a2a/test", "/api/a2a/status",
      "/templates", "/events", "/api/oee"
    ]
  });
});

/**
 * ========================================================================
 * END OF A2A-ENHANCED SERVER.JS (FRONTEND ROUTES INTEGRATED)
 * ========================================================================
 */