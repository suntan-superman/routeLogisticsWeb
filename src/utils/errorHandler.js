/**
 * Error Handler Utilities
 * Standardized error handling for the mi Factotum application
 * 
 * This module provides:
 * - Standardized error response format
 * - Error code definitions
 * - Error parsing utilities
 * - User-friendly error messages
 */

// ============================================================================
// ERROR CODES
// ============================================================================

/**
 * Application error codes for consistent error handling
 */
export const ERROR_CODES = {
  // Authentication errors (1xxx)
  AUTH_INVALID_CREDENTIALS: 'AUTH_1001',
  AUTH_SESSION_EXPIRED: 'AUTH_1002',
  AUTH_UNAUTHORIZED: 'AUTH_1003',
  AUTH_USER_NOT_FOUND: 'AUTH_1004',
  AUTH_EMAIL_NOT_VERIFIED: 'AUTH_1005',
  AUTH_RATE_LIMITED: 'AUTH_1006',
  AUTH_OTP_EXPIRED: 'AUTH_1007',
  AUTH_OTP_INVALID: 'AUTH_1008',
  
  // Validation errors (2xxx)
  VALIDATION_REQUIRED_FIELD: 'VAL_2001',
  VALIDATION_INVALID_FORMAT: 'VAL_2002',
  VALIDATION_INVALID_EMAIL: 'VAL_2003',
  VALIDATION_INVALID_PHONE: 'VAL_2004',
  VALIDATION_INVALID_DATE: 'VAL_2005',
  
  // Network errors (3xxx)
  NETWORK_OFFLINE: 'NET_3001',
  NETWORK_TIMEOUT: 'NET_3002',
  NETWORK_SERVER_ERROR: 'NET_3003',
  NETWORK_REQUEST_FAILED: 'NET_3004',
  
  // Data errors (4xxx)
  DATA_NOT_FOUND: 'DATA_4001',
  DATA_ALREADY_EXISTS: 'DATA_4002',
  DATA_INVALID_STATE: 'DATA_4003',
  DATA_CONFLICT: 'DATA_4004',
  
  // Permission errors (5xxx)
  PERMISSION_DENIED: 'PERM_5001',
  PERMISSION_INSUFFICIENT_ROLE: 'PERM_5002',
  PERMISSION_COMPANY_ACCESS: 'PERM_5003',
  
  // Payment errors (6xxx)
  PAYMENT_FAILED: 'PAY_6001',
  PAYMENT_CARD_DECLINED: 'PAY_6002',
  PAYMENT_AMOUNT_MISMATCH: 'PAY_6003',
  PAYMENT_ALREADY_PAID: 'PAY_6004',
  
  // General errors (9xxx)
  UNKNOWN_ERROR: 'ERR_9001',
  INTERNAL_ERROR: 'ERR_9002',
};

// ============================================================================
// USER-FRIENDLY ERROR MESSAGES
// ============================================================================

/**
 * Map of error codes to user-friendly messages
 */
