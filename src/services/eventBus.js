// src/services/EventBus.js - Phase 2 Event-Driven Communication
import logger from "./logger.js";
import { v4 as uuidv4 } from "uuid";

/**
 * EventBus - Central event coordination for agent collaboration
 * Enables reactive manufacturing processes with pub/sub pattern
 */
export class EventBus {
  constructor() {
    this.subscribers = new Map(); // eventType -> [{ handler, agentId, priority }]
    this.eventHistory = [];
    this.maxHistory = 1000;
    this.metrics = {
      eventsPublished: 0,
      eventsProcessed: 0,
      failedEvents: 0,
      averageProcessingTime: 0
    };
    
    logger.info('EventBus initialized for Phase 2');
  }

  /**
   * Subscribe to events with priority support
   */
  subscribe(eventType, handler, agentId, priority = 0) {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, []);
    }
    
    const subscription = { 
      handler, 
      agentId, 
      priority,
      subscribedAt: Date.now()
    };
    
    // Insert based on priority (higher priority first)
    const subscribers = this.subscribers.get(eventType);
    const insertIndex = subscribers.findIndex(sub => sub.priority < priority);
    
    if (insertIndex === -1) {
      subscribers.push(subscription);
    } else {
      subscribers.splice(insertIndex, 0, subscription);
    }
    
    logger.info('Agent subscribed to event', { 
      eventType, 
      agentId, 
      priority,
      totalSubscribers: subscribers.length 
    });
    
    return subscription;
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(eventType, agentId) {
    if (!this.subscribers.has(eventType)) return false;
    
    const subscribers = this.subscribers.get(eventType);
    const initialLength = subscribers.length;
    
    this.subscribers.set(eventType, 
      subscribers.filter(sub => sub.agentId !== agentId)
    );
    
    const removed = initialLength - this.subscribers.get(eventType).length;
    
    if (removed > 0) {
      logger.info('Agent unsubscribed from event', { eventType, agentId, removed });
    }
    
    return removed > 0;
  }

  /**
   * Publish event to all subscribers with error handling and metrics
   */
  async publish(eventType, payload, source = 'system', options = {}) {
    const startTime = Date.now();
    
    const event = {
      id: uuidv4(),
      type: eventType,
      payload: payload || {},
      source,
      timestamp: new Date().toISOString(),
      metadata: {
        priority: options.priority || 0,
        timeout: options.timeout || 5000,
        retryCount: 0,
        maxRetries: options.maxRetries || 0
      }
    };

    // Store in history
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistory) {
      this.eventHistory.shift();
    }

    this.metrics.eventsPublished++;
    
    logger.info('Publishing event', { 
      eventId: event.id,
      eventType, 
      source,
      payload: Object.keys(payload || {})
    });

    // Get subscribers for this event type
    const subscribers = this.subscribers.get(eventType) || [];
    
    if (subscribers.length === 0) {
      logger.warn('No subscribers for event', { eventType });
      return { event, results: [] };
    }

    // Process subscribers based on execution mode
    const results = options.parallel !== false 
      ? await this.processParallel(event, subscribers)
      : await this.processSequential(event, subscribers);

    // Update metrics
    const processingTime = Date.now() - startTime;
    this.metrics.averageProcessingTime = 
      (this.metrics.averageProcessingTime + processingTime) / 2;
    this.metrics.eventsProcessed++;
    
    // Count failures
    const failures = results.filter(r => !r.success).length;
    this.metrics.failedEvents += failures;

    logger.info('Event processing completed', {
      eventId: event.id,
      subscribers: subscribers.length,
      successful: results.filter(r => r.success).length,
      failed: failures,
      processingTime
    });

    // Broadcast to WebSocket clients if available
    if (global.broadcast) {
      global.broadcast({
        type: 'agent_event',
        event: {
          ...event,
          results: results.length,
          processingTime
        }
      });
    }

    return { event, results };
  }

  /**
   * Process subscribers in parallel (default)
   */
  async processParallel(event, subscribers) {
    const promises = subscribers.map(({ handler, agentId }) => 
      this.executeHandler(handler, event, agentId)
    );
    
    return await Promise.allSettled(promises).then(results =>
      results.map((result, index) => ({
        agentId: subscribers[index].agentId,
        success: result.status === 'fulfilled',
        result: result.status === 'fulfilled' ? result.value : undefined,
        error: result.status === 'rejected' ? result.reason?.message : undefined
      }))
    );
  }

  /**
   * Process subscribers sequentially (for ordered execution)
   */
  async processSequential(event, subscribers) {
    const results = [];
    
    for (const { handler, agentId } of subscribers) {
      try {
        const result = await this.executeHandler(handler, event, agentId);
        results.push({ agentId, success: true, result });
      } catch (error) {
        results.push({ 
          agentId, 
          success: false, 
          error: error.message,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
      }
    }
    
    return results;
  }

  /**
   * Execute individual event handler with timeout and error handling
   */
  async executeHandler(handler, event, agentId) {
    const timeout = event.metadata.timeout;
    
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Event handler timeout (${timeout}ms) for agent ${agentId}`));
      }, timeout);
      
      try {
        const result = await handler(event);
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        logger.warn('Event handler failed', {
          agentId,
          eventId: event.id,
          eventType: event.type,
          error: error.message
        });
        reject(error);
      }
    });
  }

  /**
   * Get event history with filtering
   */
  getEventHistory(filters = {}) {
    let history = [...this.eventHistory];
    
    if (filters.eventType) {
      history = history.filter(e => e.type === filters.eventType);
    }
    
    if (filters.source) {
      history = history.filter(e => e.source === filters.source);
    }
    
    if (filters.since) {
      const sinceTime = new Date(filters.since).getTime();
      history = history.filter(e => new Date(e.timestamp).getTime() >= sinceTime);
    }
    
    if (filters.limit) {
      history = history.slice(-filters.limit);
    }
    
    return history.reverse(); // Most recent first
  }

  /**
   * Get subscription information
   */
  getSubscriptions() {
    const subscriptions = {};
    
    for (const [eventType, subs] of this.subscribers.entries()) {
      subscriptions[eventType] = subs.map(sub => ({
        agentId: sub.agentId,
        priority: sub.priority,
        subscribedAt: sub.subscribedAt
      }));
    }
    
    return subscriptions;
  }

  /**
   * Get event bus metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      totalSubscriptions: Array.from(this.subscribers.values())
        .reduce((total, subs) => total + subs.length, 0),
      uniqueEventTypes: this.subscribers.size,
      historySize: this.eventHistory.length,
      successRate: this.metrics.eventsProcessed > 0 
        ? ((this.metrics.eventsProcessed - this.metrics.failedEvents) / this.metrics.eventsProcessed)
        : 0
    };
  }

  /**
   * Health check for event bus
   */
  async healthCheck() {
    const metrics = this.getMetrics();
    
    return {
      ok: true,
      status: 'operational',
      metrics,
      subscriptions: Object.keys(this.getSubscriptions()).length,
      recentEvents: this.getEventHistory({ limit: 5 }).length
    };
  }

  /**
   * Clear event history (for cleanup/testing)
   */
  clearHistory() {
    const clearedCount = this.eventHistory.length;
    this.eventHistory = [];
    logger.info('Event history cleared', { clearedCount });
    return clearedCount;
  }

  /**
   * Manufacturing-specific event helpers
   */
  
  // Batch lifecycle events
  async publishBatchStarted(batchId, orders, line) {
    return await this.publish('batch.started', {
      batchId,
      orders,
      line,
      startTime: new Date().toISOString()
    }, 'mar');
  }

  async publishBatchCompleted(batchId, results) {
    return await this.publish('batch.completed', {
      batchId,
      results,
      completedTime: new Date().toISOString()
    }, 'mar');
  }

  // Material events
  async publishMaterialReceived(material, quantity, supplier, lot) {
    return await this.publish('material.received', {
      material,
      quantity,
      supplier,
      lot,
      receivedTime: new Date().toISOString()
    }, 'cmo');
  }

  // Quality events
  async publishQualityAlert(material, issue, severity = 'medium') {
    return await this.publish('quality.alert', {
      material,
      issue,
      severity,
      alertTime: new Date().toISOString()
    }, 'qa');
  }
}

export default EventBus;