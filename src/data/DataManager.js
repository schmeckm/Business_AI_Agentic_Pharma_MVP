/**
 * ========================================================================
 * DATA MANAGER (Zentrale Steuerung)
 * ========================================================================
 *
 * Verbindet alle DataSources (Mock, SAP, REST, OEE) und bietet:
 * - Einheitliche Datenzugriffe
 * - Cache-Management
 * - OEE-History Laden (Simulator-File)
 * - API-Helper für OEE-Daten
 *
 * Author: Markus Schmeckenbecher
 * Version: 1.1 (modularisiert + getDataStats ergänzt)
 * ========================================================================
 */

import fs from "fs";
import path from "path";
import DataSourceFactory from "./sources/DataSourceFactory.js";
import logger from "../utils/logger.js";

class DataManager {
  constructor(configPath = "src/config/data-sources.yaml") {
    this.dataSources = new Map();   // Typ -> DataSource
    this.dataCache = new Map();     // Datentyp -> Cache
    this.sourceConfigs = new Map(); // Datentyp -> Konfiguration
    this.configPath = configPath;

    logger.info("✅ DataManager initialized");
    this.setupCleanupHandlers();
  }

  // ------------------------------------------------------------------------
  // Cleanup Handler
  // ------------------------------------------------------------------------
  setupCleanupHandlers() {
    const cleanup = () => {
      logger.info("♻️ Cleaning up data sources...");
      this.dataSources.forEach((source, type) => {
        try {
          if (source.cleanup) {
            logger.info(`🔌 Cleaning up ${type} data source`);
            source.cleanup();
          }
        } catch (err) {
          logger.error(`❌ Cleanup error for ${type}: ${err.message}`);
        }
      });
    };

    process.on("SIGTERM", cleanup);
    process.on("SIGINT", cleanup);
    process.on("exit", cleanup);
  }

  // ------------------------------------------------------------------------
  // Konfiguration Laden
  // ------------------------------------------------------------------------
  async loadDataSourceConfig() {
    try {
      const configFile = path.join(process.cwd(), this.configPath);
      if (!fs.existsSync(configFile)) {
        logger.warn("⚠️ Keine Config gefunden, nutze Default Config");
        this.setDefaultConfig();
        return;
      }

      const yaml = await import("js-yaml");
      const config = yaml.load(fs.readFileSync(configFile, "utf8"));

      for (const [dataType, sourceConfig] of Object.entries(config.dataSources)) {
        this.sourceConfigs.set(dataType, sourceConfig);
        if (!this.dataSources.has(sourceConfig.type)) {
          const dataSource = DataSourceFactory.createDataSource(
            sourceConfig.type,
            sourceConfig.config
          );
          this.dataSources.set(sourceConfig.type, dataSource);
        }
      }

      logger.info(`✅ Data sources loaded: ${Array.from(this.sourceConfigs.keys()).join(", ")}`);
    } catch (err) {
      logger.error(`❌ Failed to load data source config: ${err.message}`);
      this.setDefaultConfig();
    }
  }

  setDefaultConfig() {
    const defaults = ["orders", "issues", "batches", "compliance", "qa"];
    defaults.forEach((type) => {
      this.sourceConfigs.set(type, {
        type: "mock",
        file: type,
        config: { basePath: "mock-data" },
      });
    });

    if (process.env.MQTT_BROKER_URL) {
      this.sourceConfigs.set("oee", {
        type: "oee",
        config: {
          brokerUrl: process.env.MQTT_BROKER_URL,
          topicBase: process.env.MQTT_TOPIC_BASE || "plc",
        },
      });

      const oeeSource = DataSourceFactory.createDataSource("oee", {
        brokerUrl: process.env.MQTT_BROKER_URL,
        topicBase: process.env.MQTT_TOPIC_BASE || "plc",
      });
      this.dataSources.set("oee", oeeSource);
    }

    const mockSource = DataSourceFactory.createDataSource("mock");
    this.dataSources.set("mock", mockSource);

    logger.info("⚙️ Default config applied");
  }

