/**
 * Application Configuration
 * Central location for all configuration constants
 */
const AppConfig = {
  // API Endpoints
  endpoints: {
    chat: '/api/chat',
    health: '/api/system/health',
    status: '/api/system/status',
    version: '/api/version',
    templates: '/templates',
    events: '/events',
    agents: '/api/agents',
    agentsSave: '/api/agents/save',
    queriesSave: '/api/queries/save'
  },

  // Performance Settings
  performance: {
    historySize: 5,
    fastThreshold: 1000,
    mediumThreshold: 3000,
    targetResponseTime: 1000
  },

  // Event Monitoring
  events: {
    reconnectDelay: 5000,
    heartbeatInterval: 15000
  },

  // Refresh Intervals
  intervals: {
    healthCheck: 30000,
    backgroundRefresh: 30000
  },

  // Agent Data Sources
  agentDataSources: {
    'oeeAgent': '3 files + MQTT (real-time)',
    'plannerAgent': '3-5 files (optimized)',
    'qaAgent': '3-5 files (compliance)',
    'orderAgent': '3-7 files (optimized)',
    'briefingAgent': '7 files (cached)',
    'assessmentAgent': '3-5 files (optimized)',
    'complianceAgent': '3-5 files (optimized)',
    'statusAgent': '7 files (real-time)',
    'helpAgent': '0 files (no data)',
    'default': '7 files (legacy)'
  },

  // Event Icons
  eventIcons: {
    received: '📥',
    published: '📤',
    'agent-action': '🤖',
    'agent_event': '🔄',
    'auto_triggered_agent': '⚡',
    audit: '📝',
    chat: '💬',
    tool: '🔧',
    error: '⚠️',
    connection: '🔌',
    success: '✅',
    failure: '❌',
    heartbeat: '❤️',
    default: 'ℹ️'
  }
};