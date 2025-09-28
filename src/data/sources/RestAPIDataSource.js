/**
 * ========================================================================
 * REST API DATA SOURCE
 * ========================================================================
 *
 * Generic REST API integration.
 * Works with any JSON REST endpoint.
 *
 * Features:
 * - Configurable baseUrl + headers
 * - Timeout handling
 * - Fetch with AbortController
 * - Read-only mode (no update implemented yet)
 *
 * Author: Markus Schmeckenbecher
 * Version: 1.0
 * ========================================================================
 */

import logger from "../../utils/logger.js";
import DataSource from "./DataSource.js";

class RestAPIDataSource extends DataSource {
  /**
   * Initialize REST API data source
   * @param {Object} config - REST API configuration
   */
  constructor(config = {}) {
    super();
    this.baseUrl = config.baseUrl || "";
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
      logger.warn(
        `⏱️ REST API request timeout after ${this.timeout}ms for ${sourceConfig.file}`
      );
    }, this.timeout);

    try {
      const url = `${this.baseUrl}${sourceConfig.endpoint}`;
      logger.info(`🌐 Fetching REST API data from: ${url}`);

      const response = await fetch(url, {
        method: "GET",
        headers: { ...this.headers, ...sourceConfig.headers },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(
          `REST API error: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      logger.info(`✅ REST API data loaded: ${sourceConfig.file}`);
      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === "AbortError") {
        logger.error(
          `⏱️ REST API timeout for ${sourceConfig.file} after ${this.timeout}ms`
        );
        throw new Error(`REST API timeout after ${this.timeout}ms`);
      }
      logger.error(
        `❌ REST API fetch failed for ${sourceConfig.file}: ${error.message}`
      );
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

export default RestAPIDataSource;