  // In der handleOEEMessage Methode
handleOEEMessage(topic, message) {
  try {
    const data = JSON.parse(message.toString());
    
    // Bestehender Code...
    this.realtimeOEEData.set(lineId, oeeMetrics);
    
    // NEU: Publiziere RAW MQTT Message
    if (this.eventBusManager) {
      this.eventBusManager.publishEvent(`mqtt/${topic}`, {
        topic,
        payload: data,
        timestamp: new Date().toISOString()
      }, 'mqtt');
    }
  } catch (err) {
    // ...
  }
}

  // ------------------------------------------------------------------------
  // Daten Laden + Cache
  // ------------------------------------------------------------------------
  async loadAllData() {
    logger.info("📥 Loading all configured data sources...");
    for (const [dataType] of this.sourceConfigs.entries()) {
      try {
        await this.loadDataType(dataType);
      } catch (err) {
        logger.error(`❌ Failed to load ${dataType}: ${err.message}`);
      }
    }
    logger.info(`✅ Data load complete. Cached types: ${Array.from(this.dataCache.keys()).join(", ")}`);
  }

  async loadDataType(dataType) {
    const sourceConfig = this.sourceConfigs.get(dataType);
    if (!sourceConfig) throw new Error(`No source config for: ${dataType}`);

    const dataSource = this.dataSources.get(sourceConfig.type);
    if (!dataSource) throw new Error(`No DataSource for type: ${sourceConfig.type}`);

    const data = await dataSource.fetchData(sourceConfig);
    if (data !== null) {
      this.dataCache.set(dataType, data);
      logger.info(`📦 Cached: ${dataType} from ${dataSource.getName()}`);
    }
    return data;
  }

  async getCachedData(dataType, forceRefresh = false) {
    if (forceRefresh || !this.dataCache.has(dataType)) {
      await this.loadDataType(dataType);
    }
    return this.dataCache.get(dataType) || null;
  }

  // ------------------------------------------------------------------------
// Mock Data Helper (für AgentManager)
// ------------------------------------------------------------------------
getMockDataForAgent(agentId) {
  try {
    const mockData = this.dataCache.get("mock");
    if (!mockData) {
      return [];
    }

    // Falls mockData ein Objekt ist mit keys = agentId
    if (typeof mockData === "object" && !Array.isArray(mockData)) {
      return mockData[agentId] || [];
    }

    // Falls mockData ein Array ist, filtern
    if (Array.isArray(mockData)) {
      return mockData.filter(entry => entry.agentId === agentId);
    }

    return [];
  } catch (err) {
    logger.error(`❌ getMockDataForAgent failed: ${err.message}`);
    return [];
  }
}

/**
 * Get all available system data for generic queries
 * Combines cache, OEE history, and overview into one object
 */
async getAllAvailableData() {
  const result = {};

  try {
    result.orders = await this.getCachedData("orders").catch(() => []);
    result.issues = await this.getCachedData("issues").catch(() => []);
    result.batches = await this.getCachedData("batches").catch(() => []);
    result.compliance = await this.getCachedData("compliance").catch(() => []);
    result.qa = await this.getCachedData("qa").catch(() => []);
    result.bom = await this.getCachedData("bom").catch(() => []);
    result.inventory = await this.getCachedData("inventory").catch(() => []);

    // ✅ Wichtig: await + try/catch, nicht .catch() bei async Methoden
    try {
      result.oee_hot = await this.getRealtimeOEEData();
    } catch {
      result.oee_hot = [];
    }

    try {
      result.oee_history = await this.getOEEHistoryForAPI(50);
    } catch {
      result.oee_history = [];
    }

  } catch (err) {
    console.error("❌ Error collecting available data:", err.message);
  }

  return {
    ...result,
    timestamp: new Date().toISOString(),
    overview: this.getDataOverview(true)
  };
}

/**
 * ========================================================================
 * Correlated Data API
 * ========================================================================
 * 
 * Liefert verknüpfte Daten (OEE Hot + OEE History + Orders + QA + Inventory)
 * für eine bestimmte Zeitspanne oder Linie.
 * 
 * @param {Object} options - Filteroptionen
 *   @param {string} [options.line] - Optional: Linie filtern (z.B. "LINE-01")
 *   @param {string} [options.orderId] - Optional: Order-ID filtern
 *   @param {string} [options.batchId] - Optional: Batch-ID filtern
 *   @param {Date|string} [options.since] - Optional: nur Daten nach diesem Datum
 * 
 * @returns {Promise<Object>} - Korreliertes JSON
 */



