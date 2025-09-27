// MCP RESOURCE MANAGER
// ====================
// Manages pharmaceutical data resources for MCP protocol
// File: src/mcp/MCPResourceManager.js

import { v4 as uuidv4 } from 'uuid';

export class MCPResourceManager {
    constructor({ dataManager, auditLogger, eventBus }) {
        this.dataManager = dataManager;
        this.auditLogger = auditLogger;
        this.eventBus = eventBus;

        // Resource registry
        this.resources = new Map();
        this.resourceStats = new Map();

        // Cache management
        this.resourceCache = new Map();
        this.cacheExpiry = new Map();
        this.defaultCacheTTL = 5 * 60 * 1000; // 5 minutes

        this.initializeResources();
    }

    initializeResources() {
        console.log('📄 Initializing MCP Resource Manager...');

        this.registerPharmaceuticalResources();
        this.setupResourcePermissions();
        this.setupCachePolicy();
        this.setupResourceMonitoring();

        console.log(`✅ Resource Manager initialized with ${this.resources.size} resources`);
    }

    // ========================================================================
    // RESOURCE REGISTRATION
    // ========================================================================
    registerPharmaceuticalResources() {
        // Orders
        this.registerResource({
            uri: 'pharma://orders',
            name: 'Production Orders',
            description: 'Current pharmaceutical production orders and scheduling',
            mimeType: 'application/json',
            dataSource: 'orders',
            category: 'production',
            permissions: ['planner', 'builder', 'admin'],
            cacheTTL: 2 * 60 * 1000
        });

        // Batches
        this.registerResource({
            uri: 'pharma://batches',
            name: 'Batch Records',
            description: 'Manufacturing batch information and process data',
            mimeType: 'application/json',
            dataSource: 'batches',
            category: 'manufacturing',
            permissions: ['planner', 'admin'],
            cacheTTL: 10 * 60 * 1000
        });

        // Compliance
        this.registerResource({
            uri: 'pharma://compliance',
            name: 'Compliance Data',
            description: 'GMP/GDP compliance information and audit trails',
            mimeType: 'application/json',
            dataSource: 'compliance',
            category: 'regulatory',
            permissions: ['admin'],
            cacheTTL: 15 * 60 * 1000,
            sensitiveData: true
        });

        // QA
        this.registerResource({
            uri: 'pharma://qa',
            name: 'Quality Assurance',
            description: 'QA test results, specifications, and quality metrics',
            mimeType: 'application/json',
            dataSource: 'qa',
            category: 'quality',
            permissions: ['planner', 'admin'],
            cacheTTL: 5 * 60 * 1000
        });

        // Issues
        this.registerResource({
            uri: 'pharma://issues',
            name: 'Production Issues',
            description: 'Current production problems, deviations, and incident reports',
            mimeType: 'application/json',
            dataSource: 'issues',
            category: 'operations',
            permissions: ['planner', 'admin'],
            cacheTTL: 60 * 1000
        });

        // Inventory
        this.registerResource({
            uri: 'pharma://inventory',
            name: 'Raw Materials Inventory',
            description: 'Current inventory levels, availability, and material information',
            mimeType: 'application/json',
            dataSource: 'inventory',
            category: 'supply_chain',
            permissions: ['planner', 'builder', 'admin'],
            cacheTTL: 5 * 60 * 1000
        });

        // BOM
        this.registerResource({
            uri: 'pharma://bom',
            name: 'Bill of Materials',
            description: 'Recipe and material requirements for pharmaceutical products',
            mimeType: 'application/json',
            dataSource: 'bom',
            category: 'manufacturing',
            permissions: ['planner', 'builder', 'admin'],
            cacheTTL: 30 * 60 * 1000
        });

        // Process params (virtual)
        this.registerResource({
            uri: 'pharma://process-params',
            name: 'Process Parameters',
            description: 'Real-time process parameters and control data',
            mimeType: 'application/json',
            dataSource: 'virtual',
            category: 'process_control',
            permissions: ['admin'],
            cacheTTL: 30 * 1000,
            isVirtual: true
        });

        // Audit trail (virtual)
        this.registerResource({
            uri: 'pharma://audit-trail',
            name: 'System Audit Trail',
            description: 'Complete audit trail of system actions and changes',
            mimeType: 'application/json',
            dataSource: 'audit',
            category: 'compliance',
            permissions: ['admin'],
            cacheTTL: 0,
            sensitiveData: true,
            isVirtual: true
        });

        // 🆕 OEE
        this.registerResource({
            uri: 'pharma://oee',
            name: 'OEE Metrics',
            description: 'Real-time Overall Equipment Effectiveness data from production lines',
            mimeType: 'application/json',
            dataSource: 'oee',
            category: 'process_control',
            permissions: ['planner', 'admin'],
            cacheTTL: 5 * 1000
        });
    }

