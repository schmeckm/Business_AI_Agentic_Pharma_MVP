/**
 * ========================================================================
 * FLEXIBLE DATA MANAGER WITH SAP API + OEE MQTT SUPPORT
 * ========================================================================
 * 
 * Multi-source data management system supporting:
 * - Mock JSON files (Development)
 * - SAP APIs (Production) 
 * - REST APIs
 * - OEE MQTT (Real-time)
 * - OEE History from Simulator Files
 * 
 * Features:
 * - Configurable data sources via YAML
 * - Automatic caching and refresh mechanisms
 * - Real-time OEE data integration via MQTT
 * - OEE History file integration
 * - SAP API integration with authentication
 * - Error handling and logging with Winston
 * - Data validation and integrity checks
 * - Enhanced MQTT reconnection logic
 * - Data age validation and filtering
 * - Memory leak prevention
 * 
 * @author Markus Schmeckenbecher
 * @version 1.4.3 - OEE History Integration
 * @since 2024
 * ========================================================================
 */

import fs from "fs";
import path from "path";
import mqtt from "mqtt";
import logger from "../../utils/logger.js";

// ========================================================================
// DATA SOURCE INTERFACES
// ========================================================================

/**
 * Abstract base class for all data sources
 * Defines the interface that all data sources must implement
 */
class DataSource {
  /**
   * Fetch data from the configured source
   * @param {Object} sourceConfig - Configuration object for the data source
   * @returns {Promise<Object|Array|null>} Retrieved data or null if failed
   */
  async fetchData(sourceConfig) {
    throw new Error("fetchData method must be implemented");
  }
  
  /**
   * Update data in the configured source
   * @param {Object} sourceConfig - Configuration object for the data source
   * @param {string} entryId - Identifier of the entry to update
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} Updated entry
   */
  async updateData(sourceConfig, entryId, updates) {
    throw new Error("updateData method must be implemented");
  }
  
  /**
   * Get the name of this data source implementation
   * @returns {string} Name of the data source
   */
  getName() {
    throw new Error("getName method must be implemented");
  }

  /**
   * Cleanup resources (optional)
   */
  cleanup() {
    // Default implementation - override if cleanup needed
  }
}

// ========================================================================
// MOCK DATA SOURCE (Development)
// ========================================================================

/**
 * Mock data source for development and testing
 * Reads data from local JSON files
 */
class MockDataSource extends DataSource {
  /**
   * Initialize mock data source
   * @param {string} basePath - Base path for mock data files
   */
  constructor(basePath = "mock-data") {
    super();
    this.basePath = basePath;
  }

  /**
   * Fetch data from local JSON file
   * @param {Object} sourceConfig - Configuration containing file name
   * @returns {Promise<Object|Array|null>} Parsed JSON data or null
   */
  async fetchData(sourceConfig) {
    const filePath = path.join(process.cwd(), this.basePath, `${sourceConfig.file}.json`);
    
    if (!fs.existsSync(filePath)) {
      logger.warn(`Mock file not found: ${filePath}`);
      return null;
    }

    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const count = Array.isArray(data) ? data.length : Object.keys(data).length;
      logger.info(`Mock data loaded: ${sourceConfig.file}.json (${count} entries)`);
      return data;
    } catch (error) {
      logger.error(`Failed to load mock file ${sourceConfig.file}: ${error.message}`);
      return null;
    }
  }

  /**
   * Update entry in local JSON file
   * @param {Object} sourceConfig - Configuration containing file name
   * @param {string} entryId - ID of entry to update
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} Updated entry
   */
  async updateData(sourceConfig, entryId, updates) {
    const filePath = path.join(process.cwd(), this.basePath, `${sourceConfig.file}.json`);
    
    try {
      let data = JSON.parse(fs.readFileSync(filePath, "utf8"));
      
      if (Array.isArray(data)) {
        const entryIndex = data.findIndex(item => 
          item.id === entryId || 
          item.orderId === entryId || 
          item.batchId === entryId ||
          item.issueId === entryId
        );
        
        if (entryIndex !== -1) {
          data[entryIndex] = { ...data[entryIndex], ...updates, lastUpdated: new Date().toISOString() };
          fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
          logger.info(`Mock data updated: ${entryId} in ${sourceConfig.file}`);
          return data[entryIndex];
        }
      }
      
      throw new Error(`Entry ${entryId} not found`);
    } catch (error) {
      logger.error(`Mock data update failed: ${error.message}`);
      throw error;
    }
  }

  getName() {
    return "MockDataSource";
  }
}

// ========================================================================
// SAP API DATA SOURCE (Production)
// ========================================================================

/**
 * SAP API data source for production environments
 * Integrates with SAP OData APIs for real manufacturing data
 */
