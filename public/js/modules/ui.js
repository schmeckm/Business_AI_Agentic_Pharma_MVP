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
    historySize: 5,              // Number of response times to track
    fastThreshold: 1000,         // ms - considered "fast"
    mediumThreshold: 3000,       // ms - considered "medium"
    targetResponseTime: 1000     // ms - optimization target
  },

  // Event Monitoring
  events: {
    reconnectDelay: 5000,        // ms - reconnect delay on error
    heartbeatInterval: 15000     // ms - heartbeat ping interval
  },

  // Refresh Intervals
  intervals: {
    healthCheck: 30000,          // ms - health indicator update
    backgroundRefresh: 30000     // ms - background data refresh
  },

  // Agent Data Sources (for estimation)
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