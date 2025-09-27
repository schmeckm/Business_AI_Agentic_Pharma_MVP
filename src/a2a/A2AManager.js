/**
 * ========================================================================
 * A2A MANAGER - AGENT-TO-AGENT COMMUNICATION MANAGER
 * ========================================================================
 * 
 * Manages direct Agent-to-Agent communication in parallel to Event system
 * Provides request/response pattern for synchronous agent workflows
 * 
 * Developer: Markus Schmeckenbecher
 * Version: 1.0.0 - Phase 1 A2A Implementation
 * 
 * Features:
 * - Direct agent-to-agent communication
 * - Request/response pattern with timeout handling
 * - Service registration and discovery
 * - Integration with existing EventBus
 * - Audit logging for all A2A operations
 * - Graceful error handling and fallbacks
 * ========================================================================
 */

import { EventEmitter } from 'events';

export class A2AManager extends EventEmitter {
  constructor(eventBusManager, auditLogger) {
    super();
    
    this.eventBus = eventBusManager;
    
    // SAFETY CHECK: Ensure auditLogger has required methods
    if (!auditLogger) {
      console.warn('No auditLogger provided to A2AManager, creating fallback');
      this.auditLogger = this.createFallbackLogger();
    } else if (typeof auditLogger.log !== 'function') {
      console.warn('auditLogger missing log() method, wrapping existing logger');
      this.auditLogger = this.wrapAuditLogger(auditLogger);
    } else {
      this.auditLogger = auditLogger;
    }
    
    this.pendingRequests = new Map();
    this.registeredAgents = new Map();
    this.requestTimeout = 30000; // 30 seconds default timeout
    
    console.log("A2A Manager initialized (Phase 1)");
    
    // Setup cleanup interval for orphaned requests
    this.cleanupInterval = setInterval(() => {
      this.cleanupOrphanedRequests();
    }, 60000); // Cleanup every minute
  }

  /**
   * Register Agent with A2A System
   * Associates agent ID with available capabilities/services
   */
  registerAgent(agentId, capabilities) {
    if (!Array.isArray(capabilities)) {
      console.warn(`Invalid capabilities for agent ${agentId}: expected array`);
      return false;
    }

    this.registeredAgents.set(agentId, {
      id: agentId,
      capabilities: capabilities,
      status: 'online',
      registeredAt: new Date().toISOString(),
      requestCount: 0,
      successCount: 0,
      avgResponseTime: 0
    });

    console.log(`Agent registered: ${agentId} with capabilities: [${capabilities.join(', ')}]`);
    
    // Log registration
    this.auditLogger.log('a2a_agent_registered', {
      agentId,
      capabilities,
      timestamp: new Date().toISOString()
    });

    return true;
  }

