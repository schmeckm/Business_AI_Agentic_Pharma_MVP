// MCP CONTEXT MANAGER
// ===================
// Manages context sharing between pharmaceutical agents
// File: src/mcp/MCPContextManager.js

import { v4 as uuidv4 } from 'uuid';

export class MCPContextManager {
    constructor({ eventBus, auditLogger }) {
        this.eventBus = eventBus;
        this.auditLogger = auditLogger;
        
        // Context storage
        this.contexts = new Map();
        this.contextAccess = new Map();
        this.contextHistory = new Map();
        
        // Agent subscriptions
        this.agentSubscriptions = new Map();
        this.contextNotifications = new Map();
        
        // Configuration
        this.config = {
            maxContexts: 1000,
            defaultTTL: 24 * 60 * 60 * 1000, // 24 hours
            maxContextSize: 1024 * 1024, // 1MB
            cleanupInterval: 60 * 60 * 1000 // 1 hour
        };

        this.initializeContextManager();
    }

    initializeContextManager() {
        console.log('🤝 Initializing MCP Context Manager...');
        
        this.setupContextTypes();
        this.setupEventHandlers();
        this.startCleanupProcess();
        
        console.log('✅ Context Manager initialized successfully');
    }

    setupContextTypes() {
        // Define pharmaceutical context types
        this.contextTypes = {
            'batch_analysis': {
                description: 'Batch analysis results and recommendations',
                allowedAgents: ['orderAgent', 'briefingAgent', 'assessmentAgent', 'complianceAgent'],
                requiredFields: ['batchId', 'analysisDate'],
                schema: {
                    type: 'object',
                    properties: {
                        batchId: { type: 'string' },
                        analysisDate: { type: 'string', format: 'date-time' },
                        qualityMetrics: { type: 'object' },
                        riskAssessment: { type: 'object' },
                        recommendations: { type: 'array' }
                    }
                }
            },
            'production_status': {
                description: 'Current production status and alerts',
                allowedAgents: ['orderAgent', 'briefingAgent', 'statusAgent'],
                requiredFields: ['timestamp', 'status'],
                schema: {
                    type: 'object',
                    properties: {
                        timestamp: { type: 'string', format: 'date-time' },
                        status: { type: 'string', enum: ['normal', 'warning', 'critical'] },
                        activeOrders: { type: 'array' },
                        issues: { type: 'array' },
                        resourceUtilization: { type: 'object' }
                    }
                }
            },
            'compliance_check': {
                description: 'Compliance check results and findings',
                allowedAgents: ['complianceAgent', 'assessmentAgent', 'briefingAgent'],
                requiredFields: ['checkType', 'result'],
                schema: {
                    type: 'object',
                    properties: {
                        checkType: { type: 'string', enum: ['GMP', 'GDP', 'CFR_21_Part_11'] },
                        result: { type: 'string', enum: ['compliant', 'non_compliant', 'requires_attention'] },
                        findings: { type: 'array' },
                        corrective_actions: { type: 'array' },
                        deadline: { type: 'string', format: 'date-time' }
                    }
                }
            },
            'quality_alert': {
                description: 'Quality issues and alert notifications',
                allowedAgents: ['assessmentAgent', 'complianceAgent', 'statusAgent'],
                requiredFields: ['alertLevel', 'affectedBatches'],
                schema: {
                    type: 'object',
                    properties: {
                        alertLevel: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                        affectedBatches: { type: 'array' },
                        issueDescription: { type: 'string' },
                        impact: { type: 'object' },
                        immediateActions: { type: 'array' }
                    }
                }
            },
            'resource_allocation': {
                description: 'Resource planning and allocation information',
                allowedAgents: ['orderAgent', 'briefingAgent'],
                requiredFields: ['resources', 'timeframe'],
                schema: {
                    type: 'object',
                    properties: {
                        resources: { type: 'object' },
                        timeframe: { type: 'object' },
                        conflicts: { type: 'array' },
                        optimization_suggestions: { type: 'array' }
                    }
                }
            }
        };
    }

