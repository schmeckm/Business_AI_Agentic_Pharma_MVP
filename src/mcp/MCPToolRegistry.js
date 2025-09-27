// MCP TOOL REGISTRY
// =================
// Manages all MCP tools for pharmaceutical system
// File: src/mcp/MCPToolRegistry.js

import { v4 as uuidv4 } from 'uuid';

export class MCPToolRegistry {
    constructor({ auditLogger, eventBus }) {
        this.auditLogger = auditLogger;
        this.eventBus = eventBus;
        
        // Tool storage
        this.tools = new Map();
        this.toolExecutions = new Map();
        this.toolPermissions = new Map();
        
        // Statistics
        this.executionStats = {
            totalExecutions: 0,
            successfulExecutions: 0,
            failedExecutions: 0,
            averageExecutionTime: 0
        };
        
        this.initializeTools();
    }

    initializeTools() {
        console.log('🛠️ Initializing MCP Tool Registry...');
        
        // Register all pharmaceutical tools
        this.registerPharmaTools();
        this.setupPermissions();
        this.setupToolValidation();
        
        console.log(`✅ Tool Registry initialized with ${this.tools.size} tools`);
    }

    registerPharmaTools() {
        // 1. Agent Execution Tool
        this.registerTool({
            name: 'execute_agent',
            description: 'Execute a specific pharmaceutical agent',
            category: 'agent_management',
            inputSchema: {
                type: 'object',
                properties: {
                    agentName: {
                        type: 'string',
                        description: 'Name of the agent to execute',
                        enum: ['orderAgent', 'briefingAgent', 'assessmentAgent', 'complianceAgent', 'statusAgent', 'helpAgent']
                    },
                    parameters: {
                        type: 'object',
                        description: 'Parameters to pass to the agent',
                        properties: {
                            batchId: { type: 'string' },
                            orderId: { type: 'string' },
                            priority: { type: 'string', enum: ['low', 'medium', 'high'] }
                        }
                    },
                    async: {
                        type: 'boolean',
                        description: 'Execute agent asynchronously',
                        default: false
                    }
                },
                required: ['agentName']
            },
            permissions: ['planner', 'builder', 'admin'],
            rateLimit: 30, // per minute
            auditRequired: true
        });

        // 2. Production Data Query Tool
        this.registerTool({
            name: 'query_production_data',
            description: 'Query pharmaceutical production data with filters',
            category: 'data_access',
            inputSchema: {
                type: 'object',
                properties: {
                    dataSource: {
                        type: 'string',
                        enum: ['orders', 'batches', 'compliance', 'qa', 'issues', 'inventory', 'bom'],
                        description: 'Data source to query'
                    },
                    filters: {
                        type: 'object',
                        description: 'Filters to apply',
                        properties: {
                            status: { type: 'string' },
                            priority: { type: 'string' },
                            dateFrom: { type: 'string', format: 'date-time' },
                            dateTo: { type: 'string', format: 'date-time' },
                            batchId: { type: 'string' },
                            productId: { type: 'string' }
                        }
                    },
                    limit: {
                        type: 'integer',
                        minimum: 1,
                        maximum: 1000,
                        default: 100
                    },
                    sortBy: {
                        type: 'string',
                        description: 'Field to sort by'
                    },
                    sortOrder: {
                        type: 'string',
                        enum: ['asc', 'desc'],
                        default: 'desc'
                    }
                },
                required: ['dataSource']
            },
            permissions: ['planner', 'builder', 'admin'],
            rateLimit: 60,
            auditRequired: false
        });

        // 3. Event Trigger Tool
        this.registerTool({
            name: 'trigger_event',
            description: 'Trigger system events for agent coordination',
            category: 'event_management',
            inputSchema: {
                type: 'object',
                properties: {
                    eventType: {
                        type: 'string',
                        description: 'Type of event to trigger',
                        pattern: '^[a-zA-Z0-9_/]+$'
                    },
                    eventData: {
                        type: 'object',
                        description: 'Data to send with the event'
                    },
                    targetAgents: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Specific agents to notify'
                    },
                    priority: {
                        type: 'string',
                        enum: ['low', 'medium', 'high', 'critical'],
                        default: 'medium'
                    }
                },
                required: ['eventType']
            },
            permissions: ['planner', 'admin'],
            rateLimit: 20,
            auditRequired: true
        });

