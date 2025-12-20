/**
 * @fileoverview Centralized logging service for mi Factotum Web
 * 
 * Provides structured logging with optional integration to external services:
 * - Sentry (error tracking)
 * - LogRocket (session replay)
 * 
 * @module utils/logger
 */

/**
 * Log levels for filtering and categorization
 * @enum {string}
 */
export const LOG_LEVELS = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  FATAL: 'fatal'
};

/**
 * Log level priority for filtering
 * @private
 */
const LOG_PRIORITY = {
  [LOG_LEVELS.DEBUG]: 0,
  [LOG_LEVELS.INFO]: 1,
  [LOG_LEVELS.WARN]: 2,
  [LOG_LEVELS.ERROR]: 3,
  [LOG_LEVELS.FATAL]: 4
};

/**
 * Configuration for the logger
 * @private
 */
const CONFIG = {
  minLevel: import.meta.env.DEV ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO,
  maxStoredLogs: 100,
  enableConsole: true,
  enableStorage: true,
  enableRemote: !import.meta.env.DEV, // Only in production
};

/**
 * Storage key for persisted logs
 * @private
 */
const LOGS_STORAGE_KEY = '@mifactotum:logs';

/**
 * External service adapters - configure as needed
 * @private
 */
const adapters = {
  /**
   * Sentry integration
   * @see https://docs.sentry.io/platforms/javascript/guides/react/
   * 
   * Install: npm install @sentry/react
   * 
   * Initialize in main.jsx:
   * import * as Sentry from '@sentry/react';
   * Sentry.init({ dsn: 'YOUR_SENTRY_DSN' });
   */
  sentry: null,

  /**
   * LogRocket integration
   * @see https://docs.logrocket.com/docs/javascript
   * 
   * Install: npm install logrocket
   */
  logRocket: null
};

/**
 * Format a log entry with timestamp and metadata
 * @private
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {Object} [meta] - Additional metadata
 * @returns {Object} Formatted log entry
 */
const formatLogEntry = (level, message, meta = {}) => ({
  timestamp: new Date().toISOString(),
  level,
  message,
  meta,
  url: typeof window !== 'undefined' ? window.location.href : null,
  userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null
});

/**
 * Check if a log level should be logged based on config
 * @private
 * @param {string} level - Log level to check
 * @returns {boolean} Whether the level should be logged
 */
const shouldLog = (level) => {
  return LOG_PRIORITY[level] >= LOG_PRIORITY[CONFIG.minLevel];
};

/**
 * Output to console with appropriate method
 * @private
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {Object} [meta] - Additional metadata
 */
const logToConsole = (level, message, meta) => {
  if (!CONFIG.enableConsole) return;

  const prefix = `[${level.toUpperCase()}]`;
  const metaStr = Object.keys(meta).length > 0 ? meta : '';

  switch (level) {
    case LOG_LEVELS.DEBUG:
      console.debug(prefix, message, metaStr);
      break;
    case LOG_LEVELS.INFO:
      console.info(prefix, message, metaStr);
      break;
    case LOG_LEVELS.WARN:
      console.warn(prefix, message, metaStr);
      break;
    case LOG_LEVELS.ERROR:
    case LOG_LEVELS.FATAL:
      console.error(prefix, message, metaStr);
      break;
    default:
      console.log(prefix, message, metaStr);
  }
};

/**
 * Store log entry in localStorage for later retrieval
 * @private
 * @param {Object} entry - Formatted log entry
 */
const storeLog = (entry) => {
  if (!CONFIG.enableStorage || typeof localStorage === 'undefined') return;

  try {
    const stored = localStorage.getItem(LOGS_STORAGE_KEY);
    const logs = stored ? JSON.parse(stored) : [];
    
    logs.push(entry);
    
    // Keep only the most recent logs
    if (logs.length > CONFIG.maxStoredLogs) {
      logs.splice(0, logs.length - CONFIG.maxStoredLogs);
    }
    
    localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(logs));
  } catch (error) {
    // Don't let storage errors break the app
    console.error('Failed to store log:', error);
  }
};

/**
 * Send log to remote services
 * @private
 * @param {Object} entry - Formatted log entry
 */
const sendToRemote = (entry) => {
  if (!CONFIG.enableRemote) return;

  const { level, message, meta } = entry;

  // Sentry integration
  if (adapters.sentry) {
    if (level === LOG_LEVELS.ERROR || level === LOG_LEVELS.FATAL) {
      adapters.sentry.captureException(
        meta.error instanceof Error ? meta.error : new Error(message),
        { extra: meta }
      );
    } else {
      adapters.sentry.addBreadcrumb({
        category: 'log',
        message,
        level: level === LOG_LEVELS.WARN ? 'warning' : level,
        data: meta
      });
    }
  }

  // LogRocket integration
  if (adapters.logRocket) {
    if (level === LOG_LEVELS.ERROR || level === LOG_LEVELS.FATAL) {
      adapters.logRocket.captureException(
        meta.error instanceof Error ? meta.error : new Error(message),
        { extra: meta }
      );
    } else {
      adapters.logRocket.log(message, meta);
    }
  }
};

/**
 * Main logger class providing structured logging functionality
 */
