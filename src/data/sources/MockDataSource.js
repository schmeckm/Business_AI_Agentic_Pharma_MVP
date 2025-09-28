/**
 * ========================================================================
 * MOCK DATA SOURCE
 * ========================================================================
 * 
 * Used for development and testing.
 * Reads and updates local JSON files located in the mock-data folder.
 * 
 * Features:
 * - Load JSON files by filename
 * - Update entries in JSON arrays
 * - Auto-create `lastUpdated` timestamps
 * - Safe error handling & logging
 * 
 * Author: Markus Schmeckenbecher
 * Version: 1.0
 * ========================================================================
 */

import fs from "fs";
import path from "path";
import logger from "../../utils/logger.js";
import DataSource from "./DataSource.js";

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
      logger.info(`📂 Mock data loaded: ${sourceConfig.file}.json (${count} entries)`);
      return data;
    } catch (error) {
      logger.error(`❌ Failed to load mock file ${sourceConfig.file}: ${error.message}`);
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
        const entryIndex = data.findIndex(
          (item) =>
            item.id === entryId ||
            item.orderId === entryId ||
            item.batchId === entryId ||
            item.issueId === entryId
        );

        if (entryIndex !== -1) {
          data[entryIndex] = {
            ...data[entryIndex],
            ...updates,
            lastUpdated: new Date().toISOString(),
          };
          fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
          logger.info(`✏️ Mock data updated: ${entryId} in ${sourceConfig.file}`);
          return data[entryIndex];
        }
      }

      throw new Error(`Entry ${entryId} not found`);
    } catch (error) {
      logger.error(`❌ Mock data update failed: ${error.message}`);
      throw error;
    }
  }

  getName() {
    return "MockDataSource";
  }
}

export default MockDataSource;
