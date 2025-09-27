/**
 * ========================================================================
 * AGENT MANAGER (A2A ENHANCED + OEE INTEGRATION + OLLAMA SUPPORT)
 * ========================================================================
 */

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import Anthropic from "@anthropic-ai/sdk";
import { ChatAnthropic } from "@langchain/anthropic";
import { Ollama } from "@langchain/community/llms/ollama"; 
import { RateLimiter } from '../utils/RateLimiter.js';

export class AgentManager {
  constructor(dataManager, eventBusManager, auditLogger, a2aManager = null) {
    this.dataManager = dataManager;
    this.eventBusManager = eventBusManager;
    this.auditLogger = auditLogger || { log: () => {} };
    this.a2aManager = a2aManager;
    this.agents = [];
    this.agentStats = { loaded: 0, failed: 0, lastReload: null };
    
    // Rate Limiting Setup
    const maxCallsPerMinute = parseInt(process.env.MAX_API_CALLS_PER_MINUTE) || 5;
    this.rateLimiter = new RateLimiter(maxCallsPerMinute, 60000);
    this.totalApiCalls = 0;
    this.eventChainsActive = new Set();
    
    // LLM Provider Configuration
    this.llmProvider = process.env.LLM_PROVIDER?.toLowerCase() || 'anthropic'; // Steuert die Auswahl
    this.activeLLM = null; // Speichert die aktive LLM-Instanz
    this.llm = null; // Speichert LangChain LLM-Instanz (für Claude und Ollama)
    this.anthropic = null; // Speichert Direct Anthropic SDK-Instanz
    
    // Claude AI Configuration (Fallback/Primary)
    this.claudeApiKey = process.env.CLAUDE_API_KEY || null;
    this.claudeModel = process.env.CLAUDE_MODEL || "claude-3-7-sonnet-20250219";
    this.useLangChain = process.env.USE_LANGCHAIN === 'true' || false;
    
    // Ollama AI Configuration
    this.ollamaModel = process.env.OLLAMA_MODEL || 'tinyllama:1.1b';
    this.ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    
    this.initializeLLM(); // NEU: Zentralisierte Initialisierung
    console.log("AgentManager v1.3.1 initialized with rate limit: " + maxCallsPerMinute + " calls/minute");
    console.log("Active LLM Provider: " + this.llmProvider.toUpperCase()); 
    
    if (this.a2aManager) {
      this.setupA2AWorkflows();
      console.log('A2A Workflows initialized - Events replaced with controlled workflows');
    }

    this.oeeIntegrationEnabled = true;
    console.log('OEE Integration enabled - Automatic metrics injection active');
  }

  initializeLLM() { // Ersetzt initializeClaudeAI
    if (this.llmProvider === 'ollama') {
        if (this.ollamaUrl && this.ollamaModel) {
            this.llm = new Ollama({ // Verwenden Sie LangChain Ollama LLM
                baseUrl: this.ollamaUrl,
                model: this.ollamaModel,
            });
            this.activeLLM = this.llm;
            console.log(`Ollama AI configured via LangChain: ${this.ollamaModel} at ${this.ollamaUrl}`);
            return;
        } else {
            console.log("Ollama-Anbieter gewählt, aber URL oder Modell fehlen. Fällt auf Anthropic zurück.");
            this.llmProvider = 'anthropic';
        }
    }

    // Fällt auf Anthropic/Claude zurück oder ist Standard
    if (this.claudeApiKey) {
        if (this.useLangChain) {
            this.llm = new ChatAnthropic({
                apiKey: this.claudeApiKey,
                model: this.claudeModel,
            });
            this.activeLLM = this.llm;
            console.log("Claude AI configured via LangChain: " + this.claudeModel);
        } else {
            this.anthropic = new Anthropic({ apiKey: this.claudeApiKey });
            this.activeLLM = this.anthropic;
            console.log("Claude AI configured via Direct SDK: " + this.claudeModel);
        }
    } else {
        console.log("Kein aktiver LLM-Client konfiguriert (Claude API key fehlt). Agentenverarbeitung deaktiviert.");
        this.activeLLM = null;
    }
  }

