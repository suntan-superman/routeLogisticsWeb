/**
 * Unit tests for error handling utilities
 * @module test/utils/errorHandler.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ERROR_CODES,
  createSuccessResponse,
  createErrorResponse,
  parseFirebaseAuthError,
  parseFirestoreError,
  parseNetworkError,
  getErrorMessage,
  AppError,
  withErrorHandling
} from '../../utils/errorHandler';

describe('errorHandler', () => {
  describe('ERROR_CODES', () => {
    it('should have all standard error codes', () => {
      // Authentication
      expect(ERROR_CODES.AUTH_INVALID_CREDENTIALS).toBe('AUTH_1001');
      expect(ERROR_CODES.AUTH_SESSION_EXPIRED).toBe('AUTH_1002');
      expect(ERROR_CODES.AUTH_USER_NOT_FOUND).toBe('AUTH_1004');
      expect(ERROR_CODES.AUTH_RATE_LIMITED).toBe('AUTH_1006');
      
      // Validation
      expect(ERROR_CODES.VALIDATION_INVALID_EMAIL).toBe('VAL_2003');
      
      // Network
      expect(ERROR_CODES.NETWORK_OFFLINE).toBe('NET_3001');
      expect(ERROR_CODES.NETWORK_TIMEOUT).toBe('NET_3002');
      
      // Data
      expect(ERROR_CODES.DATA_NOT_FOUND).toBe('DATA_4001');
      
      // Permission
      expect(ERROR_CODES.PERMISSION_DENIED).toBe('PERM_5001');
      
      // General
      expect(ERROR_CODES.UNKNOWN_ERROR).toBe('ERR_9001');
    });
  });

  describe('createSuccessResponse', () => {
    it('should create a success response with data', () => {
      const data = { id: '123', name: 'Test' };
      const response = createSuccessResponse(data);
      
      expect(response.success).toBe(true);
      expect(response.data).toEqual(data);
      expect(response.message).toBeUndefined();
    });

    it('should handle null data', () => {
      const response = createSuccessResponse(null);
      
      expect(response.success).toBe(true);
      expect(response.data).toBeNull();
    });

    it('should handle array data', () => {
      const data = [{ id: 1 }, { id: 2 }];
      const response = createSuccessResponse(data);
      
      expect(response.success).toBe(true);
      expect(response.data).toHaveLength(2);
    });
  });

  describe('createErrorResponse', () => {
    it('should create an error response with default message from code', () => {
      const response = createErrorResponse(ERROR_CODES.AUTH_INVALID_CREDENTIALS);
      
      expect(response.success).toBe(false);
      expect(response.error).toBe('Invalid email or password. Please try again.');
      expect(response.errorCode).toBe(ERROR_CODES.AUTH_INVALID_CREDENTIALS);
    });

    it('should accept a custom message', () => {
      const response = createErrorResponse(ERROR_CODES.DATA_NOT_FOUND, 'User not found');
      
      expect(response.success).toBe(false);
      expect(response.error).toBe('User not found');
      expect(response.errorCode).toBe(ERROR_CODES.DATA_NOT_FOUND);
    });

    it('should fallback to unknown error for invalid codes', () => {
      const response = createErrorResponse('INVALID_CODE');
      
      expect(response.success).toBe(false);
      expect(response.error).toBe('An unexpected error occurred. Please try again.');
    });
  });

  describe('parseFirebaseAuthError', () => {
    it('should parse user-not-found error', () => {
      const error = { code: 'auth/user-not-found' };
      const result = parseFirebaseAuthError(error);
      
      expect(result).toBe(ERROR_CODES.AUTH_INVALID_CREDENTIALS);
    });

    it('should parse wrong-password error', () => {
      const error = { code: 'auth/wrong-password' };
      const result = parseFirebaseAuthError(error);
      
      expect(result).toBe(ERROR_CODES.AUTH_INVALID_CREDENTIALS);
    });

    it('should parse invalid-email error', () => {
      const error = { code: 'auth/invalid-email' };
      const result = parseFirebaseAuthError(error);
      
      expect(result).toBe(ERROR_CODES.VALIDATION_INVALID_EMAIL);
    });

    it('should parse too-many-requests error', () => {
      const error = { code: 'auth/too-many-requests' };
      const result = parseFirebaseAuthError(error);
      
      expect(result).toBe(ERROR_CODES.AUTH_RATE_LIMITED);
    });

    it('should handle unknown auth errors', () => {
      const error = { code: 'auth/unknown-error' };
      const result = parseFirebaseAuthError(error);
      
      expect(result).toBe(ERROR_CODES.UNKNOWN_ERROR);
    });
  });

  describe('parseFirestoreError', () => {
    it('should parse permission-denied error', () => {
      const error = { code: 'permission-denied' };
      const result = parseFirestoreError(error);
      
      expect(result).toBe(ERROR_CODES.PERMISSION_DENIED);
    });

    it('should parse not-found error', () => {
      const error = { code: 'not-found' };
      const result = parseFirestoreError(error);
      
      expect(result).toBe(ERROR_CODES.DATA_NOT_FOUND);
    });

    it('should parse unavailable error', () => {
      const error = { code: 'unavailable' };
      const result = parseFirestoreError(error);
      
      expect(result).toBe(ERROR_CODES.NETWORK_OFFLINE);
    });

    it('should handle unknown Firestore errors', () => {
      const error = { code: 'unknown' };
      const result = parseFirestoreError(error);
      
      expect(result).toBe(ERROR_CODES.UNKNOWN_ERROR);
    });
  });

  describe('parseNetworkError', () => {
    it('should parse network errors', () => {
      const error = { message: 'Network error' };
      const result = parseNetworkError(error);
      
      expect(result).toBe(ERROR_CODES.NETWORK_OFFLINE);
    });

    it('should parse timeout errors', () => {
      const error = { message: 'Request timed out' };
      const result = parseNetworkError(error);
      
      expect(result).toBe(ERROR_CODES.NETWORK_TIMEOUT);
    });

    it('should parse server errors', () => {
      const error = { message: 'Error', status: 500 };
      const result = parseNetworkError(error);
      
      expect(result).toBe(ERROR_CODES.NETWORK_SERVER_ERROR);
    });
  });

  describe('getErrorMessage', () => {
    it('should return message for known error code', () => {
      const message = getErrorMessage(ERROR_CODES.AUTH_SESSION_EXPIRED);
      expect(message).toBe('Your session has expired. Please sign in again.');
    });

    it('should return unknown error for invalid code', () => {
      const message = getErrorMessage('INVALID');
      expect(message).toBe('An unexpected error occurred. Please try again.');
    });
  });

  describe('AppError', () => {
    it('should create an AppError with default message from code', () => {
      const error = new AppError(ERROR_CODES.PERMISSION_DENIED);
      
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('You do not have permission to perform this action.');
      expect(error.errorCode).toBe(ERROR_CODES.PERMISSION_DENIED);
      expect(error.name).toBe('AppError');
    });

    it('should use custom message when provided', () => {
      const error = new AppError(ERROR_CODES.DATA_NOT_FOUND, 'User not found');
      
      expect(error.message).toBe('User not found');
      expect(error.errorCode).toBe(ERROR_CODES.DATA_NOT_FOUND);
    });

    it('should store additional details', () => {
      const details = { field: 'email', reason: 'invalid format' };
      const error = new AppError(ERROR_CODES.UNKNOWN_ERROR, null, details);
      
      expect(error.details).toEqual(details);
    });
  });

  describe('withErrorHandling', () => {
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should return success response on successful function', async () => {
      const fn = async () => ({ id: '123', name: 'Test' });
      const wrapped = withErrorHandling(fn);
      
      const result = await wrapped();
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: '123', name: 'Test' });
    });

    it('should return error response on thrown error', async () => {
      const fn = async () => {
        throw new Error('Something went wrong');
      };
      const wrapped = withErrorHandling(fn);
      
      const result = await wrapped();
      
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.UNKNOWN_ERROR);
    });

    it('should preserve AppError code', async () => {
      const fn = async () => {
        throw new AppError(ERROR_CODES.DATA_NOT_FOUND, 'Item not found');
      };
      const wrapped = withErrorHandling(fn);
      
      const result = await wrapped();
      
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.DATA_NOT_FOUND);
    });

    it('should pass arguments to wrapped function', async () => {
      const fn = async (a, b) => a + b;
      const wrapped = withErrorHandling(fn);
      
      const result = await wrapped(2, 3);
      
      expect(result.success).toBe(true);
      expect(result.data).toBe(5);
    });
  });
});
