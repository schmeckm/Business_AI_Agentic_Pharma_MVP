/**
 * ========================================================================
 * PHARMACEUTICAL MANUFACTURING AGENT MANAGER
 * ========================================================================
 * 
 * Comprehensive agent management system for pharmaceutical manufacturing
 * with multi-LLM support (Claude, Ollama, picoLLM), OEE integration,
 * and Agent-to-Agent (A2A) communication capabilities.
 * 
 * Features:
 * - Multi-LLM Provider Support (Anthropic Claude, Ollama, Picovoice picoLLM)
 * - Real-time OEE (Overall Equipment Effectiveness) integration
 * - Agent-to-Agent (A2A) communication workflows
 * - Rate limiting and performance monitoring
 * - GMP-compliant audit logging
 * - Event-driven architecture with MQTT support
 * - Professional Winston logging integration
 * 
 * @author Open Source Pharmaceutical AI Project
 * @version 1.4.1
 * @license MIT
 */

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import Anthropic from "@anthropic-ai/sdk";
import { ChatAnthropic } from "@langchain/anthropic";
import { Ollama } from "@langchain/community/llms/ollama"; 
import { RateLimiter } from '../utils/RateLimiter.js';
import logger from '../utils/logger.js';

/**
 * AgentManager Class
 * 
 * Central orchestration class for pharmaceutical manufacturing AI agents.
 * Handles LLM provider selection, agent lifecycle management, OEE data
 * enrichment, and A2A communication workflows.
 * 
 * Supported LLM Providers:
 * - Anthropic Claude (via direct SDK or LangChain)
 * - Ollama (local models via LangChain)
 * - Picovoice picoLLM (edge-optimized models)
 * 
 * Key Responsibilities:
 * - Load and manage agent configurations from YAML
 * - Route requests to appropriate LLM providers
 * - Enrich agent data with real-time OEE metrics
 * - Coordinate Agent-to-Agent communications
 * - Ensure GMP compliance and audit trail integrity
 */
export class AgentManager {
  /**
   * Constructor - Initialize the Agent Manager
   * 
   * @param {Object} dataManager - Data management interface for mock/real data
   * @param {Object} eventBusManager - Event bus for system-wide messaging
   * @param {Object} auditLogger - GMP-compliant audit logging system
   * @param {Object} a2aManager - Agent-to-Agent communication manager (optional)
   */
  constructor(dataManager, eventBusManager, auditLogger, a2aManager = null) {
    this.dataManager = dataManager;
    this.eventBusManager = eventBusManager;
    this.auditLogger = auditLogger || { log: () => {} };
    this.a2aManager = a2aManager;
    
    // Agent registry and statistics
    this.agents = [];
    this.agentStats = { loaded: 0, failed: 0, lastReload: null };
    
    // Rate limiting configuration for API protection
    const maxCallsPerMinute = parseInt(process.env.MAX_API_CALLS_PER_MINUTE) || 5;
    this.rateLimiter = new RateLimiter(maxCallsPerMinute, 60000);
    this.totalApiCalls = 0;
    this.eventChainsActive = new Set();
    
    // Multi-LLM Provider Configuration
    this.llmProvider = process.env.LLM_PROVIDER?.toLowerCase() || 'anthropic';
    this.activeLLM = null; // Currently active LLM instance
    this.llm = null; // LangChain LLM instance (for Claude and Ollama)
    this.anthropic = null; // Direct Anthropic SDK instance
    this.picoLLM = null; // picoLLM instance
    
    // Anthropic Claude Configuration
    this.claudeApiKey = process.env.CLAUDE_API_KEY || null;
    this.claudeModel = process.env.CLAUDE_MODEL || "claude-3-7-sonnet-20250219";
    this.useLangChain = process.env.USE_LANGCHAIN === 'true' || false;
    
    // Ollama Configuration (local LLM server)
    this.ollamaModel = process.env.OLLAMA_MODEL || 'tinyllama:1.1b';
    this.ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    
    // picoLLM Configuration (edge-optimized models)
    this.picoLLMAccessKey = process.env.PICOVOICE_ACCESS_KEY || null;
    this.picoLLMModelPath = process.env.PICOLLM_MODEL_PATH || './models/llama-2-7b-chat.pv';
    this.picoLLMTemperature = parseFloat(process.env.PICOLLM_TEMPERATURE) || 0.1;
    this.picoLLMMaxTokens = parseInt(process.env.PICOLLM_MAX_TOKENS) || 512;
    
    // Initialize LLM provider
    this.initializeLLM();
    
    logger.info(`AgentManager v1.4.1 initialized with rate limit: ${maxCallsPerMinute} calls/minute`);
    logger.info(`Active LLM Provider: ${this.llmProvider.toUpperCase()}`);
    
    // Initialize A2A workflows if manager is available
    if (this.a2aManager) {
      this.setupA2AWorkflows();
      logger.info('A2A Workflows initialized - Event-driven agent communication active');
    }

    // Enable OEE integration for pharmaceutical manufacturing
    this.oeeIntegrationEnabled = true;
    logger.info('OEE Integration enabled - Real-time equipment effectiveness monitoring active');
  }

