/**
 * @fileoverview Simple caching utility for frequently accessed data
 * 
 * Provides in-memory caching with TTL for data that doesn't change often:
 * - Company profiles
 * - User profiles
 * - Static configuration
 * 
 * @module utils/cache
 */

/**
 * Cache configuration
 */
const CONFIG = {
  /** Default TTL in milliseconds (5 minutes) */
  defaultTTL: 5 * 60 * 1000,
  /** Maximum cache entries */
  maxEntries: 100,
  /** User profile TTL (longer - rarely changes) */
  userProfileTTL: 10 * 60 * 1000,
  /** Company profile TTL */
  companyProfileTTL: 15 * 60 * 1000,
  /** Static data TTL (30 minutes) */
  staticDataTTL: 30 * 60 * 1000
};

/**
 * Cache entry structure
 * @typedef {Object} CacheEntry
 * @property {*} data - Cached data
 * @property {number} expiry - Expiration timestamp
 * @property {number} hits - Number of cache hits
 */

/**
 * In-memory cache store
 * @private
 * @type {Map<string, CacheEntry>}
 */
const cache = new Map();

/**
 * Get an item from cache
 * @param {string} key - Cache key
 * @returns {*|null} Cached data or null if not found/expired
 */
export function get(key) {
  const entry = cache.get(key);
  
  if (!entry) {
    return null;
  }
  
  // Check expiry
  if (Date.now() > entry.expiry) {
    cache.delete(key);
    return null;
  }
  
  // Increment hit counter
  entry.hits++;
  return entry.data;
}

/**
 * Set an item in cache
 * @param {string} key - Cache key
 * @param {*} data - Data to cache
 * @param {number} [ttl] - Time to live in milliseconds
 */
export function set(key, data, ttl = CONFIG.defaultTTL) {
  // Evict oldest entries if at capacity
  if (cache.size >= CONFIG.maxEntries) {
    evictOldest();
  }
  
  cache.set(key, {
    data,
    expiry: Date.now() + ttl,
    hits: 0
  });
}

/**
 * Delete an item from cache
 * @param {string} key - Cache key
 * @returns {boolean} Whether the key existed
 */
export function del(key) {
  return cache.delete(key);
}

/**
 * Delete all items matching a prefix
 * @param {string} prefix - Key prefix
 */
export function deleteByPrefix(prefix) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

/**
 * Clear all cached data
 */
export function clear() {
  cache.clear();
}

/**
 * Get cache statistics
 * @returns {Object} Cache stats
 */
export function getStats() {
  let totalHits = 0;
  let expired = 0;
  const now = Date.now();
  
  for (const entry of cache.values()) {
    totalHits += entry.hits;
    if (now > entry.expiry) expired++;
  }
  
  return {
    size: cache.size,
    totalHits,
    expired,
    maxEntries: CONFIG.maxEntries
  };
}

/**
 * Evict oldest/least used entries
 * @private
 */
function evictOldest() {
  const now = Date.now();
  let oldestKey = null;
  let oldestExpiry = Infinity;
  
  // First pass: remove expired
  for (const [key, entry] of cache.entries()) {
    if (now > entry.expiry) {
      cache.delete(key);
    } else if (entry.expiry < oldestExpiry) {
      oldestExpiry = entry.expiry;
      oldestKey = key;
    }
  }
  
  // If still at capacity, remove oldest
  if (cache.size >= CONFIG.maxEntries && oldestKey) {
    cache.delete(oldestKey);
  }
}

// ============================================================================
// SPECIALIZED CACHE HELPERS
// ============================================================================

/**
 * Cache key generators
 */
export const KEYS = {
  userProfile: (userId) => `user:${userId}`,
  companyProfile: (companyId) => `company:${companyId}`,
  companySettings: (companyId) => `settings:${companyId}`,
  materials: (companyId) => `materials:${companyId}`,
  categories: (companyId) => `categories:${companyId}`
};

/**
 * Get or fetch user profile with caching
 * @param {string} userId - User ID
 * @param {Function} fetchFn - Function to fetch if not cached
 * @returns {Promise<*>} User profile
 */
export async function getOrFetchUserProfile(userId, fetchFn) {
  const key = KEYS.userProfile(userId);
  const cached = get(key);
  
  if (cached) {
    return cached;
  }
  
  const data = await fetchFn();
  if (data) {
    set(key, data, CONFIG.userProfileTTL);
  }
  return data;
}

/**
 * Get or fetch company profile with caching
 * @param {string} companyId - Company ID
 * @param {Function} fetchFn - Function to fetch if not cached
 * @returns {Promise<*>} Company profile
 */
export async function getOrFetchCompanyProfile(companyId, fetchFn) {
  const key = KEYS.companyProfile(companyId);
  const cached = get(key);
  
  if (cached) {
    return cached;
  }
  
  const data = await fetchFn();
  if (data) {
    set(key, data, CONFIG.companyProfileTTL);
  }
  return data;
}

/**
 * Invalidate user-related caches
 * @param {string} userId - User ID
 */
export function invalidateUserCache(userId) {
  del(KEYS.userProfile(userId));
}

/**
 * Invalidate company-related caches
 * @param {string} companyId - Company ID
 */
export function invalidateCompanyCache(companyId) {
  del(KEYS.companyProfile(companyId));
  del(KEYS.companySettings(companyId));
  del(KEYS.materials(companyId));
  del(KEYS.categories(companyId));
}

/**
 * Memoize an async function with caching
 * @param {string} cacheKey - Base cache key
 * @param {Function} fn - Async function to memoize
 * @param {number} [ttl] - Cache TTL
 * @returns {Function} Memoized function
 * 
 * @example
 * const cachedGetUser = memoize('user', getUserFromDB, 60000);
 * const user = await cachedGetUser('user123');
 */
export function memoize(cacheKey, fn, ttl = CONFIG.defaultTTL) {
  return async (...args) => {
    const key = `${cacheKey}:${JSON.stringify(args)}`;
    const cached = get(key);
    
    if (cached !== null) {
      return cached;
    }
    
    const result = await fn(...args);
    set(key, result, ttl);
    return result;
  };
}

export default {
  get,
  set,
  del,
  deleteByPrefix,
  clear,
  getStats,
  KEYS,
  getOrFetchUserProfile,
  getOrFetchCompanyProfile,
  invalidateUserCache,
  invalidateCompanyCache,
  memoize,
  CONFIG
};
