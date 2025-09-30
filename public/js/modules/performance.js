// ============================================================================
// FILE: public/js/modules/performance.js
// ============================================================================
/**
 * Performance Tracking Module
 * Handles response time tracking, metrics calculation, and display
 */
class PerformanceTracker {
  constructor() {
    this.responseTimeHistory = [];
    this.lastAgentUsed = null;
    this.totalRequestCount = 0;
  }

  /**
   * Track a new performance measurement
   * @param {number} responseTime - Response time in milliseconds
   * @param {string} agentUsed - Name of the agent that processed the request
   * @param {Array} eventChain - Array of events triggered
   */
  track(responseTime, agentUsed, eventChain = []) {
    // Update history
    this.responseTimeHistory.push(responseTime);
    if (this.responseTimeHistory.length > AppConfig.performance.historySize) {
      this.responseTimeHistory.shift();
    }
    
    this.lastAgentUsed = agentUsed;
    this.totalRequestCount++;
    
    // Update displays
    this.updateDisplay(responseTime, agentUsed, eventChain);
    this.updateHeaderBadge();
  }

  /**
   * Update the performance metrics display
   * @private
   */
  updateDisplay(responseTime, agentUsed, eventChain) {
    const metricsDiv = document.getElementById('performance-metrics');
    if (!metricsDiv) return;
    
    metricsDiv.style.display = 'block';
    
    // Response time with color coding
    this.updateResponseTimeDisplay(responseTime);
    
    // Agent information
    const agentElement = document.getElementById('current-agent');
    if (agentElement) {
      agentElement.textContent = agentUsed || 'No specific agent';
    }
    
    // Event count
    const eventsElement = document.getElementById('events-triggered');
    if (eventsElement) {
      eventsElement.textContent = eventChain ? eventChain.length : 0;
    }
    
    // Average response time
    this.updateAverageDisplay();
    
    // Data sources
    this.updateDataSourcesDisplay(agentUsed);
  }

  /**
   * Update response time with color coding
   * @private
   */
  updateResponseTimeDisplay(responseTime) {
    const element = document.getElementById('current-response-time');
    if (!element) return;
    
    element.textContent = `${responseTime}ms`;
    element.className = 'performance-value';
    
    const { fastThreshold, mediumThreshold } = AppConfig.performance;
    
    if (responseTime < fastThreshold) {
      element.classList.add('response-time-fast');
    } else if (responseTime < mediumThreshold) {
      element.classList.add('response-time-medium');
    } else {
      element.classList.add('response-time-slow');
    }
  }

  /**
   * Update average response time display
   * @private
   */
  updateAverageDisplay() {
    const element = document.getElementById('average-response-time');
    if (!element || this.responseTimeHistory.length === 0) return;
    
    const average = this.calculateAverage();
    element.textContent = `${average}ms`;
  }

  /**
   * Update data sources display
   * @private
   */
  updateDataSourcesDisplay(agentUsed) {
    const element = document.getElementById('data-sources-count');
    if (!element) return;
    
    element.textContent = this.estimateDataSources(agentUsed);
  }

  /**
   * Update performance badge in header
   * @private
   */
  updateHeaderBadge() {
    const badge = document.getElementById('header-performance-badge');
    const versionElement = document.getElementById('app-version');
    
    if (!badge || this.responseTimeHistory.length === 0) return;
    
    const average = this.calculateAverage();
    const version = versionElement ? versionElement.textContent : '1.3.0';
    const { fastThreshold, mediumThreshold } = AppConfig.performance;
    
    if (average < fastThreshold) {
      badge.innerHTML = `MVP ${version} | <span style="color: #90EE90;">⚡ Fast</span>`;
    } else if (average < mediumThreshold) {
      badge.innerHTML = `MVP ${version} | <span style="color: #FFD700;">📊 Good</span>`;
    } else {
      badge.innerHTML = `MVP ${version} | <span style="color: #FFA500;">⏱️ Slow</span>`;
    }
  }

  /**
   * Calculate average response time
   * @returns {number} Average in milliseconds
   */
  calculateAverage() {
    if (this.responseTimeHistory.length === 0) return 0;
    
    const sum = this.responseTimeHistory.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.responseTimeHistory.length);
  }

  /**
   * Calculate minimum response time
   * @returns {number} Minimum in milliseconds
   */
  calculateMin() {
    return this.responseTimeHistory.length > 0 
      ? Math.min(...this.responseTimeHistory) 
      : 0;
  }

  /**
   * Calculate maximum response time
   * @returns {number} Maximum in milliseconds
   */
  calculateMax() {
    return this.responseTimeHistory.length > 0 
      ? Math.max(...this.responseTimeHistory) 
      : 0;
  }

  /**
   * Estimate data sources based on agent
   * @param {string} agentUsed - Agent name
   * @returns {string} Data source description
   */
  estimateDataSources(agentUsed) {
    return AppConfig.agentDataSources[agentUsed] 
      || AppConfig.agentDataSources.default;
  }

  /**
   * Get performance rating emoji
   * @param {number} responseTime - Response time in milliseconds
   * @returns {string} Emoji representing performance
   */
  getPerformanceRating(responseTime) {
    const { fastThreshold, mediumThreshold } = AppConfig.performance;
    
    if (responseTime < fastThreshold) return '⚡';
    if (responseTime < mediumThreshold) return '📊';
    return '⏱️';
  }

  /**
   * Show detailed performance statistics
   */
  showStatistics() {
    if (this.responseTimeHistory.length === 0) {
      alert('No performance data available yet. Please make some requests first.');
      return;
    }
    
    const min = this.calculateMin();
    const max = this.calculateMax();
    const avg = this.calculateAverage();
    const target = AppConfig.performance.targetResponseTime;
    
    const perfStatus = avg < 1500 
      ? '🟢 Performance: EXCELLENT' 
      : avg < 3000 
        ? '🟡 Performance: GOOD' 
        : '🔴 Performance: NEEDS OPTIMIZATION';
    
    const stats = `
=== PERFORMANCE STATISTICS ===

Total Requests: ${this.totalRequestCount}
Last Agent Used: ${this.lastAgentUsed || 'Unknown'}

Response Times (last ${this.responseTimeHistory.length} requests):
- Fastest: ${min}ms
- Slowest: ${max}ms  
- Average: ${avg}ms

Optimization Status:
✅ Prompts: 85% shorter
✅ Data Loading: Agent-specific
${perfStatus}

Expected after full optimization:
- Target: < ${target}ms average
- Improvement potential: ${Math.max(0, avg - target)}ms
    `;
    
    alert(stats);
  }

  /**
   * Reset all performance data
   */
  reset() {
    this.responseTimeHistory = [];
    this.lastAgentUsed = null;
    this.totalRequestCount = 0;
  }
}
