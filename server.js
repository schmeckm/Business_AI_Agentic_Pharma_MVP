/**
 * ========================================================================
 * PHARMACEUTICAL MANUFACTURING AGENT SYSTEM - SERVER.JS
 * ========================================================================
 * Enterprise AI Operations Platform for Pharmaceutical Production
 * Version: 1.3.2 (Fully Integrated Routes)
 * ========================================================================
 */

import express from 'express';
import dotenv from 'dotenv';
import { BufferMemory } from 'langchain/memory';
import path from 'path';
import { createRequire } from 'module';
import rateLimit from 'express-rate-limit';
import cors from 'cors';

// Core components
import { EventBusManager } from './src/eventBus/EventBusManager.js';
import { AgentManager } from './src/agents/AgentManager.js';
import { DataManager } from './src/data/DataManager.js';
import { AuditLogger } from './src/audit/AuditLogger.js';
import { A2AManager } from './src/a2a/A2AManager.js';
import { integrateMCPServer } from './src/mcp/MCPServer.js';
import { OEESimulator } from './src/simulator/OEESimulator.js';

// Enhancements
import {
  enhanceServerWithAgentTypes,
  enhanceServerWithWhatIf,
} from './src/agents/LLMPoweredAgents.js';

import logger from './src/utils/logger.js';

// Route files
import { createChatRoutes } from './src/api/routes/chat.routes.js';
import { createAuditRoutes } from './src/api/routes/audit.routes.js';
import { createDataRoutes } from './src/api/routes/data.routes.js';
import { createOEERoutes } from './src/api/routes/oeeRoutes.js';
import { createHealthRoutes } from './src/api/routes/health.routes.js';
import { createAgentRoutes } from './src/api/routes/agentInvoke.routes.js';

// ------------------------------------------------------------------------
// ENV + APP INIT
// ------------------------------------------------------------------------

dotenv.config();

const require = createRequire(import.meta.url);
const packageJson = require('./package.json');

const app = express();
const PORT = process.env.PORT || 4000;
const HOST = '0.0.0.0';

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || 'http://localhost:4000',
  credentials: true,
  optionsSuccessStatus: 200
}));
app.use(express.json());
app.use(express.static('public'));
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
  })
);

logger.info('='.repeat(70));
logger.info('PHARMACEUTICAL MANUFACTURING AGENT SYSTEM');
logger.info(`Version: ${packageJson.version}`);
logger.info('='.repeat(70));

// ------------------------------------------------------------------------
// COMPONENT INITIALIZATION
// ------------------------------------------------------------------------

const dataManager = new DataManager();
const auditLogger = new AuditLogger();
const eventBusManager = new EventBusManager(auditLogger);
const a2aManager =
  process.env.ENABLE_A2A !== 'false' ? new A2AManager(eventBusManager, auditLogger) : null;
const agentManager = new AgentManager(dataManager, eventBusManager, auditLogger, a2aManager);

// Link managers
eventBusManager.setAgentManager?.(agentManager);
auditLogger.eventBusManager = eventBusManager;

// MCP Server Integration
await integrateMCPServer(app, {
  eventBus: eventBusManager,
  dataManager,
  auditLogger,
  agentManager,
});

// ------------------------------------------------------------------------
// SYSTEM INIT
// ------------------------------------------------------------------------

async function initializeSystem() {
  logger.info('Initializing system data...');
  try {
    await dataManager.loadDataSourceConfig();
    await dataManager.loadAllData();
    await dataManager.loadOEEHistory();

    if (!agentManager.loadAgents()) {
      logger.error('Failed to load agents');
      process.exit(1);
    }

    await agentManager.initializePlatform();

    logger.info('✅ System initialization complete');
  } catch (err) {
    logger.error(`System init error: ${err.message}`, { stack: err.stack });
    process.exit(1);
  }
}
await initializeSystem();

// ------------------------------------------------------------------------
// ENHANCEMENTS (AgentTypes + WhatIf)
// ------------------------------------------------------------------------

try {
  // Load AgentType enhancement
  const agentEnhancer = enhanceServerWithAgentTypes(app, agentManager);
  
  // Load WhatIf enhancement and store the analyzer
  const whatIfResult = enhanceServerWithWhatIf(app, agentManager, agentEnhancer);
  app.locals.whatIfAnalyzer = whatIfResult?.whatIfAnalyzer || whatIfResult;
  
  // Store in app.locals for routes to access
  if (whatIfResult && whatIfResult.whatIfAnalyzer) {
    app.locals.whatIfAnalyzer = whatIfResult.whatIfAnalyzer;
    logger.info('✅ AgentTypes + WhatIf installed');
  } else {
    logger.warn('⚠️ WhatIf analyzer not returned - feature may be limited');
  }
  
} catch (err) {
  logger.error('AgentType/WhatIf error', err);
}

// ------------------------------------------------------------------------
// OEE SIMULATOR
// ------------------------------------------------------------------------

let oeeSimulator = null;
if (process.env.ENABLE_OEE_SIMULATOR === 'true') {
  try {
    oeeSimulator = new OEESimulator({
      MQTT_BROKER_URL: process.env.MQTT_BROKER_URL,
      MQTT_TOPIC_BASE: process.env.MQTT_TOPIC_BASE,
      OEE_LINES: process.env.OEE_LINES,
      OEE_INTERVAL_MS: process.env.OEE_INTERVAL_MS,
    });
    await oeeSimulator.start();
    logger.info('✅ OEE Simulator started');
  } catch (err) {
    logger.error('OEE Simulator error', err);
  }
} else {
  logger.info('ℹ️ OEE Simulator disabled');
}

