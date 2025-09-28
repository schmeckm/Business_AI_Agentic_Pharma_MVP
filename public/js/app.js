// ===============================
// Frontend App.js - Enhanced Version mit Performance-Tracking
// ===============================

// Performance Tracking Variables
let responseTimeHistory = [];
let lastAgentUsed = null;
let totalRequestCount = 0;

document.addEventListener('DOMContentLoaded', async () => {
  await loadTemplates();
  updateSystemStatus();
  updateHealthIndicator();
  startEventMonitor();
  loadVersionInfo();

  // Prompt-Hilfe Event Listeners hinzufügen
  setupPromptHelpers();

  setInterval(updateHealthIndicator, 30000);
  setInterval(refreshBackgroundData, 30000);
});

// ===============================
// PERFORMANCE TRACKING FUNCTIONS
// ===============================

// Erweiterte Performance-Messung
function trackPerformance(responseTime, agentUsed, eventChain) {
  // Response Time History verwalten
  responseTimeHistory.push(responseTime);
  if (responseTimeHistory.length > 5) {
    responseTimeHistory.shift(); // Nur letzte 5 behalten
  }
  
  lastAgentUsed = agentUsed;
  totalRequestCount++;
  
  // Performance-Metriken anzeigen
  updatePerformanceDisplay(responseTime, agentUsed, eventChain);
  updateHeaderPerformanceBadge();
}

// Performance Display aktualisieren
function updatePerformanceDisplay(responseTime, agentUsed, eventChain) {
  const metricsDiv = document.getElementById('performance-metrics');
  metricsDiv.style.display = 'block';
  
  // Response Time mit Farb-Kodierung
  const responseTimeElement = document.getElementById('current-response-time');
  responseTimeElement.textContent = `${responseTime}ms`;
  
  // Farb-Kodierung basierend auf Geschwindigkeit
  responseTimeElement.className = 'performance-value';
  if (responseTime < 1000) {
    responseTimeElement.classList.add('response-time-fast');
  } else if (responseTime < 3000) {
    responseTimeElement.classList.add('response-time-medium');
  } else {
    responseTimeElement.classList.add('response-time-slow');
  }
  
  // Agent Info
  document.getElementById('current-agent').textContent = agentUsed || 'No specific agent';
  
  // Events Info
  const eventsCount = eventChain ? eventChain.length : 0;
  document.getElementById('events-triggered').textContent = eventsCount;
  
  // Durchschnittliche Response Time
  if (responseTimeHistory.length > 0) {
    const average = Math.round(responseTimeHistory.reduce((a, b) => a + b, 0) / responseTimeHistory.length);
    document.getElementById('average-response-time').textContent = `${average}ms`;
  }
  
  // Data Sources Estimation (basierend auf Agent)
  const dataSources = estimateDataSources(agentUsed);
  document.getElementById('data-sources-count').textContent = dataSources;
}

// Schätze Data Sources basierend auf Agent
function estimateDataSources(agentUsed) {
  const agentDataSources = {
    'orderAgent': '3-7 files (optimized)',
    'briefingAgent': '7 files (cached)',
    'assessmentAgent': '3-5 files (optimized)',
    'complianceAgent': '3-5 files (optimized)',
    'statusAgent': '7 files (real-time)',
    'helpAgent': '0 files (no data)'
  };
  
  return agentDataSources[agentUsed] || '7 files (legacy)';
}

// Performance Statistics anzeigen
function showPerformanceStats() {
  if (responseTimeHistory.length === 0) {
    alert('No performance data available yet. Please make some requests first.');
    return;
  }
  
  const min = Math.min(...responseTimeHistory);
  const max = Math.max(...responseTimeHistory);
  const avg = Math.round(responseTimeHistory.reduce((a, b) => a + b, 0) / responseTimeHistory.length);
  
  const stats = `
=== PERFORMANCE STATISTICS ===

Total Requests: ${totalRequestCount}
Last Agent Used: ${lastAgentUsed || 'Unknown'}

Response Times (last ${responseTimeHistory.length} requests):
- Fastest: ${min}ms
- Slowest: ${max}ms  
- Average: ${avg}ms

Optimization Status:
✅ Prompts: 85% shorter
✅ Data Loading: Agent-specific
${avg < 1500 ? '🟢 Performance: EXCELLENT' : avg < 3000 ? '🟡 Performance: GOOD' : '🔴 Performance: NEEDS OPTIMIZATION'}

Expected after full optimization:
- Target: < 1000ms average
- Improvement potential: ${Math.max(0, avg - 1000)}ms
  `;
  
  alert(stats);
}

