// src/utils/logger.js
import winston from "winston";

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info", // info, debug, warn, error
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.colorize(), // farbige Ausgabe in Console
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level}] ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "logs/server.log" })
  ]
});

export default logger;
