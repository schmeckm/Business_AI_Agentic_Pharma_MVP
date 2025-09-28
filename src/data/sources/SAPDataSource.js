/**
 * ========================================================================
 * SAP API DATA SOURCE
 * ========================================================================
 * 
 * For production environments.
 * Integrates with SAP OData APIs for real manufacturing data.
 * 
 * Features:
 * - Configurable via .env or constructor config
 * - Supports query params, filters, and selects
 * - Handles timeouts and AbortController
 * - Transforms SAP responses to normalized JSON
 * 
 * Author: Markus Schmeckenbecher
 * Version: 1.0
 * ========================================================================
 */

import logger from "../../utils/logger.js";
import DataSource from "./DataSource.js";

class SAPDataSource extends DataSource {
  /**
   * Initialize SAP API data source
   * @param {Object} config - SAP connection configuration
   */
  constructor(config = {}) {
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
      logger.info(`🌐 Fetching SAP data from: ${url}`);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: this.getAuthHeader(),
          "Content-Type": "application/json",
          "sap-client": this.client,
          ...sourceConfig.headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`SAP API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const transformedData = this.transformSAPResponse(data, sourceConfig);

      const count = Array.isArray(transformedData)
        ? transformedData.length
        : Object.keys(transformedData).length;

      logger.info(`✅ SAP data loaded: ${sourceConfig.file} (${count} entries)`);
      return transformedData;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === "AbortError") {
        logger.error(`⏱️ SAP API timeout for ${sourceConfig.file} after ${this.timeout}ms`);
        throw new Error(`SAP API timeout after ${this.timeout}ms`);
      }
      logger.error(`❌ SAP data fetch failed for ${sourceConfig.file}: ${error.message}`);
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
    if (filters) queryParams.append("$filter", filters);
    if (sourceConfig.selectFields) queryParams.append("$select", sourceConfig.selectFields.join(","));
    if (sourceConfig.orderBy) queryParams.append("$orderby", sourceConfig.orderBy);
    if (sourceConfig.top) queryParams.append("$top", sourceConfig.top.toString());
    queryParams.append("$format", "json");

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
    return filters.length > 0 ? filters.join(" and ") : null;
  }

  /**
   * Resolve environment variables in configuration values
   * @param {string} value - Value that may contain environment variable references
   * @returns {string} Resolved value
   */
  resolveEnvironmentVariable(value) {
    if (typeof value === "string" && value.startsWith("${") && value.endsWith("}")) {
      const envVar = value.slice(2, -1);
      const [varName, defaultValue] = envVar.split(":");
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
    const credentials = Buffer.from(`${this.username}:${this.password}`).toString("base64");
    return `Basic ${credentials}`;
  }

  /**
   * Transform SAP OData response to normalized format
   * @param {Object} sapData - Raw SAP response
   * @param {Object} sourceConfig - Source configuration
   * @returns {Object|Array} Transformed data
   */
  transformSAPResponse(sapData, sourceConfig) {
    if (sourceConfig.transform && typeof sourceConfig.transform === "function") {
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

export default SAPDataSource;