  loadAgents(configPath = "config/agents.yaml") {
    try {
      const raw = fs.readFileSync(path.join(configPath), "utf8");
      const config = yaml.load(raw);
      this.agents = config.agents || [];

      this.agents.forEach((agent, i) => {
        if (!agent.id) throw new Error("Agent " + i + " missing id");
        if (!agent.trigger) throw new Error("Agent " + agent.id + " missing trigger");
        if (!agent.type) agent.type = "data-driven";
        
        if (agent.oeeEnabled === undefined) agent.oeeEnabled = true;
        if (agent.id === 'orderAgent' && !agent.oeeEnhanced) {
          agent.oeeEnhanced = true;
          console.log("Auto-enabled OEE enhancement for " + agent.id);
        }
      });

      this.agentStats = {
        loaded: this.agents.length,
        failed: 0,
        lastReload: new Date().toISOString(),
      };

      console.log("Loaded agents:");
      this.agents.forEach(a => {
        console.log("- " + a.id + " (" + a.trigger + ")" + (a.oeeEnabled ? ' [OEE]' : ''));
      });
      
      this.eventBusManager.buildEventSubscriptions(this.agents);
      this.setupDirectEventSubscriptions();
      
      if (this.a2aManager) {
        this.setupA2AHandlers();
      }
      
      return true;
    } catch (err) {
      console.error("Failed to load agents.yaml:", err.message);
      this.agentStats.failed++;
      return false;
    }
  }

  setupDirectEventSubscriptions() {
    console.log("Setting up direct event subscriptions for agents...");
    
    for (const agent of this.agents) {
      if (agent.events && agent.events.subscribes) {
        agent.events.subscribes.forEach(topic => {
          console.log("Agent " + agent.id + " subscribing to event: " + topic);
          
          this.eventBusManager.subscribe(topic, async (eventData) => {
            try {
              console.log("Agent " + agent.id + " received event " + topic);
              
              const eventMessage = this.buildEventMessage(topic, eventData, agent);
              await this.processAgent(agent, eventMessage, true);
              
              if (topic.startsWith('oee/') && agent.oeeEnabled) {
                console.log("OEE event " + topic + " processed by " + agent.id);
                
                if (this.eventBusManager.publishOEEEvent) {
                  await this.eventBusManager.publishOEEEvent(
                    'processing_completed',
                    { processedBy: agent.id, originalEvent: topic },
                    agent.id
                  );
                }
              }
              
            } catch (error) {
              console.error("Error processing event " + topic + " in agent " + agent.id + ":", error.message);
            }
          });
        });
      }
    }
    
    console.log("Direct event subscriptions setup completed for " + this.agents.length + " agents");
  }

  buildEventMessage(eventTopic, eventData, agent) {
    if (eventTopic.startsWith('oee/')) {
      return "Auto-triggered by OEE event: " + eventTopic + ". Analyze with OEE optimization focus.";
    }
    
    if (eventTopic.startsWith('orders/')) {
      return "Auto-triggered by order event: " + eventTopic + ". Process order updates with current data.";
    }
    
    if (eventTopic.startsWith('compliance/')) {
      return "Auto-triggered by compliance event: " + eventTopic + ". Validate regulatory requirements.";
    }
    
    if (eventTopic.startsWith('batch/')) {
      return "Auto-triggered by batch event: " + eventTopic + ". Assess batch status and release readiness.";
    }
    
    if (eventTopic === '*') {
      return "Auto-triggered by system event. Monitor and analyze current operational status.";
    }
    
    return "Auto-triggered by event: " + eventTopic + ". Process according to agent capabilities.";
  }

  getOEEData() {
    if (!this.oeeIntegrationEnabled) return [];
    
    try {
      const oeeData = this.dataManager.getRealtimeOEEData();
      console.log(`Retrieved ${oeeData.length} OEE metrics (real-time)`);
      return oeeData;
    } catch (error) {
      console.warn("OEE data unavailable:", error.message);
      return [];
    }
  }

  async enrichAgentDataWithOEE(agent, baseData) {
    if (!agent.oeeEnabled) {
      return baseData;
    }

    const oeeData = this.getOEEData();
    
    try {
      const parsedData = typeof baseData === 'string' ? JSON.parse(baseData) : baseData;
      
      if (agent.id === 'orderAgent' && agent.oeeEnhanced) {
        if (typeof this.dataManager.getOrdersWithOEE === 'function') {
          console.log("Enriching orderAgent with Orders+OEE data");
          const ordersWithOEE = await this.dataManager.getOrdersWithOEE();
          return JSON.stringify({
            orders: ordersWithOEE,
            oee: oeeData,
            enrichmentType: 'orders_with_oee',
            timestamp: new Date().toISOString()
          }, null, 2);
        }
      }
      
      const enrichedData = {
        ...parsedData,
        oee: oeeData,
        enrichmentType: 'standard_oee',
        timestamp: new Date().toISOString()
      };
      
      return JSON.stringify(enrichedData, null, 2);
      
    } catch (error) {
      console.warn("OEE enrichment failed for " + agent.id + ":", error.message);
      return baseData;
    }
  }

