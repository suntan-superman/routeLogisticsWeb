/**
 * Test setup file for Vitest
 * Configures test environment and global mocks
 */

import { vi, beforeAll, afterEach } from 'vitest';
import '@testing-library/jest-dom';

// Mock Firebase
vi.mock('../services/firebase', () => ({
  db: {},
  auth: {
    currentUser: null,
    onAuthStateChanged: vi.fn()
  },
  storage: {}
}));

// Mock environment variables
vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-api-key');
vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'test.firebaseapp.com');
vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'test-project');

// Global test utilities
global.mockFirestoreDoc = (data) => ({
  id: data.id || 'test-id',
  data: () => data,
  exists: () => true
});

global.mockFirestoreSnapshot = (docs) => ({
  docs: docs.map(d => global.mockFirestoreDoc(d)),
  empty: docs.length === 0,
  forEach: (fn) => docs.forEach((d, i) => fn(global.mockFirestoreDoc(d), i))
});

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
});

// Console warning suppression for expected warnings
const originalWarn = console.warn;
beforeAll(() => {
  console.warn = (...args) => {
    // Suppress React 19 ref warnings in tests
    if (args[0]?.includes?.('ref')) return;
    originalWarn.apply(console, args);
  };
});