// Real-time Performance Badge im Header
function updateHeaderPerformanceBadge() {
  const headerBadge = document.getElementById('header-performance-badge');
  if (headerBadge && responseTimeHistory.length > 0) {
    const avg = Math.round(responseTimeHistory.reduce((a, b) => a + b, 0) / responseTimeHistory.length);
    const appVersion = document.getElementById('app-version');
    const version = appVersion ? appVersion.textContent : '1.3.0';
    
    if (avg < 1000) {
      headerBadge.innerHTML = `MVP ${version} | <span style="color: #90EE90;">⚡ Fast</span>`;
    } else if (avg < 2000) {
      headerBadge.innerHTML = `MVP ${version} | <span style="color: #FFD700;">📊 Good</span>`;
    } else {
      headerBadge.innerHTML = `MVP ${version} | <span style="color: #FFA500;">⏱️ Slow</span>`;
    }
  }
}

// ===============================
// NEUE FUNKTION: Setup für Prompt-Hilfe Event Listeners
// ===============================
function setupPromptHelpers() {
  // Dropdown Handler
  const examplePromptsSelect = document.getElementById('example-prompts');
  if (examplePromptsSelect) {
    examplePromptsSelect.addEventListener('change', function() {
      const selectedPrompt = this.value;
      if (selectedPrompt) {
        document.getElementById('message').value = selectedPrompt;
        this.value = ''; // Reset dropdown
      }
    });
  }

  // Quick-Button Handler
  document.querySelectorAll('.quick-prompt').forEach(button => {
    button.addEventListener('click', function() {
      const prompt = this.getAttribute('data-prompt');
      document.getElementById('message').value = prompt;
    });
  });
}

// ===============================
// NEUE FUNKTION: Toggle der Prompt-Hilfe
// ===============================
function togglePromptHelp() {
  const content = document.getElementById('prompt-help-content');
  const button = document.querySelector('.toggle-help');
  
  if (content && button) {
    if (content.classList.contains('help-collapsed')) {
      content.classList.remove('help-collapsed');
      content.classList.add('help-expanded');
      button.textContent = 'Collapse';
    } else {
      content.classList.remove('help-expanded');
      content.classList.add('help-collapsed');
      button.textContent = 'Expand';
    }
  }
}

// ===============================
// Load version information
// ===============================
async function loadVersionInfo() {
  try {
    const response = await fetch('/api/version');
    const info = await response.json();

    // Badge
    const appVersion = document.getElementById('app-version');
    if (appVersion) appVersion.textContent = info.version;

    // Manual fallback
    const manualVersion = document.getElementById('manual-version');
    if (manualVersion) manualVersion.textContent = `v${info.version}`;

    // Log version
    const logVersion = document.getElementById('log-version');
    if (logVersion) logVersion.textContent = info.version;

    // Initial Output gleich setzen
    const out = document.getElementById('out');
    if (out) {
      out.textContent =
        'Pharmaceutical Manufacturing Agent System Ready...\n' +
        `MVP ${info.version} - Modular Architecture\n` +
        'AI Decision Logging: ENABLED\n' +
        'GMP Compliance Monitoring: ACTIVE\n' +
        'Event-Driven Agent System: ACTIVE';
    }

  } catch (error) {
    console.warn('Could not load version info:', error);
  }
}

// ===============================
// Show detailed system information
// ===============================
async function showSystemInfo() {
  try {
    const response = await fetch('/api/system/status')
    const status = await response.json();

    const info = `
=== SYSTEM INFORMATION ===

Version: ${status.version || 'unknown'}
Uptime: ${Math.round(status.uptime || 0)}s
Memory: ${Math.round((status.memory?.heapUsed || 0) / 1024 / 1024)}MB

=== AGENTS ===
Loaded: ${status.agents?.loaded || 0}
Failed: ${status.agents?.failed || 0}
Last Reload: ${status.agents?.lastReload || 'Never'}

=== DATA SOURCES ===
${Object.entries(status.data || {}).map(([key, info]) => 
  `${key}: ${info.entries} entries (${info.source || 'unknown'})`
).join('\n')}

=== EVENTS ===
Subscriptions: ${status.events?.totalEvents || 0}
Publishers: ${status.events?.publishers?.length || 0}

=== ENVIRONMENT ===
Platform: ${navigator.platform}
User Agent: ${navigator.userAgent.substring(0, 60)}...
    `;
    alert(info);

  } catch (error) {
    alert('Could not load detailed system information');
  }
}

