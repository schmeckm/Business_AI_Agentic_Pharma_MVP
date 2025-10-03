/**
 * ========================================================================
 * PHARMACEUTICAL MANUFACTURING AGENT MANAGER
 * ========================================================================
 * 
 * Comprehensive agent management system for pharmaceutical manufacturing
 * with multi-LLM support (Claude, Ollama, picoLLM), OEE integration,
 * and Agent-to-Agent (A2A) communication capabilities.
 * 
 * @author Open Source Pharmaceutical AI Project
 * @version 2.0.0
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

export class AgentManager {
  constructor(dataManager, eventBusManager, auditLogger, a2aManager = null) {
    this.dataManager = dataManager;
    this.eventBusManager = eventBusManager;
    this.auditLogger = auditLogger || { log: () => {} };
    this.a2aManager = a2aManager;

    this.platformEngine = null;
    this.platformEngineReady = false;

    this.agents = [];
    this.agentStats = { loaded: 0, failed: 0, lastReload: null };
    
    const maxCallsPerMinute = parseInt(process.env.MAX_API_CALLS_PER_MINUTE) || 5;
    this.rateLimiter = new RateLimiter(maxCallsPerMinute, 60000);
    this.totalApiCalls = 0;
    this.eventChainsActive = new Set();
    
    this.llmProvider = process.env.LLM_PROVIDER?.toLowerCase() || 'anthropic';
    this.activeLLM = null;
    this.llm = null;
    this.anthropic = null;
    this.picoLLM = null;
    
    this.claudeApiKey = process.env.CLAUDE_API_KEY || null;
    this.claudeModel = process.env.CLAUDE_MODEL || "claude-3-7-sonnet-20250219";
    this.useLangChain = process.env.USE_LANGCHAIN === 'true' || false;
    
    this.ollamaModel = process.env.OLLAMA_MODEL || 'tinyllama:1.1b';
    this.ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    
    this.picoLLMAccessKey = process.env.PICOVOICE_ACCESS_KEY || null;
    this.picoLLMModelPath = process.env.PICOLLM_MODEL_PATH || './models/llama-2-7b-chat.pv';
    this.picoLLMTemperature = parseFloat(process.env.PICOLLM_TEMPERATURE) || 0.1;
    this.picoLLMMaxTokens = parseInt(process.env.PICOLLM_MAX_TOKENS) || 512;
    
    this.initializeLLM();
    
    logger.info(`AgentManager v2.0.0 initialized with rate limit: ${maxCallsPerMinute} calls/minute`);
    logger.info(`Active LLM Provider: ${this.llmProvider.toUpperCase()}`);
    
    if (this.a2aManager) {
      this.setupA2AWorkflows();
      logger.info('A2A Workflows initialized');
    }

    this.oeeIntegrationEnabled = true;
    logger.info('OEE Integration enabled');
  }

  async initializePlatform() {
    logger.info('Initializing platform engine...');
    
    try {
      const { PlatformEngine } = await import('../platform/PlatformEngine.js');
      this.platformEngine = new PlatformEngine();
      await this.platformEngine.initialize();
      this.platformEngineReady = true;
      logger.info('✅ Platform engine initialized');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize platform engine: ${error.message}`);
      logger.warn('⚠️ Continuing without platform engine');
      return false;
    }
  }

  getAgentClassification(agent) {
    if (!this.platformEngineReady) {
      return { type: 'basic' };
    }
    return this.platformEngine.classifyAgent(agent);
  }

  initializeLLM() {
    if (this.llmProvider === 'picollm') {
      try {
        const PicoLLM = require('@picovoice/picollm-node');
        if (!this.picoLLMAccessKey) throw new Error('PICOVOICE_ACCESS_KEY not configured');
        if (!fs.existsSync(this.picoLLMModelPath)) throw new Error(`Model not found: ${this.picoLLMModelPath}`);
        
        this.picoLLM = new PicoLLM(this.picoLLMAccessKey, this.picoLLMModelPath, {
          temperature: this.picoLLMTemperature,
          maxTokens: this.picoLLMMaxTokens,
          topP: parseFloat(process.env.PICOLLM_TOP_P) || 0.9,
          repeatPenalty: parseFloat(process.env.PICOLLM_REPEAT_PENALTY) || 1.1
        });
        
        this.activeLLM = this.picoLLM;
        logger.info(`picoLLM configured: ${this.picoLLMModelPath}`);
        return;
      } catch (error) {
        logger.error(`picoLLM failed: ${error.message}`);
        this.llmProvider = 'ollama';
      }
    }

    if (this.llmProvider === 'ollama') {
      if (this.ollamaUrl && this.ollamaModel) {
        try {
          this.llm = new Ollama({
            baseUrl: this.ollamaUrl,
            model: this.ollamaModel,
            temperature: 0.1,
            numCtx: 2048,
            requestTimeout: 60000,
            topP: 0.9,
          });
          this.activeLLM = this.llm;
          logger.info(`Ollama configured: ${this.ollamaModel}`);
          return;
        } catch (error) {
          logger.error(`Ollama failed: ${error.message}`);
          this.llmProvider = 'anthropic';
        }
      } else {
        this.llmProvider = 'anthropic';
      }
    }

    if (this.llmProvider === 'anthropic') {
      if (this.claudeApiKey) {
        try {
          if (this.useLangChain) {
            this.llm = new ChatAnthropic({
              apiKey: this.claudeApiKey,
              model: this.claudeModel,
              temperature: 0.1,
              maxTokens: 1000
            });
            this.activeLLM = this.llm;
            logger.info(`Claude via LangChain: ${this.claudeModel}`);
          } else {
            this.anthropic = new Anthropic({ apiKey: this.claudeApiKey });
            this.activeLLM = this.anthropic;
            logger.info(`Claude Direct SDK: ${this.claudeModel}`);
          }
          return;
        } catch (error) {
          logger.error(`Claude failed: ${error.message}`);
        }
      } else {
        logger.error("No CLAUDE_API_KEY configured");
      }
    }

    logger.error("No active LLM configured");
    this.activeLLM = null;
  }

  loadAgents(dir = "config") {
    this.agents = [];

    try {
      if (!fs.existsSync(dir)) {
        logger.error(`Config directory not found: ${dir}`);
        return false;
      }

      const files = fs.readdirSync(dir).filter(f => f.endsWith(".yaml") || f.endsWith(".yml"));

      if (files.length === 0) {
        logger.error(`No YAML files in ${dir}`);
        return false;
      }

      logger.info(`Found ${files.length} YAML files in ${dir}`);

      for (const file of files) {
        try {
          const filePath = path.join(dir, file);
          const raw = fs.readFileSync(filePath, "utf8");
          
          if (!raw || raw.trim() === '') {
            logger.warn(`Skipping empty file: ${file}`);
            continue;
          }

          const config = yaml.load(raw);

          if (!config || typeof config !== 'object') {
            logger.warn(`Invalid YAML: ${file}`);
            continue;
          }

          if (config.agents && Array.isArray(config.agents)) {
            this.agents.push(...config.agents);
          } else if (config.id && config.name) {
            this.agents.push(config);
          } else {
            logger.warn(`Skipping ${file}: No agents or id found`);
          }
        } catch (fileError) {
          logger.error(`Failed to load ${file}: ${fileError.message}`);
          this.agentStats.failed++;
          continue;
        }
      }

      if (this.agents.length === 0) {
        logger.error('No agents loaded!');
        return false;
      }

      this.agentStats.loaded = this.agents.length;
      this.agentStats.lastReload = new Date().toISOString();
      
      if (this.a2aManager) {
        this.setupA2AHandlers();
      }
      
      logger.info(`✅ Loaded ${this.agents.length} agents from ${dir}`);
      return true;
    } catch (error) {
      logger.error(`Failed to load agents: ${error.message}`);
      this.agentStats.failed++;
      return false;
    }
  }

  async getOEEData() {
    if (!this.oeeIntegrationEnabled) return [];
    try {
      const oeeData = await this.dataManager.getRealtimeOEEData();
      return oeeData;
    } catch (error) {
      logger.warn(`OEE data unavailable: ${error.message}`);
      return [];
    }
  }

  async enrichAgentDataWithOEE(agent, baseData) {
    if (!agent.oeeEnabled) return baseData;

    try {
      const oeeData = await this.dataManager.getRealtimeOEEData();
      if (!oeeData || oeeData.length === 0) {
        baseData.oee = {
          status: "unavailable",
          message: "No OEE metrics received",
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
        message: `Error: ${error.message}`,
        timestamp: new Date().toISOString()
      };
    }

    return baseData;
  }

  async resolveAgentData(agent) {
    const resolved = {};

    for (const source of agent.dataSource || []) {
      if (source === "oee_hot") {
        resolved.oee_hot = await this.dataManager.getCachedData("oee_hot", true);
      }
      if (source.includes("orders")) {
        resolved.orders = await this.dataManager.getCachedData("orders", false);
      }
      if (source.includes("oee_history")) {
        resolved.oee_history = await this.dataManager.getCachedData("oee_history", false);
      }
      if (source.includes("batches")) {
        resolved.batches = await this.dataManager.getCachedData("batches", false);
      }
      if (source.includes("equipment")) {
        resolved.equipment = await this.dataManager.getCachedData("equipment", false);
      }
      if (source === "compliance") {
        const raw = await this.dataManager.getCachedData("compliance", false);
        if (raw) {
          resolved.compliance = raw.compliance || [];
          resolved.regulations = raw.regulations || {};
        }
      }
      if (source === "qa") {
        const raw = await this.dataManager.getCachedData("qa", false);
        if (raw) {
          resolved.qa = raw.map(q => `${q.material} → ${q.status}`);
        }
      }
      if (source === "issues") {
        const raw = await this.dataManager.getCachedData("issues", false);
        if (raw) {
          resolved.issues = raw.map(i => `[${i.issueId}] ${i.type}`);
        }
      }
    }

    return resolved;
  }

  setupA2AWorkflows() {
    try {
      import('../workflows/ProductionWorkflow.js').then(({ ProductionWorkflow }) => {
        this.productionWorkflow = new ProductionWorkflow(this.a2aManager);
        logger.info('ProductionWorkflow loaded');
      }).catch(error => {
        logger.warn(`ProductionWorkflow unavailable: ${error.message}`);
        this.productionWorkflow = null;
      });
    } catch (error) {
      logger.warn(`A2A Workflow setup failed: ${error.message}`);
    }
  }

  setupA2AHandlers() {
    if (!this.a2aManager) return;

    this.agents.forEach(agent => {
      if (agent.a2aCapabilities && Array.isArray(agent.a2aCapabilities)) {
        try {
          if (typeof this.a2aManager.registerAgent === 'function') {
            this.a2aManager.registerAgent(agent.id, agent.a2aCapabilities);
          }
          
          agent.a2aCapabilities.forEach(capability => {
            try {
              this.eventBusManager.subscribe(`a2a.${agent.id}.${capability}`, 
                (eventData) => this.handleA2ARequest(agent, capability, eventData)
              );
            } catch (error) {
              logger.warn(`Failed A2A listener for ${agent.id}.${capability}`);
            }
          });
        } catch (error) {
          logger.warn(`Failed A2A setup for ${agent.id}`);
        }
      }
    });

    logger.info(`A2A setup complete: ${this.getA2AEnabledAgents().length} agents`);
  }

  async handleA2ARequest(agent, action, eventData) {
    const requestStartTime = Date.now();
    
    try {
      const result = await this.processAgentA2A(agent, action, eventData.data);
      const responseTime = Date.now() - requestStartTime;
      this.a2aManager.handleA2AResponse(eventData.requestId, true, result);
      logger.info(`A2A completed: ${agent.id}.${action} in ${responseTime}ms`);
    } catch (error) {
      const responseTime = Date.now() - requestStartTime;
      logger.error(`A2A failed: ${agent.id}.${action}: ${error.message}`);
      this.a2aManager.handleA2AResponse(eventData.requestId, false, null, error.message);
    }
  }

  async processAgentA2A(agent, action, data) {
    if (!this.activeLLM) {
      throw new Error("No active LLM for A2A");
    }

    const resolvedData = await this.resolveAgentData(agent);
    const enrichedData = await this.enrichAgentDataWithOEE(agent, resolvedData);

    let prompt = agent.a2aPrompts?.[action] || `${agent.promptTemplate}\n\nA2A Action: ${action}`;
    prompt = prompt.replace('{timestamp}', new Date().toISOString())
                   .replace('{action}', action)
                   .replace('{data}', JSON.stringify(enrichedData, null, 2));

    let responseText;
    
    if (this.llmProvider === 'picollm' && this.picoLLM) {
      responseText = await this.picoLLM.generate(prompt);
    } else if (this.llmProvider === 'ollama') {
      const response = await this.llm.invoke(prompt);
      responseText = response.content || response;
    } else if (this.llmProvider === 'anthropic') {
      if (this.useLangChain) {
        const response = await this.llm.invoke(prompt);
        responseText = response.content || response;
      } else {
        const response = await this.anthropic.messages.create({
          model: this.claudeModel,
          max_tokens: 800,
          messages: [{ role: "user", content: prompt }],
        });
        responseText = response.content[0].text;
      }
    }
    
    let structuredResult;
    try {
      structuredResult = JSON.parse(responseText);
    } catch {
      structuredResult = {
        action,
        result: responseText,
        timestamp: new Date().toISOString(),
        agentId: agent.id
      };
    }

    return {
      action,
      result: structuredResult,
      timestamp: new Date().toISOString(),
      agentId: agent.id,
      responseType: 'a2a_response'
    };
  }

  findAgent(message) {
    if (!message || typeof message !== "string") return null;

    const lowerMsg = message.toLowerCase();

    return this.agents.find((a) => {
      if (Array.isArray(a.trigger)) {
        return a.trigger.some(t => t.toLowerCase() === lowerMsg || lowerMsg.includes(t.toLowerCase()));
      }
      return a.trigger.toLowerCase() === lowerMsg || lowerMsg.includes(a.trigger.toLowerCase());
    });
  }

  replacePlaceholders(template, data) {
    let output = template;

    for (const [key, value] of Object.entries(data)) {
      const regex = new RegExp(`\\{data.${key}\\}`, "g");
      output = output.replace(regex, Array.isArray(value) ? JSON.stringify(value, null, 2) : String(value));
    }

    output = output.replace("{data}", JSON.stringify(data, null, 2));
    return output;
  }

  async processAgent(agent, userMessage, isAutoTriggered = false) {
    if (!this.rateLimiter.canMakeCall(agent.id)) {
      const status = this.rateLimiter.getStatus();
      return `Rate limit exceeded. ${status.callsInWindow}/${status.maxCalls} calls used.`;
    }

    if (!this.activeLLM) {
      return "No active LLM client configured.";
    }

    this.totalApiCalls++;
    logger.info(`API Call #${this.totalApiCalls} - Agent: ${agent.id} (LLM: ${this.llmProvider.toUpperCase()})`);

    const baseData = this.dataManager.getMockDataForAgent(agent);
    const enrichedData = await this.enrichAgentDataWithOEE(agent, baseData);

    const promptTemplate = agent.promptTemplate || "";
    const safeUserMessage = userMessage && userMessage.trim() !== "" ? userMessage : "No user message";

    let prompt = this.replacePlaceholders(promptTemplate, enrichedData);
    prompt = prompt.replace(/{timestamp}/g, new Date().toISOString());
    prompt = prompt.replace(/{userMessage}/g, safeUserMessage);

    if (!prompt || prompt.trim() === "") {
      prompt = `Agent ${agent.id}\nUser: ${safeUserMessage}\nData: ${JSON.stringify(enrichedData, null, 2)}`;
    }

    try {
      let responseText;

      if (this.llmProvider === 'picollm' && this.picoLLM) {
        responseText = await this.picoLLM.generate(prompt);
      } else if (this.llmProvider === 'ollama') {
        if (!this.llm) throw new Error('Ollama LLM not initialized');
        const response = await this.llm.invoke(prompt);
        responseText = response.content || response;
      } else if (this.llmProvider === 'anthropic') {
        if (this.useLangChain) {
          if (!this.llm) throw new Error('LangChain Anthropic not initialized');
          const response = await this.llm.invoke(prompt);
          responseText = response.content || response;
        } else {
          if (!this.anthropic) throw new Error('Anthropic SDK not initialized');
          const response = await this.anthropic.messages.create({
            model: this.claudeModel,
            max_tokens: 2000,
            messages: [{ role: "user", content: prompt }],
          });
          responseText = response.content[0].text;
        }
      } else {
        throw new Error(`Unknown LLM provider: ${this.llmProvider}`);
      }

      if (this.auditLogger.logAgentExecution) {
        this.auditLogger.logAgentExecution(agent.id, userMessage, responseText);
      }

      if (agent.events && agent.events.publishes && !isAutoTriggered) {
        await this.publishEventsWithControl(agent, userMessage, responseText);
      }

      return responseText;

    } catch (error) {
      logger.error(`LLM API error for ${agent.id}: ${error.message}`);
      return `Agent processing failed: ${error.message}`;
    }
  }

  async publishEventsWithControl(agent, userMessage, responseText) {
    logger.info(`Events DISABLED - Using A2A workflows for: ${agent.id}`);
    
    if (agent.id === 'orderAgent' && this.productionWorkflow) {
      setTimeout(async () => {
        try {
          await this.productionWorkflow.executeOrderAnalysisWorkflow('ORD-1001', { 
            source: 'orderAgent', 
            response: responseText
          });
        } catch (error) {
          logger.error(`A2A workflow failed: ${error.message}`);
        }
      }, 1000);
    }
    
    return { published: 0, reason: 'Events disabled - A2A workflows active' };
  }

  getAllAgents() {
    return this.agents.map(agent => ({
      ...agent,
      a2aEnabled: !!(agent.a2aCapabilities && this.a2aManager),
      oeeEnabled: agent.oeeEnabled || false
    }));
  }

  getStats() {
    const a2aStats = this.a2aManager ? {
      a2aEnabled: true,
      a2aAgents: this.getA2AEnabledAgents().length
    } : {
      a2aEnabled: false,
      a2aAgents: 0
    };

    const oeeStats = {
      oeeIntegrationEnabled: this.oeeIntegrationEnabled,
      oeeEnabledAgents: this.agents.filter(a => a.oeeEnabled).length,
      llmProvider: this.llmProvider.toUpperCase()
    };

    return {
      ...this.agentStats,
      ...a2aStats,
      ...oeeStats,
      totalApiCalls: this.totalApiCalls
    };
  }

  getTemplates() {
    return this.agents.map((a) => ({
      value: a.trigger,
      text: a.name || `${a.id} (${a.trigger})`,
      description: a.description,
      oeeEnabled: a.oeeEnabled || false
    }));
  }

  getA2AEnabledAgents() {
    return this.agents.filter(agent => 
      agent.a2aCapabilities && Array.isArray(agent.a2aCapabilities) && agent.a2aCapabilities.length > 0
    );
  }

  reloadAgents(configPath = "config") {
    try {
      if (this.a2aManager) {
        this.a2aManager.registeredAgents?.clear?.();
      }

      this.agents = [];
      this.agentStats = { loaded: 0, failed: 0, lastReload: null };
      
      const result = this.loadAgents(configPath);
      if (result) {
        logger.info("Agents reloaded successfully");
      }
      return result;
    } catch (error) {
      logger.error(`Failed to reload agents: ${error.message}`);
      return false;
    }
  }

  async processGenericQuery(userMessage) {
    if (!this.activeLLM) {
      return "No LLM client configured for generic queries.";
    }

    try {
      const correlatedData = await this.dataManager.getCorrelatedData();

      const constrainedPrompt = `You are a pharmaceutical manufacturing AI assistant.

CRITICAL CONSTRAINT: You may ONLY use the data provided below.

User Query: ${userMessage}

Available System Data:
${JSON.stringify(correlatedData, null, 2)}

Instructions:
- Answer ONLY based on the provided data
- If information is missing, state "Not available in system data"
- Focus on pharmaceutical manufacturing context

Current Time: ${new Date().toISOString()}`;

      let responseText;

      if (this.llmProvider === 'picollm' && this.picoLLM) {
        responseText = await this.picoLLM.generate(constrainedPrompt);
      } else if (this.llmProvider === 'ollama') {
        if (!this.llm) throw new Error('Ollama LLM not initialized');
        const response = await this.llm.invoke(constrainedPrompt);
        responseText = response.content || response;
      } else if (this.llmProvider === 'anthropic') {
        if (this.useLangChain) {
          if (!this.llm) throw new Error('LangChain Anthropic not initialized');
          const response = await this.llm.invoke(constrainedPrompt);
          responseText = response.content || response;
        } else {
          if (!this.anthropic) throw new Error('Anthropic SDK not initialized');
          const response = await this.anthropic.messages.create({
            model: this.claudeModel,
            max_tokens: 600,
            messages: [{ role: "user", content: constrainedPrompt }],
          });
          responseText = response.content[0].text;
        }
      } else {
        throw new Error(`Unknown LLM provider: ${this.llmProvider}`);
      }

      this.totalApiCalls++;
      logger.info(`Generic query processed: "${userMessage}"`);

      return responseText;

    } catch (error) {
      logger.error(`Generic LLM processing failed: ${error.message}`);
      return `Error processing request: ${error.message}`;
    }
  }
}

export default AgentManager;