/**
 * ========================================================================
 * PHARMACEUTICAL MANUFACTURING AGENT SYSTEM - SERVER.JS (A2A ENHANCED)
 * ========================================================================
 * 
 * Enterprise AI Operations Platform for Pharmaceutical Production
 * MVP Version: 1.2.6 - Winston Logging Integration
 * 
 * @author Markus Schmeckenbecher
 * @contact markus.schmeckenbecher@company.com
 * @repository Business_AI_Agent_Pharma_MVP
 * @version 1.2.6
 * @since 2024
 * ========================================================================
 */

// ========================================================================
// CORE DEPENDENCIES
// ========================================================================

import express from "express";
import dotenv from "dotenv";
import path from "path";
import { BufferMemory } from "langchain/memory";

// Import modular components
import { EventBusManager } from "./src/eventBus/EventBusManager.js";
import { AgentManager } from "./src/agents/AgentManager.js";
import { DataManager } from "./src/data/DataManager.js";
import { AuditLogger } from "./src/audit/AuditLogger.js";
import { A2AManager } from './src/a2a/A2AManager.js';
import { createRoutes } from "./src/api/routes/index.js";
import packageJson from './package.json' assert { type: 'json' };
import { integrateMCPServer } from './src/mcp/MCPServer.js';
import { OEESimulator } from "./src/simulator/OEESimulator.js";

// Import Winston logger
import logger from "./src/utils/logger.js";

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

logger.info("System Configuration", {
  developer: "Markus Schmeckenbecher",
  useLangChain: USE_LANGCHAIN,
  useActions: USE_ACTIONS,
  agentMode: AGENT_MODE,
  enableA2A: ENABLE_A2A,
  enableOEESimulator: ENABLE_OEE_SIMULATOR,
  version: packageJson.version
});

// ========================================================================
// COMPONENT INITIALIZATION (Enhanced with A2A - Correct Order)
// ========================================================================

logger.info("Initializing system components...");

// 1. Initialize Data Manager (no dependencies)
const dataManager = new DataManager();
logger.info("DataManager initialized successfully");

// 2. Initialize Audit Logger (minimal dependencies)
const auditLogger = new AuditLogger();
logger.info("AuditLogger initialized successfully");

// 3. Initialize Event Bus Manager (needs audit logger)
const eventBusManager = new EventBusManager(auditLogger);
logger.info("EventBusManager initialized successfully");

// 4. Initialize A2A Manager
const a2aManager = ENABLE_A2A ? new A2AManager(eventBusManager, auditLogger) : null;
if (a2aManager) {
  logger.info("A2A Manager initialized successfully");
} else {
  logger.info("A2A Manager disabled by configuration");
}

// 5. Initialize Agent Manager
const agentManager = new AgentManager(dataManager, eventBusManager, auditLogger, a2aManager);
logger.info("AgentManager initialized successfully");

// 6. Integrate MCP Server
logger.info("Integrating MCP Server...");
const mcpServer = await integrateMCPServer(app, {
    eventBus: eventBusManager,
    dataManager,
    auditLogger,
    agentManager
});
logger.info("MCP Server integrated successfully");

// ========================================================================
// CRITICAL FIX: Link EventBusManager to AgentManager for A2A
// ========================================================================

try {
  if (typeof eventBusManager.setAgentManager === 'function') {
    eventBusManager.setAgentManager(agentManager);
    logger.info("EventBusManager linked to AgentManager for A2A communication");
  } else {
    eventBusManager.agentManager = agentManager;
    logger.info("EventBusManager directly linked to AgentManager (fallback method)");
  }
} catch (error) {
  logger.warn("Could not link EventBusManager to AgentManager", { error: error.message });
}

auditLogger.eventBusManager = eventBusManager;
logger.info("AuditLogger linked to EventBusManager");

logger.info("All components initialized successfully");

// ========================================================================
// MEMORY MANAGEMENT SYSTEM
// ========================================================================

const agentMemories = new Map();

/**
 * Get or create memory instance for user
 * @param {string} userId - User identifier
 * @returns {BufferMemory} LangChain memory instance
 */
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

/**
 * Initialize system data and configuration
 * @returns {Promise<void>}
 */
