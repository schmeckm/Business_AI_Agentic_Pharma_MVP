/**
 * ========================================================================
 * RATE LIMITER - API CALL PROTECTION
 * ========================================================================
 * 
 * Prevents budget overconsumption by limiting Claude API calls
 * Thread-safe rate limiting with configurable windows
 * 
 * Developer: Markus Schmeckenbecher
 * Version: 1.0.0
 * ========================================================================
 */

export class RateLimiter {
  constructor(maxCalls = 10, timeWindowMs = 60000) {
    this.maxCalls = maxCalls;
    this.timeWindow = timeWindowMs;
    this.calls = [];
    this.blocked = 0;
    this.startTime = Date.now();
  }

  /**
   * Check if API call is allowed
   * @param {string} agentId - Agent making the request
   * @returns {boolean} - True if call is allowed
   */
  canMakeCall(agentId = 'unknown') {
    const now = Date.now();
    
    // Remove old calls outside time window
    this.calls = this.calls.filter(call => now - call.timestamp < this.timeWindow);
    
    if (this.calls.length >= this.maxCalls) {
      this.blocked++;
      console.warn(`🚫 Rate limit exceeded for ${agentId}: ${this.calls.length}/${this.maxCalls} calls in last ${this.timeWindow/1000}s`);
      return false;
    }
    
    // Record this call
    this.calls.push({ 
      timestamp: now, 
      agentId,
      callNumber: this.getTotalCalls() + 1
    });
    
    console.log(`✅ API call ${this.calls.length}/${this.maxCalls} approved for ${agentId}`);
    return true;
  }

  /**
   * Get current rate limiter status
   * @returns {object} - Status information
   */
  getStatus() {
    const now = Date.now();
    const recentCalls = this.calls.filter(call => now - call.timestamp < this.timeWindow);
    const oldestCall = recentCalls.length > 0 ? recentCalls[0] : null;
    
    return {
      callsInWindow: recentCalls.length,
      maxCalls: this.maxCalls,
      windowSeconds: this.timeWindow / 1000,
      blockedCalls: this.blocked,
      nextResetIn: oldestCall ? 
        Math.max(0, this.timeWindow - (now - oldestCall.timestamp)) : 0,
      uptime: Math.floor((now - this.startTime) / 1000),
      recentCalls: recentCalls.map(call => ({
        agentId: call.agentId,
        secondsAgo: Math.floor((now - call.timestamp) / 1000)
      }))
    };
  }

  /**
   * Reset rate limiter (emergency use)
   */
  reset() {
    const previousCalls = this.calls.length;
    const previousBlocked = this.blocked;
    
    this.calls = [];
    this.blocked = 0;
    
    console.log(`🔄 Rate limiter reset - cleared ${previousCalls} calls, ${previousBlocked} blocked`);
    
    return {
      clearedCalls: previousCalls,
      clearedBlocked: previousBlocked,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get total calls made since startup
   */
  getTotalCalls() {
    return this.calls.reduce((max, call) => 
      Math.max(max, call.callNumber || 0), 0
    );
  }

  /**
   * Check if rate limiter is healthy
   */
  isHealthy() {
    const status = this.getStatus();
    return {
      healthy: status.callsInWindow < this.maxCalls,
      utilizationPercent: Math.round((status.callsInWindow / this.maxCalls) * 100),
      status: status.callsInWindow >= this.maxCalls ? 'RATE_LIMITED' : 'OK'
    };
  }

  /**
   * Get detailed metrics
   */
  getMetrics() {
    const now = Date.now();
    const recentCalls = this.calls.filter(call => now - call.timestamp < this.timeWindow);
    
    // Agent usage breakdown
    const agentUsage = {};
    recentCalls.forEach(call => {
      agentUsage[call.agentId] = (agentUsage[call.agentId] || 0) + 1;
    });

    return {
      ...this.getStatus(),
      agentUsage,
      efficiency: {
        successRate: this.calls.length > 0 ? 
          Math.round(((this.calls.length / (this.calls.length + this.blocked)) * 100)) : 100,
        avgCallsPerMinute: this.calls.length > 0 ?
          Math.round((this.calls.length / ((now - this.startTime) / 60000)) * 100) / 100 : 0
      }
    };
  }
}

export default RateLimiter;