        // 4. Compliance Check Tool
        this.registerTool({
            name: 'check_compliance',
            description: 'Perform GMP/GDP compliance checks',
            category: 'compliance',
            inputSchema: {
                type: 'object',
                properties: {
                    batchId: {
                        type: 'string',
                        description: 'Batch ID to check compliance for'
                    },
                    complianceType: {
                        type: 'string',
                        enum: ['GMP', 'GDP', 'CFR_21_Part_11', 'ICH_Q7'],
                        description: 'Type of compliance check'
                    },
                    checkLevel: {
                        type: 'string',
                        enum: ['basic', 'detailed', 'full_audit'],
                        default: 'basic'
                    },
                    includeRecommendations: {
                        type: 'boolean',
                        default: true
                    }
                },
                required: ['complianceType']
            },
            permissions: ['planner', 'admin'],
            rateLimit: 10,
            auditRequired: true
        });

        // 5. Report Generation Tool
        this.registerTool({
            name: 'generate_report',
            description: 'Generate pharmaceutical reports',
            category: 'reporting',
            inputSchema: {
                type: 'object',
                properties: {
                    reportType: {
                        type: 'string',
                        enum: ['batch_record', 'quality_summary', 'compliance_audit', 'production_summary', 'deviation_report'],
                        description: 'Type of report to generate'
                    },
                    parameters: {
                        type: 'object',
                        properties: {
                            batchId: { type: 'string' },
                            dateRange: {
                                type: 'object',
                                properties: {
                                    from: { type: 'string', format: 'date-time' },
                                    to: { type: 'string', format: 'date-time' }
                                }
                            },
                            includeCharts: { type: 'boolean', default: true },
                            format: { type: 'string', enum: ['pdf', 'excel', 'json'], default: 'pdf' }
                        }
                    }
                },
                required: ['reportType']
            },
            permissions: ['planner', 'admin'],
            rateLimit: 5,
            auditRequired: true
        });

