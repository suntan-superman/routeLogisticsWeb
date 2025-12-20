/**
 * @fileoverview Pagination utilities for Firestore queries
 * 
 * Provides standardized pagination, cursor management, and caching
 * for efficient data loading throughout the application.
 * 
 * @module utils/pagination
 */

import { 
  query, 
  collection, 
  getDocs, 
  limit, 
  startAfter, 
  orderBy,
  where 
} from 'firebase/firestore';
import { db } from '../services/firebase';

/**
 * Default pagination configuration
 */
export const PAGINATION_DEFAULTS = {
  pageSize: 25,
  maxPageSize: 100,
  cacheTimeout: 5 * 60 * 1000, // 5 minutes
};

/**
 * In-memory cache for paginated results
 * @private
 */
const cache = new Map();

/**
 * Generate a cache key from query parameters
 * @private
 * @param {string} collectionName - Firestore collection name
 * @param {Object} filters - Query filters
 * @param {string} orderField - Field to order by
 * @returns {string} Cache key
 */
const generateCacheKey = (collectionName, filters, orderField) => {
  const filterStr = JSON.stringify(filters || {});
  return `${collectionName}:${filterStr}:${orderField}`;
};

/**
 * Paginated query result
 * @typedef {Object} PaginatedResult
 * @property {boolean} success - Whether the query succeeded
 * @property {Array} items - Array of documents
 * @property {Object|null} lastDoc - Last document for cursor pagination
 * @property {boolean} hasMore - Whether more results are available
 * @property {number} totalFetched - Total items fetched so far
 * @property {string} [error] - Error message if failed
 */

/**
 * Execute a paginated Firestore query
 * 
 * @param {Object} options - Query options
 * @param {string} options.collectionName - Firestore collection name
 * @param {Array<Object>} [options.filters] - Array of {field, operator, value} filters
 * @param {string} [options.orderField='createdAt'] - Field to order by
 * @param {string} [options.orderDirection='desc'] - Order direction ('asc' or 'desc')
 * @param {number} [options.pageSize=25] - Number of items per page
 * @param {Object} [options.cursor=null] - Last document from previous query
 * @param {boolean} [options.useCache=true] - Whether to use caching
 * @returns {Promise<PaginatedResult>} Paginated results
 * 
 * @example
 * // First page
 * const result = await paginatedQuery({
 *   collectionName: 'customers',
 *   filters: [{ field: 'companyId', operator: '==', value: 'abc123' }],
 *   orderField: 'createdAt',
 *   pageSize: 25
 * });
 * 
 * // Next page
 * const nextResult = await paginatedQuery({
 *   collectionName: 'customers',
 *   filters: [{ field: 'companyId', operator: '==', value: 'abc123' }],
 *   cursor: result.lastDoc
 * });
 */
export async function paginatedQuery({
  collectionName,
  filters = [],
  orderField = 'createdAt',
  orderDirection = 'desc',
  pageSize = PAGINATION_DEFAULTS.pageSize,
  cursor = null,
  useCache = true
}) {
  try {
    // Validate page size
    const effectivePageSize = Math.min(
      Math.max(1, pageSize),
      PAGINATION_DEFAULTS.maxPageSize
    );

    // Build query constraints
    const constraints = [];

    // Add filters
    for (const filter of filters) {
      if (filter.field && filter.operator && filter.value !== undefined) {
        constraints.push(where(filter.field, filter.operator, filter.value));
      }
    }

    // Add ordering
    constraints.push(orderBy(orderField, orderDirection));

    // Add cursor if paginating
    if (cursor) {
      constraints.push(startAfter(cursor));
    }

    // Add limit (fetch one extra to check if more exist)
    constraints.push(limit(effectivePageSize + 1));

    // Execute query
    const q = query(collection(db, collectionName), ...constraints);
    const snapshot = await getDocs(q);

    // Process results
    const items = [];
    let lastDoc = null;
    let count = 0;

    snapshot.forEach((doc) => {
      count++;
      if (count <= effectivePageSize) {
        items.push({
          id: doc.id,
          ...doc.data()
        });
        lastDoc = doc;
      }
    });

    const hasMore = count > effectivePageSize;

    return {
      success: true,
      items,
      lastDoc,
      hasMore,
      totalFetched: items.length
    };
  } catch (error) {
    console.error(`Pagination error for ${collectionName}:`, error);
    
    // If it's an index error, try without orderBy
    if (error.code === 'failed-precondition') {
      try {
        return await paginatedQueryWithoutOrder({
          collectionName,
          filters,
          orderField,
          orderDirection,
          pageSize,
          cursor
        });
      } catch (fallbackError) {
        return {
          success: false,
          error: fallbackError.message,
          items: [],
          lastDoc: null,
          hasMore: false,
          totalFetched: 0
        };
      }
    }

    return {
      success: false,
      error: error.message,
      items: [],
      lastDoc: null,
      hasMore: false,
      totalFetched: 0
    };
  }
}

