// src/services/BaseAgent.js - Phase 2 Enhanced Agent Base Class
import logger from "./logger.js";

/**
 * BaseAgent - Enhanced base class for event-driven agents
 * Provides event subscription, A2A communication, and lifecycle management
 */
export class BaseAgent {
  constructor(agentId, eventBus, router, config = {}) {
    this.agentId = agentId;
    this.eventBus = eventBus;
    this.router = router;
    this.config = config;
    
    this.subscriptions = [];
    this.isInitialized = false;
    this.metrics = {
      eventsReceived: 0,
      eventsPublished: 0,
      a2aCalls: 0,
      errors: 0
    };
    
    logger.info('BaseAgent created', { agentId });
  }

  /**
   * Subscribe to events with automatic cleanup tracking
   */
  subscribe(eventType, handler, priority = 0) {
    const subscription = this.eventBus.subscribe(
      eventType, 
      async (event) => {
        this.metrics.eventsReceived++;
        try {
          return await handler.call(this, event);
        } catch (error) {
          this.metrics.errors++;
          logger.error('Event handler failed', {
            agentId: this.agentId,
            eventType,
            eventId: event.id,
            error: error.message
          });
          throw error;
        }
      },
      this.agentId,
      priority
    );
    
    this.subscriptions.push({ eventType, subscription });
    
    logger.debug('Agent subscribed to event', { 
      agentId: this.agentId, 
      eventType, 
      priority 
    });
    
    return subscription;
  }

  /**
   * Publish events with agent identification
   */
  async publish(eventType, payload, options = {}) {
    this.metrics.eventsPublished++;
    
    return await this.eventBus.publish(eventType, payload, this.agentId, options);
  }

  /**
   * Enhanced A2A communication with error handling and metrics
   */
  async a2a(intent, context = {}) {
    this.metrics.a2aCalls++;
    
    try {
      const result = await this.router.route({
        intent,
        context: {
          ...context,
          _callerAgent: this.agentId,
          _callTimestamp: Date.now()
        },
        callerId: this.agentId
      });
      
      if (result?.result?.ok === false || result?.result?.error) {
        throw new Error(result?.result?.error || result?.result?.reason || 'A2A call failed');
      }
      
      return result.result;
      
    } catch (error) {
      this.metrics.errors++;
      logger.error('A2A call failed', {
        callerAgent: this.agentId,
        intent,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Agent lifecycle management
   */
  async initialize() {
    if (this.isInitialized) return;
    
    logger.info('Initializing agent', { agentId: this.agentId });
    
    // Override in subclasses for specific initialization
    await this.onInitialize();
    
    this.isInitialized = true;
    
    // Publish agent ready event
    await this.publish('agent.initialized', {
      agentId: this.agentId,
      capabilities: this.getCapabilities()
    });
  }

  async shutdown() {
    logger.info('Shutting down agent', { agentId: this.agentId });
    
    // Cleanup subscriptions
    for (const { eventType } of this.subscriptions) {
      this.eventBus.unsubscribe(eventType, this.agentId);
    }
    this.subscriptions = [];
    
    // Override in subclasses for specific cleanup
    await this.onShutdown();
    
    this.isInitialized = false;
    
    // Publish agent shutdown event
    await this.publish('agent.shutdown', {
      agentId: this.agentId
    });
  }

  /**
   * Override these in subclasses
   */
  async onInitialize() {
    // Subclass-specific initialization
  }

  async onShutdown() {
    // Subclass-specific cleanup
  }

  /**
   * Get agent capabilities - override in subclasses
   */
  getCapabilities() {
    return {
      agentId: this.agentId,
      eventSubscriptions: this.subscriptions.length,
      initialized: this.isInitialized,
      ...this.config
    };
  }

  /**
   * Get agent metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      subscriptions: this.subscriptions.length,
      uptime: this.isInitialized ? Date.now() - this.initTime : 0
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    return {
      agentId: this.agentId,
      status: this.isInitialized ? 'active' : 'inactive',
      metrics: this.getMetrics(),
      lastActivity: this.metrics.eventsReceived + this.metrics.a2aCalls > 0 ? 'active' : 'idle'
    };
  }

  /**
   * Helper method to safely execute async operations with error handling
   */
  async safeExecute(operation, context = {}) {
    try {
      return await operation();
    } catch (error) {
      this.metrics.errors++;
      
      logger.error('Safe execution failed', {
        agentId: this.agentId,
        context,
        error: error.message
      });
      
      // Publish error event for monitoring
      await this.publish('agent.error', {
        agentId: this.agentId,
        error: error.message,
        context
      }).catch(() => {}); // Don't fail on event publish errors
      
      throw error;
    }
  }
}

/**
 * ManufacturingAgent - Specialized base class for manufacturing domain agents
 */
export class ManufacturingAgent extends BaseAgent {
  constructor(agentId, eventBus, router, config = {}) {
    super(agentId, eventBus, router, config);
    
    this.manufacturingMetrics = {
      batchesProcessed: 0,
      ordersHandled: 0,
      qualityChecks: 0,
      alerts: 0
    };
  }

  async onInitialize() {
    // Subscribe to common manufacturing events
    this.subscribe('batch.started', this.onBatchStarted, 1);
    this.subscribe('batch.completed', this.onBatchCompleted, 1);
    this.subscribe('quality.alert', this.onQualityAlert, 2); // Higher priority
    this.subscribe('material.shortage', this.onMaterialShortage, 2);
    
    logger.info('Manufacturing agent initialized', { agentId: this.agentId });
  }

  // Default manufacturing event handlers - override in subclasses
  async onBatchStarted(event) {
    this.manufacturingMetrics.batchesProcessed++;
    logger.debug('Batch started event received', { 
      agentId: this.agentId, 
      batchId: event.payload.batchId 
    });
  }

  async onBatchCompleted(event) {
    logger.debug('Batch completed event received', { 
      agentId: this.agentId, 
      batchId: event.payload.batchId 
    });
  }

  async onQualityAlert(event) {
    this.manufacturingMetrics.alerts++;
    logger.warn('Quality alert received', { 
      agentId: this.agentId, 
      material: event.payload.material,
      severity: event.payload.severity
    });
  }

  async onMaterialShortage(event) {
    this.manufacturingMetrics.alerts++;
    logger.warn('Material shortage alert', { 
      agentId: this.agentId, 
      material: event.payload.material,
      currentStock: event.payload.currentStock
    });
  }

  getCapabilities() {
    return {
      ...super.getCapabilities(),
      domain: 'manufacturing',
      manufacturingMetrics: this.manufacturingMetrics
    };
  }
}

export default BaseAgent;