    setupEventHandlers() {
        // Listen for context-related events
        this.eventBus.on('context/request', this.handleContextRequest.bind(this));
        this.eventBus.on('context/update', this.handleContextUpdate.bind(this));
        this.eventBus.on('context/subscribe', this.handleContextSubscription.bind(this));
        this.eventBus.on('agent/shutdown', this.handleAgentShutdown.bind(this));
    }

    startCleanupProcess() {
        // Periodically clean up expired contexts
        setInterval(() => {
            this.cleanupExpiredContexts();
        }, this.config.cleanupInterval);
    }

    // CONTEXT CREATION & MANAGEMENT
    // ==============================

    async createContext(contextData, options = {}) {
        const {
            contextId = uuidv4(),
            contextType,
            sourceAgent,
            targetAgents = [],
            ttl = this.config.defaultTTL,
            accessLevel = 'read',
            priority = 'medium'
        } = options;

        try {
            // Validate context data
            this.validateContextData(contextData, contextType);

            // Check context limits
            if (this.contexts.size >= this.config.maxContexts) {
                throw new Error('Maximum number of contexts reached');
            }

            // Check data size
            const dataSize = JSON.stringify(contextData).length;
            if (dataSize > this.config.maxContextSize) {
                throw new Error('Context data exceeds maximum size limit');
            }

            // Create context object
            const context = {
                id: contextId,
                type: contextType,
                data: contextData,
                sourceAgent,
                targetAgents,
                accessLevel,
                priority,
                createdAt: Date.now(),
                expiresAt: Date.now() + ttl,
                lastAccessed: Date.now(),
                accessCount: 0,
                version: 1,
                status: 'active'
            };

            // Store context
            this.contexts.set(contextId, context);
            this.contextAccess.set(contextId, new Map());

            // Initialize history
            this.contextHistory.set(contextId, [{
                action: 'created',
                timestamp: Date.now(),
                agent: sourceAgent,
                version: 1
            }]);

            // Notify target agents
            if (targetAgents.length > 0) {
                await this.notifyAgents(contextId, 'context_created', targetAgents);
            }

            // Audit log
            this.auditLogger.log('mcp_context_created', {
                contextId,
                contextType,
                sourceAgent,
                targetAgents,
                dataSize,
                timestamp: Date.now()
            });

            console.log(`🤝 Context created: ${contextId} (${contextType})`);
            return contextId;

        } catch (error) {
            this.auditLogger.log('mcp_context_error', {
                action: 'create_context',
                error: error.message,
                sourceAgent,
                timestamp: Date.now()
            });
            throw error;
        }
    }

    async shareContext(contextId, targetAgents, options = {}) {
        const context = this.contexts.get(contextId);
        if (!context) {
            throw new Error(`Context not found: ${contextId}`);
        }

        const {
            accessLevel = 'read',
            notification = true
        } = options;

        // Add new target agents
        const newTargets = targetAgents.filter(agent => !context.targetAgents.includes(agent));
        context.targetAgents.push(...newTargets);

        // Set access levels
        const contextAccess = this.contextAccess.get(contextId);
        newTargets.forEach(agent => {
            contextAccess.set(agent, {
                accessLevel,
                grantedAt: Date.now(),
                lastAccess: null
            });
        });

        // Record history
        this.addContextHistory(contextId, 'shared', null, {
            newTargets,
            accessLevel
        });

        // Notify new agents
        if (notification && newTargets.length > 0) {
            await this.notifyAgents(contextId, 'context_shared', newTargets);
        }

        // Audit log
        this.auditLogger.log('mcp_context_shared', {
            contextId,
            newTargets,
            accessLevel,
            timestamp: Date.now()
        });

        return true;
    }

    async updateContext(contextId, newData, sourceAgent) {
        const context = this.contexts.get(contextId);
        if (!context) {
            throw new Error(`Context not found: ${contextId}`);
        }

        // Check if agent has write access
        if (context.sourceAgent !== sourceAgent && 
            !this.hasWriteAccess(contextId, sourceAgent)) {
            throw new Error('Insufficient permissions to update context');
        }

        // Validate new data
        this.validateContextData(newData, context.type);

        // Update context
        const previousVersion = context.version;
        context.data = { ...context.data, ...newData };
        context.version += 1;
        context.lastAccessed = Date.now();

        // Record history
        this.addContextHistory(contextId, 'updated', sourceAgent, {
            previousVersion,
            newVersion: context.version,
            changedFields: Object.keys(newData)
        });

        // Notify target agents
        await this.notifyAgents(contextId, 'context_updated', context.targetAgents);

        // Audit log
        this.auditLogger.log('mcp_context_updated', {
            contextId,
            sourceAgent,
            version: context.version,
            timestamp: Date.now()
        });

        return context.version;
    }