  setupA2AWorkflows() {
    try {
      import('../workflows/ProductionWorkflow.js').then(({ ProductionWorkflow }) => {
        this.productionWorkflow = new ProductionWorkflow(this.a2aManager);
        console.log('ProductionWorkflow loaded successfully');
      }).catch(error => {
        console.warn('ProductionWorkflow not available:', error.message);
        this.productionWorkflow = null;
      });
    } catch (error) {
      console.warn('A2A Workflow setup failed:', error.message);
    }
  }

  setupA2AHandlers() {
    if (!this.a2aManager) return;

    this.agents.forEach(agent => {
      if (agent.a2aCapabilities && Array.isArray(agent.a2aCapabilities)) {
        console.log("Setting up A2A for " + agent.id + ":", agent.a2aCapabilities);
        
        try {
          if (typeof this.a2aManager.registerAgent === 'function') {
            this.a2aManager.registerAgent(agent.id, agent.a2aCapabilities);
          } else {
            console.warn("A2A Manager registerAgent method not available");
            return;
          }
          
          agent.a2aCapabilities.forEach(capability => {
            try {
              this.eventBusManager.subscribe("a2a." + agent.id + "." + capability, 
                (eventData) => this.handleA2ARequest(agent, capability, eventData)
              );
            } catch (error) {
              console.warn("Failed to setup A2A listener for " + agent.id + "." + capability + ":", error.message);
            }
          });
        } catch (error) {
          console.warn("Failed to setup A2A for " + agent.id + ":", error.message);
        }
      }
    });

    console.log("A2A setup completed for " + this.getA2AEnabledAgents().length + " agents");
  }

  async handleA2ARequest(agent, action, eventData) {
    const requestStartTime = Date.now();
    
    try {
      console.log("A2A Request: " + agent.id + "." + action + " (RequestID: " + eventData.requestId + ")");
      
      const result = await this.processAgentA2A(agent, action, eventData.data);
      const responseTime = Date.now() - requestStartTime;
      
      this.a2aManager.handleA2AResponse(eventData.requestId, true, result);
      console.log("A2A Request completed: " + agent.id + "." + action + " in " + responseTime + "ms");
      
    } catch (error) {
      const responseTime = Date.now() - requestStartTime;
      console.error("A2A Request failed for " + agent.id + "." + action + ":", error);
      
      this.a2aManager.handleA2AResponse(eventData.requestId, false, null, error.message);
      console.log("A2A Request failed: " + agent.id + "." + action + " in " + responseTime + "ms - " + error.message);
    }
  }

