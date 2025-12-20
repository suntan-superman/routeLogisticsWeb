/**
 * @fileoverview Retry utilities for network operations
 * 
 * Provides configurable retry logic with exponential backoff
 * for handling transient network failures gracefully.
 * 
 * @module utils/retry
 */

/**
 * Default retry configuration
 */
export const RETRY_DEFAULTS = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableErrors: [
    'network-request-failed',
    'unavailable',
    'deadline-exceeded',
    'internal',
    'resource-exhausted'
  ]
};

/**
 * Determines if an error is retryable
 * @param {Error} error - The error to check
 * @param {string[]} [retryableErrors] - List of retryable error codes
 * @returns {boolean} Whether the error is retryable
 */
export function isRetryableError(error, retryableErrors = RETRY_DEFAULTS.retryableErrors) {
  // Network errors (fetch failures)
  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    return true;
  }

  // Firebase/Firestore errors
  const errorCode = error.code || error.name;
  if (errorCode && retryableErrors.some(code => errorCode.includes(code))) {
    return true;
  }

  // HTTP status codes that are retryable
  const status = error.status || error.statusCode;
  if (status && [408, 429, 500, 502, 503, 504].includes(status)) {
    return true;
  }

  return false;
}

/**
 * Calculate delay with exponential backoff and jitter
 * @param {number} attempt - Current attempt number (0-based)
 * @param {Object} [options] - Delay options
 * @returns {number} Delay in milliseconds
 */
export function calculateDelay(attempt, options = {}) {
  const {
    initialDelayMs = RETRY_DEFAULTS.initialDelayMs,
    maxDelayMs = RETRY_DEFAULTS.maxDelayMs,
    backoffMultiplier = RETRY_DEFAULTS.backoffMultiplier
  } = options;

  // Exponential backoff
  const exponentialDelay = initialDelayMs * Math.pow(backoffMultiplier, attempt);
  
  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
  
  // Add jitter (±25%) to prevent thundering herd
  const jitter = cappedDelay * 0.25 * (Math.random() - 0.5) * 2;
  
  return Math.round(cappedDelay + jitter);
}

/**
 * Sleep for a specified duration
 * @param {number} ms - Duration in milliseconds
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry options
 * @typedef {Object} RetryOptions
 * @property {number} [maxRetries=3] - Maximum number of retry attempts
 * @property {number} [initialDelayMs=1000] - Initial delay before first retry
 * @property {number} [maxDelayMs=10000] - Maximum delay between retries
 * @property {number} [backoffMultiplier=2] - Backoff multiplier
 * @property {string[]} [retryableErrors] - Error codes that should trigger retry
 * @property {Function} [onRetry] - Callback before each retry
 * @property {Function} [shouldRetry] - Custom retry condition function
 */

/**
 * Execute a function with retry logic
 * 
 * @template T
 * @param {() => Promise<T>} fn - Async function to execute
 * @param {RetryOptions} [options] - Retry options
 * @returns {Promise<T>} Result of the function
 * @throws {Error} If all retries fail
 * 
 * @example
 * // Basic usage
 * const result = await withRetry(() => fetchData('/api/users'));
 * 
 * @example
 * // With custom options
 * const result = await withRetry(
 *   () => firestoreQuery(),
 *   {
 *     maxRetries: 5,
 *     onRetry: (error, attempt) => console.log(`Retry ${attempt}:`, error.message)
 *   }
 * );
 */