async function initializeSystem() {
  logger.info("Loading system configuration and data...");
  
  try {
    await dataManager.loadDataSourceConfig();
    await dataManager.loadAllData();
    
    const agentsLoaded = agentManager.loadAgents();
    if (!agentsLoaded) {
      logger.error("Critical: Failed to load agents");
      process.exit(1);
    }
    
    const dataValidation = dataManager.validateDataIntegrity();
    if (!dataValidation.isValid) {
      logger.warn("Data integrity validation failed", { 
        missing: dataValidation.missing,
        loaded: dataValidation.loaded
      });
    }
    
    logger.info("System initialization completed successfully");
    
    auditLogger.logSystemEvent("system_startup", {
      version: packageJson.version,
      components: ["EventBusManager", "AgentManager", "DataManager", "AuditLogger", "A2AManager", "MCPServer"],
      configuration: { USE_LANGCHAIN, USE_ACTIONS, AGENT_MODE, ENABLE_A2A },
      eventBusIntegration: "Working - EventBusManager provides EventEmitter interface",
      mcpIntegration: "Successful"
    });

  } catch (error) {
    logger.error("Critical error during system initialization", { 
      error: error.message,
      stack: error.stack
    });
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
    logger.info("OEE Simulator started and publishing to MQTT");
  } catch (error) {
    logger.error("Failed to start OEE Simulator", { error: error.message });
  }
} else {
  logger.info("OEE Simulator disabled by configuration");
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
    // forceRefresh=true to ensure latest MQTT data
    const data = await dataManager.getCachedData("oee", true);
    logger.debug("OEE API request served", { dataPoints: data?.length || 0 });
    
    res.json({
      success: true,
      data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error("OEE API error", { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ========================================================================
// FRONTEND COMPATIBILITY ROUTES (Root-Level)
// ========================================================================

/**
 * Frontend Templates Route
 * Provides agent templates for frontend dropdown without /api prefix
 */
app.get('/templates', (req, res) => {
  try {
    const templates = agentManager.getTemplates();
    logger.debug("Frontend templates request served", { count: templates.length });
    
    res.json({ 
      templates,
      count: templates.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error("Templates endpoint error", { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * Frontend Events Route (Server-Sent Events)
 * Provides real-time event stream for frontend monitoring
 */
app.get('/events', (req, res) => {
  logger.info("Frontend event stream connection established", {
    clientIP: req.ip,
    userAgent: req.get('User-Agent')
  });
  
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
      logger.warn("Error writing to event stream", { error: error.message });
    }
  };

  eventBusManager.on('event', eventHandler);

  // Cleanup on client disconnect
  req.on('close', () => {
    eventBusManager.removeListener('event', eventHandler);
    logger.info("Event stream client disconnected");
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
    logger.warn("Event stream client error", { error: error.message });
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
  const versionInfo = {
    version: packageJson.version,
    name: packageJson.name,
    description: packageJson.description,
    frontendRoutesEnabled: true,
    oeeIntegration: true,
    a2aEnabled: !!a2aManager,
    timestamp: new Date().toISOString()
  };
  
  logger.debug("Version info requested", versionInfo);
  res.json(versionInfo);
});

/**
 * Health check endpoint with comprehensive system status
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
    
    logger.debug("Health check performed", { 
      status: health.status,
      uptime: health.uptime,
      agentCount: health.agents?.loaded || 0
    });
    
    res.json(health);
  } catch (error) {
    logger.error("Health check failed", { error: error.message });
    res.status(500).json({
      status: "unhealthy",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Agents YAML configuration endpoint
 */
app.get('/agents.yaml', (req, res) => {
  try {
    const yamlPath = path.join(process.cwd(), 'agents.yaml');
    logger.debug("Agents YAML requested", { path: yamlPath });
    res.sendFile(yamlPath);
  } catch (error) {
    logger.warn("Agents YAML not found", { error: error.message });
    res.status(404).send('agents.yaml not found');
  }
});

// ========================================================================
// ERROR HANDLING & GRACEFUL SHUTDOWN
// ========================================================================

/**
 * Global error handler middleware
 */
app.use((err, req, res, next) => {
  logger.error("Unhandled application error", {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });
  
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

/**
 * Graceful shutdown handler for SIGTERM
 */
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, performing graceful shutdown...');
  if (oeeSimulator) {
    oeeSimulator.stop();
    logger.info('OEE Simulator stopped');
  }
  auditLogger.logSystemEvent("system_shutdown", { 
    reason: "SIGTERM", 
    version: packageJson.version 
  });
  process.exit(0);
});

/**
 * Graceful shutdown handler for SIGINT (Ctrl+C)
 */
process.on('SIGINT', () => {
  logger.info('SIGINT received, performing graceful shutdown...');
  if (oeeSimulator) {
    oeeSimulator.stop();
    logger.info('OEE Simulator stopped');
  }
  auditLogger.logSystemEvent("system_shutdown", { 
    reason: "SIGINT", 
    version: packageJson.version 
  });
  process.exit(0);
});

/**
 * Handle uncaught exceptions
 */
process.on('uncaughtException', (error) => {
  console.error('🚨 Uncaught Exception:', error);
  // Don't exit - keep running
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit - keep running
});

// ========================================================================
// SERVER STARTUP
// ========================================================================

app.listen(PORT, () => {
  const startupInfo = {
    version: packageJson.version,
    port: PORT,
    developer: "Markus Schmeckenbecher",
    architecture: "Event-Driven Microservices Pattern + A2A",
    a2aEnabled: !!a2aManager,
    endpoints: [
      "/api/chat", "/api/agents", "/api/data", "/api/events", "/api/audit", 
      "/api/system", "/api/workflows", "/api/a2a/test", "/api/a2a/status",
      "/templates", "/events", "/api/oee"
    ]
  };

  logger.info("Pharmaceutical Manufacturing Agent System started successfully", startupInfo);
  
  // Console output for immediate feedback
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/system/health`);
  console.log(`📡 Events stream: http://localhost:${PORT}/events`);
  console.log(`📋 Templates: http://localhost:${PORT}/templates`);
  
  if (a2aManager) {
    console.log(`🔗 A2A Test endpoint: http://localhost:${PORT}/api/a2a/test`);
  }
  
  auditLogger.logSystemEvent("server_started", {
    port: PORT,
    version: packageJson.version,
    architecture: "modular+a2a",
    a2aEnabled: !!a2aManager,
    eventBusIntegration: "EventBusManager",
    mcpIntegration: "Active",
    frontendRoutesEnabled: true,
    loggingSystem: "Winston",
    ...startupInfo
  });
});

/**
 * ========================================================================
 * END OF WINSTON-ENHANCED SERVER.JS
 * ========================================================================
 */