// src/routes/index.js - Centralized Route Management
import express from 'express';
import rateLimit from 'express-rate-limit';
import { body, query, param, validationResult } from 'express-validator';
import helmet from 'helmet';
import cors from 'cors';

import healthRoutes from './health.routes.js';
import chatRoutes from './chat.routes.js';
import agentRoutes from './agentInvoke.routes.js';
import ragRoutes from './rag.routes.js';
import marRoutes from './mar.routes.js';
import adminRoutes from './admin.routes.js';

import config from '../config/index.js';
import logger from '../services/logger.js';

/**
 * Security middleware
 */
export function createSecurityMiddleware() {
  const router = express.Router();
  
  // Helmet for security headers
  router.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "ws:", "wss:"]
      }
    },
    crossOriginEmbedderPolicy: false
  }));
  
  // CORS configuration
  router.use(cors({
    origin: config.get('server.cors.origin'),
    credentials: config.get('server.cors.credentials'),
    maxAge: config.get('security.cors.maxAge'),
    allowedHeaders: config.get('security.cors.allowedHeaders')
  }));
  
  return router;
}

/**
 * Rate limiting middleware
 */
export function createRateLimiter(options = {}) {
  const defaultOptions = config.get('security.rateLimit');
  
  return rateLimit({
    ...defaultOptions,
    ...options,
    message: {
      error: 'Too many requests from this IP',
      retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path
      });
      
      res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil(defaultOptions.windowMs / 1000)
      });
    }
  });
}

/**
 * Request validation middleware
 */
export function createValidationMiddleware() {
  return (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Request validation failed', {
        path: req.path,
        method: req.method,
        errors: errors.array()
      });
      
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }
    next();
  };
}

/**
 * Request logging middleware
 */
export function createLoggingMiddleware() {
  return (req, res, next) => {
    const startTime = Date.now();
    
    // Log request
    logger.info('Request started', {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    // Log response when finished
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      logger.info('Request completed', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration
      });
    });
    
    next();
  };
}

/**
 * Error handling middleware
 */
export function createErrorHandler() {
  return (error, req, res, next) => {
    logger.error('Request error', {
      error: error.message,
      stack: config.isDevelopment() ? error.stack : undefined,
      path: req.path,
      method: req.method
    });
    
    // Don't expose internal errors in production
    const message = config.isProduction() ? 'Internal server error' : error.message;
    
    res.status(error.status || 500).json({
      error: message,
      timestamp: new Date().toISOString(),
      path: req.path
    });
  };
}

/**
 * Service injection middleware
 */
export function createServiceMiddleware(services) {
  return (req, res, next) => {
    req.locals = {
      ...req.locals,
      ...services,
      config
    };
    next();
  };
}

/**
 * Common validation schemas
 */
export