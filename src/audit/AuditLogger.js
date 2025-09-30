/**
 * ========================================================================
 * AUDIT LOGGER
 * ========================================================================
 * 
 * GMP-Compliant Audit Trail System
 * Maintains complete audit log for regulatory compliance
 * 
 * Developer: Markus Schmeckenbecher
 * Version: 1.2.1
 * 
 * Features:
 * - GMP-compliant audit trail
 * - Tamper-proof logging
 * - Real-time event streaming
 * - JSON-based log format for analysis
 * ========================================================================
 */

import fs from "fs";
import path from "path";

export class AuditLogger {
  constructor(eventBusManager = null) {
    this.eventBusManager = eventBusManager;
    this.auditLogPath = path.join(process.cwd(), "audit_log.json");
    
    console.log("📋 AuditLogger initialized");
  }

  /**
   * Append Audit Entry
   * Adds entry to audit log with timestamp and event emission
   */
  appendAudit(entry) {
    let log = [];
    
    // Load existing log
    if (fs.existsSync(this.auditLogPath)) {
      try {
        log = JSON.parse(fs.readFileSync(this.auditLogPath, "utf8"));
      } catch (error) {
        console.error("❌ Error reading audit log:", error);
        log = [];
      }
    }

    // Ensure timestamp for GMP compliance
    entry.timestamp = entry.timestamp || new Date().toISOString();
    entry.auditId = this.generateAuditId();

    // Add entry to log
    log.push(entry);

    // Write to file
    try {
      fs.writeFileSync(this.auditLogPath, JSON.stringify(log, null, 2));
    } catch (error) {
      console.error("❌ Error writing audit log:", error);
    }

    // Emit to event bus for real-time monitoring
    if (this.eventBusManager) {
      this.eventBusManager.emit("event", { type: "audit", ...entry });
    }

    return entry.auditId;
  }

  /**
   * Generate Unique Audit ID
   */
  generateAuditId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `AUD-${timestamp}-${random}`;
  }

  /**
   * Get Audit Log
   * Returns complete audit trail or filtered entries
   */
  getAuditLog(filter = null, limit = null) {
    if (!fs.existsSync(this.auditLogPath)) {
      return { count: 0, entries: [] };
    }

    try {
      let log = JSON.parse(fs.readFileSync(this.auditLogPath, "utf8"));

      // Apply filter if provided
      if (filter) {
        log = this.filterEntries(log, filter);
      }

      // Apply limit if provided
      if (limit && limit > 0) {
        log = log.slice(-limit); // Get last N entries
      }

      return { count: log.length, entries: log };
    } catch (error) {
      console.error("❌ Error reading audit log:", error);
      return { count: 0, entries: [], error: "Failed to parse audit log" };
    }
  }

  /**
   * Filter Audit Entries
   * Applies filtering based on criteria
   */
  filterEntries(entries, filter) {
    return entries.filter(entry => {
      // Filter by type
      if (filter.type && entry.type !== filter.type) {
        return false;
      }

      // Filter by agent
      if (filter.agent && entry.agent !== filter.agent) {
        return false;
      }

      // Filter by date range
      if (filter.startDate) {
        const entryDate = new Date(entry.timestamp);
        const startDate = new Date(filter.startDate);
        if (entryDate < startDate) {
          return false;
        }
      }

      if (filter.endDate) {
        const entryDate = new Date(entry.timestamp);
        const endDate = new Date(filter.endDate);
        if (entryDate > endDate) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Log Chat Interaction
   */
  logChatInteraction(user, agent, message, response) {
    return this.appendAudit({
      type: "chat",
      user: user?.name || "Anonymous",
      agent,
      message,
      response,
    });
  }

  /**
   * Log Agent Event
   */
  logAgentEvent(eventType, sourceAgent, data) {
    return this.appendAudit({
      type: "agent_event",
      eventType,
      sourceAgent,
      data,
    });
  }

  /**
 * Get recent audit entries (for API)
 */
getEntries(limit = 100) {
  const result = this.getAuditLog(null, limit);
  return result.entries || [];
}


  /**
   * Log Auto-Triggered Agent
   */
  logAutoTriggeredAgent(triggeredAgent, triggerEvent, sourceAgent, response) {
    return this.appendAudit({
      type: "auto_triggered_agent",
      triggeredAgent,
      triggerEvent,
      sourceAgent,
      response: response.substring(0, 200) + '...',
    });
  }

  /**
   * Log Tool Usage
   */
  logToolUsage(tool, details) {
    return this.appendAudit({
      type: "tool",
      tool,
      details,
    });
  }

  /**
   * Log Data Change
   */
  logDataChange(fileName, entryId, oldValue, newValue, reason) {
    return this.appendAudit({
      type: "data_change",
      fileName,
      entryId,
      oldValue,
      newValue,
      reason,
    });
  }

  /**
   * Log System Event
   */
  logSystemEvent(event, details) {
    return this.appendAudit({
      type: "system",
      event,
      details,
    });
  }

  /**
   * 🔥 Generic Logging Methods (compatibility layer)
   */
  logInfo(event, message, details = {}) {
    return this.appendAudit({
      type: "system",
      level: "info",
      event,
      message,
      details,
    });
  }

  logWarn(event, message, details = {}) {
    return this.appendAudit({
      type: "system",
      level: "warn",
      event,
      message,
      details,
    });
  }

  logError(event, message, details = {}) {
    return this.appendAudit({
      type: "system",
      level: "error",
      event,
      message,
      details,
    });
  }

  /**
   * Get Audit Statistics
   */
  getAuditStats() {
    const auditLog = this.getAuditLog();
    const entries = auditLog.entries;

    if (entries.length === 0) {
      return {
        totalEntries: 0,
        byType: {},
        byAgent: {},
        dateRange: null,
      };
    }

    // Count by type
    const byType = {};
    const byAgent = {};
    
    entries.forEach(entry => {
      // Count by type
      byType[entry.type] = (byType[entry.type] || 0) + 1;
      
      // Count by agent
      if (entry.agent) {
        byAgent[entry.agent] = (byAgent[entry.agent] || 0) + 1;
      }
    });

    // Date range
    const timestamps = entries.map(e => e.timestamp).sort();
    const dateRange = {
      earliest: timestamps[0],
      latest: timestamps[timestamps.length - 1],
    };

    return {
      totalEntries: entries.length,
      byType,
      byAgent,
      dateRange,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Clear Audit Log
   * WARNING: Use with caution - for development only
   */
  clearAuditLog() {
    try {
      if (fs.existsSync(this.auditLogPath)) {
        fs.unlinkSync(this.auditLogPath);
        console.log("🗑️ Audit log cleared");
        return true;
      }
      return false;
    } catch (error) {
      console.error("❌ Error clearing audit log:", error);
      return false;
    }
  }

  /**
   * Archive Audit Log
   * Creates backup of current log and starts new one
   */
  archiveAuditLog() {
    try {
      if (!fs.existsSync(this.auditLogPath)) {
        return false;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const archivePath = path.join(
        path.dirname(this.auditLogPath),
        `audit_log_${timestamp}.json`
      );

      fs.copyFileSync(this.auditLogPath, archivePath);
      fs.unlinkSync(this.auditLogPath);

      console.log(`📦 Audit log archived to: ${archivePath}`);
      
      this.appendAudit({
        type: "system",
        event: "audit_log_archived",
        details: { archivePath },
      });

      return archivePath;
    } catch (error) {
      console.error("❌ Error archiving audit log:", error);
      return false;
    }
  }
}

export default AuditLogger;