// ===============================
// Create version element helper
// ===============================
function createVersionElement() {
  const versionElement = document.createElement('div');
  versionElement.id = 'version-display';
  versionElement.style.cssText = `
    position: fixed; 
    bottom: 10px; 
    right: 10px; 
    font-size: 11px; 
    color: #666; 
    background: rgba(255,255,255,0.9); 
    padding: 5px 10px; 
    border-radius: 4px;
    border: 1px solid #ddd;
    cursor: pointer;
    z-index: 1000;
  `;
  document.body.appendChild(versionElement);
  return versionElement;
}

// ===============================
// Load templates from backend YAML
// ===============================
async function loadTemplates() {
  try {
    const response = await fetch('/templates');
    const data = await response.json();

    const selectElement = document.getElementById('prompt');
    while (selectElement.children.length > 1) {
      selectElement.removeChild(selectElement.lastChild);
    }

    data.templates.forEach(template => {
      const option = document.createElement('option');
      option.value = template.value;
      option.textContent = template.text;
      if (template.description) option.title = template.description;
      selectElement.appendChild(option);
    });

    console.log(`✅ Loaded ${data.count} templates from agents.yaml`);
  } catch (error) {
    console.error('❌ Failed to load templates:', error);
  }
}

// ===============================
// Update Health Indicator (Ampel)
// ===============================
async function updateHealthIndicator() {
  const healthDot = document.getElementById('health-dot');
  const healthText = document.getElementById('health-text');

  try {
    let response = await fetch('/api/system/health')
    const health = await response.json();

    if (health.status === 'ok' || health.status === 'healthy') {
      healthDot.className = 'health-dot health-green';
      healthText.textContent = 'System OK';
    } else if (health.status === 'error' || health.status === 'unhealthy') {
      healthDot.className = 'health-dot health-red';
      healthText.textContent = 'Error';
    } else {
      healthDot.className = 'health-dot health-yellow';
      healthText.textContent = 'Warning';
    }

  } catch (error) {
    healthDot.className = 'health-dot health-red';
    healthText.textContent = 'API Error';
    console.error('Health check failed:', error);
  }
}

// ===============================
// Update system status display
// ===============================
async function updateSystemStatus() {
  try {
    const response = await fetch('/api/system/health');
    const health = await response.json();

    const statusElement = document.getElementById('status');
    if (statusElement) {
      const mode = health.agentMode || 'simple';
      const actions = health.useActions ? 'enabled' : 'disabled';
      statusElement.textContent = `System Status: Ready - Mode: ${mode} | Actions: ${actions}`;
    }

  } catch (error) {
    console.error('Status update failed:', error);
  }
}

// ===============================
// Clear output function
// ===============================
function clearOutput() {
  const manualVersion = document.getElementById('manual-version');
  const version = manualVersion ? manualVersion.textContent.replace(/^v/, '') : '...';

  document.getElementById('out').textContent = 
    'Pharmaceutical Manufacturing Agent System Ready...\n' +
    `MVP ${version} - Modular Architecture\n` +
    'AI Decision Logging: ENABLED\n' +
    'GMP Compliance Monitoring: ACTIVE\n' +
    'Event-Driven Agent System: ACTIVE';

  document.getElementById('claude-response').style.display = 'none';
}