  async processAgentA2A(agent, action, data) {
    if (!this.activeLLM) { // NEU: Prüft activeLLM
      throw new Error("Kein aktiver LLM-Client für A2A-Verarbeitung konfiguriert");
    }

    let prompt;
    
    const baseData = this.dataManager.getMockDataForAgent(agent.dataSource);
    const enrichedData = await this.enrichAgentDataWithOEE(agent, baseData);
    
    if (agent.a2aPrompts && agent.a2aPrompts[action]) {
      prompt = agent.a2aPrompts[action]
        .replace('{timestamp}', new Date().toISOString())
        .replace('{action}', action)
        .replace('{orderId}', data.orderId || 'N/A')
        .replace('{priority}', data.priority || 'normal')
        .replace('{data}', enrichedData);
    } else {
      prompt = agent.promptTemplate + "\n\n=== A2A REQUEST CONTEXT ===\nAction: " + action + 
        "\nRequest Data: " + JSON.stringify(data, null, 2) + 
        "\n\nIMPORTANT: This is an Agent-to-Agent communication request.\n" +
        "Please respond with structured, actionable data that another agent can process.\n" +
        "Focus on providing clear status, recommendations, and any required follow-up actions.\n\n" +
        "Expected Response Format: JSON with clear status and reasoning."
        .replace('{timestamp}', new Date().toISOString())
        .replace('{userMessage}', "A2A Request: " + action)
        .replace('{data}', enrichedData);
    }

    console.log("Processing A2A request for " + agent.id + "." + action + " (OEE: " + agent.oeeEnabled + ")");

    let responseText;
    
    // NEU: Vereinheitlichte LLM-Ausführung für Ollama/LangChain und Direct Anthropic
    if (this.llmProvider === 'ollama' || (this.llmProvider === 'anthropic' && this.useLangChain)) {
      // LangChain (Ollama oder ChatAnthropic) verwenden
      const response = await this.llm.invoke(prompt);
      responseText = response.content || response; 
    } else if (this.llmProvider === 'anthropic' && this.anthropic) {
      // Direct Anthropic SDK verwenden
      const response = await this.anthropic.messages.create({
        model: this.claudeModel,
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      });
      responseText = response.content[0].text;
    } else {
      throw new Error("Kein aktiver LLM-Client verfügbar");
    }
    // Ende des NEUEN LLM-Blocks
    
    let structuredResult;
    try {
      structuredResult = JSON.parse(responseText);
    } catch {
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

  findAgent(message) {
    if (!message || typeof message !== 'string') {
      console.warn('Invalid message provided to findAgent:', message);
      return null;
    }
    
    return this.agents.find(
      (a) =>
        a.trigger === message ||
        message.toLowerCase().includes(a.trigger.toLowerCase())
    );
  }

  async processAgent(agent, userMessage, isAutoTriggered = false) {
    if (!this.rateLimiter.canMakeCall(agent.id)) {
      const status = this.rateLimiter.getStatus();
      return "Rate limit exceeded. " + status.callsInWindow + "/" + status.maxCalls + 
        " calls used. Next reset in " + Math.ceil(status.nextResetIn/1000) + " seconds.";
    }

    if (!this.activeLLM) return "Kein aktiver LLM-Client konfiguriert.";
    
    this.totalApiCalls++;
    console.log("API Call #" + this.totalApiCalls + " - Agent: " + agent.id + 
      " (Auto: " + isAutoTriggered + ") (OEE: " + agent.oeeEnabled + ") (LLM: " + this.llmProvider.toUpperCase() + ")");

    const baseData = this.dataManager.getMockDataForAgent(agent.dataSource);
    const enrichedData = await this.enrichAgentDataWithOEE(agent, baseData);
    
    const prompt = agent.promptTemplate
      .replace('{timestamp}', new Date().toISOString())
      .replace('{userMessage}', userMessage)
      .replace('{data}', enrichedData);

    console.log("Agent " + agent.id + " processing with OEE data:", enrichedData.substring(0, 150) + '...');

    try {
      let responseText;
      
      // NEU: Vereinheitlichte LLM-Ausführung für Ollama/LangChain und Direct Anthropic
      if (this.llmProvider === 'ollama' || (this.llmProvider === 'anthropic' && this.useLangChain)) {
        // LangChain (Ollama oder ChatAnthropic) verwenden
        const response = await this.llm.invoke(prompt);
        responseText = response.content || response;
        
        if (this.auditLogger.logAgentExecution) {
          this.auditLogger.logAgentExecution(agent.id, userMessage, responseText);
        }
      } else if (this.llmProvider === 'anthropic' && this.anthropic) {
        // Direct Anthropic SDK verwenden
        const response = await this.anthropic.messages.create({
          model: this.claudeModel,
          max_tokens: 500,
          messages: [{ role: "user", content: prompt }],
        });
        responseText = response.content[0].text;
      } else {
        throw new Error("Kein aktiver LLM-Client verfügbar");
      }
      // Ende des NEUEN LLM-Blocks

      if (agent.events && agent.events.publishes && !isAutoTriggered) {
        this.isAutoTriggered = isAutoTriggered;
        await this.publishEventsWithControl(agent, userMessage, responseText);
      }

      return responseText;

    } catch (error) {
      console.error("LLM API error for " + agent.id + ":", error.message);
      return "Agent processing failed: " + error.message;
    }
  }

  async publishEventsWithControl(agent, userMessage, responseText) {
    console.log("Events DISABLED - Using A2A workflows instead for agent: " + agent.id);
    
    if (agent.id === 'orderAgent' && !this.isAutoTriggered && this.productionWorkflow) {
      setTimeout(async () => {
        try {
          console.log("Triggering A2A workflow for orderAgent result (OEE-enhanced)");
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
          console.error('A2A workflow failed:', error.message);
        }
      }, 1000);
    }
    
    return {
      published: 0,
      reason: 'Events disabled - A2A workflows active',
      oeeContext: agent.oeeEnabled
    };
  }

  getAllAgents() {
    return this.agents.map(agent => ({
      ...agent,
      a2aEnabled: !!(agent.a2aCapabilities && this.a2aManager),
      a2aCapabilities: agent.a2aCapabilities || [],
      oeeEnabled: agent.oeeEnabled || false,
      oeeEnhanced: agent.oeeEnhanced || false
    }));
  }

  getStats() {
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

    const oeeStats = {
      oeeIntegrationEnabled: this.oeeIntegrationEnabled,
      oeeEnabledAgents: this.agents.filter(a => a.oeeEnabled).length,
      oeeEnhancedAgents: this.agents.filter(a => a.oeeEnhanced).length,
      claudeIntegration: this.useLangChain ? 'LangChain' : 'Direct SDK',
      llmProvider: this.llmProvider.toUpperCase() // Hinzugefügt
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
      text: a.name || (a.id + " (" + a.trigger + ")"),
      description: a.description,
      a2aEnabled: !!(a.a2aCapabilities && this.a2aManager),
      oeeEnabled: a.oeeEnabled || false,
      oeeEnhanced: a.oeeEnhanced || false
    }));
  }

