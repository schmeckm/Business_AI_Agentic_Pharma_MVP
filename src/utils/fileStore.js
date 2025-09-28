// src/utils/fileStore.js
import fs from "fs";
import path from "path";
import logger from "./logger.js";

const dataFile = path.join(process.cwd(), "oee_history.json");

export function saveOEE(line, payload) {
  try {
    let history = [];
    if (fs.existsSync(dataFile)) {
      const raw = fs.readFileSync(dataFile, "utf-8");
      history = JSON.parse(raw);
    }

    // Store all key metrics and counters
    history.push({
      line,
      status: payload.status,
      batchId: payload.batchId,
      counters: {
        plannedProductionTime: payload.counters.plannedProductionTime,
        operatingTime: payload.counters.operatingTime,
        goodCount: payload.counters.goodCount,
        badCount: payload.counters.badCount,
      },
      metrics: {
        availability: payload.metrics.availability,
        performance: payload.metrics.performance,
        quality: payload.metrics.quality,
        oee: payload.metrics.oee,
      },
      parameters: {
        temperature: payload.parameters.temperature,
        pressure: payload.parameters.pressure,
      },
      alarms: payload.alarms,
      timestamp: payload.timestamp,
    });

    fs.writeFileSync(dataFile, JSON.stringify(history, null, 2));

    if (history.length === 1) {
      logger.info(`💾 Created new OEE history file: ${dataFile}`);
    } else {
      logger.debug(`💾 Appended OEE record for line ${line}`);
    }
  } catch (err) {
    logger.error("❌ Failed to persist OEE: " + err.message);
  }
}
