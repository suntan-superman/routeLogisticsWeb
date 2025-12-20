/**
 * Unit tests for pagination utilities
 * @module test/utils/pagination.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PAGINATION_DEFAULTS, createPaginationState } from '../../utils/pagination';

// Mock Firebase
vi.mock('firebase/firestore', () => ({
  query: vi.fn(),
  collection: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn(),
  startAfter: vi.fn(),
  orderBy: vi.fn(),
  where: vi.fn()
}));

describe('pagination', () => {
  describe('PAGINATION_DEFAULTS', () => {
    it('should have sensible default values', () => {
      expect(PAGINATION_DEFAULTS.pageSize).toBe(25);
      expect(PAGINATION_DEFAULTS.maxPageSize).toBe(100);
      expect(PAGINATION_DEFAULTS.cacheTimeout).toBe(5 * 60 * 1000);
    });
  });

  describe('createPaginationState', () => {
    it('should create initial pagination state', () => {
      const state = createPaginationState();
      
      expect(state.items).toEqual([]);
      expect(state.lastDoc).toBeNull();
      expect(state.hasMore).toBe(true);
      expect(state.totalFetched).toBe(0);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });
  });
});