  /**
   * Initialize LLM Provider
   * 
   * Configures the active LLM provider based on environment settings.
   * Implements fallback strategy: picoLLM -> Ollama -> Claude
   * 
   * Priority Order:
   * 1. picoLLM (if configured and available)
   * 2. Ollama (if URL and model specified)
   * 3. Anthropic Claude (if API key provided)
   * 
   * @private
   */
  initializeLLM() {
    // First Priority: picoLLM (Edge-optimized, local inference)
    if (this.llmProvider === 'picollm') {
      try {
        const PicoLLM = require('@picovoice/picollm-node');
        
        if (!this.picoLLMAccessKey) {
          throw new Error('PICOVOICE_ACCESS_KEY not configured');
        }
        
        if (!fs.existsSync(this.picoLLMModelPath)) {
          throw new Error(`Model file not found: ${this.picoLLMModelPath}`);
        }
        
        this.picoLLM = new PicoLLM(
          this.picoLLMAccessKey,
          this.picoLLMModelPath,
          {
            temperature: this.picoLLMTemperature,
            maxTokens: this.picoLLMMaxTokens,
            topP: parseFloat(process.env.PICOLLM_TOP_P) || 0.9,
            repeatPenalty: parseFloat(process.env.PICOLLM_REPEAT_PENALTY) || 1.1
          }
        );
        
        this.activeLLM = this.picoLLM;
        logger.info(`picoLLM configured successfully - Model: ${this.picoLLMModelPath}`);
        logger.info(`picoLLM settings - Temperature: ${this.picoLLMTemperature}, MaxTokens: ${this.picoLLMMaxTokens}`);
        return;
        
      } catch (error) {
        logger.error(`picoLLM initialization failed: ${error.message}`);
        logger.info('Falling back to Ollama...');
        this.llmProvider = 'ollama';
      }
    }

    // Second Priority: Ollama (Local LLM server)
    if (this.llmProvider === 'ollama') {
      if (this.ollamaUrl && this.ollamaModel) {
        try {
          this.llm = new Ollama({
            baseUrl: this.ollamaUrl,
            model: this.ollamaModel,
            temperature: 0.1, // Low temperature for consistent pharmaceutical responses
            numCtx: 2048,  // Reduziert für Speed
            requestTimeout: 60000,  // 60 Sekunden Timeout
            topP: 0.9,
          });
          
          this.activeLLM = this.llm;
          logger.info(`Ollama AI configured via LangChain: ${this.ollamaModel} at ${this.ollamaUrl}`);
          return;
          
        } catch (error) {
          logger.error(`Ollama initialization failed: ${error.message}`);
          logger.info('Falling back to Anthropic Claude...');
          this.llmProvider = 'anthropic';
        }
      } else {
        logger.info("Ollama provider selected but URL or model missing. Falling back to Anthropic.");
        this.llmProvider = 'anthropic';
      }
    }

    // Third Priority: Anthropic Claude (Cloud API)
    if (this.llmProvider === 'anthropic') {
      if (this.claudeApiKey) {
        try {
          if (this.useLangChain) {
            // Use LangChain wrapper for consistent interface
            this.llm = new ChatAnthropic({
              apiKey: this.claudeApiKey,
              model: this.claudeModel,
              temperature: 0.1, // Low temperature for pharmaceutical compliance
              maxTokens: 1000
            });
            this.activeLLM = this.llm;
            logger.info(`Claude AI configured via LangChain: ${this.claudeModel}`);
          } else {
            // Use direct Anthropic SDK for better control
            this.anthropic = new Anthropic({ apiKey: this.claudeApiKey });
            this.activeLLM = this.anthropic;
            logger.info(`Claude AI configured via Direct SDK: ${this.claudeModel}`);
          }
          return;
          
        } catch (error) {
          logger.error(`Claude initialization failed: ${error.message}`);
        }
      } else {
        logger.error("No Claude API key configured. Please set CLAUDE_API_KEY environment variable.");
      }
    }

    // No LLM provider successfully initialized
    logger.error("No active LLM client configured. Agent processing will be disabled.");
    logger.error("Please configure one of: picoLLM, Ollama, or Claude API key.");
    this.activeLLM = null;
  }

  /**
   * Load Agent Configurations
   * 
   * Loads agent definitions from YAML configuration file.
   * Each agent defines triggers, capabilities, data sources, and prompts.
   * 
   * @param {string} configPath - Path to agents.yaml configuration file
   * @returns {boolean} Success status of agent loading
   */
  loadAgents(configPath = "config/agents.yaml") {
    try {
      const raw = fs.readFileSync(path.join(configPath), "utf8");
      const config = yaml.load(raw);
      this.agents = config.agents || [];

      // Validate and enhance agent configurations
      this.agents.forEach((agent, i) => {
        if (!agent.id) throw new Error(`Agent ${i} missing required 'id' field`);
        if (!agent.trigger) throw new Error(`Agent ${agent.id} missing required 'trigger' field`);
        if (!agent.type) agent.type = "data-driven";
        
        // Enable OEE by default for pharmaceutical manufacturing
        if (agent.oeeEnabled === undefined) agent.oeeEnabled = true;
        
        // Auto-enable OEE enhancement for order agent (production planning)
        if (agent.id === 'orderAgent' && !agent.oeeEnhanced) {
          agent.oeeEnhanced = true;
          logger.info(`Auto-enabled OEE enhancement for ${agent.id}`);
        }
      });

      // Update statistics
      this.agentStats = {
        loaded: this.agents.length,
        failed: 0,
        lastReload: new Date().toISOString(),
      };

      logger.info("Successfully loaded agents:");
      this.agents.forEach(a => {
        const oeeStatus = a.oeeEnabled ? ' [OEE]' : '';
        const enhancedStatus = a.oeeEnhanced ? ' [Enhanced]' : '';
        logger.info(`  - ${a.id} (${a.trigger})${oeeStatus}${enhancedStatus}`);
      });
      
      // Setup event subscriptions and A2A handlers
      this.eventBusManager.buildEventSubscriptions(this.agents);
      this.setupDirectEventSubscriptions();
      
      if (this.a2aManager) {
        this.setupA2AHandlers();
      }
      
      return true;
      
    } catch (err) {
      logger.error(`Failed to load agents.yaml: ${err.message}`);
      this.agentStats.failed++;
      return false;
    }
  }