  getA2AEnabledAgents() {
    return this.agents.filter(agent => 
      agent.a2aCapabilities && Array.isArray(agent.a2aCapabilities) && agent.a2aCapabilities.length > 0
    );
  }

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

  getEventPublishers() {
    return this.agents.filter(a => a.events && a.events.publishes).map(a => ({
      id: a.id,
      name: a.name,
      publishes: a.events.publishes,
      oeeEnabled: a.oeeEnabled || false
    }));
  }

  reloadAgents(configPath = "config/agents.yaml") {
    try {
      if (this.a2aManager) {
        console.log("Resetting A2A registrations...");
        this.a2aManager.registeredAgents?.clear?.();
      }

      if (this.eventBusManager && typeof this.eventBusManager.clearSubscriptions === 'function') {
        console.log("Clearing existing event subscriptions...");
        this.eventBusManager.clearSubscriptions();
      }

      this.agents = [];
      this.agentStats = { loaded: 0, failed: 0, lastReload: null };
      
      const result = this.loadAgents(configPath);
      
      if (result) {
        console.log("Agents reloaded successfully with updated event subscriptions");
      }
      
      return result;
    } catch (error) {
      console.error("Failed to reload agents:", error);
      return false;
    }
  }

  toggleAgentOEE(agentId, enabled = true) {
    const agent = this.agents.find(a => a.id === agentId);
    if (agent) {
      agent.oeeEnabled = enabled;
      console.log("OEE " + (enabled ? 'enabled' : 'disabled') + " for agent: " + agentId);
      return true;
    }
    return false;
  }

  getOEEEnabledAgents() {
    return this.agents.filter(agent => agent.oeeEnabled);
  }

  refreshOEEData() {
    try {
      if (typeof this.dataManager.refreshOEECache === 'function') {
        this.dataManager.refreshOEECache();
        console.log('OEE data cache refreshed');
        return true;
      }
    } catch (error) {
      console.warn('Failed to refresh OEE cache:', error.message);
    }
    return false;
  }

async processGenericQuery(userMessage) {
  if (!this.activeLLM) return "No LLM client configured for generic queries.";

  // Hole ALLE verfügbaren lokalen Daten
  const allData = this.dataManager.getAllAvailableData();
  
  const constrainedPrompt = `You are a pharmaceutical manufacturing AI assistant.

CRITICAL CONSTRAINT: You may ONLY use the data provided below. Do NOT use any external knowledge or make assumptions. If the provided data doesn't contain the answer, explicitly say "This information is not available in the current system data."

User Query: ${userMessage}

Available System Data:
${JSON.stringify(allData, null, 2)}

Instructions:
- Answer ONLY based on the provided data
- If asked about something not in the data, say "Not available in system data"
- Reference specific data points from the JSON when possible
- Focus on pharmaceutical manufacturing context
- Do not speculate or use external knowledge

Current Time: ${new Date().toISOString()}`;

  try {
    let responseText;
    
    if (this.llmProvider === 'ollama' || (this.llmProvider === 'anthropic' && this.useLangChain)) {
      const response = await this.llm.invoke(constrainedPrompt);
      responseText = response.content || response;
    } else if (this.llmProvider === 'anthropic' && this.anthropic) {
      const response = await this.anthropic.messages.create({
        model: this.claudeModel,
        max_tokens: 500,
        messages: [{ role: "user", content: constrainedPrompt }],
      });
      responseText = response.content[0].text;
    }

    this.totalApiCalls++;
    console.log("Generic query processed with data constraint");
    return responseText;

  } catch (error) {
    console.error("Generic LLM processing failed:", error.message);
    return `I'm sorry, I encountered an error processing your request: ${error.message}`;
  }
}

}

export default AgentManager;