  // ------------------------------------------------------------------------
  // Realtime OEE Zugriff (Hot Data)
  // ------------------------------------------------------------------------
async getRealtimeOEEData() {
    try {
      const source = this.dataSources.get("oee");
      if (!source) {
        logger.warn("⚠️ No OEE data source configured");
        return [];
      }

      const data = await source.fetchData();
      return Array.isArray(data) ? data : [];
    } catch (err) {
      logger.error(`❌ Failed to get realtime OEE data: ${err.message}`);
      return [];
    }
  }

  /**
   * ------------------------------------------------------------------------
   * Korrelierte Daten (Hot + Cold + Orders + QA + Issues)
   * ------------------------------------------------------------------------
   */
  async getCorrelatedData() {
    try {
      const hot = await this.getRealtimeOEEData();
      const history = await this.getOEEHistoryForAPI(100);
      const orders = await this.getCachedData("orders").catch(() => []);
      const batches = await this.getCachedData("batches").catch(() => []);
      const compliance = await this.getCachedData("compliance").catch(() => []);
      const issues = await this.getCachedData("issues").catch(() => []);

      let qaEvents = [];
      if (this.sourceConfigs.has("qa_events")) {
        try {
          qaEvents = await this.getCachedData("qa_events");
        } catch (e) {
          logger.warn(`⚠️ QA Events not available: ${e.message}`);
        }
      }

      return {
        oee_hot: hot || [],
        oee_history: history || [],
        orders: orders || [],
        batches: batches || [],
        compliance: compliance || [],
        issues: issues || [],
        qa_events: qaEvents,
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      logger.error(`❌ Error in getCorrelatedData: ${err.message}`);
      return { error: err.message, timestamp: new Date().toISOString() };
    }
  }


  // ------------------------------------------------------------------------
  // OEE-History (Cold Data - Simulator File)
  // ------------------------------------------------------------------------
  async loadOEEHistory() {
    try {
      const historyPath = path.join(process.cwd(), "oee_history.json");
      if (!fs.existsSync(historyPath)) {
        logger.warn(`⚠️ OEE history file not found: ${historyPath}`);
        return [];
      }

      const history = JSON.parse(fs.readFileSync(historyPath, "utf8"));
      this.dataCache.set("oee_history", history);

      logger.info(`✅ Loaded ${history.length} OEE history entries`);
      return history;
    } catch (err) {
      logger.error(`❌ Error loading OEE history: ${err.message}`);
      return [];
    }
  }

  async getOEEHistoryForAPI(limit = 100, lineId = null) {
    try {
      const historyData = await this.loadOEEHistory();
      if (!Array.isArray(historyData) || historyData.length === 0) {
        return this.generateMockOEEHistory(limit, lineId);
      }

      const history = historyData
        .filter((entry) => !lineId || entry.line === lineId)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, limit);

      return history;
    } catch (err) {
      logger.error(`❌ Error processing OEE history: ${err.message}`);
      return this.generateMockOEEHistory(limit, lineId);
    }
  }

  generateMockOEEHistory(limit, lineId) {
    const lines = lineId ? [lineId] : ["LINE-01", "LINE-02", "LINE-03"];
    const history = [];

    for (let i = 0; i < limit; i++) {
      const line = lines[i % lines.length];
      const minutesAgo = i * 5;
      history.push({
        timestamp: new Date(Date.now() - minutesAgo * 60000).toISOString(),
        lineId: line,
        oee: 80 + Math.random() * 15,
        availability: 85 + Math.random() * 10,
        performance: 90 + Math.random() * 5,
        quality: 95 + Math.random() * 5,
        status: "running",
        batchId: `BATCH-${100 + i}`,
        eventType: "oee_update",
        source: "mock",
      });
    }

    return history;
  }

