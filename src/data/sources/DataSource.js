/**
 * ========================================================================
 * ABSTRACT DATA SOURCE BASE CLASS
 * ========================================================================
 * 
 * Defines the interface that all data sources (Mock, SAP, REST, OEE) 
 * must implement. Provides a consistent API for the DataManager.
 * 
 * Features:
 * - fetchData (required)
 * - updateData (required)
 * - getName (required)
 * - cleanup (optional)
 * 
 * Author: Markus Schmeckenbecher
 * Version: 1.0
 * ========================================================================
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

export default DataSource;
