/**
 * Logger Utility for ShieldHer
 *
 * A centralized logging utility that:
 * - Only logs in development mode (__DEV__)
 * - Provides structured log levels (debug, info, warn, error)
 * - Can be easily configured or replaced with a proper logging service
 *
 * Usage:
 *   import logger from '../utils/logger';
 *   logger.info('[MyComponent]', 'User logged in', { userId: '123' });
 *   logger.error('[MyService]', 'Failed to fetch data', error);
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4,
};

// Set minimum log level (DEBUG shows all, ERROR only errors, NONE disables all)
const isDevEnv =
  (typeof __DEV__ !== 'undefined' && __DEV__) || process.env.NODE_ENV !== 'production';
const MIN_LOG_LEVEL = isDevEnv ? LOG_LEVELS.DEBUG : LOG_LEVELS.WARN;

/**
 * Format log arguments for consistent output
 */
const formatArgs = (tag, message, ...args) => {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
  return [`[${timestamp}]${tag}`, message, ...args];
};

/**
 * Logger object with level-based methods
 */
const logger = {
  /**
   * Debug level - verbose development logging
   * Only shown in development mode
   */
  debug: (tag, message, ...args) => {
    if (MIN_LOG_LEVEL <= LOG_LEVELS.DEBUG) {
      console.log(...formatArgs(tag, message, ...args));
    }
  },

  /**
   * Info level - general information
   * Shown in development mode
   */
  info: (tag, message, ...args) => {
    if (MIN_LOG_LEVEL <= LOG_LEVELS.INFO) {
      console.log(...formatArgs(tag, message, ...args));
    }
  },

  /**
   * Warn level - potential issues that aren't errors
   * Shown in development and production
   */
  warn: (tag, message, ...args) => {
    if (MIN_LOG_LEVEL <= LOG_LEVELS.WARN) {
      console.warn(...formatArgs(tag, message, ...args));
    }
  },

  /**
   * Error level - actual errors that need attention
   * Always shown
   */
  error: (tag, message, ...args) => {
    if (MIN_LOG_LEVEL <= LOG_LEVELS.ERROR) {
      console.error(...formatArgs(tag, message, ...args));
    }
  },

  /**
   * Log method that accepts a level parameter
   * Useful for dynamic log levels
   */
  log: (level, tag, message, ...args) => {
    switch (level) {
      case 'debug':
        logger.debug(tag, message, ...args);
        break;
      case 'info':
        logger.info(tag, message, ...args);
        break;
      case 'warn':
        logger.warn(tag, message, ...args);
        break;
      case 'error':
        logger.error(tag, message, ...args);
        break;
      default:
        logger.debug(tag, message, ...args);
    }
  },

  /**
   * Structured event logger for operational telemetry.
   */
  event: (level, tag, eventName, payload = {}) => {
    const safePayload = payload && typeof payload === 'object' ? payload : { value: payload };
    logger.log(level, tag, eventName, {
      event: eventName,
      timestamp: new Date().toISOString(),
      ...safePayload,
    });
  },
};

export default logger;

// Named exports for convenience
export const { debug, info, warn, error, log, event } = logger;
