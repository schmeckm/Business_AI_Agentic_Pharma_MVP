/**
 * ========================================================================
 * OEE Simulator Service
 * ========================================================================
 * Simulates production line metrics and publishes them via MQTT.
 * Additionally, periodically persists OEE metrics and counters into a JSON file
 * (oee_history.json) for later analysis.
 *
 * Controlled entirely via .env settings:
 *  - OEE_INTERVAL_MS:    Publish interval (default: 5000 ms)
 *  - PERSIST_INTERVAL_MS:Persist interval for history file (default: 60000 ms)
 *  - OEE_LINES:          Comma-separated list of production lines (default: LINE-01)
 *  - MQTT_BROKER_URL:    Broker URL (default: mqtt://localhost:1883)
 *  - MQTT_TOPIC_BASE:    Base topic for MQTT messages (default: plc)
 *
 * Author: Markus Schmeckenbecher
 * Version: 1.0
 * ========================================================================
 */

import mqtt from "mqtt";
import logger from "../utils/logger.js";
import { saveOEE } from "../utils/fileStore.js";

export class OEESimulator {
  constructor(config) {
    this.brokerUrl = config.MQTT_BROKER_URL;
    this.topicBase = config.MQTT_TOPIC_BASE || "plc";
    this.lines = (config.OEE_LINES || "LINE-01").split(",");
    this.intervalMs = parseInt(config.OEE_INTERVAL_MS || "5000", 10);       // Publish interval
    this.persistIntervalMs = parseInt(config.PERSIST_INTERVAL_MS || "60000", 10); // Persist interval

    this.client = null;
    this.lineData = {};
    this.states = ["idle", "running", "stopped", "error"];

    this.lastPersist = 0; // Timestamp of last persist
  }

  /**
   * Connect to MQTT and start simulation
   */
  async start() {
    return new Promise((resolve, reject) => {
      this.client = mqtt.connect(this.brokerUrl);

      this.client.on("connect", () => {
        logger.info(`✅ OEE Simulator connected to MQTT broker: ${this.brokerUrl}`);

        // Initialize each line with base counters
        this.lines.forEach((line, index) => {
          this.lineData[line] = {
            batchCounter: 100 + index,
            plannedProductionTime: 0,
            operatingTime: 0,
            goodCount: 0,
            badCount: 0,
            idealCycleTime: 1,
            cycleCount: 0,
          };
        });

        // Start publishing on interval
        this.timer = setInterval(() => this.publishOEE(), this.intervalMs);

        resolve();
      });

      this.client.on("error", (err) => {
        logger.error("❌ OEE Simulator MQTT Error: " + err.message);
        reject(err);
      });
    });
  }

  /**
   * Stop simulation gracefully
   */
  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.client) this.client.end();
    logger.info("🛑 OEE Simulator stopped");
  }

  /**
   * Publish OEE updates for all lines
   */
  publishOEE() {
    const now = Date.now();
    const doPersist = now - this.lastPersist >= this.persistIntervalMs;

    this.lines.forEach((line) => {
      const data = this.lineData[line];
      data.plannedProductionTime += 1;
      data.cycleCount += 1;

      // Random state simulation
      const state = this.states[Math.floor(Math.random() * this.states.length)];

      if (state === "running") {
        data.operatingTime += 1;
        const produced = Math.floor(Math.random() * 3) + 1;
        const rejects = Math.random() < 0.1 ? 1 : 0;

        data.goodCount += produced - rejects;
        data.badCount += rejects;
      }

      // Simulate batch change
      if (data.cycleCount >= 20 + Math.floor(Math.random() * 10)) {
        logger.info(`🔄 ${line} starting new batch...`);
        data.batchCounter += 1;
        data.plannedProductionTime = 0;
        data.operatingTime = 0;
        data.goodCount = 0;
        data.badCount = 0;
        data.cycleCount = 0;
      }

      // --- OEE Calculation ---
      const availability =
        data.plannedProductionTime > 0
          ? data.operatingTime / data.plannedProductionTime
          : 0;

      const performance =
        data.operatingTime > 0
          ? (data.goodCount + data.badCount) /
            (data.operatingTime * (1 / data.idealCycleTime))
          : 0;

      const cappedPerformance = Math.min(performance, 1.0);

      const quality =
        data.goodCount + data.badCount > 0
          ? data.goodCount / (data.goodCount + data.badCount)
          : 0;

      const oee = availability * cappedPerformance * quality * 100;

      const payload = {
        line,
        status: state,
        batchId: `BATCH-${data.batchCounter}`,
        counters: {
          plannedProductionTime: data.plannedProductionTime,
          operatingTime: data.operatingTime,
          goodCount: data.goodCount,
          badCount: data.badCount,
        },
        metrics: {
          availability: parseFloat((availability * 100).toFixed(2)),
          performance: parseFloat((performance * 100).toFixed(2)),
          quality: parseFloat((quality * 100).toFixed(2)),
          oee: parseFloat(oee.toFixed(2)),
        },
        parameters: {
          temperature: 20 + Math.random() * 5,
          pressure: 1 + Math.random() * 0.1,
        },
        alarms: state === "error" ? ["Critical fault detected"] : [],
        timestamp: new Date().toISOString(),
      };

      // --- Publish to MQTT ---
      this.client.publish(`${this.topicBase}/${line}/status`, JSON.stringify(payload));
      this.client.publish(`${this.topicBase}/${line}/oee`, JSON.stringify(payload.metrics));

      logger.info(`📡 Sent [${line}] Update → ${this.topicBase}/${line}/status + /oee`);

      // --- Persist to file (only if persist interval elapsed) ---
      if (doPersist) {
        saveOEE(line, payload);
        logger.debug(`💾 Persisted OEE for line ${line}`);
      }
    });

    if (doPersist) {
      this.lastPersist = now;
    }
  }
}