// ------------------------------------------------------------------------
// ROUTES
// ------------------------------------------------------------------------

// API Routes
app.use('/api/chat', createChatRoutes(agentManager, auditLogger, eventBusManager));
app.use('/api/audit', createAuditRoutes(auditLogger));
app.use('/api/data', createDataRoutes(dataManager, eventBusManager));
app.use('/api/oee', createOEERoutes(dataManager, eventBusManager));
app.use('/api/health', createHealthRoutes(agentManager, dataManager, eventBusManager));
app.use('/api/agents', createAgentRoutes(agentManager));

// Root-level Routes
app.get('/templates', (req, res) => {
  const templates = agentManager.getTemplates();
  res.json({
    templates,
    count: templates.length,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/version', (req, res) => {
  res.json({
    version: packageJson.version,
    name: packageJson.name,
    description: packageJson.description,
  });
});

app.get('/agents.yaml', (req, res) => {
  const yamlPath = path.join(process.cwd(), 'agents.yaml');
  res.sendFile(yamlPath, (err) => {
    if (err) {
      logger.error('agents.yaml not found');
      res.status(404).send('agents.yaml not found');
    }
  });
});

// ------------------------------------------------------------------------
// SERVER-SENT EVENTS (SSE) - SINGLE ENDPOINT
// ------------------------------------------------------------------------

const activeSSEConnections = new Set();

app.get('/events', (req, res) => {
  const clientIp = req.ip || req.connection.remoteAddress;
  logger.info(`SSE connection established from ${clientIp}`);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no'
  });

  // Add to active connections
  activeSSEConnections.add(res);

  // Initial connection message
  res.write(`data: ${JSON.stringify({ 
    type: 'connected', 
    message: 'SSE connection established',
    timestamp: new Date().toISOString()
  })}\n\n`);

  // Heartbeat every 30 seconds
  const heartbeatInterval = setInterval(() => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ 
        type: 'heartbeat', 
        timestamp: new Date().toISOString()
      })}\n\n`);
    }
  }, 30000);

  // Forward system events to client
  const eventHandler = (eventData) => {
    try {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({
          type: 'system_event',
          data: eventData,
          timestamp: new Date().toISOString()
        })}\n\n`);
      }
    } catch (error) {
      logger.error(`Failed to send SSE event: ${error.message}`);
    }
  };

  // Subscribe to events
  if (eventBusManager && typeof eventBusManager.subscribe === 'function') {
    eventBusManager.subscribe('agent/*', eventHandler);
    eventBusManager.subscribe('oee/*', eventHandler);
    eventBusManager.subscribe('system/*', eventHandler);
  }

// MQTT Messages (If needed)

eventBusManager.subscribe('mqtt/*', eventHandler);  // ← Alle MQTT Messages

  // Cleanup on disconnect
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    activeSSEConnections.delete(res);
    
    if (eventBusManager) {
      if (typeof eventBusManager.unsubscribe === 'function') {
        eventBusManager.unsubscribe('agent/*', eventHandler);
        eventBusManager.unsubscribe('oee/*', eventHandler);
        eventBusManager.unsubscribe('system/*', eventHandler);
      }
    }
    
    logger.info(`SSE connection closed from ${clientIp}`);
  });
});

// System heartbeat
setInterval(() => {
  if (eventBusManager && typeof eventBusManager.publishEvent === 'function') {
    eventBusManager.publishEvent('system/heartbeat', { status: 'alive' }, 'system');
  }
}, 30000);

// ------------------------------------------------------------------------
// ERROR HANDLING
// ------------------------------------------------------------------------

app.use((err, req, res, next) => {
  logger.error('Error:', { 
    message: err.message, 
    stack: err.stack,
    url: req.url 
  });
  
  const response = {
    error: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && {
      details: err.message,
      stack: err.stack
    })
  };
  
  res.status(err.status || 500).json(response);
});

// ------------------------------------------------------------------------
// GRACEFUL SHUTDOWN
// ------------------------------------------------------------------------

function gracefulShutdown(signal) {
  logger.info(`${signal} received, shutting down gracefully...`);
  
  // Close all SSE connections
  activeSSEConnections.forEach(res => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: 'shutdown' })}\n\n`);
      res.end();
    }
  });
  activeSSEConnections.clear();
  
  // Stop OEE simulator
  if (oeeSimulator) {
    oeeSimulator.stop();
  }
  
  // Cleanup data manager
  if (dataManager && typeof dataManager.cleanup === 'function') {
    dataManager.cleanup();
  }
  
  logger.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ------------------------------------------------------------------------
// SERVER START
// ------------------------------------------------------------------------

app.listen(PORT, HOST, () => {
  logger.info('='.repeat(70));
  logger.info(`SERVER STARTED: http://${HOST}:${PORT}`);
  logger.info('Available Endpoints:');
  logger.info('  /api/chat');
  logger.info('  /api/audit');
  logger.info('  /api/data');
  logger.info('  /api/oee');
  logger.info('  /api/health');
  logger.info('  /api/agents');
  logger.info('  /templates');
  logger.info('  /events (SSE)');
  logger.info('  /api/version');
  logger.info('  /agents.yaml');
  logger.info('='.repeat(70));
});