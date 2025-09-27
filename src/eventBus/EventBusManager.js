/**
 * ========================================================================
 * EVENT BUS MANAGER (A2A ENHANCED + OEE INTEGRATION)
 * ========================================================================
 * 
 * Handles all event-driven communication between agents
 * Supports both local EventEmitter and production message brokers
 * Enhanced with A2A (Agent-to-Agent) communication support
 * NEW: OEE Event Integration for equipment effectiveness monitoring
 * 
 * Developer: Markus Schmeckenbecher
 * Version: 1.3.1 - A2A Integration + OEE Events
 * 
 * Features:
 * - Event publishing and subscription management
 * - Agent auto-triggering based on event subscriptions
 * - Loop prevention for cascading events
 * - Audit logging integration
 * - A2A communication support with AgentManager integration
 * - OEE event handling (oee/updated, oee/optimization_required, etc.)
 * ========================================================================
 */

import EventEmitter from "events";

export class EventBusManager {
  constructor(auditLogger) {
    this.eventBus = new EventEmitter();
    this.auditLogger = auditLogger;
    this.agentSubscriptions = new Map();
    this.agentManager = null; // Will be set by server.js for A2A support
    
    // OEE Event Tracking
    this.oeeEventHistory = [];
    this.oeeSubscribers = new Set();
    
    console.log("🔗 EventBusManager initialized with OEE support");
  }

  /**
   * Set AgentManager Reference for A2A Communication
   * Called by server.js after AgentManager initialization
   */
  setAgentManager(agentManager) {
    this.agentManager = agentManager;
    console.log("🔗 EventBusManager linked to AgentManager for A2A communication");
  }

  /**
   * Build Event Subscription Mappings (Enhanced with OEE Events)
   * Creates efficient lookup table for event-to-agent routing
   */
  buildEventSubscriptions(agents) {
    this.agentSubscriptions.clear();
    this.oeeSubscribers.clear();
    
    agents.forEach(agent => {
      if (agent.events && agent.events.subscribes) {
        agent.events.subscribes.forEach(event => {
          if (!this.agentSubscriptions.has(event)) {
            this.agentSubscriptions.set(event, []);
          }
          this.agentSubscriptions.get(event).push(agent);
          
          // Track OEE subscribers
          if (event.startsWith('oee/') || event === 'oee/updated') {
            this.oeeSubscribers.add(agent.id);
            console.log(`🏭 Agent ${agent.id} subscribed to OEE events`);
          }
        });
      }
    });
    
    console.log("🔗 Event subscriptions built:", 
      Array.from(this.agentSubscriptions.entries()).map(([event, agents]) => 
        `${event} → [${agents.map(a => a.id).join(', ')}]`
      )
    );
    
    console.log(`🏭 OEE subscribers: [${Array.from(this.oeeSubscribers).join(', ')}]`);
  }