    registerResource(resourceDefinition) {
        const resource = {
            ...resourceDefinition,
            id: uuidv4(),
            registeredAt: Date.now(),
            accessCount: 0,
            lastAccessed: null,
            averageResponseTime: 0
        };

        this.resources.set(resource.uri, resource);
        this.resourceStats.set(resource.uri, {
            totalAccesses: 0,
            cacheHits: 0,
            cacheMisses: 0,
            errorCount: 0,
            averageResponseTime: 0
        });

        console.log(`📄 Registered resource: ${resource.name} (${resource.uri})`);
    }

    // ========================================================================
    // PERMISSIONS & CACHE
    // ========================================================================
    setupResourcePermissions() {
        this.rolePermissions = {
            'planner': [
                'pharma://orders',
                'pharma://batches',
                'pharma://qa',
                'pharma://issues',
                'pharma://inventory',
                'pharma://bom',
                'pharma://oee'
            ],
            'builder': [
                'pharma://orders',
                'pharma://inventory',
                'pharma://bom'
            ],
            'admin': ['*']
        };
    }

    setupCachePolicy() {
        this.cachePolicies = {
            'production': { ttl: 2 * 60 * 1000, maxSize: 100 },
            'manufacturing': { ttl: 10 * 60 * 1000, maxSize: 50 },
            'regulatory': { ttl: 15 * 60 * 1000, maxSize: 20 },
            'quality': { ttl: 5 * 60 * 1000, maxSize: 100 },
            'operations': { ttl: 1 * 60 * 1000, maxSize: 200 },
            'supply_chain': { ttl: 5 * 60 * 1000, maxSize: 100 },
            'process_control': { ttl: 30 * 1000, maxSize: 50 },
            'compliance': { ttl: 0, maxSize: 0 }
        };
    }

    setupResourceMonitoring() {
        this.eventBus.on('resource/accessed', (data) => {
            this.updateResourceStats(data.uri, data.responseTime, data.fromCache);
        });

        setInterval(() => this.cleanupExpiredCache(), 60 * 1000);
    }

    // ========================================================================
    // RESOURCE ACCESS
    // ========================================================================
    async getResource(uri, userRole = 'planner', userId = 'system') {
        const startTime = Date.now();
        try {
            const resource = this.resources.get(uri);
            if (!resource) throw new Error(`Resource not found: ${uri}`);
            if (!this.checkResourcePermission(uri, userRole)) {
                throw new Error(`Permission denied for resource: ${uri}`);
            }

            const cachedData = this.getCachedResource(uri);
            if (cachedData) {
                const responseTime = Date.now() - startTime;
                this.recordResourceAccess(uri, responseTime, true, userId);
                return cachedData;
            }

            const resourceData = await this.loadResourceData(resource);

            if (resource.cacheTTL > 0) {
                this.cacheResource(uri, resourceData, resource.cacheTTL);
            }

            const responseTime = Date.now() - startTime;
            this.recordResourceAccess(uri, responseTime, false, userId);

            if (resource.sensitiveData) {
                this.auditLogger.log('mcp_resource_access', {
                    uri, userId, userRole, timestamp: Date.now(), responseTime
                });
            }

            return resourceData;
        } catch (error) {
            const responseTime = Date.now() - startTime;
            this.recordResourceError(uri, error.message, responseTime, userId);
            throw error;
        }
    }

    async loadResourceData(resource) {
        if (resource.isVirtual) {
            return await this.generateVirtualResourceData(resource);
        }

        const data = await this.dataManager.getData(resource.dataSource);
        if (!data) throw new Error(`Data source not found: ${resource.dataSource}`);

        return {
            uri: resource.uri,
            name: resource.name,
            description: resource.description,
            mimeType: resource.mimeType,
            data: data,
            metadata: {
                lastUpdated: Date.now(),
                recordCount: Array.isArray(data) ? data.length : 1,
                dataSource: resource.dataSource
            }
        };
    }

    async generateVirtualResourceData(resource) {
        switch (resource.uri) {
            case 'pharma://process-params':
                return this.generateProcessParameters();
            case 'pharma://audit-trail':
                return this.generateAuditTrail();
            default:
                throw new Error(`Unknown virtual resource: ${resource.uri}`);
        }
    }

    generateProcessParameters() {
        return {
            uri: 'pharma://process-params',
            name: 'Process Parameters',
            data: {
                reactors: [{
                    id: 'REACTOR-001',
                    temperature: 65.2 + (Math.random() - 0.5) * 2,
                    pressure: 1.0 + (Math.random() - 0.5) * 0.1,
                    ph: 7.0 + (Math.random() - 0.5) * 0.3,
                    agitationSpeed: 250 + (Math.random() - 0.5) * 20,
                    timestamp: Date.now()
                }],
                alarms: [],
                status: 'normal'
            },
            metadata: {
                lastUpdated: Date.now(),
                dataType: 'real-time',
                updateFrequency: '30s'
            }
        };
    }

    async generateAuditTrail() {
        const auditData = await this.auditLogger.getRecentLogs(100);
        return {
            uri: 'pharma://audit-trail',
            name: 'System Audit Trail',
            data: auditData,
            metadata: {
                lastUpdated: Date.now(),
                recordCount: auditData.length,
                dataType: 'audit'
            }
        };
    }

