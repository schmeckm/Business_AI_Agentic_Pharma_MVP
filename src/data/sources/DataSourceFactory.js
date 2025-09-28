/**
 * ========================================================================
 * DATA SOURCE FACTORY
 * ========================================================================
 *
 * Creates data source instances based on type.
 * Supports:
 * - MockDataSource
 * - SAPDataSource
 * - RestAPIDataSource
 * - OEEDataSource
 *
 * Author: Markus Schmeckenbecher
 * Version: 1.0
 * ========================================================================
 */

import MockDataSource from "./MockDataSource.js";
import SAPDataSource from "./SAPDataSource.js";
import RestAPIDataSource from "./RestAPIDataSource.js";
import OEEDataSource from "./OEEDataSource.js";

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
      case "mock":
        return new MockDataSource(config.basePath);
      case "sap":
        return new SAPDataSource(config);
      case "rest":
        return new RestAPIDataSource(config);
      case "oee":
        return new OEEDataSource(config);
      default:
        throw new Error(`Unknown data source type: ${type}`);
    }
  }
}

export default DataSourceFactory;
