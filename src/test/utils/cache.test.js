/**
 * Unit tests for cache utilities
 * @module test/utils/cache.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import cache from '../../utils/cache';

describe('cache', () => {
  beforeEach(() => {
    cache.clear();
  });

  describe('get/set', () => {
    it('should store and retrieve a value', () => {
      cache.set('test-key', { id: 1, name: 'Test' });
      const result = cache.get('test-key');
      
      expect(result).toEqual({ id: 1, name: 'Test' });
    });

    it('should return null for non-existent key', () => {
      const result = cache.get('non-existent');
      
      expect(result).toBeNull();
    });

    it('should expire entries after TTL', async () => {
      cache.set('short-lived', 'data', 50); // 50ms TTL
      
      expect(cache.get('short-lived')).toBe('data');
      
      await new Promise(resolve => setTimeout(resolve, 60));
      
      expect(cache.get('short-lived')).toBeNull();
    });

    it('should increment hit counter on get', () => {
      cache.set('hit-test', 'value');
      
      cache.get('hit-test');
      cache.get('hit-test');
      cache.get('hit-test');
      
      const stats = cache.getStats();
      expect(stats.totalHits).toBe(3);
    });
  });

  describe('del', () => {
    it('should delete an existing entry', () => {
      cache.set('to-delete', 'value');
      expect(cache.get('to-delete')).toBe('value');
      
      const deleted = cache.del('to-delete');
      
      expect(deleted).toBe(true);
      expect(cache.get('to-delete')).toBeNull();
    });

    it('should return false for non-existent key', () => {
      const deleted = cache.del('non-existent');
      
      expect(deleted).toBe(false);
    });
  });

  describe('deleteByPrefix', () => {
    it('should delete all entries with matching prefix', () => {
      cache.set('user:1', { name: 'User 1' });
      cache.set('user:2', { name: 'User 2' });
      cache.set('company:1', { name: 'Company 1' });
      
      cache.deleteByPrefix('user:');
      
      expect(cache.get('user:1')).toBeNull();
      expect(cache.get('user:2')).toBeNull();
      expect(cache.get('company:1')).not.toBeNull();
    });
  });

  describe('clear', () => {
    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      
      cache.clear();
      
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
      expect(cache.getStats().size).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.get('key1');
      
      const stats = cache.getStats();
      
      expect(stats.size).toBe(2);
      expect(stats.totalHits).toBe(1);
      expect(stats.maxEntries).toBe(100);
    });
  });

  describe('KEYS', () => {
    it('should generate user profile key', () => {
      const key = cache.KEYS.userProfile('user123');
      expect(key).toBe('user:user123');
    });

    it('should generate company profile key', () => {
      const key = cache.KEYS.companyProfile('company456');
      expect(key).toBe('company:company456');
    });
  });

  describe('getOrFetchUserProfile', () => {
    it('should return cached value if exists', async () => {
      const fetchFn = vi.fn().mockResolvedValue({ id: 'user1', name: 'Test' });
      
      // Pre-populate cache
      cache.set(cache.KEYS.userProfile('user1'), { id: 'user1', name: 'Cached' });
      
      const result = await cache.getOrFetchUserProfile('user1', fetchFn);
      
      expect(result).toEqual({ id: 'user1', name: 'Cached' });
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('should fetch and cache if not in cache', async () => {
      const fetchFn = vi.fn().mockResolvedValue({ id: 'user2', name: 'Fetched' });
      
      const result = await cache.getOrFetchUserProfile('user2', fetchFn);
      
      expect(result).toEqual({ id: 'user2', name: 'Fetched' });
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(cache.get(cache.KEYS.userProfile('user2'))).toEqual({ id: 'user2', name: 'Fetched' });
    });
  });

  describe('memoize', () => {
    it('should memoize async function results', async () => {
      const expensiveFn = vi.fn().mockResolvedValue({ result: 'computed' });
      const memoized = cache.memoize('test', expensiveFn, 60000);
      
      // First call - should compute
      const result1 = await memoized('arg1');
      expect(result1).toEqual({ result: 'computed' });
      expect(expensiveFn).toHaveBeenCalledTimes(1);
      
      // Second call with same args - should use cache
      const result2 = await memoized('arg1');
      expect(result2).toEqual({ result: 'computed' });
      expect(expensiveFn).toHaveBeenCalledTimes(1);
      
      // Call with different args - should compute again
      await memoized('arg2');
      expect(expensiveFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('invalidateUserCache', () => {
    it('should remove user-related cache entries', () => {
      cache.set(cache.KEYS.userProfile('user1'), { name: 'Test' });
      
      cache.invalidateUserCache('user1');
      
      expect(cache.get(cache.KEYS.userProfile('user1'))).toBeNull();
    });
  });

  describe('invalidateCompanyCache', () => {
    it('should remove company-related cache entries', () => {
      const companyId = 'company1';
      cache.set(cache.KEYS.companyProfile(companyId), { name: 'Company' });
      cache.set(cache.KEYS.companySettings(companyId), { setting: 'value' });
      cache.set(cache.KEYS.materials(companyId), []);
      
      cache.invalidateCompanyCache(companyId);
      
      expect(cache.get(cache.KEYS.companyProfile(companyId))).toBeNull();
      expect(cache.get(cache.KEYS.companySettings(companyId))).toBeNull();
      expect(cache.get(cache.KEYS.materials(companyId))).toBeNull();
    });
  });
});