class Logger {
  /**
   * Initialize remote logging adapters
   * Call this in main.jsx after initializing external services
   * 
   * @param {Object} options - Adapter instances
   * @param {Object} [options.sentry] - Initialized Sentry instance
   * @param {Object} [options.logRocket] - Initialized LogRocket instance
   * 
   * @example
   * import * as Sentry from '@sentry/react';
   * import LogRocket from 'logrocket';
   * 
   * Sentry.init({ dsn: 'YOUR_DSN' });
   * LogRocket.init('YOUR_APP_ID');
   * Logger.init({ sentry: Sentry, logRocket: LogRocket });
   */
  static init({ sentry, logRocket } = {}) {
    if (sentry) adapters.sentry = sentry;
    if (logRocket) adapters.logRocket = logRocket;
    
    this.info('Logger initialized', { 
      adapters: {
        sentry: !!sentry,
        logRocket: !!logRocket
      }
    });
  }

  /**
   * Set the minimum log level
   * @param {string} level - Minimum level to log
   */
  static setMinLevel(level) {
    if (LOG_PRIORITY[level] !== undefined) {
      CONFIG.minLevel = level;
    }
  }

  /**
   * Set user context for error tracking
   * @param {Object} user - User information
   * @param {string} [user.id] - User ID
   * @param {string} [user.email] - User email
   * @param {string} [user.role] - User role
   */
  static setUser(user) {
    if (adapters.sentry) {
      adapters.sentry.setUser(user);
    }
    if (adapters.logRocket) {
      adapters.logRocket.identify(user.id, user);
    }
  }

  /**
   * Clear user context
   */
  static clearUser() {
    if (adapters.sentry) adapters.sentry.setUser(null);
    if (adapters.logRocket) adapters.logRocket.identify(null);
  }

  /**
   * Log a debug message
   * @param {string} message - Debug message
   * @param {Object} [meta] - Additional metadata
   */
  static debug(message, meta = {}) {
    this._log(LOG_LEVELS.DEBUG, message, meta);
  }

  /**
   * Log an informational message
   * @param {string} message - Info message
   * @param {Object} [meta] - Additional metadata
   */
  static info(message, meta = {}) {
    this._log(LOG_LEVELS.INFO, message, meta);
  }

  /**
   * Log a warning message
   * @param {string} message - Warning message
   * @param {Object} [meta] - Additional metadata
   */
  static warn(message, meta = {}) {
    this._log(LOG_LEVELS.WARN, message, meta);
  }

  /**
   * Log an error
   * @param {string} message - Error message
   * @param {Error|Object} [errorOrMeta] - Error object or metadata
   * @param {Object} [meta] - Additional metadata (if error provided)
   */
  static error(message, errorOrMeta = {}, meta = {}) {
    const isError = errorOrMeta instanceof Error;
    const finalMeta = isError 
      ? { error: errorOrMeta, stack: errorOrMeta.stack, ...meta }
      : errorOrMeta;
    
    this._log(LOG_LEVELS.ERROR, message, finalMeta);
  }

  /**
   * Log a fatal error (app crash imminent)
   * @param {string} message - Fatal error message
   * @param {Error|Object} [errorOrMeta] - Error object or metadata
   * @param {Object} [meta] - Additional metadata
   */
  static fatal(message, errorOrMeta = {}, meta = {}) {
    const isError = errorOrMeta instanceof Error;
    const finalMeta = isError 
      ? { error: errorOrMeta, stack: errorOrMeta.stack, ...meta }
      : errorOrMeta;
    
    this._log(LOG_LEVELS.FATAL, message, finalMeta);
  }

  /**
   * Create a scoped logger with a prefix
   * @param {string} scope - Logger scope/prefix (e.g., service name)
   * @returns {Object} Scoped logger methods
   * 
   * @example
   * const log = Logger.scope('CustomerService');
   * log.info('Loading customers'); // [INFO] [CustomerService] Loading customers
   */
  static scope(scope) {
    const prefix = `[${scope}]`;
    return {
      debug: (msg, meta) => this.debug(`${prefix} ${msg}`, meta),
      info: (msg, meta) => this.info(`${prefix} ${msg}`, meta),
      warn: (msg, meta) => this.warn(`${prefix} ${msg}`, meta),
      error: (msg, errorOrMeta, meta) => this.error(`${prefix} ${msg}`, errorOrMeta, meta),
      fatal: (msg, errorOrMeta, meta) => this.fatal(`${prefix} ${msg}`, errorOrMeta, meta)
    };
  }

  /**
   * Get stored logs
   * @returns {Array} Array of stored log entries
   */
  static getStoredLogs() {
    try {
      if (typeof localStorage === 'undefined') return [];
      const stored = localStorage.getItem(LOGS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  /**
   * Clear stored logs
   */
  static clearStoredLogs() {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LOGS_STORAGE_KEY);
    }
  }

  /**
   * Export logs for debugging/support
   * @returns {string} JSON string of logs
   */
  static exportLogs() {
    const logs = this.getStoredLogs();
    return JSON.stringify(logs, null, 2);
  }

  /**
   * Internal logging method
   * @private
   */
  static _log(level, message, meta) {
    if (!shouldLog(level)) return;

    const entry = formatLogEntry(level, message, meta);
    
    logToConsole(level, message, meta);
    storeLog(entry);
    sendToRemote(entry);
  }
}

export default Logger;