/**
 * Fallback pagination without orderBy (for missing indexes)
 * @private
 */
async function paginatedQueryWithoutOrder({
  collectionName,
  filters = [],
  orderField,
  orderDirection,
  pageSize
}) {
  const constraints = [];

  for (const filter of filters) {
    if (filter.field && filter.operator && filter.value !== undefined) {
      constraints.push(where(filter.field, filter.operator, filter.value));
    }
  }

  const q = query(collection(db, collectionName), ...constraints);
  const snapshot = await getDocs(q);

  const items = [];
  snapshot.forEach((doc) => {
    items.push({
      id: doc.id,
      ...doc.data()
    });
  });

  // Sort client-side
  items.sort((a, b) => {
    const aVal = a[orderField];
    const bVal = b[orderField];
    
    // Handle Firestore Timestamps
    const aTime = aVal?.toDate ? aVal.toDate().getTime() : 
                  aVal ? new Date(aVal).getTime() : 0;
    const bTime = bVal?.toDate ? bVal.toDate().getTime() : 
                  bVal ? new Date(bVal).getTime() : 0;
    
    return orderDirection === 'desc' ? bTime - aTime : aTime - bTime;
  });

  // Apply pagination client-side
  const paginatedItems = items.slice(0, pageSize);

  return {
    success: true,
    items: paginatedItems,
    lastDoc: null, // Can't use cursor with client-side pagination
    hasMore: items.length > pageSize,
    totalFetched: paginatedItems.length,
    warning: 'Using client-side sorting due to missing Firestore index'
  };
}

/**
 * Cached query result fetcher
 * Caches first page results for quick re-renders
 * 
 * @param {Object} options - Same options as paginatedQuery
 * @returns {Promise<PaginatedResult>} Paginated results (from cache if available)
 */
export async function cachedPaginatedQuery(options) {
  const cacheKey = generateCacheKey(
    options.collectionName,
    options.filters,
    options.orderField
  );

  // Check cache (only for first page)
  if (!options.cursor && cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    if (Date.now() - cached.timestamp < PAGINATION_DEFAULTS.cacheTimeout) {
      return { ...cached.data, fromCache: true };
    }
    cache.delete(cacheKey);
  }

  // Fetch fresh data
  const result = await paginatedQuery(options);

  // Cache first page results
  if (result.success && !options.cursor) {
    cache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });
  }

  return result;
}

/**
 * Invalidate cache for a collection
 * Call this after creating/updating/deleting documents
 * 
 * @param {string} collectionName - Collection name to invalidate
 */
export function invalidateCache(collectionName) {
  for (const key of cache.keys()) {
    if (key.startsWith(`${collectionName}:`)) {
      cache.delete(key);
    }
  }
}

/**
 * Clear all cached data
 */
export function clearAllCache() {
  cache.clear();
}

/**
 * Infinite scroll helper - accumulates pages
 * 
 * @param {Object} currentState - Current pagination state
 * @param {Array} currentState.items - Currently loaded items
 * @param {Object} currentState.lastDoc - Last document cursor
 * @param {Object} queryOptions - Query options (same as paginatedQuery)
 * @returns {Promise<Object>} Updated state with accumulated items
 */
export async function loadMoreItems(currentState, queryOptions) {
  const result = await paginatedQuery({
    ...queryOptions,
    cursor: currentState.lastDoc
  });

  if (!result.success) {
    return {
      ...currentState,
      error: result.error,
      isLoading: false
    };
  }

  return {
    items: [...currentState.items, ...result.items],
    lastDoc: result.lastDoc,
    hasMore: result.hasMore,
    totalFetched: currentState.items.length + result.items.length,
    isLoading: false
  };
}

/**
 * Create initial pagination state
 * @returns {Object} Initial state for pagination
 */
export function createPaginationState() {
  return {
    items: [],
    lastDoc: null,
    hasMore: true,
    totalFetched: 0,
    isLoading: false,
    error: null
  };
}

export default {
  paginatedQuery,
  cachedPaginatedQuery,
  invalidateCache,
  clearAllCache,
  loadMoreItems,
  createPaginationState,
  PAGINATION_DEFAULTS
};