class SAPDataSource extends DataSource {
  /**
   * Initialize SAP API data source
   * @param {Object} config - SAP connection configuration
   */
  constructor(config) {
    super();
    this.baseUrl = config.baseUrl || process.env.SAP_API_BASE_URL;
    this.username = config.username || process.env.SAP_USERNAME;
    this.password = config.password || process.env.SAP_PASSWORD;
    this.client = config.client || process.env.SAP_CLIENT;
    this.timeout = config.timeout || 30000;
    this.defaultPlant = config.defaultPlant || process.env.SAP_DEFAULT_PLANT;
  }

  /**
   * Fetch data from SAP API endpoint
   * @param {Object} sourceConfig - SAP endpoint configuration
   * @returns {Promise<Object|Array>} SAP response data
   */
  async fetchData(sourceConfig) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      logger.warn(`SAP API request timeout after ${this.timeout}ms for ${sourceConfig.file}`);
    }, this.timeout);

    try {
      const url = this.buildSAPUrl(sourceConfig);
      logger.info(`Fetching SAP data from: ${url}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
          'sap-client': this.client,
          ...sourceConfig.headers
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`SAP API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const transformedData = this.transformSAPResponse(data, sourceConfig);
      
      const count = Array.isArray(transformedData) ? transformedData.length : Object.keys(transformedData).length;
      logger.info(`SAP data loaded: ${sourceConfig.file} (${count} entries)`);
      return transformedData;
      
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        logger.error(`SAP API timeout for ${sourceConfig.file} after ${this.timeout}ms`);
        throw new Error(`SAP API timeout after ${this.timeout}ms`);
      }
      logger.error(`SAP data fetch failed for ${sourceConfig.file}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Build complete SAP OData URL with filters and parameters
   * @param {Object} sourceConfig - Source configuration
   * @returns {string} Complete SAP URL
   */
  buildSAPUrl(sourceConfig) {
    let url = `${this.baseUrl}${sourceConfig.endpoint}`;
    const queryParams = new URLSearchParams();
    
    if (sourceConfig.staticParams) {
      Object.entries(sourceConfig.staticParams).forEach(([key, value]) => {
        const resolvedValue = this.resolveEnvironmentVariable(value);
        queryParams.append(key, resolvedValue);
      });
    }
    
    const filters = this.buildSAPFilters(sourceConfig);
    if (filters) queryParams.append('$filter', filters);
    if (sourceConfig.selectFields) queryParams.append('$select', sourceConfig.selectFields.join(','));
    if (sourceConfig.orderBy) queryParams.append('$orderby', sourceConfig.orderBy);
    if (sourceConfig.top) queryParams.append('$top', sourceConfig.top.toString());
    queryParams.append('$format', 'json');
    
    const queryString = queryParams.toString();
    return queryString ? `${url}?${queryString}` : url;
  }

  /**
   * Build SAP OData filter expressions
   * @param {Object} sourceConfig - Source configuration
   * @returns {string|null} Filter expression or null
   */
  buildSAPFilters(sourceConfig) {
    const filters = [];
    const plant = sourceConfig.plant || this.defaultPlant;
    if (plant) filters.push(`Plant eq '${plant}'`);
    if (sourceConfig.orderType) filters.push(`OrderType eq '${sourceConfig.orderType}'`);
    if (sourceConfig.mrpController) filters.push(`MRPController eq '${sourceConfig.mrpController}'`);
    return filters.length > 0 ? filters.join(' and ') : null;
  }

  /**
   * Resolve environment variables in configuration values
   * @param {string} value - Value that may contain environment variable references
   * @returns {string} Resolved value
   */
  resolveEnvironmentVariable(value) {
    if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
      const envVar = value.slice(2, -1);
      const [varName, defaultValue] = envVar.split(':');
      return process.env[varName] || defaultValue || value;
    }
    return value;
  }

  /**
   * Update data via SAP API (not implemented in this version)
   * @throws {Error} Always throws - SAP updates not implemented
   */
  async updateData() {
    throw new Error("SAPDataSource update not implemented in this version");
  }

  /**
   * Generate Basic Authentication header for SAP
   * @returns {string} Authorization header value
   */
  getAuthHeader() {
    const credentials = btoa(`${this.username}:${this.password}`);
    return `Basic ${credentials}`;
  }

  /**
   * Transform SAP OData response to normalized format
   * @param {Object} sapData - Raw SAP response
   * @param {Object} sourceConfig - Source configuration
   * @returns {Object|Array} Transformed data
   */
  transformSAPResponse(sapData, sourceConfig) {
    if (sourceConfig.transform && typeof sourceConfig.transform === 'function') {
      return sourceConfig.transform(sapData);
    }
    if (sapData.d && sapData.d.results) return sapData.d.results;
    if (sapData.value) return sapData.value;
    return sapData;
  }

  getName() {
    return "SAPDataSource";
  }
}

// ========================================================================
// REST API DATA SOURCE
// ========================================================================

/**
 * Generic REST API data source
 * Supports any REST API with JSON responses
 */
class RestAPIDataSource extends DataSource {
  /**
   * Initialize REST API data source
   * @param {Object} config - REST API configuration
   */
  constructor(config) {
    super();
    this.baseUrl = config.baseUrl;
    this.headers = config.headers || {};
    this.timeout = config.timeout || 15000;
  }

  /**
   * Fetch data from REST API endpoint
   * @param {Object} sourceConfig - API endpoint configuration
   * @returns {Promise<Object|Array>} API response data
   */
  async fetchData(sourceConfig) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      logger.warn(`REST API request timeout after ${this.timeout}ms for ${sourceConfig.file}`);
    }, this.timeout);

    try {
      const url = `${this.baseUrl}${sourceConfig.endpoint}`;
      logger.info(`Fetching REST API data from: ${url}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: { ...this.headers, ...sourceConfig.headers },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`REST API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      logger.info(`REST API data loaded: ${sourceConfig.file}`);
      return data;
      
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        logger.error(`REST API timeout for ${sourceConfig.file} after ${this.timeout}ms`);
        throw new Error(`REST API timeout after ${this.timeout}ms`);
      }
      logger.error(`REST API fetch failed for ${sourceConfig.file}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update data via REST API (not implemented in this version)
   * @throws {Error} Always throws - REST API updates not implemented
   */
  async updateData() {
    throw new Error("RestAPIDataSource update not implemented in this version");
  }

  getName() {
    return "RestAPIDataSource";
  }
}

// ========================================================================
// OEE MQTT DATA SOURCE (Real-time OEE from MQTT)
// ========================================================================

/**
 * OEE data source for real-time equipment effectiveness monitoring
 * Connects to MQTT broker to receive live production data
 */
class OEEDataSource extends DataSource {
  /**
   * Initialize OEE MQTT data source
   * @param {Object} config - MQTT connection configuration
   */
  constructor(config) {
    super();
    this.brokerUrl = config.brokerUrl || process.env.MQTT_BROKER_URL;
    this.topicBase = config.topicBase || process.env.MQTT_TOPIC_BASE || "plc";
    this.client = null;
    this.data = new Map(); // Map of production line -> latest OEE data
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 5000; // 5 seconds
    this.isConnecting = false;
    
    if (this.brokerUrl) {
      this.connect();
    } else {
      logger.warn("MQTT_BROKER_URL not configured, OEE integration disabled");
    }
  }

  /**
   * Establish MQTT connection and set up event handlers
   */
  connect() {
    if (this.isConnecting) {
      logger.debug("MQTT connection already in progress");
      return;
    }

    this.isConnecting = true;
    const options = {
      keepalive: 60,
      connectTimeout: 30 * 1000, // 30 seconds
      reconnectPeriod: 0, // Disable automatic reconnection, handle manually
    };

    // Configure authentication if credentials are provided
    if (process.env.MQTT_USER && process.env.MQTT_PASS) {
      options.username = process.env.MQTT_USER;
      options.password = process.env.MQTT_PASS;
      logger.info(`MQTT authentication configured for user: ${process.env.MQTT_USER}`);
    } else {
      logger.info("MQTT connecting without authentication");
    }

    this.client = mqtt.connect(this.brokerUrl, options);

    this.client.on("connect", () => {
      logger.info(`OEE MQTT connected to broker: ${this.brokerUrl}`);
      this.reconnectAttempts = 0;
      this.isConnecting = false;
      
      const topic = `${this.topicBase}/+/status`;
      logger.info(`Subscribing to MQTT topic: ${topic}`);
      this.client.subscribe(topic, (err) => {
        if (err) {
          logger.error(`MQTT subscription failed: ${err.message}`);
        } else {
          logger.info(`Successfully subscribed to ${topic}`);
        }
      });
    });

    this.client.on("message", (topic, message) => {
      try {
        const msgStr = message.toString();
        logger.debug(`MQTT message received on ${topic}: ${msgStr.substring(0, 100)}...`);
        
        if (!msgStr.startsWith("{") && !msgStr.startsWith("[")) {
          logger.warn(`Ignored non-JSON MQTT message on ${topic}`);
          return;
        }

        const payload = JSON.parse(msgStr);

        if (payload && payload.line && payload.metrics) {
          // Validate timestamp (max 5 minutes old)
          const dataAge = payload.timestamp ? 
            Date.now() - new Date(payload.timestamp).getTime() : 
            0;
            
          if (dataAge < 300000) { // 5 minutes
            const enrichedPayload = {
              ...payload,
              receivedAt: new Date().toISOString(),
              dataAge: Math.round(dataAge / 1000) // seconds
            };
            
            this.data.set(payload.line, enrichedPayload);
            logger.info(`OEE data updated for line: ${payload.line} (age: ${Math.round(dataAge/1000)}s, total lines: ${this.data.size})`);
          } else {
            logger.warn(`OEE data too old for line ${payload.line}: ${Math.round(dataAge/1000)}s`);
          }
        } else {
          logger.warn(`Invalid OEE payload structure on ${topic}`);
        }

      } catch (err) {
        logger.error(`MQTT message parsing failed on ${topic}: ${err.message}`);
      }
    });

    this.client.on("error", (err) => {
      logger.error(`OEE MQTT connection error: ${err.message}`);
      this.isConnecting = false;
    });

    this.client.on("close", () => {
      logger.warn("MQTT connection lost");
      this.isConnecting = false;
      this.scheduleReconnect();
    });

    this.client.on("offline", () => {
      logger.warn("MQTT client went offline");
      this.isConnecting = false;
    });

    this.client.on("disconnect", () => {
      logger.info("MQTT client disconnected");
      this.isConnecting = false;
    });
  }

  /**
   * Schedule MQTT reconnection with exponential backoff
   */
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error(`Max MQTT reconnection attempts (${this.maxReconnectAttempts}) reached. Giving up.`);
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 60000); // Max 1 minute
    
    logger.info(`Scheduling MQTT reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
    
    setTimeout(() => {
      if (!this.client || !this.client.connected) {
        logger.info(`Attempting MQTT reconnection (attempt ${this.reconnectAttempts})`);
        this.connect();
      }
    }, delay);
  }

  /**
   * Fetch current OEE data from MQTT cache
   * @returns {Promise<Array>} Array of current OEE data for all production lines
   */
  async fetchData() {
    const result = Array.from(this.data.values());
    logger.debug(`OEE data fetch: returning ${result.length} production lines`);
    return result;
  }

  /**
   * OEE data source is read-only
   * @throws {Error} Always throws - OEE data cannot be updated via this interface
   */
  async updateData() {
    throw new Error("OEEDataSource is read-only");
  }

  /**
   * Get connection status
   * @returns {Object} Connection status information
   */
  getConnectionStatus() {
    return {
      connected: this.client?.connected || false,
      reconnectAttempts: this.reconnectAttempts,
      dataPoints: this.data.size,
      brokerUrl: this.brokerUrl
    };
  }

  /**
   * Cleanup MQTT connection
   */
  cleanup() {
    if (this.client) {
      logger.info("Cleaning up MQTT connection...");
      this.client.end(true); // Force close
      this.client = null;
    }
    this.data.clear();
    this.isConnecting = false;
  }

  getName() {
    return "OEEDataSource";
  }
}

// ========================================================================
// DATA SOURCE FACTORY
// ========================================================================

/**
 * Factory class for creating data source instances
 * Supports multiple data source types with proper configuration
 */
class DataSourceFactory {
  /**
   * Create a data source instance based on type
   * @param {string} type - Type of data source (mock, sap, rest, oee)
   * @param {Object} config - Configuration object for the data source
   * @returns {DataSource} Configured data source instance
   * @throws {Error} If data source type is unknown
   */
  static createDataSource(type, config = {}) {
    switch (type.toLowerCase()) {
      case 'mock':
        return new MockDataSource(config.basePath);
      case 'sap':
        return new SAPDataSource(config);
      case 'rest':
        return new RestAPIDataSource(config);
      case 'oee':
        return new OEEDataSource(config);
      default:
        throw new Error(`Unknown data source type: ${type}`);
    }
  }
}

// ========================================================================
// ENHANCED DATA MANAGER
// ========================================================================

/**
 * Central data management system for pharmaceutical manufacturing
 * Coordinates multiple data sources and provides unified data access
 */
export class DataManager {
  /**
   * Initialize DataManager with configuration
   * @param {string} configPath - Path to data sources configuration file
   */
  constructor(configPath = "src/config/data-sources.yaml") {
    this.dataSources = new Map();      // Type -> DataSource instance
    this.dataCache = new Map();        // DataType -> Cached data
    this.sourceConfigs = new Map();    // DataType -> Source configuration
    this.configPath = configPath;
    
    logger.info("DataManager initialized");

    // Setup cleanup handlers
    this.setupCleanupHandlers();
  }

  /**
   * Setup cleanup handlers for graceful shutdown
   */
  setupCleanupHandlers() {
    const cleanup = () => {
      logger.info("Received shutdown signal, cleaning up data sources...");
      this.dataSources.forEach((source, type) => {
        try {
          if (source.cleanup) {
            logger.info(`Cleaning up ${type} data source`);
            source.cleanup();
          }
        } catch (error) {
          logger.error(`Error cleaning up ${type} data source: ${error.message}`);
        }
      });
    };

    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
    process.on('exit', cleanup);
  }

  /**
   * Load data source configuration from YAML file
   * Sets up data sources based on configuration or defaults
   */
  async loadDataSourceConfig() {
    try {
      const configFile = path.join(process.cwd(), this.configPath);
      if (!fs.existsSync(configFile)) {
        logger.info("No data source config found, using defaults");
        this.setDefaultConfig();
        return;
      }

      const yaml = await import('js-yaml');
      const config = yaml.load(fs.readFileSync(configFile, 'utf8'));
      
      for (const [dataType, sourceConfig] of Object.entries(config.dataSources)) {
        this.sourceConfigs.set(dataType, sourceConfig);
        if (!this.dataSources.has(sourceConfig.type)) {
          const dataSource = DataSourceFactory.createDataSource(sourceConfig.type, sourceConfig.config);
          this.dataSources.set(sourceConfig.type, dataSource);
        }
      }
      
      logger.info("Data source configuration loaded successfully");
      logger.info(`Configured data sources: ${Array.from(this.sourceConfigs.keys()).join(', ')}`);
      
    } catch (error) {
      logger.error(`Failed to load data source config: ${error.message}`);
      this.setDefaultConfig();
    }
  }

  /**
   * Set up default data source configuration
   * Uses mock data sources for all standard data types
   */
  setDefaultConfig() {
    const defaultSources = ["orders", "issues", "batches", "compliance", "bom", "inventory", "qa", "qa_events"];
    defaultSources.forEach(source => {
      this.sourceConfigs.set(source, {
        type: 'mock',
        file: source,
        config: { basePath: 'mock-data' }
      });
    });

    // Add OEE MQTT as default real-time source (only if broker URL is configured)
    if (process.env.MQTT_BROKER_URL) {
      this.sourceConfigs.set("oee", {
        type: "oee",
        config: {
          brokerUrl: process.env.MQTT_BROKER_URL,
          topicBase: process.env.MQTT_TOPIC_BASE || "plc"
        }
      });

      const oeeSource = DataSourceFactory.createDataSource('oee', {
        brokerUrl: process.env.MQTT_BROKER_URL,
        topicBase: process.env.MQTT_TOPIC_BASE || "plc"
      });
      this.dataSources.set('oee', oeeSource);
      logger.info("OEE MQTT source configured");
    } else {
      logger.warn("MQTT_BROKER_URL not set, OEE integration will be disabled");
    }

    const mockSource = DataSourceFactory.createDataSource('mock');
    this.dataSources.set('mock', mockSource);

    logger.info("Default data source configuration applied");
  }

  /**
   * Load all configured data sources into cache
   * Processes each configured data type and caches the results
   */
  async loadAllData() {
    logger.info("Loading data from all configured sources");
    for (const [dataType] of this.sourceConfigs.entries()) {
      try {
        await this.loadDataType(dataType);
      } catch (error) {
        logger.error(`Failed to load data type ${dataType}: ${error.message}`, {
          dataType,
          sourceType: this.sourceConfigs.get(dataType)?.type,
          error: error.stack
        });
      }
    }
    logger.info(`Data loading completed. Cached data types: ${Array.from(this.dataCache.keys()).join(', ')}`);
  }

  /**
   * Load data for a specific data type
   * @param {string} dataType - Type of data to load (e.g., 'orders', 'batches')
   * @returns {Promise<Object|Array|null>} Loaded data or null if failed
   */
  async loadDataType(dataType) {
    const sourceConfig = this.sourceConfigs.get(dataType);
    if (!sourceConfig) throw new Error(`No source configuration for data type: ${dataType}`);
    
    const dataSource = this.dataSources.get(sourceConfig.type);
    if (!dataSource) throw new Error(`No data source available for type: ${sourceConfig.type}`);
    
    const data = await dataSource.fetchData(sourceConfig);
    if (data !== null) {
      this.dataCache.set(dataType, data);
      logger.info(`Data cached: ${dataType} from ${dataSource.getName()}`);
    }
    return data;
  }

  /**
   * Get cached data with optional refresh
   * @param {string} dataType - Type of data to retrieve
   * @param {boolean} forceRefresh - Whether to force reload from source
   * @returns {Promise<Object|Array|null>} Cached or freshly loaded data
   */
  async getCachedData(dataType, forceRefresh = false) {
    if (forceRefresh || !this.dataCache.has(dataType)) {
      await this.loadDataType(dataType);
    }
    return this.dataCache.get(dataType) || null;
  }

  /**
   * Get all available data from cache
   * Used for providing complete context to LLM queries
   * @returns {Object} Object containing all cached data
   */
  getAllAvailableData() {
    const allData = {};
    
    // Collect all cached data
    this.dataCache.forEach((data, key) => {
      if (data) {
        allData[key] = data;
      }
    });

    logger.info(`getAllAvailableData: Returning ${Object.keys(allData).length} data sets`);
    return allData;
  }

  /**
   * Update a specific data entry
   * @param {string} dataType - Type of data to update
   * @param {string} entryId - ID of the entry to update
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} Updated entry
   */
  async updateDataEntry(dataType, entryId, updates) {
    const sourceConfig = this.sourceConfigs.get(dataType);
    if (!sourceConfig) throw new Error(`No source configuration for data type: ${dataType}`);
    
    const dataSource = this.dataSources.get(sourceConfig.type);
    if (!dataSource) throw new Error(`No data source available for type: ${sourceConfig.type}`);
    
    try {
      const result = await dataSource.updateData(sourceConfig, entryId, updates);
      await this.loadDataType(dataType); // Refresh cache
      logger.info(`Data entry updated: ${entryId} in ${dataType}`);
      return result;
    } catch (error) {
      logger.error(`Failed to update data entry ${entryId} in ${dataType}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get production orders enriched with OEE data
   * Combines order data with real-time equipment effectiveness metrics
   * @returns {Promise<Array>} Orders with associated OEE data
   */
  async getOrdersWithOEE() {
    const orders = (await this.getCachedData("orders", true)) || [];
    const oeeData = (await this.getCachedData("oee", true)) || [];

    if (!Array.isArray(orders)) {
      logger.warn("Orders data is not an array, normalizing to empty array");
      return [];
    }  

    return orders.map(order => {
      // Extract work center from order operations
      const opWithWorkCenter = order.operations?.find(op => op.workCenter) || null;
      const workCenter = opWithWorkCenter ? opWithWorkCenter.workCenter : "UNKNOWN";

      // Find matching OEE data for this work center
      const oeeMatch = oeeData.find(o => o.line === workCenter);

      return {
        ...order,
        workCenter,
        oee: oeeMatch || { status: "no-data", metrics: {} }
      };
    });
  }

  /**
   * Get real-time OEE data directly from MQTT source
   * Enhanced with data freshness filtering
   * @returns {Array} Current OEE data for all production lines
   */
  getRealtimeOEEData() {
    const oeeSource = this.dataSources.get('oee');
    if (oeeSource && oeeSource.data && oeeSource.client?.connected) {
      const data = Array.from(oeeSource.data.values());
      
      // Filter out stale data (older than 10 minutes)
      const freshData = data.filter(item => {
        if (!item.receivedAt) return true; // Legacy data without timestamp
        const age = Date.now() - new Date(item.receivedAt).getTime();
        return age < 600000; // 10 minutes
      });
      
      if (freshData.length !== data.length) {
        logger.debug(`Filtered OEE data: ${freshData.length}/${data.length} fresh lines (removed ${data.length - freshData.length} stale entries)`);
      }
      
      logger.debug(`Real-time OEE data: ${freshData.length} production lines`);
      return freshData;
    }
    
    logger.warn("OEE DataSource not available or disconnected");
    return [];
  }

  /**
   * Get OEE connection status
   * @returns {Object} OEE data source connection information
   */
  getOEEConnectionStatus() {
    const oeeSource = this.dataSources.get('oee');
    if (oeeSource && oeeSource.getConnectionStatus) {
      return oeeSource.getConnectionStatus();
    }
    return {
      connected: false,
      reconnectAttempts: 0,
      dataPoints: 0,
      brokerUrl: 'Not configured'
    };
  }

  /**
   * Extract filename from file path
   * @param {string} source - File path or source identifier
   * @returns {string} Filename without extension
   */
  extractFileName(source) {
    return path.basename(source, '.json');
  }

  /**
   * Get list of all loaded data types
   * @returns {Array<string>} Array of cached data type names
   */
  getLoadedDataKeys() {
    return Array.from(this.dataCache.keys());
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
        type: Array.isArray(data) ? 'array' : 'object',
        entries: Array.isArray(data) ? data.length : Object.keys(data).length,
        source: sourceConfig ? sourceConfig.type : 'unknown',
        sample: Array.isArray(data) ? data[0] : Object.keys(data).slice(0, 3),
        lastUpdate: this.getDataLastUpdate(data)
      };
    });
    
    // Add OEE connection status
    stats.oee_connection = this.getOEEConnectionStatus();
    
    return stats;
  }

  /**
   * Get last update timestamp for data
   * @param {Object|Array} data - Data to check for timestamps
   * @returns {string} Last update timestamp or 'unknown'
   */
  getDataLastUpdate(data) {
    if (Array.isArray(data) && data.length > 0) {
      // Check for receivedAt (OEE data) or lastUpdated fields
      const timestamps = data
        .map(item => item.receivedAt || item.lastUpdated || item.timestamp)
        .filter(ts => ts)
        .sort()
        .reverse();
      
      return timestamps[0] || 'unknown';
    }
    return 'unknown';
  }

  /**
   * Reload all data from sources
   * Clears cache and reloads all configured data sources
   * @returns {Promise<boolean>} Success status
   */
  async reloadData() {
    try {
      this.dataCache.clear();
      await this.loadDataSourceConfig();
      await this.loadAllData();
      logger.info("Data reload completed successfully");
      return true;
    } catch (error) {
      logger.error(`Data reload failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Get comprehensive data overview
   * @param {boolean} includeFullData - Whether to include actual data in response
   * @returns {Object} Overview of all loaded data
   */
  getDataOverview(includeFullData = false) {
    const summary = Array.from(this.dataCache.entries()).map(([key, data]) => {
      const sourceConfig = this.sourceConfigs.get(key);
      return {
        file: key,
        source: sourceConfig ? sourceConfig.type : 'unknown',
        entries: Array.isArray(data) ? data.length : Object.keys(data).length,
        sample: Array.isArray(data) ? data[0] : Object.keys(data).slice(0, 3),
        lastUpdate: this.getDataLastUpdate(data)
      };
    });
    
    return {
      loaded: Array.from(this.dataCache.keys()),
      summary,
      oeeConnection: this.getOEEConnectionStatus(),
      fullData: includeFullData ? Object.fromEntries(this.dataCache) : 'Use ?full=true to see all data',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Validate data integrity
   * Checks if all required data types are loaded and available
   * @param {Array<string>} requiredFiles - List of required data types
   * @returns {Object} Validation results
   */
  validateDataIntegrity(requiredFiles = ['orders', 'issues', 'batches', 'compliance', 'oee']) {
    const missing = requiredFiles.filter(file => !this.dataCache.has(file));
    const isValid = missing.length === 0;
    
    // Check OEE data freshness if required
    let oeeStatus = 'not_required';
    if (requiredFiles.includes('oee')) {
      const oeeData = this.getRealtimeOEEData();
      if (oeeData.length === 0) {
        oeeStatus = 'no_data';
      } else {
        const oldestData = Math.max(...oeeData.map(d => {
          if (!d.receivedAt) return 0;
          return Date.now() - new Date(d.receivedAt).getTime();
        }));
        oeeStatus = oldestData < 300000 ? 'fresh' : 'stale'; // 5 minutes
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
      oeeConnection: this.getOEEConnectionStatus(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Refresh OEE cache (for compatibility)
   * @returns {boolean} Success status
   */
  refreshOEECache() {
    try {
      // OEE data is real-time via MQTT, no manual refresh needed
      logger.info('OEE data is real-time via MQTT, no manual refresh required');
      return true;
    } catch (error) {
      logger.warn(`OEE cache refresh failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Compatibility helper for legacy agent configuration
   * Maps agent dataSource configuration to cached data
   * @param {Object} agentConfig - Agent configuration with dataSource array
   * @returns {Object} Object containing requested data sets
   */
  getMockDataForAgent(agentConfig) {
    const results = {};

    if (!agentConfig?.dataSource) {
      return results;
    }

    agentConfig.dataSource.forEach(src => {
      try {
        // Extract key from path (e.g., "mock-data/orders.json" -> "orders")
        const key = this.extractFileName(src.replace(/^mock-data\//, ''));
        const data = this.dataCache.get(key);
        if (data) {
          results[key] = data;
        }
      } catch (err) {
        logger.warn(`Could not load data for agent source ${src}: ${err.message}`);
      }
    });

    return results;
  }

  /**
   * Health check for data manager
   * @returns {Object} Health status of all data sources
   */
  getHealthStatus() {
    const health = {
      status: 'healthy',
      dataSources: {},
      dataCache: {
        totalTypes: this.dataCache.size,
        types: Array.from(this.dataCache.keys())
      },
      timestamp: new Date().toISOString()
    };

    // Check each data source
    this.dataSources.forEach((source, type) => {
      health.dataSources[type] = {
        name: source.getName(),
        status: 'unknown'
      };

      if (type === 'oee' && source.getConnectionStatus) {
        const connStatus = source.getConnectionStatus();
        health.dataSources[type] = {
          ...health.dataSources[type],
          ...connStatus,
          status: connStatus.connected ? 'connected' : 'disconnected'
        };
        
        if (!connStatus.connected) {
          health.status = 'degraded';
        }
      } else {
        health.dataSources[type].status = 'available';
      }
    });

    return health;
  }

  /**
   * ========================================================================
   * OEE HISTORY INTEGRATION - NEW METHODS
   * ========================================================================
   */

  /**
   * Lädt OEE History aus der vom Simulator erstellten JSON-Datei
   * @returns {Promise<Object>} OEE History Daten
   */
  async loadOEEHistory() {
    try {
      const historyPath = path.join(process.cwd(), 'data', 'oee_history.json');
      
      if (fs.existsSync(historyPath)) {
        const historyData = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
        
        // Cache die History-Daten
        this.dataCache.set('oee_history', historyData);
        
        logger.info(`✅ Loaded ${Object.keys(historyData).length} OEE history entries from file`);
        return historyData;
      } else {
        logger.info(`⚠️ OEE history file not found at: ${historyPath}`);
        return {};
      }
    } catch (error) {
      logger.error(`❌ Error loading OEE history: ${error.message}`);
      return {};
    }
  }

  /**
   * Konvertiert OEE History JSON zu API-Format
   * @param {number} limit - Maximum Anzahl von Einträgen
   * @param {string} lineId - Optional: Filter für spezifische Linie
   * @returns {Promise<Array>} Formatierte OEE History
   */
  async getOEEHistoryForAPI(limit = 100, lineId = null) {
    try {
      // Lade aktuellste History
      const historyData = await this.loadOEEHistory();
      
      if (!historyData || Object.keys(historyData).length === 0) {
        logger.info('📊 No OEE history data available, generating mock data');
        return this.generateMockOEEHistory(limit, lineId);
      }
      
      // Konvertiere JSON-Struktur zu Array
      const historyArray = [];
      
      for (const [line, entries] of Object.entries(historyData)) {
        if (lineId && line !== lineId) continue;
        
        if (Array.isArray(entries)) {
          entries.forEach(entry => {
            historyArray.push({
              timestamp: entry.timestamp,
              lineId: line,
              lineName: `Production Line ${line.split('-')[1]}`,
              oee: entry.metrics?.oee || 0,
              availability: entry.metrics?.availability || 0,
              performance: entry.metrics?.performance || 0,
              quality: entry.metrics?.quality || 0,
              status: entry.status || 'unknown',
              batchId: entry.batchId || 'N/A',
              eventType: 'oee_update',
              source: 'simulator_file',
              counters: entry.counters || {},
              parameters: entry.parameters || {},
              alarms: entry.alarms || []
            });
          });
        }
      }
      
      // Sortiere nach Timestamp (neueste zuerst) und limitiere
      const sortedHistory = historyArray
        .toSorted((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, limit);
      
      logger.info(`✅ Converted ${sortedHistory.length} OEE history records from simulator file`);
      return sortedHistory;
      
    } catch (error) {
      logger.error(`❌ Error processing OEE history for API: ${error.message}`);
      return this.generateMockOEEHistory(limit, lineId);
    }
  }

  /**
   * Fallback: Mock OEE History Generator
   * @param {number} limit - Anzahl der zu generierenden Einträge
   * @param {string} lineId - Optional: Spezifische Linie
   * @returns {Array} Mock OEE History Daten
   */
  generateMockOEEHistory(limit, lineId) {
    const lines = lineId ? [lineId] : ['LINE-01', 'LINE-02', 'LINE-03'];
    const history = [];
    
    logger.info(`🔧 Generating ${limit} mock OEE records for lines: ${lines.join(', ')}`);
    
    for (let i = 0; i < limit; i++) {
      const selectedLine = lines[i % lines.length];
      const minutesAgo = i * 3;
      const timeOffset = Date.now() - (minutesAgo * 60000);
      
      // Realistische OEE-Werte mit Trends
      const baseOEE = 85 + (Math.sin(i / 10) * 10);
      const baseAvail = 92 + (Math.sin(i / 15) * 5);
      const basePerf = 88 + (Math.cos(i / 12) * 8);
      const baseQual = 96 + (Math.sin(i / 20) * 3);
      
      history.push({
        timestamp: new Date(timeOffset).toISOString(),
        lineId: selectedLine,
        lineName: `Production Line ${selectedLine.split('-')[1]}`,
        oee: Math.round((baseOEE + (Math.random() - 0.5) * 4) * 100) / 100,
        availability: Math.round((baseAvail + (Math.random() - 0.5) * 3) * 100) / 100,
        performance: Math.round((basePerf + (Math.random() - 0.5) * 5) * 100) / 100,
        quality: Math.round((baseQual + (Math.random() - 0.5) * 2) * 100) / 100,
        status: Math.random() > 0.9 ? 'maintenance' : 'running',
        eventType: 'oee_update',
        source: 'mock_generator',
        batchId: `BATCH-${Math.floor(Math.random() * 1000)}`,
        product: this.getRandomProduct(),
        shift: this.getShift(timeOffset),
        operator: this.getRandomOperator()
      });
    }
    
    return history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  /**
   * Helper: Bestimme Schicht basierend auf Zeitstempel
   * @param {number} timestamp - Zeitstempel
   * @returns {string} Schicht-Bezeichnung
   */
  getShift(timestamp) {
    const hour = new Date(timestamp).getHours();
    if (hour >= 6 && hour < 14) return 'Day Shift';
    if (hour >= 14 && hour < 22) return 'Evening Shift';
    return 'Night Shift';
  }

  /**
   * Helper: Zufälliges Produkt
   * @returns {string} Produkt-Name
   */
  getRandomProduct() {
    const products = ['Aspirin 500mg', 'Ibuprofen 200mg', 'Paracetamol 250mg', 'Vitamin C 1000mg'];
    return products[Math.floor(Math.random() * products.length)];
  }

  /**
   * Helper: Zufälliger Operator
   * @returns {string} Operator-Name
   */
  getRandomOperator() {
    const operators = ['Mueller_A', 'Schmidt_B', 'Weber_C', 'Fischer_D', 'Meyer_E'];
    return operators[Math.floor(Math.random() * operators.length)];
  }

  /**
   * Cleanup all data sources
   */
  cleanup() {
    logger.info("DataManager cleanup initiated");
    this.dataSources.forEach((source, type) => {
      try {
        if (source.cleanup) {
          logger.info(`Cleaning up ${type} data source`);
          source.cleanup();
        }
      } catch (error) {
        logger.error(`Error cleaning up ${type} data source: ${error.message}`);
      }
    });
    this.dataCache.clear();
    logger.info("DataManager cleanup completed");
  }
}

export default DataManager;