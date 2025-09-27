// MCP SERVER - MAIN IMPLEMENTATION
// =================================
// Model Context Protocol Server for Pharmaceutical System
// File: src/mcp/MCPServer.js

import { EventEmitter } from 'events';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Import MCP components
import { MCPToolRegistry } from './MCPToolRegistry.js';
import { MCPResourceManager } from './MCPResourceManager.js';
import { MCPContextManager } from './MCPContextManager.js';

export class PharmaMCPServer extends EventEmitter {
    constructor({ eventBus, dataManager, auditLogger, agentManager }) {
        super();
        
        // Core dependencies
        this.eventBus = eventBus;
        this.dataManager = dataManager;
        this.auditLogger = auditLogger;
        this.agentManager = agentManager;
        
        // MCP Server Instance
        this.server = new Server(
            {
                name: 'pharmaceutical-agent-system',
                version: '1.0.0',
                description: 'MCP Server for Pharmaceutical Manufacturing Agents'
            },
            {
                capabilities: {
                    resources: {},
                    tools: {},
                    prompts: {}
                }
            }
        );

        // MCP Components
        this.toolRegistry = new MCPToolRegistry({ 
            auditLogger: this.auditLogger, 
            eventBus: this.eventBus 
        });
        
        this.resourceManager = new MCPResourceManager({ 
            dataManager: this.dataManager,
            auditLogger: this.auditLogger, 
            eventBus: this.eventBus 
        });
        
        this.contextManager = new MCPContextManager({ 
            eventBus: this.eventBus, 
            auditLogger: this.auditLogger 
        });

        // Server state
        this.isRunning = false;
        this.startTime = null;
        this.requestCount = 0;
        this.errorCount = 0;
        
        this.initializeMCPServer();
    }

    async initializeMCPServer() {
        console.log('🔗 Initializing MCP Server...');
        
        try {
            // Setup MCP Handlers
            this.setupResourceHandlers();
            this.setupToolHandlers();
            this.setupPromptHandlers();
            
            // Setup tool execution integration
            this.setupToolExecutionIntegration();
            
            // Setup agent communication
            this.setupAgentCommunication();
            
            // Setup error handling
            this.setupErrorHandling();
            
            console.log('✅ MCP Server initialized successfully');
            
        } catch (error) {
            console.error('❌ Failed to initialize MCP Server:', error);
            throw error;
        }
    }

    // MCP RESOURCE HANDLERS
    // =====================
    