  /**
   * Request Service from Specific Agent
   * Direct agent-to-agent communication with timeout
   */
  async requestService(targetAgentId, action, data, options = {}) {
    const requestId = `a2a-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const timeout = options.timeout || this.requestTimeout;
    const startTime = Date.now();

    // Validate target agent
    const targetAgent = this.registeredAgents.get(targetAgentId);
    if (!targetAgent) {
      throw new Error(`Agent ${targetAgentId} not registered in A2A system`);
    }

    // Check if agent has the requested capability
    if (!targetAgent.capabilities.includes(action)) {
      throw new Error(`Agent ${targetAgentId} does not support action: ${action}`);
    }

    console.log(`A2A Request: ${targetAgentId}.${action} (ID: ${requestId})`);

    // Create promise that resolves when response is received
    const responsePromise = new Promise((resolve, reject) => {
      // Setup timeout
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`A2A timeout: ${targetAgentId}.${action} (${timeout}ms)`));
      }, timeout);

      // Store pending request
      this.pendingRequests.set(requestId, {
        requestId,
        targetAgentId,
        action,
        data,
        startTime,
        timeout,
        timeoutHandle,
        resolve: (response) => {
          clearTimeout(timeoutHandle);
          resolve(response);
        },
        reject: (error) => {
          clearTimeout(timeoutHandle);
          reject(error);
        }
      });
    });

    try {
      // Send A2A message via EventBus (leveraging existing infrastructure)
      this.eventBus.publishEvent(`a2a.${targetAgentId}.${action}`, {
        requestId,
        from: 'a2a-system',
        targetAgentId,
        action,
        data,
        timestamp: new Date().toISOString()
      }, 'a2a-manager');

      // Update agent stats
      targetAgent.requestCount++;

      // Wait for response
      const result = await responsePromise;
      
      // Calculate response time and update stats
      const responseTime = Date.now() - startTime;
      targetAgent.successCount++;
      targetAgent.avgResponseTime = (targetAgent.avgResponseTime * 0.8) + (responseTime * 0.2);

      // Audit logging
      this.auditLogger.log('a2a_request_completed', {
        requestId,
        targetAgentId,
        action,
        responseTime: `${responseTime}ms`,
        success: true
      });

      console.log(`A2A Response received: ${targetAgentId}.${action} (${responseTime}ms)`);
      
      return result;

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      // Cleanup pending request
      this.pendingRequests.delete(requestId);
      
      // Audit logging
      this.auditLogger.log('a2a_request_failed', {
        requestId,
        targetAgentId,
        action,
        responseTime: `${responseTime}ms`,
        error: error.message
      });

      console.error(`A2A Request failed: ${targetAgentId}.${action} - ${error.message}`);
      throw error;
    }
  }

  /**
   * Handle A2A Response from Agent
   * Processes response and resolves pending promise
   */
  handleA2AResponse(requestId, success, data, error = null) {
    const pendingRequest = this.pendingRequests.get(requestId);
    
    if (!pendingRequest) {
      console.warn(`Received A2A response for unknown request: ${requestId}`);
      return false;
    }

    // Remove from pending requests
    this.pendingRequests.delete(requestId);

    try {
      if (success) {
        console.log(`A2A Response: ${requestId} - SUCCESS`);
        pendingRequest.resolve(data);
      } else {
        console.log(`A2A Response: ${requestId} - ERROR: ${error}`);
        pendingRequest.reject(new Error(error));
      }
      
      return true;
    } catch (err) {
      console.error(`Error handling A2A response for ${requestId}:`, err);
      return false;
    }
  }

  /**
   * Find Agents by Capability
   * Service discovery for A2A requests
   */
  findAgentsByCapability(capability) {
    const matchingAgents = [];
    
    this.registeredAgents.forEach((agent, agentId) => {
      if (agent.capabilities.includes(capability) && agent.status === 'online') {
        matchingAgents.push({
          agentId,
          ...agent,
          load: this.calculateAgentLoad(agent)
        });
      }
    });

    // Sort by load (least loaded first)
    return matchingAgents.sort((a, b) => a.load - b.load);
  }

  /**
   * Request Service by Capability (with Service Discovery)
   * Finds best available agent for the capability
   */
  async requestServiceByCapability(capability, data, options = {}) {
    const availableAgents = this.findAgentsByCapability(capability);
    
    if (availableAgents.length === 0) {
      throw new Error(`No agents available with capability: ${capability}`);
    }

    // Use least loaded agent
    const selectedAgent = availableAgents[0];
    
    console.log(`Service Discovery: Selected ${selectedAgent.agentId} for capability '${capability}'`);
    
    return await this.requestService(selectedAgent.agentId, capability, data, options);
  }

  /**
   * Calculate Agent Load
   * Simple load metric based on success rate and pending requests
   */
  calculateAgentLoad(agent) {
    const successRate = agent.requestCount > 0 ? agent.successCount / agent.requestCount : 1.0;
    const pendingRequests = Array.from(this.pendingRequests.values())
      .filter(req => req.targetAgentId === agent.id).length;
    
    // Lower is better: (1 - success_rate) + pending_requests * 0.1
    return (1 - successRate) + (pendingRequests * 0.1);
  }

  /**
   * Get A2A System Status
   * Returns current status of A2A system
   */
  getStatus() {
    const registeredAgentsList = Array.from(this.registeredAgents.values());
    
    return {
      enabled: true,
      registeredAgents: registeredAgentsList.length,
      pendingRequests: this.pendingRequests.size,
      agents: registeredAgentsList.map(agent => ({
        id: agent.id,
        capabilities: agent.capabilities,
        status: agent.status,
        requests: agent.requestCount,
        successRate: agent.requestCount > 0 ? 
          Math.round((agent.successCount / agent.requestCount) * 100) : 100,
        avgResponseTime: Math.round(agent.avgResponseTime)
      })),
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get Service Registry
   * Returns all available services and their providers
   */
  getServiceRegistry() {
    const registry = {};
    
    this.registeredAgents.forEach((agent, agentId) => {
      agent.capabilities.forEach(capability => {
        if (!registry[capability]) {
          registry[capability] = [];
        }
        
        registry[capability].push({
          agentId,
          status: agent.status,
          load: this.calculateAgentLoad(agent),
          successRate: agent.requestCount > 0 ? 
            Math.round((agent.successCount / agent.requestCount) * 100) : 100
        });
      });
    });

    // Sort providers by load for each service
    Object.keys(registry).forEach(capability => {
      registry[capability].sort((a, b) => a.load - b.load);
    });

    return registry;
  }

  /**
   * Cleanup Orphaned Requests
   * Removes requests that have exceeded their timeout
   */
  cleanupOrphanedRequests() {
    const now = Date.now();
    let cleanedCount = 0;

    this.pendingRequests.forEach((request, requestId) => {
      const elapsed = now - request.startTime;
      
      if (elapsed > request.timeout + 5000) { // 5s grace period
        console.warn(`Cleaning up orphaned A2A request: ${requestId} (${elapsed}ms old)`);
        
        // Clear timeout and reject
        clearTimeout(request.timeoutHandle);
        request.reject(new Error(`Request orphaned after ${elapsed}ms`));
        
        // Remove from pending
        this.pendingRequests.delete(requestId);
        cleanedCount++;
      }
    });

    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} orphaned A2A requests`);
    }
  }

  /**
   * Shutdown A2A Manager
   * Cleanup resources and pending requests
   */
  shutdown() {
    console.log("Shutting down A2A Manager...");
    
    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Reject all pending requests
    this.pendingRequests.forEach((request, requestId) => {
      clearTimeout(request.timeoutHandle);
      request.reject(new Error('A2A Manager shutting down'));
    });
    
    this.pendingRequests.clear();
    this.registeredAgents.clear();
    
    // Audit log
    this.auditLogger.log('a2a_manager_shutdown', {
      timestamp: new Date().toISOString()
    });
    
    console.log("A2A Manager shutdown complete");
  }

  /**
   * Health Check
   * Returns simple health status
   */
  isHealthy() {
    const pendingCount = this.pendingRequests.size;
    const registeredCount = this.registeredAgents.size;
    
    return {
      healthy: pendingCount < 100 && registeredCount > 0,
      pendingRequests: pendingCount,
      registeredAgents: registeredCount,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Creates fallback logger when none provided
   */
  createFallbackLogger() {
    return {
      log: (type, data) => {
        console.log(`[A2A-AUDIT] ${type}:`, JSON.stringify(data, null, 2));
      },
      appendAudit: (data) => {
        console.log('[A2A-AUDIT]', data);
      }
    };
  }

  /**
   * Wraps existing logger to add missing log() method
   */
  wrapAuditLogger(existingLogger) {
    return {
      ...existingLogger,
      log: (type, data) => {
        if (typeof existingLogger.appendAudit === 'function') {
          existingLogger.appendAudit({
            type: type,
            timestamp: new Date().toISOString(),
            ...data
          });
        } else if (typeof existingLogger.info === 'function') {
          existingLogger.info(`${type}: ${JSON.stringify(data)}`);
        } else if (typeof existingLogger.logEvent === 'function') {
          existingLogger.logEvent(type, data);
        } else {
          console.log(`[A2A-${type.toUpperCase()}]`, data);
        }
      }
    };
  }
}

export default A2AManager;