    // CONTEXT ACCESS
    // ==============

    async getContext(contextId, requestingAgent) {
        const context = this.contexts.get(contextId);
        if (!context) {
            throw new Error(`Context not found: ${contextId}`);
        }

        // Check access permissions
        if (!this.hasReadAccess(contextId, requestingAgent)) {
            throw new Error('Insufficient permissions to access context');
        }

        // Check expiration
        if (Date.now() > context.expiresAt) {
            throw new Error('Context has expired');
        }

        // Update access tracking
        context.accessCount += 1;
        context.lastAccessed = Date.now();

        const contextAccess = this.contextAccess.get(contextId);
        const agentAccess = contextAccess.get(requestingAgent);
        if (agentAccess) {
            agentAccess.lastAccess = Date.now();
        }

        // Record history
        this.addContextHistory(contextId, 'accessed', requestingAgent);

        return {
            id: context.id,
            type: context.type,
            data: context.data,
            sourceAgent: context.sourceAgent,
            createdAt: context.createdAt,
            version: context.version,
            lastAccessed: context.lastAccessed
        };
    }

    async deleteContext(contextId, requestingAgent) {
        const context = this.contexts.get(contextId);
        if (!context) {
            throw new Error(`Context not found: ${contextId}`);
        }

        // Only source agent or admin can delete context
        if (context.sourceAgent !== requestingAgent) {
            throw new Error('Only context creator can delete context');
        }

        // Notify target agents
        await this.notifyAgents(contextId, 'context_deleted', context.targetAgents);

        // Clean up
        this.contexts.delete(contextId);
        this.contextAccess.delete(contextId);
        this.contextHistory.delete(contextId);

        // Audit log
        this.auditLogger.log('mcp_context_deleted', {
            contextId,
            requestingAgent,
            timestamp: Date.now()
        });

        return true;
    }

    // AGENT SUBSCRIPTIONS
    // ===================

    subscribeToContextType(agentId, contextType, callback) {
        if (!this.agentSubscriptions.has(agentId)) {
            this.agentSubscriptions.set(agentId, new Map());
        }

        this.agentSubscriptions.get(agentId).set(contextType, callback);
        console.log(`🔔 Agent ${agentId} subscribed to context type: ${contextType}`);
    }

    unsubscribeFromContextType(agentId, contextType) {
        const agentSubs = this.agentSubscriptions.get(agentId);
        if (agentSubs) {
            agentSubs.delete(contextType);
            if (agentSubs.size === 0) {
                this.agentSubscriptions.delete(agentId);
            }
        }
    }

    async notifyAgents(contextId, eventType, targetAgents) {
        const context = this.contexts.get(contextId);
        if (!context) return;

        const notification = {
            contextId,
            eventType,
            contextType: context.type,
            sourceAgent: context.sourceAgent,
            timestamp: Date.now()
        };

        for (const agentId of targetAgents) {
            // Direct notification
            this.eventBus.emit(`agent/${agentId}/context_notification`, notification);

            // Type-based subscription notification
            const agentSubs = this.agentSubscriptions.get(agentId);
            if (agentSubs && agentSubs.has(context.type)) {
                const callback = agentSubs.get(context.type);
                try {
                    await callback(notification);
                } catch (error) {
                    console.error(`Error in context callback for agent ${agentId}:`, error);
                }
            }
        }
    }

    // PERMISSION CHECKS
    // =================

    hasReadAccess(contextId, agentId) {
        const context = this.contexts.get(contextId);
        if (!context) return false;

        // Source agent always has access
        if (context.sourceAgent === agentId) return true;

        // Check if agent is in target list
        if (context.targetAgents.includes(agentId)) return true;

        // Check context type permissions
        const contextType = this.contextTypes[context.type];
        if (contextType && contextType.allowedAgents.includes(agentId)) return true;

        return false;
    }

