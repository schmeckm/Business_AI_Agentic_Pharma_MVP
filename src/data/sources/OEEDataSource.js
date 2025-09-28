/**
 * ========================================================================
 * OEE MQTT DATA SOURCE
 * ========================================================================
 *
 * Real-time OEE monitoring via MQTT.
 * - Connects to MQTT broker
 * - Subscribes to `<topicBase>/+/status`
 * - Stores latest OEE metrics per line in memory
 * - Provides hot (real-time) data for DataManager
 * - Includes reconnection with exponential backoff
 *
 * Author: Markus Schmeckenbecher
 * Version: 1.0
 * ========================================================================
 */

import mqtt from "mqtt";
import logger from "../../utils/logger.js";
import DataSource from "./DataSource.js";

class OEEDataSource extends DataSource {
  constructor(config = {}) {
    super();
    this.brokerUrl = config.brokerUrl || process.env.MQTT_BROKER_URL;
    this.topicBase = config.topicBase || process.env.MQTT_TOPIC_BASE || "plc";
    this.client = null;
    this.data = new Map(); // line -> last OEE payload
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 5000; // ms
    this.isConnecting = false;

    if (this.brokerUrl) {
      this.connect();
    } else {
      logger.warn("⚠️ MQTT_BROKER_URL not configured, OEE integration disabled");
    }
  }

  /**
   * Establish MQTT connection and subscribe
   */
  connect() {
    if (this.isConnecting) {
      logger.debug("MQTT connection already in progress");
      return;
    }

    this.isConnecting = true;
    const options = {
      keepalive: 60,
      connectTimeout: 30_000,
      reconnectPeriod: 0, // manual reconnect
    };

    if (process.env.MQTT_USER && process.env.MQTT_PASS) {
      options.username = process.env.MQTT_USER;
      options.password = process.env.MQTT_PASS;
      logger.info(`🔑 MQTT auth enabled for user: ${process.env.MQTT_USER}`);
    }

    this.client = mqtt.connect(this.brokerUrl, options);

    this.client.on("connect", () => {
      logger.info(`✅ OEE MQTT connected: ${this.brokerUrl}`);
      this.reconnectAttempts = 0;
      this.isConnecting = false;

      const topic = `${this.topicBase}/+/status`;
      this.client.subscribe(topic, (err) => {
        if (err) {
          logger.error(`❌ MQTT subscription failed: ${err.message}`);
        } else {
          logger.info(`📡 Subscribed to ${topic}`);
        }
      });
    });

    this.client.on("message", (topic, message) => {
      try {
        const msgStr = message.toString();
        if (!msgStr.startsWith("{") && !msgStr.startsWith("[")) {
          logger.warn(`⚠️ Ignored non-JSON MQTT message on ${topic}`);
          return;
        }

        const payload = JSON.parse(msgStr);

        if (payload && payload.line && payload.metrics) {
          const dataAge = payload.timestamp
            ? Date.now() - new Date(payload.timestamp).getTime()
            : 0;

          if (dataAge < 300_000) {
            const enrichedPayload = {
              ...payload,
              receivedAt: new Date().toISOString(),
              dataAge: Math.round(dataAge / 1000),
            };
            this.data.set(payload.line, enrichedPayload);
            logger.debug(
              `📥 OEE updated [${payload.line}] (age ${Math.round(
                dataAge / 1000
              )}s, lines: ${this.data.size})`
            );
          } else {
            logger.warn(
              `⚠️ OEE data too old for ${payload.line}: ${Math.round(
                dataAge / 1000
              )}s`
            );
          }
        } else {
          logger.warn(`⚠️ Invalid OEE payload on ${topic}`);
        }
      } catch (err) {
        logger.error(`❌ MQTT parse failed on ${topic}: ${err.message}`);
      }
    });

    this.client.on("error", (err) => {
      logger.error(`❌ OEE MQTT error: ${err.message}`);
      this.isConnecting = false;
    });

    this.client.on("close", () => {
      logger.warn("⚠️ OEE MQTT connection lost");
      this.isConnecting = false;
      this.scheduleReconnect();
    });

    this.client.on("offline", () => {
      logger.warn("⚠️ OEE MQTT client offline");
      this.isConnecting = false;
    });

    this.client.on("disconnect", () => {
      logger.info("ℹ️ OEE MQTT client disconnected");
      this.isConnecting = false;
    });
  }

  /**
   * Exponential backoff reconnect
   */
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error(
        `❌ Max reconnect attempts (${this.maxReconnectAttempts}) reached`
      );
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      60_000
    );

    logger.info(
      `⏳ Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`
    );

    setTimeout(() => {
      if (!this.client || !this.client.connected) {
        logger.info(
          `🔄 Reconnecting MQTT (attempt ${this.reconnectAttempts})`
        );
        this.connect();
      }
    }, delay);
  }

  /**
   * Fetch current OEE data from memory
   */
  async fetchData() {
    const result = Array.from(this.data.values());
    logger.debug(`📊 Returning ${result.length} OEE lines`);
    return result;
  }

  async updateData() {
    throw new Error("OEEDataSource is read-only");
  }

  getConnectionStatus() {
    return {
      connected: this.client?.connected || false,
      reconnectAttempts: this.reconnectAttempts,
      dataPoints: this.data.size,
      brokerUrl: this.brokerUrl,
    };
  }

  cleanup() {
    if (this.client) {
      logger.info("🧹 Closing MQTT connection...");
      this.client.end(true);
      this.client = null;
    }
    this.data.clear();
    this.isConnecting = false;
  }

  getName() {
    return "OEEDataSource";
  }
}

export default OEEDataSource;