  /**
   * Setup Direct Event Subscriptions
   * 
   * Configures agents to listen for specific events (OEE updates, order changes, etc.)
   * Enables reactive agent behavior based on system state changes.
   * 
   * @private
   */
  setupDirectEventSubscriptions() {
    logger.info("Setting up direct event subscriptions for agents...");
    
    for (const agent of this.agents) {
      if (agent.events && agent.events.subscribes) {
        agent.events.subscribes.forEach(topic => {
          logger.debug(`Agent ${agent.id} subscribing to event: ${topic}`);
          
          this.eventBusManager.subscribe(topic, async (eventData) => {
            try {
              logger.debug(`Agent ${agent.id} received event ${topic}`);
              
              const eventMessage = this.buildEventMessage(topic, eventData, agent);
              await this.processAgent(agent, eventMessage, true);
              
              // Special handling for OEE events
              if (topic.startsWith('oee/') && agent.oeeEnabled) {
                logger.info(`OEE event ${topic} processed by ${agent.id}`);
                
                if (this.eventBusManager.publishOEEEvent) {
                  await this.eventBusManager.publishOEEEvent(
                    'processing_completed',
                    { processedBy: agent.id, originalEvent: topic },
                    agent.id
                  );
                }
              }
              
            } catch (error) {
              logger.error(`Error processing event ${topic} in agent ${agent.id}: ${error.message}`);
            }
          });
        });
      }
    }
    
    logger.info(`Direct event subscriptions setup completed for ${this.agents.length} agents`);
  }

  /**
   * Build Event Message
   * 
   * Converts system events into natural language messages for agent processing.
   * Provides context-aware message generation based on event type.
   * 
   * @param {string} eventTopic - Event topic/type
   * @param {Object} eventData - Event payload data
   * @param {Object} agent - Target agent configuration
   * @returns {string} Natural language event message
   * @private
   */
  buildEventMessage(eventTopic, eventData, agent) {
    // OEE (Overall Equipment Effectiveness) events
    if (eventTopic.startsWith('oee/')) {
      return `Auto-triggered by OEE event: ${eventTopic}. Analyze with OEE optimization focus.`;
    }
    
    // Production order events
    if (eventTopic.startsWith('orders/')) {
      return `Auto-triggered by order event: ${eventTopic}. Process order updates with current data.`;
    }
    
    // Compliance and regulatory events
    if (eventTopic.startsWith('compliance/')) {
      return `Auto-triggered by compliance event: ${eventTopic}. Validate regulatory requirements.`;
    }
    
    // Batch processing events
    if (eventTopic.startsWith('batch/')) {
      return `Auto-triggered by batch event: ${eventTopic}. Assess batch status and release readiness.`;
    }
    
    // System-wide monitoring events
    if (eventTopic === '*') {
      return "Auto-triggered by system event. Monitor and analyze current operational status.";
    }
    
    // Default event message
    return `Auto-triggered by event: ${eventTopic}. Process according to agent capabilities.`;
  }

  /**
   * Get Real-time OEE Data
   * 
   * Retrieves current OEE (Overall Equipment Effectiveness) metrics
   * from the data manager. OEE is critical for pharmaceutical manufacturing
   * efficiency and equipment monitoring.
   * 
   * @returns {Array} Array of OEE metric objects
   */
async getOEEData() {
  if (!this.oeeIntegrationEnabled) {
    logger.warn("OEE integration is disabled");
    return [];
  }
  try {
    const oeeData = await this.dataManager.getRealtimeOEEData();
    logger.debug(`Retrieved ${oeeData.length} OEE metrics (real-time)`);
    return oeeData;
  } catch (error) {
    logger.warn(`OEE data unavailable: ${error.message}`);
    return [];
  }
}


  /**
   * Enrich Agent Data with OEE Metrics
   * 
   * Enhances agent input data with real-time OEE metrics for better
   * decision-making in pharmaceutical manufacturing contexts.
   * 
   * @param {Object} agent - Agent configuration
   * @param {string|Object} baseData - Base data for agent processing
   * @returns {string} JSON string with OEE-enriched data
   */

async enrichAgentDataWithOEE(agent, baseData) {
  if (!agent.oeeEnabled) return baseData;

  try {
    const oeeData = await this.dataManager.getRealtimeOEEData();

    if (!oeeData || oeeData.length === 0) {
      baseData.oee = {
        status: "unavailable",
        message: "No OEE metrics received from MQTT.",
        suggestions: [
          "Verify MQTT broker connection",
          "Check if 'oee/updated' topic is publishing",
          "Ensure DataManager cache refresh is working"
        ],
        timestamp: new Date().toISOString()
      };
    } else {
      baseData.oee = {
        status: "available",
        data: oeeData,
        timestamp: new Date().toISOString()
      };
    }
  } catch (error) {
    baseData.oee = {
      status: "error",
      message: `Error retrieving OEE data: ${error.message}`,
      timestamp: new Date().toISOString()
    };
  }

  return baseData;
}