    setupResourceHandlers() {
        // List available resources
        this.server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
            try {
                this.requestCount++;
                
                // Get user role from request context (simplified)
                const userRole = this.extractUserRole(request);
                
                const resources = this.resourceManager.listResources(userRole);
                
                return { resources };
                
            } catch (error) {
                this.errorCount++;
                throw new McpError(
                    ErrorCode.InternalError,
                    `Failed to list resources: ${error.message}`
                );
            }
        });

        // Read specific resources
        this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
            try {
                this.requestCount++;
                
                const { uri } = request.params;
                const userRole = this.extractUserRole(request);
                const userId = this.extractUserId(request);
                
                const resourceData = await this.resourceManager.getResource(uri, userRole, userId);
                
                return {
                    contents: [
                        {
                            uri,
                            mimeType: resourceData.mimeType || 'application/json',
                            text: JSON.stringify(resourceData.data, null, 2)
                        }
                    ]
                };
                
            } catch (error) {
                this.errorCount++;
                throw new McpError(
                    ErrorCode.InternalError,
                    `Failed to read resource ${request.params.uri}: ${error.message}`
                );
            }
        });
    }

    // MCP TOOL HANDLERS
    // =================
    
    setupToolHandlers() {
        // List available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async (request) => {
            try {
                this.requestCount++;
                
                const userRole = this.extractUserRole(request);
                const tools = this.toolRegistry.listTools(userRole);
                
                return { tools };
                
            } catch (error) {
                this.errorCount++;
                throw new McpError(
                    ErrorCode.InternalError,
                    `Failed to list tools: ${error.message}`
                );
            }
        });

        // Handle tool calls
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            try {
                this.requestCount++;
                
                const { name, arguments: args } = request.params;
                const userRole = this.extractUserRole(request);
                const userId = this.extractUserId(request);
                
                const result = await this.toolRegistry.executeTool(name, args, userRole, userId);
                
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result.result, null, 2)
                        }
                    ]
                };
                
            } catch (error) {
                this.errorCount++;
                throw new McpError(
                    ErrorCode.InternalError,
                    `Tool execution failed: ${error.message}`
                );
            }
        });
    }

    // TOOL EXECUTION INTEGRATION
    // ===========================
    
    setupToolExecutionIntegration() {
        // Override tool execution in registry to use our implementations
        this.toolRegistry.executeToolLogic = async (toolName, args) => {
            switch (toolName) {
                case 'execute_agent':
                    return await this.executeAgent(args.agentName, args.parameters || {});
                    
                case 'query_production_data':
                    return await this.queryProductionData(args.dataSource, args.filters);
                    
                case 'trigger_event':
                    return await this.triggerEvent(args.eventType, args.eventData);
                    
                case 'check_compliance':
                    return await this.checkCompliance(args.batchId, args.complianceType);
                    
                case 'generate_report':
                    return await this.generateReport(args.reportType, args.parameters);
                    
                case 'share_context':
                    return await this.shareContext(args.contextId, args.contextData, args.targetAgents);
                    
                case 'assess_quality':
                    return await this.assessQuality(args.batchId, args.testResults);
                    
                case 'manage_inventory':
                    return await this.manageInventory(args.action, args);
                    
                default:
                    throw new Error(`Unknown tool: ${toolName}`);
            }
        };
    }

    // PHARMACEUTICAL TOOL IMPLEMENTATIONS
    // ====================================
    
    async executeAgent(agentName, parameters = {}) {
        try {
            // Validate agent exists
            if (!this.agentManager.agents || !this.agentManager.agents[agentName]) {
                throw new Error(`Agent not found: ${agentName}`);
            }

            // Create execution context
            const context = {
                source: 'mcp',
                timestamp: Date.now(),
                parameters
            };

            // Execute agent through existing agent manager
            const result = await this.agentManager.executeAgent(agentName, context);
            
            // Emit execution event
            this.eventBus.emit('mcp/agent_executed', {
                agentName,
                parameters,
                timestamp: Date.now(),
                success: true
            });

            return {
                success: true,
                agentName,
                result,
                executionTime: Date.now() - context.timestamp,
                parameters
            };

        } catch (error) {
            this.eventBus.emit('mcp/agent_execution_failed', {
                agentName,
                parameters,
                error: error.message,
                timestamp: Date.now()
            });
            
            throw error;
        }
    }

    async queryProductionData(dataSource, filters = {}) {
        try {
            // Get data through data manager
            const data = await this.dataManager.getData(dataSource);
            
            if (!data) {
                throw new Error(`Data source not found: ${dataSource}`);
            }

            // Apply filters
            let filteredData = Array.isArray(data) ? data : [data];
            
            if (Object.keys(filters).length > 0) {
                filteredData = filteredData.filter(item => {
                    return Object.entries(filters).every(([key, value]) => {
                        if (item[key] === undefined) return false;
                        
                        // Handle different filter types
                        if (typeof value === 'string') {
                            return item[key].toString().toLowerCase().includes(value.toLowerCase());
                        }
                        
                        return item[key] === value;
                    });
                });
            }

            return {
                dataSource,
                filters,
                resultCount: filteredData.length,
                totalRecords: Array.isArray(data) ? data.length : 1,
                data: filteredData.slice(0, 100), // Limit results
                timestamp: Date.now()
            };

        } catch (error) {
            throw new Error(`Query failed: ${error.message}`);
        }
    }

    async triggerEvent(eventType, eventData = {}) {
        try {
            const eventId = `mcp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            const eventPayload = {
                ...eventData,
                source: 'mcp',
                eventId,
                timestamp: Date.now()
            };

            // Emit event through event bus
            this.eventBus.emit(eventType, eventPayload);

            // Log event
            this.auditLogger.log('mcp_event_triggered', {
                eventType,
                eventId,
                eventData: eventPayload,
                timestamp: Date.now()
            });

            return {
                success: true,
                eventType,
                eventId,
                timestamp: Date.now(),
                message: `Event ${eventType} triggered successfully`
            };

        } catch (error) {
            throw new Error(`Failed to trigger event: ${error.message}`);
        }
    }

    async checkCompliance(batchId, complianceType) {
        try {
            // Mock compliance check implementation
            const complianceRules = {
                'GMP': {
                    rules: ['temperature_monitoring', 'batch_documentation', 'clean_room_protocols'],
                    description: 'Good Manufacturing Practice'
                },
                'GDP': {
                    rules: ['cold_chain_maintenance', 'distribution_tracking', 'storage_conditions'],
                    description: 'Good Distribution Practice'
                },
                'CFR_21_Part_11': {
                    rules: ['electronic_signatures', 'audit_trails', 'data_integrity'],
                    description: 'FDA Electronic Records Regulation'
                }
            };

            const compliance = complianceRules[complianceType];
            if (!compliance) {
                throw new Error(`Unknown compliance type: ${complianceType}`);
            }

            // Simulate compliance checks
            const checks = compliance.rules.map(rule => ({
                rule,
                status: Math.random() > 0.1 ? 'passed' : 'failed', // 90% pass rate
                timestamp: Date.now(),
                details: `${rule} check completed`
            }));

            const passedChecks = checks.filter(c => c.status === 'passed').length;
            const overallStatus = passedChecks === checks.length ? 'compliant' : 
                                passedChecks >= checks.length * 0.8 ? 'requires_attention' : 'non_compliant';

            return {
                batchId: batchId || 'system-wide',
                complianceType,
                description: compliance.description,
                status: overallStatus,
                checks,
                overallScore: Math.round((passedChecks / checks.length) * 100),
                recommendations: overallStatus !== 'compliant' ? 
                    ['Review failed checks', 'Update procedures', 'Retrain personnel'] : [],
                checkDate: new Date().toISOString(),
                validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
            };

        } catch (error) {
            throw new Error(`Compliance check failed: ${error.message}`);
        }
    }

    async generateReport(reportType, parameters = {}) {
        try {
            const reportGenerators = {
                'batch_record': () => this.generateBatchRecord(parameters),
                'quality_summary': () => this.generateQualitySummary(parameters),
                'compliance_audit': () => this.generateComplianceAudit(parameters),
                'production_summary': () => this.generateProductionSummary(parameters),
                'deviation_report': () => this.generateDeviationReport(parameters)
            };

            const generator = reportGenerators[reportType];
            if (!generator) {
                throw new Error(`Unknown report type: ${reportType}`);
            }

            const report = await generator();
            
            // Generate report ID
            const reportId = `RPT-${Date.now()}-${reportType.toUpperCase()}`;
            
            return {
                reportId,
                reportType,
                parameters,
                generatedAt: new Date().toISOString(),
                format: parameters.format || 'json',
                report,
                downloadUrl: `/api/reports/${reportId}`, // Mock URL
                status: 'completed'
            };

        } catch (error) {
            throw new Error(`Report generation failed: ${error.message}`);
        }
    }

    async shareContext(contextId, contextData, targetAgents = []) {
        try {
            const result = await this.contextManager.createContext(contextData, {
                contextId,
                contextType: contextData.type || 'general',
                sourceAgent: 'mcp',
                targetAgents,
                ttl: 24 * 60 * 60 * 1000, // 24 hours
                accessLevel: 'read'
            });

            return {
                contextId: result,
                sharedWith: targetAgents,
                success: true,
                timestamp: Date.now(),
                message: `Context shared with ${targetAgents.length} agents`
            };

        } catch (error) {
            throw new Error(`Context sharing failed: ${error.message}`);
        }
    }

    async assessQuality(batchId, testResults = {}) {
        try {
            // Mock quality assessment
            const assessment = {
                batchId,
                assessmentDate: new Date().toISOString(),
                overallScore: Math.round(85 + Math.random() * 15), // 85-100
                testResults: {
                    physical: testResults.physical || { appearance: 'pass', hardness: 'pass' },
                    chemical: testResults.chemical || { assay: '99.2%', impurities: '<0.1%' },
                    microbiological: testResults.microbiological || { total_count: '<10 CFU/g' }
                },
                qualityGrade: 'A',
                recommendation: 'Release for distribution',
                assessor: 'MCP Quality System',
                nextReview: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
            };

            return assessment;

        } catch (error) {
            throw new Error(`Quality assessment failed: ${error.message}`);
        }
    }

    async manageInventory(action, args) {
        try {
            const inventoryActions = {
                'check_availability': () => this.checkMaterialAvailability(args),
                'reserve_materials': () => this.reserveMaterials(args),
                'update_stock': () => this.updateStock(args),
                'forecast_needs': () => this.forecastNeeds(args)
            };

            const actionHandler = inventoryActions[action];
            if (!actionHandler) {
                throw new Error(`Unknown inventory action: ${action}`);
            }

            const result = await actionHandler();
            
            return {
                action,
                success: true,
                result,
                timestamp: Date.now(),
                orderId: args.orderId
            };

        } catch (error) {
            throw new Error(`Inventory management failed: ${error.message}`);
        }
    }

    // REPORT GENERATORS
    // =================
    
    async generateBatchRecord(parameters) {
        return {
            batchId: parameters.batchId || 'BATCH-001',
            product: 'Pharmaceutical Product A',
            manufacturingDate: '2024-09-24',
            status: 'completed',
            yield: '94.2%',
            qualityGrade: 'A',
            compliance: 'GMP compliant',
            processSteps: [
                { step: 'Raw material dispensing', status: 'completed', timestamp: '2024-09-24T08:00:00Z' },
                { step: 'Mixing', status: 'completed', timestamp: '2024-09-24T09:30:00Z' },
                { step: 'Granulation', status: 'completed', timestamp: '2024-09-24T11:00:00Z' }
            ]
        };
    }

    async generateQualitySummary(parameters) {
        return {
            period: parameters.dateRange || 'Last 30 days',
            overallScore: 96,
            testsPassed: 147,
            testsTotal: 150,
            testsFailed: 3,
            batchesReleased: 25,
            batchesRejected: 1,
            trends: {
                quality_improving: true,
                average_score: 96.2,
                compliance_rate: 98.7
            },
            recommendations: ['Maintain current quality standards', 'Review failed test procedures']
        };
    }

    async generateComplianceAudit(parameters) {
        return {
            auditDate: new Date().toISOString(),
            auditScope: parameters.scope || 'facility',
            complianceFramework: parameters.complianceType || 'GMP',
            overallStatus: 'compliant',
            findings: [
                { category: 'documentation', status: 'compliant', score: 95 },
                { category: 'processes', status: 'compliant', score: 98 },
                { category: 'equipment', status: 'requires_attention', score: 87 }
            ],
            correctiveActions: [
                { finding: 'Equipment calibration overdue', action: 'Schedule immediate calibration', dueDate: '2024-10-01' }
            ]
        };
    }

    // PROMPT HANDLERS
    // ===============
    
    setupPromptHandlers() {
        // Implementation for prompt handling if needed
        console.log('📝 Prompt handlers setup complete');
    }

    // AGENT COMMUNICATION
    // ===================
    
    setupAgentCommunication() {
        // Listen for agent communication events
        this.eventBus.on('agent/mcp_request', async (data) => {
            try {
                const result = await this.handleInterAgentCommunication(data);
                this.eventBus.emit('agent/mcp_response', result);
            } catch (error) {
                this.eventBus.emit('agent/mcp_error', {
                    ...data,
                    error: error.message,
                    timestamp: Date.now()
                });
            }
        });
    }

    async handleInterAgentCommunication(data) {
        const { sourceAgent, targetAgent, requestType, parameters } = data;
        
        switch (requestType) {
            case 'request_data':
                return await this.handleAgentDataRequest(sourceAgent, targetAgent, parameters);
            case 'share_analysis':
                return await this.handleAgentAnalysisShare(sourceAgent, targetAgent, parameters);
            default:
                throw new Error(`Unknown request type: ${requestType}`);
        }
    }

    // ERROR HANDLING
    // ==============
    
    setupErrorHandling() {
        this.on('error', (error) => {
            console.error('🚨 MCP Server Error:', error);
            this.auditLogger.log('mcp_server_error', {
                error: error.message,
                stack: error.stack,
                timestamp: Date.now()
            });
        });
    }

    // UTILITY METHODS
    // ===============
    
    extractUserRole(request) {
        // In a real implementation, extract from authentication context
        return request.meta?.userRole || 'planner';
    }

    extractUserId(request) {
        // In a real implementation, extract from authentication context
        return request.meta?.userId || 'system';
    }

    checkMaterialAvailability(args) {
        // Mock implementation
        const materials = args.materialIds || [];
        return materials.map(id => ({
            materialId: id,
            available: Math.random() > 0.2, // 80% availability
            quantity: Math.floor(Math.random() * 1000),
            unit: 'kg'
        }));
    }

    reserveMaterials(args) {
        return {
            reservationId: `RES-${Date.now()}`,
            materials: args.materialIds || [],
            quantities: args.quantities || {},
            reservedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        };
    }

    // MCP SERVER API ENDPOINTS
    // ========================
    
    getAPIEndpoints() {
        return {
            // Server status and management
            'GET /api/mcp/status': () => this.getServerStatus(),
            'GET /api/mcp/resources': () => this.resourceManager.listResources(),
            'GET /api/mcp/tools': () => ({ tools: this.toolRegistry.listTools() }),
            'GET /api/mcp/contexts': () => this.contextManager.listContexts('system'),
            
            // Tool execution via REST API
            'POST /api/mcp/execute': (req) => this.executeToolViaAPI(req.body),
            
            // Statistics and monitoring
            'GET /api/mcp/stats': () => this.getServerStats(),
            'GET /api/mcp/tools/stats': () => this.toolRegistry.getGlobalStats(),
            'GET /api/mcp/resources/stats': () => this.resourceManager.getGlobalResourceStats(),
            'GET /api/mcp/contexts/stats': () => this.contextManager.getContextStats(),
            
            // Context management
            'POST /api/mcp/context/share': (req) => this.shareContextViaAPI(req.body)
        };
    }

    async executeToolViaAPI(body) {
        const { tool, arguments: args, userRole = 'planner', userId = 'api_user' } = body;
        
        try {
            const result = await this.toolRegistry.executeTool(tool, args, userRole, userId);
            return result;
        } catch (error) {
            throw new Error(`API tool execution failed: ${error.message}`);
        }
    }

    getServerStatus() {
        return {
            status: this.isRunning ? 'operational' : 'stopped',
            protocol: 'MCP/1.0',
            version: '1.0.0',
            capabilities: ['resources', 'tools', 'prompts'],
            uptime: this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0,
            requestCount: this.requestCount,
            errorCount: this.errorCount,
            errorRate: this.requestCount > 0 ? this.errorCount / this.requestCount : 0,
            components: {
                toolRegistry: this.toolRegistry ? 'operational' : 'offline',
                resourceManager: this.resourceManager ? 'operational' : 'offline',
                contextManager: this.contextManager ? 'operational' : 'offline'
            }
        };
    }

    getServerStats() {
        return {
            server: this.getServerStatus(),
            tools: this.toolRegistry.getGlobalStats(),
            resources: this.resourceManager.getGlobalResourceStats(),
            contexts: this.contextManager.getContextStats()
        };
    }

    // LIFECYCLE MANAGEMENT
    // ====================
    
    async start() {
        try {
            // Start MCP server with transport
            const transport = new StdioServerTransport();
            await this.server.connect(transport);
            
            this.isRunning = true;
            this.startTime = Date.now();
            
            console.log('🔗 MCP Server started successfully');
            console.log('📡 Protocol: Model Context Protocol v1.0');
            console.log(`🛠️ Available tools: ${this.toolRegistry.tools.size}`);
            console.log(`📄 Available resources: ${this.resourceManager.resources.size}`);
            
        } catch (error) {
            console.error('❌ Failed to start MCP Server:', error);
            throw error;
        }
    }

    async shutdown() {
        console.log('🛑 Shutting down MCP Server...');
        
        this.isRunning = false;
        
        // Clean up components
        if (this.contextManager) {
            this.contextManager.cleanupExpiredContexts();
        }
        
        if (this.resourceManager) {
            this.resourceManager.clearAllCache();
        }
        
        this.auditLogger.log('mcp_server_shutdown', {
            uptime: this.startTime ? Date.now() - this.startTime : 0,
            requestCount: this.requestCount,
            timestamp: Date.now()
        });
        
        console.log('✅ MCP Server shutdown complete');
    }
}

// INTEGRATION FUNCTION FOR MAIN SERVER
// =====================================

export async function integrateMCPServer(app, { eventBus, dataManager, auditLogger, agentManager }) {
    const mcpServer = new PharmaMCPServer({ 
        eventBus, 
        dataManager, 
        auditLogger, 
        agentManager 
    });
    
    // Register MCP API endpoints
    const mcpEndpoints = mcpServer.getAPIEndpoints();
    
    Object.entries(mcpEndpoints).forEach(([route, handler]) => {
        const [method, path] = route.split(' ');
        app[method.toLowerCase()](path, async (req, res) => {
            try {
                const result = await handler(req);
                res.json({ success: true, data: result });
            } catch (error) {
                console.error(`MCP API Error (${route}):`, error);
                res.status(500).json({ 
                    success: false, 
                    error: error.message 
                });
            }
        });
    });
    
    // Start MCP server
    await mcpServer.start();
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
        await mcpServer.shutdown();
        process.exit(0);
    });
    
    return mcpServer;
}

/* USAGE EXAMPLE:

// In your main server.js:
import { integrateMCPServer } from './src/mcp/MCPServer.js';

// After initializing other services...
const mcpServer = await integrateMCPServer(app, {
    eventBus,
    dataManager,
    auditLogger,
    agentManager
});

console.log('🔗 MCP Server integrated successfully');

*/