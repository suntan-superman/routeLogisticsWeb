/**
 * @fileoverview Tests for retry utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
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
} from '../../utils/retry';

describe('retry utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('isRetryableError', () => {
    it('should return true for fetch network errors', () => {
      const error = new TypeError('Failed to fetch');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for Firebase network errors', () => {
      const error = { code: 'network-request-failed', message: 'Network error' };
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for unavailable errors', () => {
      const error = { code: 'unavailable' };
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for 503 status', () => {
      const error = { status: 503 };
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for 429 rate limit', () => {
      const error = { statusCode: 429 };
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return false for authentication errors', () => {
      const error = { code: 'auth/invalid-credentials' };
      expect(isRetryableError(error)).toBe(false);
    });

    it('should return false for 404 errors', () => {
      const error = { status: 404 };
      expect(isRetryableError(error)).toBe(false);
    });
  });

  describe('calculateDelay', () => {
    it('should return initial delay for first attempt', () => {
      // With jitter, result will be close to initialDelay
      const delay = calculateDelay(0, { initialDelayMs: 1000 });
      expect(delay).toBeGreaterThan(750);
      expect(delay).toBeLessThan(1250);
    });

    it('should increase exponentially', () => {
      const delay0 = calculateDelay(0, { initialDelayMs: 100, maxDelayMs: 10000 });
      const delay1 = calculateDelay(1, { initialDelayMs: 100, maxDelayMs: 10000 });
      const delay2 = calculateDelay(2, { initialDelayMs: 100, maxDelayMs: 10000 });
      
      // Each should roughly double (accounting for jitter)
      expect(delay1).toBeGreaterThan(delay0 * 1.5);
      expect(delay2).toBeGreaterThan(delay1 * 1.5);
    });

    it('should cap at maxDelayMs', () => {
      const delay = calculateDelay(10, { initialDelayMs: 1000, maxDelayMs: 5000 });
      expect(delay).toBeLessThanOrEqual(5000 * 1.25); // Max + jitter
    });
  });

  describe('sleep', () => {
    it('should resolve after specified time', async () => {
      const promise = sleep(1000);
      vi.advanceTimersByTime(999);
      let resolved = false;
      promise.then(() => { resolved = true; });
      await Promise.resolve();
      expect(resolved).toBe(false);
      vi.advanceTimersByTime(1);
      await Promise.resolve();
      // Let the promise resolve
      await vi.runAllTimersAsync();
    });
  });

  describe('withRetry', () => {
    it('should return result on first success', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      
      const result = await withRetry(fn);
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable error', async () => {
      vi.useRealTimers();
      
      const fn = vi.fn()
        .mockRejectedValueOnce({ code: 'unavailable' })
        .mockResolvedValue('success');
      
      const result = await withRetry(fn, { maxRetries: 3, initialDelayMs: 10 });
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      vi.useRealTimers();
      
      const error = { code: 'unavailable', message: 'Service unavailable' };
      const fn = vi.fn().mockRejectedValue(error);
      
      await expect(withRetry(fn, { maxRetries: 2, initialDelayMs: 10 }))
        .rejects.toEqual(error);
      
      expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should not retry non-retryable errors', async () => {
      const error = { code: 'not-found', message: 'Not found' };
      const fn = vi.fn().mockRejectedValue(error);
      
      await expect(withRetry(fn)).rejects.toEqual(error);
      
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should call onRetry callback', async () => {
      vi.useRealTimers();
      
      const onRetry = vi.fn();
      const fn = vi.fn()
        .mockRejectedValueOnce({ code: 'unavailable' })
        .mockResolvedValue('success');
      
      await withRetry(fn, { maxRetries: 3, initialDelayMs: 10, onRetry });
      
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'unavailable' }),
        1,
        expect.any(Number)
      );
    });

    it('should use custom shouldRetry function', async () => {
      vi.useRealTimers();
      
      const shouldRetry = vi.fn().mockReturnValue(true);
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('custom error'))
        .mockResolvedValue('success');
      
      await withRetry(fn, { maxRetries: 3, initialDelayMs: 10, shouldRetry });
      
      expect(shouldRetry).toHaveBeenCalled();
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('createRetryable', () => {
    it('should create a retryable function', async () => {
      vi.useRealTimers();
      
      const originalFn = vi.fn()
        .mockRejectedValueOnce({ code: 'unavailable' })
        .mockResolvedValue('result');
      
      const retryableFn = createRetryable(originalFn, { maxRetries: 2, initialDelayMs: 10 });
      
      const result = await retryableFn('arg1', 'arg2');
      
      expect(result).toBe('result');
      expect(originalFn).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });

  describe('withRetryAndTimeout', () => {
    it('should timeout if operation takes too long', async () => {
      vi.useRealTimers();
      
      const fn = () => new Promise(resolve => setTimeout(resolve, 5000));
      
      await expect(withRetryAndTimeout(fn, 100, { maxRetries: 0 }))
        .rejects.toThrow('Operation timed out');
    });

    it('should succeed if operation completes in time', async () => {
      vi.useRealTimers();
      
      const fn = () => Promise.resolve('quick result');
      
      const result = await withRetryAndTimeout(fn, 1000);
      
      expect(result).toBe('quick result');
    });
  });

  describe('batchWithRetry', () => {
    it('should execute all functions and return results', async () => {
      vi.useRealTimers();
      
      const fns = [
        vi.fn().mockResolvedValue('result1'),
        vi.fn().mockResolvedValue('result2'),
        vi.fn().mockRejectedValue(new Error('failed'))
      ];
      
      const results = await batchWithRetry(fns, { maxRetries: 0 });
      
      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ success: true, data: 'result1' });
      expect(results[1]).toEqual({ success: true, data: 'result2' });
      expect(results[2].success).toBe(false);
      expect(results[2].error).toBeInstanceOf(Error);
    });
  });

  describe('circuit breaker', () => {
    const circuitKey = 'test-circuit';

    beforeEach(() => {
      resetCircuitBreaker(circuitKey);
    });

    it('should execute function when circuit is closed', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      
      const result = await withCircuitBreaker(circuitKey, fn);
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should open circuit after failure threshold', async () => {
      const error = new Error('Service error');
      const fn = vi.fn().mockRejectedValue(error);
      
      // Fail 5 times (default threshold)
      for (let i = 0; i < 5; i++) {
        await expect(withCircuitBreaker(circuitKey, fn)).rejects.toThrow();
      }
      
      const status = getCircuitBreakerStatus(circuitKey);
      expect(status.state).toBe(CircuitState.OPEN);
    });

    it('should reject immediately when circuit is open', async () => {
      const error = new Error('Service error');
      const fn = vi.fn().mockRejectedValue(error);
      
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        await expect(withCircuitBreaker(circuitKey, fn)).rejects.toThrow();
      }
      
      // Next call should be rejected immediately
      await expect(withCircuitBreaker(circuitKey, fn))
        .rejects.toThrow('Circuit breaker is open');
      
      // Function should not have been called again
      expect(fn).toHaveBeenCalledTimes(5);
    });

    it('should reset on success after half-open', async () => {
      vi.useRealTimers();
      
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('recovered');
      
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        await expect(withCircuitBreaker(circuitKey, fn, { failureThreshold: 5, resetTimeoutMs: 100 }))
          .rejects.toThrow();
      }
      
      // Wait for reset timeout
      await new Promise(r => setTimeout(r, 150));
      
      // Should succeed now
      const result = await withCircuitBreaker(circuitKey, fn, { failureThreshold: 5, resetTimeoutMs: 100 });
      expect(result).toBe('recovered');
      
      const status = getCircuitBreakerStatus(circuitKey);
      expect(status.state).toBe(CircuitState.CLOSED);
    });

    it('should reset circuit breaker', () => {
      resetCircuitBreaker(circuitKey);
      
      const status = getCircuitBreakerStatus(circuitKey);
      expect(status).toBeNull();
    });
  });

  describe('RETRY_DEFAULTS', () => {
    it('should have expected default values', () => {
      expect(RETRY_DEFAULTS.maxRetries).toBe(3);
      expect(RETRY_DEFAULTS.initialDelayMs).toBe(1000);
      expect(RETRY_DEFAULTS.maxDelayMs).toBe(10000);
      expect(RETRY_DEFAULTS.backoffMultiplier).toBe(2);
      expect(RETRY_DEFAULTS.retryableErrors).toContain('unavailable');
    });
  });
});