export async function withRetry(fn, options = {}) {
  const {
    maxRetries = RETRY_DEFAULTS.maxRetries,
    initialDelayMs = RETRY_DEFAULTS.initialDelayMs,
    maxDelayMs = RETRY_DEFAULTS.maxDelayMs,
    backoffMultiplier = RETRY_DEFAULTS.backoffMultiplier,
    retryableErrors = RETRY_DEFAULTS.retryableErrors,
    onRetry,
    shouldRetry
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      const canRetry = shouldRetry 
        ? shouldRetry(error, attempt)
        : isRetryableError(error, retryableErrors);

      if (!canRetry || attempt >= maxRetries) {
        throw error;
      }

      // Calculate delay
      const delay = calculateDelay(attempt, {
        initialDelayMs,
        maxDelayMs,
        backoffMultiplier
      });

      // Call onRetry callback
      if (onRetry) {
        onRetry(error, attempt + 1, delay);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Create a retryable version of an async function
 * 
 * @template T
 * @param {(...args: any[]) => Promise<T>} fn - Function to make retryable
 * @param {RetryOptions} [options] - Default retry options
 * @returns {(...args: any[]) => Promise<T>} Retryable function
 * 
 * @example
 * const fetchUserRetryable = createRetryable(fetchUser, { maxRetries: 3 });
 * const user = await fetchUserRetryable(userId);
 */
export function createRetryable(fn, options = {}) {
  return (...args) => withRetry(() => fn(...args), options);
}

/**
 * Retry with timeout - fails if operation doesn't complete within timeout
 * 
 * @template T
 * @param {() => Promise<T>} fn - Async function to execute
 * @param {number} timeoutMs - Maximum time to wait
 * @param {RetryOptions} [options] - Retry options
 * @returns {Promise<T>} Result of the function
 * @throws {Error} If timeout or all retries fail
 * 
 * @example
 * const result = await withRetryAndTimeout(
 *   () => slowOperation(),
 *   30000, // 30 second timeout
 *   { maxRetries: 3 }
 * );
 */
export async function withRetryAndTimeout(fn, timeoutMs, options = {}) {
  return Promise.race([
    withRetry(fn, options),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

/**
 * Execute multiple operations with individual retry logic
 * 
 * @template T
 * @param {Array<() => Promise<T>>} fns - Array of async functions
 * @param {RetryOptions} [options] - Retry options for each function
 * @returns {Promise<Array<{success: boolean, data?: T, error?: Error}>>}
 * 
 * @example
 * const results = await batchWithRetry([
 *   () => fetchUser(1),
 *   () => fetchUser(2),
 *   () => fetchUser(3)
 * ]);
 */
export async function batchWithRetry(fns, options = {}) {
  return Promise.all(
    fns.map(async (fn) => {
      try {
        const data = await withRetry(fn, options);
        return { success: true, data };
      } catch (error) {
        return { success: false, error };
      }
    })
  );
}

/**
 * Circuit breaker state
 * @private
 */
const circuitBreakers = new Map();

/**
 * Circuit breaker states
 * @enum {string}
 */
export const CircuitState = {
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half_open'
};

/**
 * Execute function with circuit breaker pattern
 * Prevents repeated calls to a failing service
 * 
 * @template T
 * @param {string} key - Unique key for this circuit
 * @param {() => Promise<T>} fn - Function to execute
 * @param {Object} [options] - Circuit breaker options
 * @param {number} [options.failureThreshold=5] - Failures before opening circuit
 * @param {number} [options.resetTimeoutMs=30000] - Time before attempting reset
 * @returns {Promise<T>} Result of the function
 * @throws {Error} If circuit is open or function fails
 * 
 * @example
 * const result = await withCircuitBreaker('external-api', () => callExternalApi());
 */
export async function withCircuitBreaker(key, fn, options = {}) {
  const {
    failureThreshold = 5,
    resetTimeoutMs = 30000
  } = options;

  let circuit = circuitBreakers.get(key);
  
  if (!circuit) {
    circuit = {
      state: CircuitState.CLOSED,
      failures: 0,
      lastFailure: null
    };
    circuitBreakers.set(key, circuit);
  }

  // Check if circuit should transition from OPEN to HALF_OPEN
  if (circuit.state === CircuitState.OPEN) {
    const timeSinceFailure = Date.now() - circuit.lastFailure;
    if (timeSinceFailure >= resetTimeoutMs) {
      circuit.state = CircuitState.HALF_OPEN;
    } else {
      throw new Error(`Circuit breaker is open for "${key}". Retry after ${Math.ceil((resetTimeoutMs - timeSinceFailure) / 1000)}s`);
    }
  }

  try {
    const result = await fn();
    
    // Success - reset circuit
    if (circuit.state === CircuitState.HALF_OPEN) {
      circuit.state = CircuitState.CLOSED;
    }
    circuit.failures = 0;
    
    return result;
  } catch (error) {
    circuit.failures++;
    circuit.lastFailure = Date.now();
    
    if (circuit.failures >= failureThreshold) {
      circuit.state = CircuitState.OPEN;
    }
    
    throw error;
  }
}

/**
 * Reset a circuit breaker
 * @param {string} key - Circuit key to reset
 */
export function resetCircuitBreaker(key) {
  circuitBreakers.delete(key);
}

/**
 * Get circuit breaker status
 * @param {string} key - Circuit key
 * @returns {Object|null} Circuit status or null if not found
 */
export function getCircuitBreakerStatus(key) {
  return circuitBreakers.get(key) || null;
}

export default {
  withRetry,
  createRetryable,
  withRetryAndTimeout,
  batchWithRetry,
  withCircuitBreaker,
  resetCircuitBreaker,
  getCircuitBreakerStatus,
  isRetryableError,
  calculateDelay,
  sleep,
  RETRY_DEFAULTS,
  CircuitState
};