    // ========================================================================
    // CACHE MANAGEMENT
    // ========================================================================
    getCachedResource(uri) {
        const cached = this.resourceCache.get(uri);
        const expiry = this.cacheExpiry.get(uri);
        if (!cached || !expiry || Date.now() > expiry) return null;
        return cached;
    }

    cacheResource(uri, data, ttl) {
        this.resourceCache.set(uri, data);
        this.cacheExpiry.set(uri, Date.now() + ttl);
    }

    cleanupExpiredCache() {
        const now = Date.now();
        for (const [uri, expiry] of this.cacheExpiry) {
            if (now > expiry) {
                this.resourceCache.delete(uri);
                this.cacheExpiry.delete(uri);
            }
        }
    }

    invalidateCache(uri) {
        this.resourceCache.delete(uri);
        this.cacheExpiry.delete(uri);
    }

    clearAllCache() {
        this.resourceCache.clear();
        this.cacheExpiry.clear();
    }

    // ========================================================================
    // PERMISSION CHECKS
    // ========================================================================
    checkResourcePermission(uri, userRole) {
        if (userRole === 'admin') return true;
        const rolePerms = this.rolePermissions[userRole] || [];
        return rolePerms.includes(uri) || rolePerms.includes('*');
    }

    // ========================================================================
    // MONITORING
    // ========================================================================
    recordResourceAccess(uri, responseTime, fromCache, userId) {
        const stats = this.resourceStats.get(uri);
        if (stats) {
            stats.totalAccesses++;
            if (fromCache) stats.cacheHits++;
            else stats.cacheMisses++;
            const count = stats.totalAccesses;
            stats.averageResponseTime =
                ((stats.averageResponseTime * (count - 1)) + responseTime) / count;
        }
        const resource = this.resources.get(uri);
        if (resource) {
            resource.accessCount++;
            resource.lastAccessed = Date.now();
        }
        this.eventBus.emit('resource/accessed', { uri, responseTime, fromCache, userId });
    }

    recordResourceError(uri, error, responseTime, userId) {
        const stats = this.resourceStats.get(uri);
        if (stats) stats.errorCount++;
        this.auditLogger.log('mcp_resource_error', {
            uri, error, responseTime, userId, timestamp: Date.now()
        });
    }

    updateResourceStats(uri, responseTime, fromCache) {
        const stats = this.resourceStats.get(uri);
        if (!stats) return;
        if (fromCache) stats.cacheHits++;
        else stats.cacheMisses++;
    }

    // ========================================================================
    // QUERY METHODS
    // ========================================================================
    listResources(userRole = 'planner') {
        const resources = [];
        for (const [uri, resource] of this.resources) {
            if (this.checkResourcePermission(uri, userRole)) {
                resources.push({
                    uri: resource.uri,
                    name: resource.name,
                    description: resource.description,
                    mimeType: resource.mimeType,
                    category: resource.category,
                    accessCount: resource.accessCount,
                    lastAccessed: resource.lastAccessed,
                    sensitiveData: resource.sensitiveData || false
                });
            }
        }
        return resources;
    }

    getResourceStats(uri) {
        const resource = this.resources.get(uri);
        const stats = this.resourceStats.get(uri);
        if (!resource || !stats) return null;
        return {
            uri: resource.uri,
            name: resource.name,
            totalAccesses: stats.totalAccesses,
            cacheHitRate: stats.totalAccesses > 0 ? stats.cacheHits / stats.totalAccesses : 0,
            errorRate: stats.totalAccesses > 0 ? stats.errorCount / stats.totalAccesses : 0,
            averageResponseTime: stats.averageResponseTime
        };
    }

    getGlobalResourceStats() {
        let totalAccesses = 0, totalCacheHits = 0, totalErrors = 0, avgResponseTime = 0;
        for (const stats of this.resourceStats.values()) {
            totalAccesses += stats.totalAccesses;
            totalCacheHits += stats.cacheHits;
            totalErrors += stats.errorCount;
            avgResponseTime += stats.averageResponseTime;
        }
        const resourceCount = this.resourceStats.size;
        return {
            totalResources: this.resources.size,
            totalAccesses,
            cacheHitRate: totalAccesses > 0 ? totalCacheHits / totalAccesses : 0,
            errorRate: totalAccesses > 0 ? totalErrors / totalAccesses : 0,
            averageResponseTime: resourceCount > 0 ? avgResponseTime / resourceCount : 0,
            cacheSize: this.resourceCache.size
        };
    }

    getResourcesByCategory() {
        const categories = {};
        for (const [uri, resource] of this.resources) {
            const category = resource.category || 'uncategorized';
            if (!categories[category]) categories[category] = [];
            categories[category].push({
                uri: resource.uri,
                name: resource.name,
                description: resource.description,
                accessCount: resource.accessCount
            });
        }
        return categories;
    }
}
