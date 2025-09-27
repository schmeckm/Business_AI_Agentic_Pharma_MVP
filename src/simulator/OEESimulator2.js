/**
 * OEE Simulator Service
 * Simulates production line metrics and publishes them via MQTT
 * Controlled via .env settings
 */

import mqtt from "mqtt";
import logger from "../utils/logger.js";

export class OEESimulator {
  constructor(config) {
    this.brokerUrl = config.MQTT_BROKER_URL;
    this.topicBase = config.MQTT_TOPIC_BASE || "plc";
    this.lines = (config.OEE_LINES || "LINE-01").split(",");
    this.intervalMs = parseInt(config.OEE_INTERVAL_MS || "5000", 10);

    // Internal state
    this.client = null;
    this.lineData = {};
    this.states = ["idle", "running", "stopped", "error"];
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.client = mqtt.connect(this.brokerUrl);

      this.client.on("connect", () => {
        console.log(`OEE Simulator connected to MQTT broker: ${this.brokerUrl}`);

        // Init line states
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

        // Start publishing
        this.timer = setInterval(() => this.publishOEE(), this.intervalMs);
        resolve();
      });

      this.client.on("error", (err) => {
        logger.error("OEE Simulator MQTT Error:", err.message);
        reject(err);
      });
    });
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.client) this.client.end();
    logger.info("OEE Simulator stopped");
  }

  publishOEE() {
    this.lines.forEach((line) => {
      const data = this.lineData[line];
      data.plannedProductionTime += 1;
      data.cycleCount += 1;

      const state = this.states[Math.floor(Math.random() * this.states.length)];

      if (state === "running") {
        data.operatingTime += 1;
        const produced = Math.floor(Math.random() * 3) + 1;
        const rejects = Math.random() < 0.1 ? 1 : 0;

        data.goodCount += produced - rejects;
        data.badCount += rejects;
      }

      // Batch-Wechsel
      if (data.cycleCount >= 20 + Math.floor(Math.random() * 10)) {
        console.log(`🔄 ${line} startet neuen Batch...`);
        data.batchCounter += 1;
        data.plannedProductionTime = 0;
        data.operatingTime = 0;
        data.goodCount = 0;
        data.badCount = 0;
        data.cycleCount = 0;
      }

      // OEE Berechnung
      const availability =
        data.plannedProductionTime > 0
          ? data.operatingTime / data.plannedProductionTime
          : 0;

      const performance =
        data.operatingTime > 0
          ? (data.goodCount + data.badCount) /
            (data.operatingTime * (1 / data.idealCycleTime))
          : 0;

      // 💡 NEW: Cap the Performance factor at 1.0 (100%) for the final OEE calculation.
      // The raw 'performance' value is kept for reporting.
      const cappedPerformance = Math.min(performance, 1.0); 

      const quality =
        data.goodCount + data.badCount > 0
          ? data.goodCount / (data.goodCount + data.badCount)
          : 0;

      // Use the cappedPerformance here to ensure OEE <= 100%
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
          // The reported performance remains the raw value (can be > 100%)
          performance: parseFloat((performance * 100).toFixed(2)), 
          quality: parseFloat((quality * 100).toFixed(2)),
          oee: parseFloat(oee.toFixed(2)), // This value is now capped at 100.00
        },
        parameters: {
          temperature: 20 + Math.random() * 5,
          pressure: 1 + Math.random() * 0.1,
        },
        alarms: state === "error" ? ["Critical fault detected"] : [],
        timestamp: new Date().toISOString(),
      };

      // Zwei Topics: Status + OEE
      this.client.publish(`${this.topicBase}/${line}/status`, JSON.stringify(payload));
      this.client.publish(`${this.topicBase}/${line}/oee`, JSON.stringify(payload.metrics));

      logger.info(`Sent [${line}] Update → ${this.topicBase}/${line}/status + /oee`);
    });
  }
}