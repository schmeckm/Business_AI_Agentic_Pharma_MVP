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
 * 
 * Features:
 * - Configurable data sources via YAML
 * - Automatic caching and refresh mechanisms
 * - Real-time OEE data integration via MQTT
 * - SAP API integration with authentication
 * - Error handling and logging with Winston
 * - Data validation and integrity checks
 * 
 * @author Markus Schmeckenbecher
 * @version 1.4.1
 * @since 2024
 * ========================================================================
 */

import fs from "fs";
import path from "path";
import mqtt from "mqtt";
import logger from "../utils/logger.js";

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
        timeout: this.timeout
      });

      if (!response.ok) {
        throw new Error(`SAP API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const transformedData = this.transformSAPResponse(data, sourceConfig);
      
      const count = Array.isArray(transformedData) ? transformedData.length : Object.keys(transformedData).length;
      logger.info(`SAP data loaded: ${sourceConfig.file} (${count} entries)`);
      return transformedData;
      
    } catch (error) {
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
    try {
      const url = `${this.baseUrl}${sourceConfig.endpoint}`;
      logger.info(`Fetching REST API data from: ${url}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: { ...this.headers, ...sourceConfig.headers },
        timeout: this.timeout
      });

      if (!response.ok) {
        throw new Error(`REST API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      logger.info(`REST API data loaded: ${sourceConfig.file}`);
      return data;
      
    } catch (error) {
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
    this.connect();
  }

  /**
   * Establish MQTT connection and set up event handlers
   */
  connect() {
    const options = {};

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
      const topic = `${this.topicBase}/+/status`;
      logger.info(`Subscribing to MQTT topic: ${topic}`);
      this.client.subscribe(topic);
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
          this.data.set(payload.line, payload);
          logger.info(`OEE data updated for production line: ${payload.line} (total lines: ${this.data.size})`);
        } else {
          logger.warn(`Invalid OEE payload structure on ${topic}`);
        }

      } catch (err) {
        logger.error(`MQTT message parsing failed on ${topic}: ${err.message}`);
      }
    });

    this.client.on("error", (err) => {
      logger.error(`OEE MQTT connection error: ${err.message}`);
    });
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
    const defaultSources = ['orders', 'issues', 'batches', 'compliance', 'bom', 'inventory', 'qa'];
    defaultSources.forEach(source => {
      this.sourceConfigs.set(source, {
        type: 'mock',
        file: source,
        config: { basePath: 'mock-data' }
      });
    });

    // Add OEE MQTT as default real-time source
    this.sourceConfigs.set("oee", {
      type: "oee",
      config: {
        brokerUrl: process.env.MQTT_BROKER_URL,
        topicBase: process.env.MQTT_TOPIC_BASE || "plc"
      }
    });

    const mockSource = DataSourceFactory.createDataSource('mock');
    this.dataSources.set('mock', mockSource);

    const oeeSource = DataSourceFactory.createDataSource('oee', {
      brokerUrl: process.env.MQTT_BROKER_URL,
      topicBase: process.env.MQTT_TOPIC_BASE || "plc"
    });
    this.dataSources.set('oee', oeeSource);

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
        logger.error(`Failed to load data type ${dataType}: ${error.message}`);
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
   * @returns {Array} Current OEE data for all production lines
   */
  getRealtimeOEEData() {
    const oeeSource = this.dataSources.get('oee');
    if (oeeSource && oeeSource.data) {
      const data = Array.from(oeeSource.data.values());
      logger.info(`Real-time OEE data: ${data.length} production lines`);
      return data;
    }
    logger.warn("OEE DataSource not available for real-time access");
    return [];
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
        sample: Array.isArray(data) ? data[0] : Object.keys(data).slice(0, 3)
      };
    });
    return stats;
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
        sample: Array.isArray(data) ? data[0] : Object.keys(data).slice(0, 3)
      };
    });
    
    return {
      loaded: Array.from(this.dataCache.keys()),
      summary,
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
    
    return {
      isValid,
      missing,
      loaded: Array.from(this.dataCache.keys()),
      sources: Object.fromEntries(
        Array.from(this.sourceConfigs.entries()).map(([key, config]) => [key, config.type])
      ),
      timestamp: new Date().toISOString()
    };
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
}

export default DataManager;