  async enrichAgentDataWithOEE(agent, baseData) {
    if (!agent.oeeEnabled) return baseData;

    try {
      const oeeData = await this.dataManager.getRealtimeOEEData();
      if (!oeeData || oeeData.length === 0) {
        baseData.oee = {
          status: "unavailable",
          message: "No OEE metrics received from MQTT.",
          suggestions: [
            "Verify MQTT broker connection",
            "Check if 'oee/updated' topic is publishing",
            "Ensure DataManager cache refresh is working"
          ],
          timestamp: new Date().toISOString()
        };
      } else {
        baseData.oee = {
          status: "available",
          data: oeeData,
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      baseData.oee = {
        status: "error",
        message: `Error retrieving OEE data: ${error.message}`,
        timestamp: new Date().toISOString()
      };
    }

    return baseData;
  }

  /**
   * Resolve all configured data sources for an agent (from agents.yaml).
   * Supports compliance, QA, issues, batches, equipment, orders, etc.
   */
  async resolveAgentData(agent) {
    const resolved = {};

    for (const source of agent.dataSource || []) {
      // 🔹 OEE Hot Data
      if (source === "oee_hot") {
        resolved.oee_hot = await this.dataManager.getCachedData("oee_hot", true);
      }

      // 🔹 Orders
      if (source.includes("orders")) {
        resolved.orders = await this.dataManager.getCachedData("orders", false);
      }

      // 🔹 OEE History
      if (source.includes("oee_history")) {
        resolved.oee_history = await this.dataManager.getCachedData("oee_history", false);
      }

      // 🔹 Batches
      if (source.includes("batches")) {
        resolved.batches = await this.dataManager.getCachedData("batches", false);
      }

      // 🔹 Equipment
      if (source.includes("equipment")) {
        resolved.equipment = await this.dataManager.getCachedData("equipment", false);
      }

      // 🔹 Compliance
      if (source === "compliance") {
        const raw = await this.dataManager.getCachedData("compliance", false);
        if (raw) {
          resolved.compliance = raw.compliance || [];
          resolved.regulations = raw.regulations || {};
        }
      }

      // 🔹 QA Inspections
      if (source === "qa") {
        const raw = await this.dataManager.getCachedData("qa", false);
        if (raw) {
          resolved.qa = raw.map(q =>
            `${q.material} → Priority: ${q.priority}, Status: ${q.status}`
          );
        }
      }

      // 🔹 Issues
      if (source === "issues") {
        const raw = await this.dataManager.getCachedData("issues", false);
        if (raw) {
          resolved.issues = raw.map(i =>
            `[${i.issueId}] ${i.type} – ${i.description} | Severity: ${i.severity} | Status: ${i.status} | Dept: ${i.responsibleDept}`
          );
        }
      }
    }

    return resolved;
  }


  /**
   * Setup A2A (Agent-to-Agent) Workflows
   * 
   * Initializes production workflows that enable agents to communicate
   * and coordinate complex pharmaceutical manufacturing processes.
   * 
   * @private
   */
  setupA2AWorkflows() {
    try {
      import('../workflows/ProductionWorkflow.js').then(({ ProductionWorkflow }) => {
        this.productionWorkflow = new ProductionWorkflow(this.a2aManager);
        logger.info('ProductionWorkflow loaded successfully');
      }).catch(error => {
        logger.warn(`ProductionWorkflow not available: ${error.message}`);
        this.productionWorkflow = null;
      });
    } catch (error) {
      logger.warn(`A2A Workflow setup failed: ${error.message}`);
    }
  }

  /**
   * Setup A2A Handler Registrations
   * 
   * Registers agent capabilities with the A2A manager and sets up
   * event listeners for inter-agent communication requests.
   * 
   * @private
   */
  setupA2AHandlers() {
    if (!this.a2aManager) return;

    this.agents.forEach(agent => {
      if (agent.a2aCapabilities && Array.isArray(agent.a2aCapabilities)) {
        logger.debug(`Setting up A2A for ${agent.id}:`, agent.a2aCapabilities);
        
        try {
          // Register agent with A2A manager
          if (typeof this.a2aManager.registerAgent === 'function') {
            this.a2aManager.registerAgent(agent.id, agent.a2aCapabilities);
          } else {
            logger.warn("A2A Manager registerAgent method not available");
            return;
          }
          
          // Setup event listeners for each capability
          agent.a2aCapabilities.forEach(capability => {
            try {
              this.eventBusManager.subscribe(`a2a.${agent.id}.${capability}`, 
                (eventData) => this.handleA2ARequest(agent, capability, eventData)
              );
            } catch (error) {
              logger.warn(`Failed to setup A2A listener for ${agent.id}.${capability}: ${error.message}`);
            }
          });
        } catch (error) {
          logger.warn(`Failed to setup A2A for ${agent.id}: ${error.message}`);
        }
      }
    });

    logger.info(`A2A setup completed for ${this.getA2AEnabledAgents().length} agents`);
  }

  /**
   * Handle A2A Request
   * 
   * Processes Agent-to-Agent communication requests with performance monitoring
   * and error handling. Enables complex workflow coordination between agents.
   * 
   * @param {Object} agent - Source agent configuration
   * @param {string} action - Requested action/capability
   * @param {Object} eventData - Request data and metadata
   */
  async handleA2ARequest(agent, action, eventData) {
    const requestStartTime = Date.now();
    
    try {
      logger.debug(`A2A Request: ${agent.id}.${action} (RequestID: ${eventData.requestId})`);
      
      const result = await this.processAgentA2A(agent, action, eventData.data);
      const responseTime = Date.now() - requestStartTime;
      
      this.a2aManager.handleA2AResponse(eventData.requestId, true, result);
      logger.info(`A2A Request completed: ${agent.id}.${action} in ${responseTime}ms`);
      
    } catch (error) {
      const responseTime = Date.now() - requestStartTime;
      logger.error(`A2A Request failed for ${agent.id}.${action}: ${error.message}`);
      
      this.a2aManager.handleA2AResponse(eventData.requestId, false, null, error.message);
      logger.warn(`A2A Request failed: ${agent.id}.${action} in ${responseTime}ms - ${error.message}`);
    }
  }

  /**
   * Process Agent A2A Request
   * 
   * Executes an Agent-to-Agent request using the configured LLM provider.
   * Handles structured communication between agents for complex workflows.
   * 
   * @param {Object} agent - Agent configuration
   * @param {string} action - Requested action
   * @param {Object} data - Request data
   * @returns {Object} Structured response for agent communication
   */
  async processAgentA2A(agent, action, data) {
    if (!this.activeLLM) {
      throw new Error("No active LLM client configured for A2A processing");
    }

    // Prepare data with OEE enrichment
    const resolvedData = await this.resolveAgentData(agent);
    const enrichedData = await this.enrichAgentDataWithOEE(agent, resolvedData);

    // Build prompt from A2A-specific template or fallback to general template
    let prompt;
    if (agent.a2aPrompts?.[action]) {
      prompt = agent.a2aPrompts[action]
        .replace('{timestamp}', new Date().toISOString())
        .replace('{action}', action)
        .replace('{orderId}', data.orderId || 'N/A')
        .replace('{priority}', data.priority || 'normal')
        .replace('{data}', JSON.stringify(enrichedData, null, 2));
    } else {
      prompt = `${agent.promptTemplate}

=== A2A REQUEST CONTEXT ===
Action: ${action}
Request Data: ${JSON.stringify(data, null, 2)}

IMPORTANT: This is an Agent-to-Agent communication request.
Please respond with structured, actionable data that another agent can process.
Focus on providing clear status, recommendations, and any required follow-up actions.

Expected Response Format: JSON with clear status and reasoning.`
        .replace('{timestamp}', new Date().toISOString())
        .replace('{userMessage}', `A2A Request: ${action}`)
        .replace('{data}', enrichedData);
    }

    logger.debug(`Processing A2A request for ${agent.id}.${action} (OEE: ${agent.oeeEnabled})`);

    // Execute LLM request with multi-provider support
    let responseText;
    
    if (this.llmProvider === 'picollm' && this.picoLLM) {
      // picoLLM: Edge-optimized local inference
      const response = await this.picoLLM.generate(prompt);
      responseText = response;
    } else if (this.llmProvider === 'ollama' || (this.llmProvider === 'anthropic' && this.useLangChain)) {
      // LangChain: Unified interface for Ollama and Claude
      const response = await this.llm.invoke(prompt);
      responseText = response.content || response; 
    } else if (this.llmProvider === 'anthropic' && this.anthropic) {
      // Direct Anthropic SDK: Maximum control
      const response = await this.anthropic.messages.create({
        model: this.claudeModel,
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      });
      responseText = response.content[0].text;
    } else {
      throw new Error("No active LLM client available");
    }
    
    // Parse response into structured format
    let structuredResult;
    try {
      structuredResult = JSON.parse(responseText);
    } catch {
      // Fallback if response is not valid JSON
      structuredResult = {
        action,
        result: responseText,
        timestamp: new Date().toISOString(),
        agentId: agent.id,
        type: 'text_response',
        oeeEnriched: agent.oeeEnabled
      };
    }

    return {
      action,
      result: structuredResult,
      timestamp: new Date().toISOString(),
      agentId: agent.id,
      responseType: 'a2a_response',
      oeeEnriched: agent.oeeEnabled
    };
  }

  /**
   * Find Agent by Message
   * 
   * Locates the appropriate agent based on trigger matching.
   * Supports exact matches and partial string matching.
   * 
   * @param {string} message - User message or trigger command
   * @returns {Object|null} Matching agent configuration or null
   */
findAgent(message) {
  if (!message || typeof message !== "string") {
    logger.warn("Invalid message provided to findAgent:", message);
    return null;
  }

  const lowerMsg = message.toLowerCase();

  return this.agents.find((a) => {
    if (Array.isArray(a.trigger)) {
      return a.trigger.some(
        (t) =>
          t.toLowerCase() === lowerMsg ||
          lowerMsg.includes(t.toLowerCase())
      );
    }
    return (
      a.trigger.toLowerCase() === lowerMsg ||
      lowerMsg.includes(a.trigger.toLowerCase())
    );
  });
}


replacePlaceholders(template, data) {
  let output = template;

  // Ersetzt einfache Platzhalter wie {data.compliance}, {data.qa}, {data.issues}
  for (const [key, value] of Object.entries(data)) {
    const regex = new RegExp(`\\{data.${key}\\}`, "g");
    output = output.replace(
      regex,
      Array.isArray(value) ? JSON.stringify(value, null, 2) : String(value)
    );
  }

  // Fallback: falls {data} benutzt wird → komplettes JSON einsetzen
  output = output.replace("{data}", JSON.stringify(data, null, 2));

  return output;
}




  /**
   * Process Agent Request
   * 
   * Main entry point for agent processing. Handles rate limiting,
   * data enrichment, LLM execution, and event publishing.
   * 
   * @param {Object} agent - Agent configuration
   * @param {string} userMessage - User input or trigger message
   * @param {boolean} isAutoTriggered - Whether triggered by system event
   * @returns {string} Agent response text
   * * 
   * 
/**
 * Process Agent Request
 * 
 * Main entry point for agent processing. Handles rate limiting,
 * data enrichment, LLM execution, and event publishing.
 * 
 * @param {Object} agent - Agent configuration
 * @param {string} userMessage - User input or trigger message
 * @param {boolean} isAutoTriggered - Whether triggered by system event
 * @returns {string} Agent response text
 */
async processAgent(agent, userMessage, isAutoTriggered = false) {
  // Rate limiting check
  if (!this.rateLimiter.canMakeCall(agent.id)) {
    const status = this.rateLimiter.getStatus();
    return `Rate limit exceeded. ${status.callsInWindow}/${status.maxCalls} calls used. Next reset in ${Math.ceil(status.nextResetIn/1000)} seconds.`;
  }

  // LLM availability check
  if (!this.activeLLM) {
    return "No active LLM client configured. Please check your LLM provider settings.";
  }

  // Performance tracking
  this.totalApiCalls++;
  logger.info(`API Call #${this.totalApiCalls} - Agent: ${agent.id} (Auto: ${isAutoTriggered}) (OEE: ${agent.oeeEnabled}) (LLM: ${this.llmProvider.toUpperCase()})`);

  // Basisdaten vorbereiten
  const baseData = this.dataManager.getMockDataForAgent(agent);
  const enrichedData = await this.enrichAgentDataWithOEE(agent, baseData);

  // Sonderlogik für OEE Executive Agent
  if (agent.id === "oeeAgent") {
    if (typeof this.getOEEExecutiveData === "function") {
      try {
        const oeeData = await this.getOEEExecutiveData();
        enrichedData.oee = oeeData.oee_hot || [];
        enrichedData.orders = oeeData.orders || [];
        enrichedData.oee_history = oeeData.oee_history || [];
        logger.info("✅ OEE Executive Data injected into agent prompt");
      } catch (err) {
        logger.error(`❌ Failed to load OEE Executive Data: ${err.message}`);
      }
    } else {
      logger.warn("⚠️ getOEEExecutiveData() not implemented in AgentManager");
    }
  }

  // ---------------- SAFE PROMPT BUILDER ----------------
  const promptTemplate = agent.promptTemplate || "";

  const safeUserMessage = userMessage && userMessage.trim() !== ""
    ? userMessage
    : "No user message provided.";

  // Hilfsfunktion: ersetzt {data} und {data.xyz}
  const replacePlaceholders = (template, data) => {
    let result = template;

    // Komplettes JSON für {data}
    result = result.replace(/{data}/g, JSON.stringify(data, null, 2));

    // Einzelne Keys für {data.xyz}
    result = result.replace(/{data\.([a-zA-Z0-9_]+)}/g, (match, key) => {
      if (data && data[key] !== undefined) {
        if (typeof data[key] === "object") {
          return JSON.stringify(data[key], null, 2);
        }
        return String(data[key]);
      }
      return "(no data)";
    });

    return result;
  };

  let prompt = replacePlaceholders(promptTemplate, enrichedData);

  if (!prompt || prompt.trim() === "") {
    prompt = `Agent ${agent.id} invoked at ${new Date().toISOString()}.
UserMessage: ${safeUserMessage}
Data: ${JSON.stringify(enrichedData, null, 2)}`;
  }
  // ------------------------------------------------------

  try {
    let responseText;

    // Multi-provider LLM execution
    if (this.llmProvider === 'picollm' && this.picoLLM) {
      const response = await this.picoLLM.generate(prompt);
      responseText = response;
    } else if (this.llmProvider === 'ollama' || (this.llmProvider === 'anthropic' && this.useLangChain)) {
      const response = await this.llm.invoke(prompt);
      responseText = response.content || response;
      if (this.auditLogger.logAgentExecution) {
        this.auditLogger.logAgentExecution(agent.id, userMessage, responseText);
      }
    } else if (this.llmProvider === 'anthropic' && this.anthropic) {
      const response = await this.anthropic.messages.create({
        model: this.claudeModel,
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      });
      responseText = response.content[0].text;
      if (this.auditLogger.logAgentExecution) {
        this.auditLogger.logAgentExecution(agent.id, userMessage, responseText);
      }
    } else {
      throw new Error("No active LLM client available");
    }

    // Events/A2A-Workflows
    if (agent.events && agent.events.publishes && !isAutoTriggered) {
      this.isAutoTriggered = isAutoTriggered;
      await this.publishEventsWithControl(agent, userMessage, responseText);
    }

    return responseText;

  } catch (error) {
    logger.error(`LLM API error for ${agent.id}: ${error.message}`);
    return `Agent processing failed: ${error.message}`;
  }
}


  
  /**
   * Publish Events with Control
   * 
   * Manages event publishing for agent workflows. Currently disabled in favor
   * of A2A workflows for better control and coordination.
   * 
   * @param {Object} agent - Agent configuration
   * @param {string} userMessage - Original user message
   * @param {string} responseText - Agent response
   * @returns {Object} Publishing status and metadata
   * @private
   */
  async publishEventsWithControl(agent, userMessage, responseText) {
    logger.info(`Events DISABLED - Using A2A workflows instead for agent: ${agent.id}`);
    
    // Special handling for order agent workflow triggers
    if (agent.id === 'orderAgent' && !this.isAutoTriggered && this.productionWorkflow) {
      setTimeout(async () => {
        try {
          logger.info("Triggering A2A workflow for orderAgent result (OEE-enhanced)");
          await this.productionWorkflow.executeOrderAnalysisWorkflow(
            'ORD-1001',
            { 
              source: 'orderAgent', 
              response: responseText,
              oeeEnriched: agent.oeeEnabled,
              timestamp: new Date().toISOString()
            }
          );
        } catch (error) {
          logger.error(`A2A workflow failed: ${error.message}`);
        }
      }, 1000);
    }
    
    return {
      published: 0,
      reason: 'Events disabled - A2A workflows active',
      oeeContext: agent.oeeEnabled
    };
  }

  /**
   * Get All Agents
   * 
   * Returns complete agent registry with enhanced metadata including
   * A2A capabilities and OEE integration status.
   * 
   * @returns {Array} Array of agent configurations with metadata
   */
  getAllAgents() {
    return this.agents.map(agent => ({
      ...agent,
      a2aEnabled: !!(agent.a2aCapabilities && this.a2aManager),
      a2aCapabilities: agent.a2aCapabilities || [],
      oeeEnabled: agent.oeeEnabled || false,
      oeeEnhanced: agent.oeeEnhanced || false
    }));
  }

  /**
   * Get System Statistics
   * 
   * Provides comprehensive system statistics including agent counts,
   * A2A capabilities, OEE integration status, and performance metrics.
   * 
   * @returns {Object} System statistics and performance metrics
   */
  getStats() {
    // A2A (Agent-to-Agent) statistics
    const a2aStats = this.a2aManager ? {
      a2aEnabled: true,
      a2aAgents: this.getA2AEnabledAgents().length,
      pendingA2ARequests: this.a2aManager.pendingRequests?.size || 0,
      workflowsActive: this.productionWorkflow ? 1 : 0
    } : {
      a2aEnabled: false,
      a2aAgents: 0,
      pendingA2ARequests: 0,
      workflowsActive: 0
    };

    // OEE (Overall Equipment Effectiveness) statistics
    const oeeStats = {
      oeeIntegrationEnabled: this.oeeIntegrationEnabled,
      oeeEnabledAgents: this.agents.filter(a => a.oeeEnabled).length,
      oeeEnhancedAgents: this.agents.filter(a => a.oeeEnhanced).length,
      claudeIntegration: this.useLangChain ? 'LangChain' : 'Direct SDK',
      llmProvider: this.llmProvider.toUpperCase()
    };

    return {
      ...this.agentStats,
      ...a2aStats,
      ...oeeStats,
      totalApiCalls: this.totalApiCalls
    };
  }

  /**
   * Get Agent Templates
   * 
   * Returns agent configurations formatted for UI template selection.
   * Includes metadata for filtering and display purposes.
   * 
   * @returns {Array} Array of agent template configurations
   */
  getTemplates() {
    return this.agents.map((a) => ({
      value: a.trigger,
      text: a.name || `${a.id} (${a.trigger})`,
      description: a.description,
      a2aEnabled: !!(a.a2aCapabilities && this.a2aManager),
      oeeEnabled: a.oeeEnabled || false,
      oeeEnhanced: a.oeeEnhanced || false
    }));
  }

  /**
   * Get A2A Enabled Agents
   * 
   * Filters agents that have Agent-to-Agent communication capabilities.
   * 
   * @returns {Array} Array of A2A-capable agents
   */
  getA2AEnabledAgents() {
    return this.agents.filter(agent => 
      agent.a2aCapabilities && Array.isArray(agent.a2aCapabilities) && agent.a2aCapabilities.length > 0
    );
  }

  /**
   * Get A2A Service Registry
   * 
   * Creates a service registry mapping capabilities to available agents.
   * Enables dynamic service discovery for A2A workflows.
   * 
   * @returns {Object|null} Service registry or null if A2A disabled
   */
  getA2AServiceRegistry() {
    if (!this.a2aManager) return null;

    const registry = {};
    this.getA2AEnabledAgents().forEach(agent => {
      agent.a2aCapabilities.forEach(capability => {
        if (!registry[capability]) {
          registry[capability] = [];
        }
        registry[capability].push({
          agentId: agent.id,
          agentName: agent.name,
          description: agent.description,
          oeeEnabled: agent.oeeEnabled || false
        });
      });
    });

    return registry;
  }

  /**
   * Get Event Publishers
   * 
   * Returns agents that can publish events to the system event bus.
   * 
   * @returns {Array} Array of event-publishing agents
   */
  getEventPublishers() {
    return this.agents.filter(a => a.events && a.events.publishes).map(a => ({
      id: a.id,
      name: a.name,
      publishes: a.events.publishes,
      oeeEnabled: a.oeeEnabled || false
    }));
  }

  /**
   * Reload Agent Configurations
   * 
   * Hot-reloads agent configurations from YAML file without system restart.
   * Clears existing subscriptions and re-establishes connections.
   * 
   * @param {string} configPath - Path to agents.yaml configuration file
   * @returns {boolean} Success status of reload operation
   */
  reloadAgents(configPath = "config/agents.yaml") {
    try {
      // Clear existing A2A registrations
      if (this.a2aManager) {
        logger.info("Resetting A2A registrations...");
        this.a2aManager.registeredAgents?.clear?.();
      }

      // Clear existing event subscriptions
      if (this.eventBusManager && typeof this.eventBusManager.clearSubscriptions === 'function') {
        logger.info("Clearing existing event subscriptions...");
        this.eventBusManager.clearSubscriptions();
      }

      // Reset agent registry
      this.agents = [];
      this.agentStats = { loaded: 0, failed: 0, lastReload: null };
      
      // Reload configurations
      const result = this.loadAgents(configPath);
      
      if (result) {
        logger.info("Agents reloaded successfully with updated event subscriptions");
      }
      
      return result;
    } catch (error) {
      logger.error(`Failed to reload agents: ${error}`);
      return false;
    }
  }

  /**
   * Toggle Agent OEE Integration
   * 
   * Dynamically enable or disable OEE integration for specific agents.
   * 
   * @param {string} agentId - Agent identifier
   * @param {boolean} enabled - Enable/disable OEE integration
   * @returns {boolean} Success status of toggle operation
   */
  toggleAgentOEE(agentId, enabled = true) {
    const agent = this.agents.find(a => a.id === agentId);
    if (agent) {
      agent.oeeEnabled = enabled;
      logger.info(`OEE ${enabled ? 'enabled' : 'disabled'} for agent: ${agentId}`);
      return true;
    }
    return false;
  }

  /**
   * Get OEE Enabled Agents
   * 
   * Returns all agents with OEE integration enabled.
   * 
   * @returns {Array} Array of OEE-enabled agents
   */
  getOEEEnabledAgents() {
    return this.agents.filter(agent => agent.oeeEnabled);
  }

  /**
   * Refresh OEE Data Cache
   * 
   * Forces refresh of cached OEE data from data sources.
   * 
   * @returns {boolean} Success status of cache refresh
   */
  refreshOEEData() {
    try {
      if (typeof this.dataManager.refreshOEECache === 'function') {
        this.dataManager.refreshOEECache();
        logger.info('OEE data cache refreshed');
        return true;
      }
    } catch (error) {
      logger.warn(`Failed to refresh OEE cache: ${error.message}`);
    }
    return false;
  }

  /**
   * Process Generic Query
   * 
   * Handles free-form queries that don't match specific agent triggers.
   * Uses constrained prompting to ensure responses are based only on
   * available system data.
   * 
   * @param {string} userMessage - User query
   * @returns {string} LLM response based on system data
   */
/**
 * Process Generic Query
 * 
 * Handles free-form queries that don't match specific agent triggers.
 * Uses correlated data (OEE Hot + History + Orders + QA + Inventory).
 * 
 * @param {string} userMessage - User query
 * @returns {string} LLM response based on correlated system data
 */
async processGenericQuery(userMessage) {
  if (!this.activeLLM) {
    return "No LLM client configured for generic queries.";
  }

  try {
    // === KORRELATIONSDATEN LADEN ===
    const correlatedData = await this.dataManager.getCorrelatedData();

    // Constrained Prompt mit allen verfügbaren Daten
    const constrainedPrompt = `You are a pharmaceutical manufacturing AI assistant.

CRITICAL CONSTRAINT: You may ONLY use the data provided below. Do NOT use external knowledge. 
If the provided data doesn't contain the answer, explicitly say: 
"This information is not available in the current system data."

User Query: ${userMessage}

Available Correlated System Data:
${JSON.stringify(correlatedData, null, 2)}

Instructions:
- Answer ONLY based on the provided data
- Correlate OEE Hot (realtime), Orders, QA, Inventory and OEE History
- If something is missing, clearly state "Not available in system data"
- Reference specific lines, orders, or batches where possible
- Focus on pharmaceutical manufacturing context
- Provide clear KPIs and summaries when relevant

Current Time: ${new Date().toISOString()}`;

    // === LLM-Ausführung (alle Provider unterstützt) ===
    let responseText;

    if (this.llmProvider === 'picollm' && this.picoLLM) {
      const response = await this.picoLLM.generate(constrainedPrompt);
      responseText = response;
    } else if (this.llmProvider === 'ollama' || (this.llmProvider === 'anthropic' && this.useLangChain)) {
      const response = await this.llm.invoke(constrainedPrompt);
      responseText = response.content || response;
    } else if (this.llmProvider === 'anthropic' && this.anthropic) {
      const response = await this.anthropic.messages.create({
        model: this.claudeModel,
        max_tokens: 600,
        messages: [{ role: "user", content: constrainedPrompt }],
      });
      responseText = response.content[0].text;
    } else {
      throw new Error("No active LLM client available");
    }

    this.totalApiCalls++;
    logger.info(`Generic query processed with correlated data (Query: "${userMessage}")`);

    return responseText;

  } catch (error) {
    logger.error(`Generic LLM processing failed: ${error.message}`);
    return `I'm sorry, I encountered an error processing your request: ${error.message}`;
  }
}


}

export default AgentManager;