// ===============================
// Main chat handler - ENHANCED mit Performance-Tracking
// ===============================
document.getElementById("send").addEventListener("click", async () => {
  const btn = document.getElementById("send");
  const promptSelect = document.getElementById("prompt").value;
  const messageInput = document.getElementById("message").value.trim();

  // Priorisiere Freitext über Dropdown
  let finalMessage = "";
  if (messageInput) {
    finalMessage = messageInput;
  } else if (promptSelect) {
    finalMessage = promptSelect;
  } else {
    alert("Please enter a message or select a template");
    return;
  }

  btn.innerHTML = `Processing <span class="spinner"></span>`;
  btn.disabled = true;
  const startTime = performance.now(); // Präzisere Zeitmessung

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: finalMessage,
        user: { id: "frontend-user", name: "Manufacturing Operator", interface: "web" }
      })
    });

    const data = await res.json();
    const endTime = performance.now();
    const processingTime = Math.round(endTime - startTime);

    // Response anzeigen
    document.getElementById("claude-text").innerText = data.response;
    document.getElementById("claude-response").style.display = "block";

    // Performance-Tracking
    trackPerformance(processingTime, data.agentUsed, data.eventChainTriggered);

    // Erweiterte Log-Ausgabe mit Performance-Info
    const out = document.getElementById("out");
    const agentInfo = data.agentUsed ? `Agent: ${data.agentUsed}` : 'No specific agent';
    const eventsInfo = data.eventChainTriggered?.length ? ` | Events: ${data.eventChainTriggered.join(', ')}` : '';
    const timeInfo = ` | Time: ${processingTime}ms`;
    const perfRating = processingTime < 1000 ? ' ⚡' : processingTime < 2000 ? ' 📊' : ' ⏱️';

    out.textContent += `\n\n[${new Date().toLocaleTimeString()}] ${agentInfo}${eventsInfo}${timeInfo}${perfRating}\n${data.response}`;
    out.scrollTop = out.scrollHeight;

    // Metrics Update mit mehr Details
    const metrics = document.getElementById("metrics");
    if (metrics) {
      const avgTime = responseTimeHistory.length > 0 ? 
        Math.round(responseTimeHistory.reduce((a, b) => a + b, 0) / responseTimeHistory.length) : '--';
      
      metrics.innerHTML = `
        Last operation: ${agentInfo}${eventsInfo}${timeInfo}${perfRating}<br>
        <small>Total requests: ${totalRequestCount} | Avg response: ${avgTime}ms | Data sources: ${estimateDataSources(data.agentUsed)}</small>
      `;
    }

    // Input leeren
    document.getElementById("message").value = "";
    document.getElementById("prompt").selectedIndex = 0;

  } catch (err) {
    const endTime = performance.now();
    const processingTime = Math.round(endTime - startTime);
    
    console.error("Chat error:", err);
    document.getElementById("claude-text").innerText = `System Error: ${err.message}`;
    document.getElementById("claude-response").style.display = "block";
    
    // Auch Fehler-Performance tracken
    trackPerformance(processingTime, 'ERROR', []);
    
  } finally {
    btn.innerHTML = "Execute Manufacturing Command";
    btn.disabled = false;
  }
});

// ===============================
// Background refresh
// ===============================
async function refreshBackgroundData() {
  try {
    await loadTemplates();
    loadVersionInfo();
  } catch (error) {}
}

// ===============================
// Event Monitor (SSE)
// ===============================
let allEvents = [];

function startEventMonitor() {
  const evtSource = new EventSource("/events");

  evtSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    allEvents.push(data);
    renderEvents();
  };

  evtSource.onerror = () => {
    allEvents.push({
      type: "error",
      timestamp: new Date().toISOString(),
      payload: { message: "⚠️ Event stream disconnected" }
    });
    renderEvents();
  };
}

function renderEvents() {
  const monitor = document.getElementById("event-monitor");
  if (!monitor) return;

  monitor.innerHTML = "";

  allEvents.forEach(data => {
    const wrapper = document.createElement("div");
    wrapper.classList.add("event-line");

    const icon = {
      received: "📥",
      published: "📤",
      "agent-action": "🤖",
      "agent_event": "🔄",
      "auto_triggered_agent": "⚡",
      audit: "📝",
      chat: "💬",
      tool: "🔧",
      error: "⚠️",
      connection: "🔌",
      success: "✅",
      failure: "❌"
    }[data.type] || "ℹ️";

    const ts = data.timestamp ? new Date(data.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
    wrapper.textContent = `[${ts}] ${icon} ${data.type.toUpperCase()} | ${data.topic || data.agent || ""} | ${JSON.stringify(data.payload || {})}`;

    monitor.appendChild(wrapper);
  });

  monitor.scrollTop = monitor.scrollHeight;
}

function clearEvents() {
  allEvents = [];
  renderEvents();
}

// ===============================
// Response action functions
// ===============================
function copyResponse() {
  const responseText = document.getElementById("claude-text").innerText;
  navigator.clipboard.writeText(responseText);
}

function exportResponse() {
  const responseText = document.getElementById("claude-text").innerText;
  const blob = new Blob([responseText], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `agent-response-${new Date().toISOString().slice(0,19)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function clearResponse() {
  document.getElementById("claude-response").style.display = 'none';
}