const ERROR_MESSAGES = {
  [ERROR_CODES.AUTH_INVALID_CREDENTIALS]: 'Invalid email or password. Please try again.',
  [ERROR_CODES.AUTH_SESSION_EXPIRED]: 'Your session has expired. Please sign in again.',
  [ERROR_CODES.AUTH_UNAUTHORIZED]: 'You are not authorized to perform this action.',
  [ERROR_CODES.AUTH_USER_NOT_FOUND]: 'No account found with this email address.',
  [ERROR_CODES.AUTH_EMAIL_NOT_VERIFIED]: 'Please verify your email address to continue.',
  [ERROR_CODES.AUTH_RATE_LIMITED]: 'Too many attempts. Please try again later.',
  [ERROR_CODES.AUTH_OTP_EXPIRED]: 'Your verification code has expired. Please request a new one.',
  [ERROR_CODES.AUTH_OTP_INVALID]: 'Invalid verification code. Please try again.',
  
  [ERROR_CODES.VALIDATION_REQUIRED_FIELD]: 'Please fill in all required fields.',
  [ERROR_CODES.VALIDATION_INVALID_FORMAT]: 'The format of your input is invalid.',
  [ERROR_CODES.VALIDATION_INVALID_EMAIL]: 'Please enter a valid email address.',
  [ERROR_CODES.VALIDATION_INVALID_PHONE]: 'Please enter a valid phone number.',
  [ERROR_CODES.VALIDATION_INVALID_DATE]: 'Please enter a valid date.',
  
  [ERROR_CODES.NETWORK_OFFLINE]: 'You appear to be offline. Please check your connection.',
  [ERROR_CODES.NETWORK_TIMEOUT]: 'The request timed out. Please try again.',
  [ERROR_CODES.NETWORK_SERVER_ERROR]: 'Server error. Please try again later.',
  [ERROR_CODES.NETWORK_REQUEST_FAILED]: 'Request failed. Please try again.',
  
  [ERROR_CODES.DATA_NOT_FOUND]: 'The requested item was not found.',
  [ERROR_CODES.DATA_ALREADY_EXISTS]: 'This item already exists.',
  [ERROR_CODES.DATA_INVALID_STATE]: 'This action cannot be performed in the current state.',
  [ERROR_CODES.DATA_CONFLICT]: 'A conflict occurred. Please refresh and try again.',
  
  [ERROR_CODES.PERMISSION_DENIED]: 'You do not have permission to perform this action.',
  [ERROR_CODES.PERMISSION_INSUFFICIENT_ROLE]: 'Your role does not allow this action.',
  [ERROR_CODES.PERMISSION_COMPANY_ACCESS]: 'You do not have access to this company.',
  
  [ERROR_CODES.PAYMENT_FAILED]: 'Payment failed. Please try again.',
  [ERROR_CODES.PAYMENT_CARD_DECLINED]: 'Your card was declined. Please try another payment method.',
  [ERROR_CODES.PAYMENT_AMOUNT_MISMATCH]: 'Payment amount does not match invoice total.',
  [ERROR_CODES.PAYMENT_ALREADY_PAID]: 'This invoice has already been paid.',
  
  [ERROR_CODES.UNKNOWN_ERROR]: 'An unexpected error occurred. Please try again.',
  [ERROR_CODES.INTERNAL_ERROR]: 'Internal error. Please contact support if this persists.',
};

// ============================================================================
// STANDARDIZED RESPONSE FORMAT
// ============================================================================

/**
 * Create a successful response object
 * @param {*} data - The response data
 * @param {string} message - Optional success message
 * @returns {{ success: true, data: *, message?: string }}
 */
export function createSuccessResponse(data, message = null) {
  const response = {
    success: true,
    data,
  };
  if (message) {
    response.message = message;
  }
  return response;
}

/**
 * Create an error response object
 * @param {string} errorCode - Error code from ERROR_CODES
 * @param {string} [customMessage] - Custom error message (overrides default)
 * @param {Object} [details] - Additional error details for debugging
 * @returns {{ success: false, error: string, errorCode: string, details?: Object }}
 */
export function createErrorResponse(errorCode, customMessage = null, details = null) {
  const response = {
    success: false,
    error: customMessage || ERROR_MESSAGES[errorCode] || ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR],
    errorCode,
  };
  if (details && process.env.NODE_ENV === 'development') {
    response.details = details;
  }
  return response;
}

// ============================================================================
// ERROR PARSING UTILITIES
// ============================================================================

/**
 * Parse Firebase Auth errors into standardized error codes
 * @param {Error} error - Firebase auth error
 * @returns {string} Error code from ERROR_CODES
 */
export function parseFirebaseAuthError(error) {
  const code = error?.code || '';
  
  switch (code) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return ERROR_CODES.AUTH_INVALID_CREDENTIALS;
    case 'auth/email-already-in-use':
      return ERROR_CODES.DATA_ALREADY_EXISTS;
    case 'auth/invalid-email':
      return ERROR_CODES.VALIDATION_INVALID_EMAIL;
    case 'auth/too-many-requests':
      return ERROR_CODES.AUTH_RATE_LIMITED;
    case 'auth/network-request-failed':
      return ERROR_CODES.NETWORK_OFFLINE;
    case 'auth/id-token-expired':
    case 'auth/session-cookie-expired':
      return ERROR_CODES.AUTH_SESSION_EXPIRED;
    case 'auth/requires-recent-login':
      return ERROR_CODES.AUTH_SESSION_EXPIRED;
    default:
      return ERROR_CODES.UNKNOWN_ERROR;
  }
}