  // ------------------------------------------------------------------------
  // Übersicht + Stats
  // ------------------------------------------------------------------------
  getDataOverview(includeFullData = false) {
    const summary = Array.from(this.dataCache.entries()).map(([key, data]) => ({
      file: key,
      entries: Array.isArray(data) ? data.length : Object.keys(data).length,
      sample: Array.isArray(data) ? data[0] : Object.keys(data).slice(0, 3),
    }));

    return {
      loaded: Array.from(this.dataCache.keys()),
      summary,
      fullData: includeFullData ? Object.fromEntries(this.dataCache) : "Use ?full=true",
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get comprehensive statistics about loaded data
   * @returns {Object} Statistics for each data type
   */
  getDataStats() {
    const stats = {};
    this.dataCache.forEach((data, key) => {
      const sourceConfig = this.sourceConfigs.get(key);
      stats[key] = {
        type: Array.isArray(data) ? "array" : "object",
        entries: Array.isArray(data) ? data.length : Object.keys(data).length,
        source: sourceConfig ? sourceConfig.type : "unknown",
        sample: Array.isArray(data) ? data[0] : Object.keys(data).slice(0, 3),
        lastUpdate: this.getDataLastUpdate(data),
      };
    });

    // Add OEE connection status
    stats.oee_connection = this.getOEEConnectionStatus();

    return stats;
  }

  /**
   * Get last update timestamp for data
   */
  getDataLastUpdate(data) {
    if (Array.isArray(data) && data.length > 0) {
      const timestamps = data
        .map((item) => item.receivedAt || item.lastUpdated || item.timestamp)
        .filter((ts) => ts)
        .sort()
        .reverse();

      return timestamps[0] || "unknown";
    }
    return "unknown";
  }

  /**
   * Get OEE connection status
   */
  getOEEConnectionStatus() {
    const oeeSource = this.dataSources.get("oee");
    if (oeeSource && oeeSource.getConnectionStatus) {
      return oeeSource.getConnectionStatus();
    }
    return {
      connected: false,
      reconnectAttempts: 0,
      dataPoints: 0,
      brokerUrl: "Not configured",
    };
  }

  // ------------------------------------------------------------------------
  // Data Integrity Validation
  // ------------------------------------------------------------------------
validateDataIntegrity(requiredFiles = ['orders', 'issues', 'batches', 'compliance', 'oee']) {
  const missing = requiredFiles.filter(file => !this.dataCache.has(file));
  const isValid = missing.length === 0;

  // Check OEE data freshness if required
  let oeeStatus = 'not_required';
  if (requiredFiles.includes('oee')) {
    let oeeData = [];
    try {
      oeeData = this.getRealtimeOEEData
        ? this.safeArray(this.getRealtimeOEEData())
        : [];
    } catch (e) {
      logger.warn(`⚠️ validateDataIntegrity: Failed to fetch OEE data: ${e.message}`);
      oeeData = [];
    }

    if (oeeData.length === 0) {
      oeeStatus = 'no_data';
    } else {
      const oldestData = Math.max(
        ...oeeData
          .filter(d => d && d.receivedAt)
          .map(d => Date.now() - new Date(d.receivedAt).getTime())
      );
      oeeStatus = oldestData < 300000 ? 'fresh' : 'stale'; // 5 min
    }
  }

  return {
    isValid,
    missing,
    loaded: Array.from(this.dataCache.keys()),
    sources: Object.fromEntries(
      Array.from(this.sourceConfigs.entries()).map(([key, config]) => [key, config.type])
    ),
    oeeStatus,
    oeeConnection: this.getOEEConnectionStatus ? this.getOEEConnectionStatus() : "unknown",
    timestamp: new Date().toISOString()
  };
}


   /**
   * Utility: Always return an array
   * - If input is null/undefined → []
   * - If input is already array → same array
   * - If input is object → [object]
   * - If input is primitive → [value]
   */
  safeArray(input) {
    if (!input) return [];
    if (Array.isArray(input)) return input;
    return [input];
  }

}



export { DataManager };
export default DataManager;