  /**
   * Publish Agent Event (Enhanced for A2A + OEE)
   * Distributes events to all subscribing agents
   * Now supports both legacy agentProcessor and new A2A agentManager
   * Enhanced with OEE event handling
   */
  async publishEvent(eventType, data, sourceAgentId, agentProcessor = null) {
    console.log(`📡 Publishing event: ${eventType} from ${sourceAgentId}`);
    
    // Special handling for OEE events
    if (eventType.startsWith('oee/')) {
      this.handleOEEEvent(eventType, data, sourceAgentId);
    }
    
    // Audit logging for GMP compliance (enhanced with OEE context)
    const auditEvent = {
      type: "agent_event",
      eventType,
      sourceAgent: sourceAgentId,
      data,
      isOEEEvent: eventType.startsWith('oee/'),
      timestamp: new Date().toISOString()
    };
    
    this.auditLogger.appendAudit(auditEvent);
    this.emit("event", auditEvent);
    
    // Find and trigger subscribing agents
    const subscribers = this.agentSubscriptions.get(eventType) || [];
    const wildcardSubscribers = this.agentSubscriptions.get("*") || [];
    const allSubscribers = [...subscribers, ...wildcardSubscribers];
    
    if (allSubscribers.length > 0) {
      console.log(`🎯 Triggering ${allSubscribers.length} subscribing agents:`, 
        allSubscribers.map(a => a.id)
      );
      
      // Execute subscribing agents with loop prevention
      for (const subscribingAgent of allSubscribers) {
        try {
          console.log(`⚡ Auto-triggering agent: ${subscribingAgent.id}`);
          
          let autoMessage;
          if (eventType.startsWith('oee/')) {
            autoMessage = `Auto-triggered by OEE event: ${eventType} from ${sourceAgentId}`;
          } else {
            autoMessage = `Auto-triggered by event: ${eventType} from ${sourceAgentId}`;
          }
          
          let response = null;
          
          // ENHANCED: Support both legacy agentProcessor and new A2A agentManager
          if (agentProcessor && typeof agentProcessor.processAgent === 'function') {
            // Legacy event system
            response = await agentProcessor.processAgent(subscribingAgent, autoMessage, true);
          } else if (this.agentManager && typeof this.agentManager.processAgent === 'function') {
            // A2A system with OEE context
            response = await this.agentManager.processAgent(subscribingAgent, autoMessage, true);
          } else {
            console.warn(`⚠️ No agent processor available for ${subscribingAgent.id}`);
            console.log(`📋 Event ${eventType} logged for ${subscribingAgent.id} (no processing)`);
            continue; // Skip to next agent
          }
          
          // Log auto-triggered response (enhanced with OEE context)
          const autoEvent = {
            type: "auto_triggered_agent",
            triggeredAgent: subscribingAgent.id,
            triggerEvent: eventType,
            sourceAgent: sourceAgentId,
            response: response ? response.substring(0, 200) + '...' : 'No response',
            isOEETriggered: eventType.startsWith('oee/'),
            timestamp: new Date().toISOString()
          };
          
          this.auditLogger.appendAudit(autoEvent);
          this.emit("event", autoEvent);
          
          // Handle cascading events with delay to prevent overload
          // OPTION B: Disable cascading events to prevent infinite loops
          // Cascading events replaced by controlled A2A workflows
          console.log(`🔗 Cascading events disabled for ${subscribingAgent.id} (Option B: A2A workflows)`);
          // No automatic event cascading - use controlled A2A workflows instead
          
        } catch (error) {
          console.error(`❌ Error auto-triggering agent ${subscribingAgent.id}:`, error.message);
          // Continue with other agents even if one fails
        }
      }
    }
  }

  /**
   * Handle OEE Events (NEW)
   * Special processing for OEE-related events
   */
  handleOEEEvent(eventType, data, sourceAgentId) {
    console.log(`🏭 Processing OEE event: ${eventType}`);
    
    // Store OEE event history for trend analysis
    const oeeEvent = {
      eventType,
      data,
      sourceAgent: sourceAgentId,
      timestamp: new Date().toISOString()
    };
    
    this.oeeEventHistory.push(oeeEvent);
    
    // Keep only last 100 OEE events to prevent memory growth
    if (this.oeeEventHistory.length > 100) {
      this.oeeEventHistory = this.oeeEventHistory.slice(-100);
    }
    
    // Special handling for different OEE event types
    switch (eventType) {
      case 'oee/updated':
        console.log(`📊 OEE metrics updated:`, data.oeeMetrics || 'No metrics provided');
        break;
      case 'oee/optimization_required':
        console.log(`⚡ OEE optimization required for:`, data.orderId || 'Unknown order');
        break;
      case 'oee/compliance_status':
        console.log(`🛡️ OEE compliance status:`, data.status || 'Unknown status');
        break;
      case 'oee/batch_impact':
        console.log(`🔬 OEE batch impact assessed:`, data.batchId || 'Unknown batch');
        break;
      default:
        console.log(`📋 General OEE event processed: ${eventType}`);
    }
  }

  /**
   * Publish OEE Event (NEW)
   * Convenience method for publishing OEE events
   */
  async publishOEEEvent(eventType, oeeData, sourceAgentId = 'system') {
    const fullEventType = eventType.startsWith('oee/') ? eventType : `oee/${eventType}`;
    
    console.log(`🏭 Publishing OEE event: ${fullEventType}`);
    
    await this.publishEvent(fullEventType, {
      oeeMetrics: oeeData,
      timestamp: new Date().toISOString(),
      source: sourceAgentId
    }, sourceAgentId);
  }