/**
 * Parse Firestore errors into standardized error codes
 * @param {Error} error - Firestore error
 * @returns {string} Error code from ERROR_CODES
 */
export function parseFirestoreError(error) {
  const code = error?.code || '';
  
  switch (code) {
    case 'permission-denied':
      return ERROR_CODES.PERMISSION_DENIED;
    case 'not-found':
      return ERROR_CODES.DATA_NOT_FOUND;
    case 'already-exists':
      return ERROR_CODES.DATA_ALREADY_EXISTS;
    case 'aborted':
    case 'failed-precondition':
      return ERROR_CODES.DATA_CONFLICT;
    case 'unavailable':
      return ERROR_CODES.NETWORK_OFFLINE;
    case 'deadline-exceeded':
      return ERROR_CODES.NETWORK_TIMEOUT;
    case 'invalid-argument':
      return ERROR_CODES.VALIDATION_INVALID_FORMAT;
    default:
      return ERROR_CODES.UNKNOWN_ERROR;
  }
}

/**
 * Parse network/fetch errors into standardized error codes
 * @param {Error} error - Network error
 * @returns {string} Error code from ERROR_CODES
 */
export function parseNetworkError(error) {
  const message = error?.message?.toLowerCase() || '';
  
  if (message.includes('network') || message.includes('offline') || message.includes('internet')) {
    return ERROR_CODES.NETWORK_OFFLINE;
  }
  if (message.includes('timeout') || message.includes('timed out')) {
    return ERROR_CODES.NETWORK_TIMEOUT;
  }
  if (error?.status >= 500) {
    return ERROR_CODES.NETWORK_SERVER_ERROR;
  }
  return ERROR_CODES.NETWORK_REQUEST_FAILED;
}

/**
 * Get user-friendly message for an error code
 * @param {string} errorCode - Error code from ERROR_CODES
 * @returns {string} User-friendly error message
 */
export function getErrorMessage(errorCode) {
  return ERROR_MESSAGES[errorCode] || ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR];
}

// ============================================================================
// ERROR HANDLER CLASS
// ============================================================================

/**
 * Application error class for throwing standardized errors
 */
export class AppError extends Error {
  constructor(errorCode, customMessage = null, details = null) {
    const message = customMessage || ERROR_MESSAGES[errorCode] || ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR];
    super(message);
    this.name = 'AppError';
    this.errorCode = errorCode;
    this.details = details;
  }

  /**
   * Convert to response object
   * @returns {{ success: false, error: string, errorCode: string, details?: Object }}
   */
  toResponse() {
    return createErrorResponse(this.errorCode, this.message, this.details);
  }
}

// ============================================================================
// ASYNC WRAPPER
// ============================================================================

/**
 * Wrap an async function to return standardized success/error responses
 * @param {Function} asyncFn - Async function to wrap
 * @returns {Function} Wrapped function that returns { success, data|error }
 */
export function withErrorHandling(asyncFn) {
  return async (...args) => {
    try {
      const result = await asyncFn(...args);
      return createSuccessResponse(result);
    } catch (error) {
      console.error('[ErrorHandler] Caught error:', error);
      
      if (error instanceof AppError) {
        return error.toResponse();
      }
      
      // Try to parse known error types
      let errorCode = ERROR_CODES.UNKNOWN_ERROR;
      
      if (error?.code?.startsWith('auth/')) {
        errorCode = parseFirebaseAuthError(error);
      } else if (error?.code?.includes('-')) {
        errorCode = parseFirestoreError(error);
      } else if (error?.message?.includes('network') || error?.message?.includes('fetch')) {
        errorCode = parseNetworkError(error);
      }
      
      return createErrorResponse(errorCode, null, {
        originalError: error?.message,
        stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
      });
    }
  };
}

export default {
  ERROR_CODES,
  createSuccessResponse,
  createErrorResponse,
  parseFirebaseAuthError,
  parseFirestoreError,
  parseNetworkError,
  getErrorMessage,
  AppError,
  withErrorHandling,
};