        // 6. Context Sharing Tool
        this.registerTool({
            name: 'share_context',
            description: 'Share context data between agents',
            category: 'agent_communication',
            inputSchema: {
                type: 'object',
                properties: {
                    contextId: {
                        type: 'string',
                        description: 'Unique context identifier'
                    },
                    contextData: {
                        type: 'object',
                        description: 'Context data to share'
                    },
                    targetAgents: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'List of agents to share context with'
                    },
                    expirationTime: {
                        type: 'string',
                        format: 'date-time',
                        description: 'When context expires'
                    },
                    accessLevel: {
                        type: 'string',
                        enum: ['read', 'read_write'],
                        default: 'read'
                    }
                },
                required: ['contextId', 'contextData']
            },
            permissions: ['planner', 'builder', 'admin'],
            rateLimit: 30,
            auditRequired: true
        });

        // 7. Quality Assessment Tool  
        this.registerTool({
            name: 'assess_quality',
            description: 'Assess product quality parameters',
            category: 'quality_control',
            inputSchema: {
                type: 'object',
                properties: {
                    batchId: {
                        type: 'string',
                        description: 'Batch ID to assess'
                    },
                    testResults: {
                        type: 'object',
                        description: 'Test results data'
                    },
                    qualitySpecs: {
                        type: 'object',
                        description: 'Quality specifications to check against'
                    },
                    assessmentType: {
                        type: 'string',
                        enum: ['in_process', 'final_product', 'stability'],
                        default: 'final_product'
                    }
                },
                required: ['batchId']
            },
            permissions: ['planner', 'admin'],
            rateLimit: 20,
            auditRequired: true
        });

        // 8. Inventory Management Tool
        this.registerTool({
            name: 'manage_inventory',
            description: 'Manage raw material inventory',
            category: 'inventory_management',
            inputSchema: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        enum: ['check_availability', 'reserve_materials', 'update_stock', 'forecast_needs'],
                        description: 'Inventory action to perform'
                    },
                    materialIds: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Material IDs to work with'
                    },
                    quantities: {
                        type: 'object',
                        description: 'Quantities for materials'
                    },
                    orderId: {
                        type: 'string',
                        description: 'Associated order ID'
                    }
                },
                required: ['action']
            },
            permissions: ['planner', 'admin'],
            rateLimit: 40,
            auditRequired: true
        });
    }

    registerTool(toolDefinition) {
        const tool = {
            ...toolDefinition,
            id: uuidv4(),
            registeredAt: Date.now(),
            executionCount: 0,
            lastExecuted: null,
            averageExecutionTime: 0
        };

        this.tools.set(tool.name, tool);
        this.toolPermissions.set(tool.name, tool.permissions || []);

        console.log(`🔧 Registered tool: ${tool.name}`);
    }

    setupPermissions() {
        // Role-based tool access
        const rolePermissions = {
            'planner': [
                'execute_agent', 'query_production_data', 'trigger_event',
                'check_compliance', 'generate_report', 'share_context',
                'assess_quality', 'manage_inventory'
            ],
            'builder': [
                'execute_agent', 'query_production_data', 'share_context'
            ],
            'admin': [
                '*' // All tools
            ]
        };

        this.rolePermissions = rolePermissions;
    }

    setupToolValidation() {
        // Input validation patterns
        this.validators = {
            batchId: /^BATCH-[0-9]{3}$/,
            orderId: /^ORD-[0-9]{4}$/,
            agentName: /^[a-zA-Z][a-zA-Z0-9]*Agent$/,
            eventType: /^[a-zA-Z0-9_/]+$/
        };
    }

    // TOOL EXECUTION METHODS
    // ======================

    async executeTool(toolName, args, userRole = 'planner', userId = 'system') {
        const startTime = Date.now();
        const executionId = uuidv4();

        try {
            // 1. Validate tool exists
            const tool = this.tools.get(toolName);
            if (!tool) {
                throw new Error(`Tool not found: ${toolName}`);
            }

            // 2. Check permissions
            if (!this.checkPermission(toolName, userRole)) {
                throw new Error(`Permission denied for tool: ${toolName}`);
            }

            // 3. Rate limiting
            if (!this.checkRateLimit(toolName, userId)) {
                throw new Error(`Rate limit exceeded for tool: ${toolName}`);
            }

            // 4. Validate input
            this.validateToolInput(tool, args);

            // 5. Execute tool
            const result = await this.executeToolLogic(toolName, args);

            // 6. Record execution
            const executionTime = Date.now() - startTime;
            this.recordExecution(toolName, executionId, true, executionTime, userId);

            // 7. Audit logging
            if (tool.auditRequired) {
                this.auditLogger.log('mcp_tool_execution', {
                    toolName,
                    executionId,
                    userId,
                    userRole,
                    args,
                    result: result ? 'success' : 'failure',
                    executionTime,
                    timestamp: Date.now()
                });
            }

            return {
                success: true,
                executionId,
                result,
                executionTime
            };

        } catch (error) {
            const executionTime = Date.now() - startTime;
            this.recordExecution(toolName, executionId, false, executionTime, userId);

            this.auditLogger.log('mcp_tool_error', {
                toolName,
                executionId,
                userId,
                userRole,
                error: error.message,
                executionTime,
                timestamp: Date.now()
            });

            throw error;
        }
    }

    async executeToolLogic(toolName, args) {
        // This method should be overridden by the main MCP server
        // to provide actual tool implementations
        throw new Error(`Tool execution not implemented: ${toolName}`);
    }

    validateToolInput(tool, args) {
        // Basic input validation against schema
        if (!args || typeof args !== 'object') {
            throw new Error('Invalid arguments: must be an object');
        }

        // Check required fields
        if (tool.inputSchema && tool.inputSchema.required) {
            for (const field of tool.inputSchema.required) {
                if (!(field in args)) {
                    throw new Error(`Missing required field: ${field}`);
                }
            }
        }

        // Validate specific patterns
        for (const [field, value] of Object.entries(args)) {
            if (this.validators[field] && !this.validators[field].test(value)) {
                throw new Error(`Invalid format for field: ${field}`);
            }
        }
    }

    checkPermission(toolName, userRole) {
        const tool = this.tools.get(toolName);
        if (!tool) return false;

        // Admin can access all tools
        if (userRole === 'admin') return true;

        // Check role permissions
        const rolePerms = this.rolePermissions[userRole] || [];
        return rolePerms.includes(toolName) || rolePerms.includes('*');
    }

    checkRateLimit(toolName, userId) {
        // Simplified rate limiting - in production, use Redis or similar
        const now = Date.now();
        const windowSize = 60 * 1000; // 1 minute
        
        const key = `${toolName}:${userId}`;
        const executions = this.toolExecutions.get(key) || [];
        
        // Remove old executions
        const recent = executions.filter(time => now - time < windowSize);
        
        const tool = this.tools.get(toolName);
        const limit = tool ? tool.rateLimit : 10;
        
        if (recent.length >= limit) {
            return false;
        }

        // Record this execution
        recent.push(now);
        this.toolExecutions.set(key, recent);
        
        return true;
    }

    recordExecution(toolName, executionId, success, executionTime, userId) {
        // Update tool statistics
        const tool = this.tools.get(toolName);
        if (tool) {
            tool.executionCount++;
            tool.lastExecuted = Date.now();
            
            // Update average execution time
            const prevAvg = tool.averageExecutionTime || 0;
            const count = tool.executionCount;
            tool.averageExecutionTime = ((prevAvg * (count - 1)) + executionTime) / count;
        }

        // Update global statistics
        this.executionStats.totalExecutions++;
        if (success) {
            this.executionStats.successfulExecutions++;
        } else {
            this.executionStats.failedExecutions++;
        }

        // Update global average
        const totalAvg = this.executionStats.averageExecutionTime;
        const totalCount = this.executionStats.totalExecutions;
        this.executionStats.averageExecutionTime = 
            ((totalAvg * (totalCount - 1)) + executionTime) / totalCount;
    }

    // QUERY METHODS
    // =============

    listTools(userRole = 'planner') {
        const tools = [];
        
        for (const [name, tool] of this.tools) {
            if (this.checkPermission(name, userRole)) {
                tools.push({
                    name: tool.name,
                    description: tool.description,
                    category: tool.category,
                    inputSchema: tool.inputSchema,
                    executionCount: tool.executionCount,
                    averageExecutionTime: tool.averageExecutionTime,
                    lastExecuted: tool.lastExecuted
                });
            }
        }

        return tools;
    }

    getToolStats(toolName) {
        const tool = this.tools.get(toolName);
        if (!tool) return null;

        return {
            name: tool.name,
            executionCount: tool.executionCount,
            averageExecutionTime: tool.averageExecutionTime,
            lastExecuted: tool.lastExecuted,
            successRate: this.calculateSuccessRate(toolName)
        };
    }

    getGlobalStats() {
        return {
            ...this.executionStats,
            totalTools: this.tools.size,
            successRate: this.executionStats.totalExecutions > 0 
                ? this.executionStats.successfulExecutions / this.executionStats.totalExecutions 
                : 0
        };
    }

    calculateSuccessRate(toolName) {
        // This would require more detailed tracking in production
        return 0.95; // Mock success rate
    }

    getToolsByCategory() {
        const categories = {};
        
        for (const [name, tool] of this.tools) {
            const category = tool.category || 'uncategorized';
            if (!categories[category]) {
                categories[category] = [];
            }
            categories[category].push({
                name: tool.name,
                description: tool.description,
                executionCount: tool.executionCount
            });
        }

        return categories;
    }
}