  /**
   * Subscribe to Event (Enhanced for A2A + OEE)
   * Register event listener with A2A callback support
   */
  subscribe(eventPattern, callback) {
    this.eventBus.on(eventPattern, callback);
    console.log(`📩 Subscribed to event pattern: ${eventPattern}`);
    
    // Track OEE subscriptions
    if (eventPattern.startsWith('oee/')) {
      console.log(`🏭 OEE event subscription registered: ${eventPattern}`);
    }
  }

  /**
   * Subscribe to Events
   * Register event listener for real-time updates
   */
  on(event, listener) {
    this.eventBus.on(event, listener);
  }

  /**
   * Emit Event
   * Send event to all registered listeners
   */
  emit(event, data) {
    this.eventBus.emit(event, data);
  }

  /**
   * Remove Event Listener
   */
  removeListener(event, listener) {
    this.eventBus.removeListener(event, listener);
  }

  /**
   * Get Event Subscriptions Overview (Enhanced with OEE info)
   * Returns mapping of events to subscribing agents
   */
  getEventSubscriptions() {
    const subscriptions = Array.from(this.agentSubscriptions.entries()).map(([event, agents]) => ({
      event,
      subscribers: agents.map(a => ({ 
        id: a.id, 
        name: a.name, 
        trigger: a.trigger,
        oeeEnabled: a.oeeEnabled || false
      })),
      isOEEEvent: event.startsWith('oee/')
    }));
    
    return {
      subscriptions,
      totalEvents: this.agentSubscriptions.size,
      oeeEvents: subscriptions.filter(s => s.isOEEEvent).length,
      oeeSubscribers: Array.from(this.oeeSubscribers),
      a2aEnabled: !!this.agentManager,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get Subscribers for Event (Enhanced with OEE context)
   * Returns array of agent IDs subscribed to specific event
   */
  getSubscribers(eventType) {
    const directSubscribers = this.agentSubscriptions.get(eventType)?.map(a => a.id) || [];
    const wildcardSubscribers = this.agentSubscriptions.get("*")?.map(a => a.id) || [];
    
    // Combine and deduplicate
    const allSubscribers = [...new Set([...directSubscribers, ...wildcardSubscribers])];
    
    return {
      subscribers: allSubscribers,
      isOEEEvent: eventType.startsWith('oee/'),
      subscriberCount: allSubscribers.length
    };
  }

  /**
   * Get OEE Event History (NEW)
   * Returns recent OEE events for analysis
   */
  getOEEEventHistory(limit = 20) {
    return {
      events: this.oeeEventHistory.slice(-limit),
      totalOEEEvents: this.oeeEventHistory.length,
      oeeSubscribers: Array.from(this.oeeSubscribers),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get OEE Event Statistics (NEW)
   * Returns statistics about OEE event activity
   */
  getOEEStatistics() {
    const recentEvents = this.oeeEventHistory.slice(-50); // Last 50 events
    const eventTypes = {};
    
    recentEvents.forEach(event => {
      eventTypes[event.eventType] = (eventTypes[event.eventType] || 0) + 1;
    });
    
    return {
      totalOEEEvents: this.oeeEventHistory.length,
      recentEventCount: recentEvents.length,
      eventTypeBreakdown: eventTypes,
      oeeSubscriberCount: this.oeeSubscribers.size,
      mostRecentEvent: this.oeeEventHistory[this.oeeEventHistory.length - 1] || null,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Health Check for A2A Integration (Enhanced with OEE status)
   */
  getA2AStatus() {
    return {
      agentManagerLinked: !!this.agentManager,
      eventSubscriptions: this.agentSubscriptions.size,
      canProcessAgents: !!(this.agentManager?.processAgent),
      oeeEventsSupported: true,
      oeeSubscribers: this.oeeSubscribers.size,
      oeeEventHistory: this.oeeEventHistory.length,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Clear OEE Event History (NEW)
   * Utility method for maintenance
   */
  clearOEEHistory() {
    const clearedCount = this.oeeEventHistory.length;
    this.oeeEventHistory = [];
    console.log(`🧹 Cleared ${clearedCount} OEE events from history`);
    return clearedCount;
  }
}

export default EventBusManager;