    hasWriteAccess(contextId, agentId) {
        const context = this.contexts.get(contextId);
        if (!context) return false;

        // Only source agent has write access by default
        if (context.sourceAgent === agentId) return true;

        // Check specific access level grants
        const contextAccess = this.contextAccess.get(contextId);
        const agentAccess = contextAccess?.get(agentId);
        
        return agentAccess && agentAccess.accessLevel === 'read_write';
    }

    // VALIDATION
    // ==========

    validateContextData(data, contextType) {
        if (!contextType || !this.contextTypes[contextType]) {
            throw new Error(`Unknown context type: ${contextType}`);
        }

        const typeDefinition = this.contextTypes[contextType];
        
        // Check required fields
        for (const field of typeDefinition.requiredFields) {
            if (!(field in data)) {
                throw new Error(`Missing required field: ${field}`);
            }
        }

        // Additional schema validation could be added here
        return true;
    }

    // UTILITY METHODS
    // ===============

    addContextHistory(contextId, action, agentId, metadata = {}) {
        const history = this.contextHistory.get(contextId);
        if (history) {
            history.push({
                action,
                agent: agentId,
                timestamp: Date.now(),
                metadata
            });

            // Keep only last 100 entries
            if (history.length > 100) {
                history.shift();
            }
        }
    }

    cleanupExpiredContexts() {
        const now = Date.now();
        let cleanedCount = 0;

        for (const [contextId, context] of this.contexts) {
            if (now > context.expiresAt) {
                this.contexts.delete(contextId);
                this.contextAccess.delete(contextId);
                this.contextHistory.delete(contextId);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            console.log(`🧹 Cleaned up ${cleanedCount} expired contexts`);
        }
    }

    handleContextRequest(data) {
        const { contextId, requestingAgent } = data;
        // Handle context request events
    }

    handleContextUpdate(data) {
        const { contextId, newData, sourceAgent } = data;
        this.updateContext(contextId, newData, sourceAgent);
    }

    handleContextSubscription(data) {
        const { agentId, contextType } = data;
        // Handle subscription events
    }

    handleAgentShutdown(data) {
        const { agentId } = data;
        // Clean up agent subscriptions
        this.agentSubscriptions.delete(agentId);
    }

    // QUERY & STATISTICS METHODS
    // ===========================

    listContexts(agentId) {
        const contexts = [];

        for (const [contextId, context] of this.contexts) {
            if (this.hasReadAccess(contextId, agentId)) {
                contexts.push({
                    id: context.id,
                    type: context.type,
                    sourceAgent: context.sourceAgent,
                    createdAt: context.createdAt,
                    expiresAt: context.expiresAt,
                    version: context.version,
                    accessCount: context.accessCount,
                    status: context.status
                });
            }
        }

        return contexts;
    }

    getContextStats() {
        const stats = {
            totalContexts: this.contexts.size,
            activeContexts: 0,
            expiredContexts: 0,
            contextsByType: {},
            averageAccessCount: 0,
            totalAccesses: 0
        };

        const now = Date.now();
        let totalAccesses = 0;

        for (const context of this.contexts.values()) {
            if (now <= context.expiresAt) {
                stats.activeContexts++;
            } else {
                stats.expiredContexts++;
            }

            // Count by type
            const type = context.type || 'unknown';
            stats.contextsByType[type] = (stats.contextsByType[type] || 0) + 1;

            totalAccesses += context.accessCount;
        }

        stats.totalAccesses = totalAccesses;
        stats.averageAccessCount = stats.totalContexts > 0 
            ? totalAccesses / stats.totalContexts 
            : 0;

        return stats;
    }

    getContextHistory(contextId) {
        return this.contextHistory.get(contextId) || [];
    }

    getAgentContexts(agentId) {
        const contexts = [];

        for (const [contextId, context] of this.contexts) {
            if (context.sourceAgent === agentId || context.targetAgents.includes(agentId)) {
                contexts.push({
                    id: context.id,
                    type: context.type,
                    role: context.sourceAgent === agentId ? 'owner' : 'participant',
                    createdAt: context.createdAt,
                    lastAccessed: context.lastAccessed
                });
            }
        }

        return contexts;
    }
}