// src/services/logger.js
import pino from "pino";
import crypto from "crypto";

const LOG_LEVEL = process.env.LOG_LEVEL || "info";

/**
 * Build pino transport (pretty) if available and not in production.
 * pino.transport exists in newer pino versions; fallback to simple pino.
 */
let logger;
try {
  if (process.env.NODE_ENV !== "production" && pino.transport) {
    const transport = pino.transport({
      target: "pino-pretty",
      options: { colorize: true, translateTime: "YYYY-MM-DD HH:mm:ss.l o", ignore: "pid,hostname" }
    });
    logger = pino({ level: LOG_LEVEL }, transport);
  } else {
    logger = pino({ level: LOG_LEVEL });
  }
} catch (err) {
  // If anything fails (old pino version etc.), fallback to basic logger
  // but still try to construct a pino logger minimally
  try { logger = pino({ level: LOG_LEVEL }); } catch (e) { /* last resort */ console.warn("Logger init fallback", e); logger = console; }
}

/**
 * createLogger(name) -> returns a child logger with module=name
 * Exported as named export for files that do: import { createLogger } from "./logger.js"
 */
export function createLogger(name = "app") {
  if (!logger || typeof logger.child !== "function") {
    // fallback to console-like wrapper
    return {
      info: (...a) => console.info(`[${name}]`, ...a),
      warn: (...a) => console.warn(`[${name}]`, ...a),
      error: (...a) => console.error(`[${name}]`, ...a),
      debug: (...a) => console.debug ? console.debug(`[${name}]`, ...a) : console.log(`[${name}]`, ...a)
    };
  }
  return logger.child({ module: name });
}

/**
 * Default export: base logger instance (module "app")
 * Many files in the repo expect: import logger from "./logger.js"
 */
const defaultLogger = (typeof logger.child === "function") ? logger.child({ module: "app" }) : createLogger("app");
export default defaultLogger;

/**
 * signAuditEntry(payload) -> { entry, hmac }
 * Uses LOG_HMAC_KEY env. Returns hmac=null when key not set (but still returns entry).
 */
export function signAuditEntry(payload) {
  const entry = { ts: new Date().toISOString(), payload };
  const key = process.env.LOG_HMAC_KEY;
  if (!key) {
    defaultLogger && defaultLogger.warn && defaultLogger.warn("LOG_HMAC_KEY not set - audit entries UNSIGNED");
    return { entry, hmac: null };
  }
  try {
    const h = crypto.createHmac("sha256", key).update(JSON.stringify(entry)).digest("hex");
    return { entry, hmac: h };
  } catch (err) {
    defaultLogger && defaultLogger.error && defaultLogger.error("signAuditEntry error", err?.message || err);
    return { entry, hmac: null };
  }
}
