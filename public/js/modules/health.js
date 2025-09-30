// ============================================================================
// FILE: public/js/modules/health.js
// ============================================================================
/**
 * Health Monitoring Module
 * Handles system health checks and status updates
 */
class HealthMonitor {
  constructor() {
    this.lastStatus = null;
  }

  /**
   * Update the health indicator display
   */
  async updateIndicator() {
    const healthDot = document.getElementById('health-dot');
    const healthText = document.getElementById('health-text');
    
    if (!healthDot || !healthText) return;

    try {
      const response = await fetch(AppConfig.endpoints.health);
      const health = await response.json();
      this.lastStatus = health;

      const { className, text } = this.getHealthDisplay(health.status);
      healthDot.className = `health-dot ${className}`;
      healthText.textContent = text;

    } catch (error) {
      console.error('Health check failed:', error);
      healthDot.className = 'health-dot health-red';
      healthText.textContent = 'API Error';
      this.lastStatus = { status: 'error', error: error.message };
    }
  }

  /**
   * Get health display properties based on status
   * @private
   * @param {string} status - Health status
   * @returns {Object} Display properties
   */
  getHealthDisplay(status) {
    const displays = {
      'ok': { className: 'health-green', text: 'System OK' },
      'healthy': { className: 'health-green', text: 'System OK' },
      'error': { className: 'health-red', text: 'Error' },
      'unhealthy': { className: 'health-red', text: 'Error' },
      'degraded': { className: 'health-yellow', text: 'Warning' }
    };

    return displays[status] || { className: 'health-yellow', text: 'Warning' };
  }

  /**
   * Update system status display
   */
  async updateSystemStatus() {
    try {
      const response = await fetch(AppConfig.endpoints.health);
      const health = await response.json();

      const statusElement = document.getElementById('status');
      if (statusElement) {
        const mode = health.agentMode || 'enhanced';
        const actions = health.useActions ? 'enabled' : 'disabled';
        statusElement.textContent = 
          `System Status: Ready - Mode: ${mode} | Actions: ${actions} | OEE: Live`;
      }

    } catch (error) {
      console.error('Status update failed:', error);
    }
  }

  /**
   * Show detailed system information
   */
  async showSystemInfo() {
    try {
      const response = await fetch(AppConfig.endpoints.status);
      const status = await response.json();

      const dataSources = Object.entries(status.data || {})
        .map(([key, info]) => 
          `${key}: ${info.entries} entries (${info.source || 'unknown'})`
        )
        .join('\n');

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
${dataSources}

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

  /**
   * Start periodic health checks
   */
  startMonitoring() {
    this.updateIndicator();
    this.updateSystemStatus();
    
    setInterval(() => this.updateIndicator(), AppConfig.intervals.healthCheck);
  }
}