/**
 * Date utility functions to handle timezone issues consistently
 * across the application.
 * 
 * Common Problem: new Date('2025-11-13') interprets as UTC midnight,
 * which can display as previous day in timezones behind UTC.
 * 
 * Solution: Always add a time component when parsing date-only strings.
 */

/**
 * Parse a date string safely, avoiding timezone offset issues
 * @param {string} dateString - Date in format 'YYYY-MM-DD'
 * @returns {Date} Date object at noon local time
 */
export function parseDate(dateString) {
  if (!dateString) return new Date();
  
  // If already has time component, parse normally
  if (dateString.includes('T') || dateString.includes(' ')) {
    return new Date(dateString);
  }
  
  // For date-only strings, add noon time to avoid timezone issues
  return new Date(dateString + 'T12:00:00');
}

/**
 * Format a date for display (handles both Date objects and date strings)
 * @param {Date|string} date - Date object or date string
 * @param {Object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date string
 */
export function formatDate(date, options = {}) {
  if (!date) return '';
  
  const dateObj = typeof date === 'string' ? parseDate(date) : date;
  
  const defaultOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options
  };
  
  return new Intl.DateTimeFormat('en-US', defaultOptions).format(dateObj);
}

/**
 * Format a date with full details (weekday, month, day, year)
 * @param {Date|string} date - Date object or date string
 * @returns {string} Formatted date string like "Monday, November 13, 2025"
 */
export function formatDateLong(date) {
  return formatDate(date, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Format a date for short display (no year if current year)
 * @param {Date|string} date - Date object or date string
 * @returns {string} Formatted date string like "Nov 13" or "Nov 13, 2024"
 */
export function formatDateShort(date) {
  if (!date) return '';
  
  const dateObj = typeof date === 'string' ? parseDate(date) : date;
  const now = new Date();
  const isSameYear = dateObj.getFullYear() === now.getFullYear();
  
  return formatDate(date, {
    month: 'short',
    day: 'numeric',
    ...(isSameYear ? {} : { year: 'numeric' })
  });
}

/**
 * Get the local date string in YYYY-MM-DD format
 * @param {Date} date - Date object (defaults to today)
 * @returns {string} Date string in YYYY-MM-DD format
 */
export function toLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Check if a date string is today
 * @param {string} dateString - Date in format 'YYYY-MM-DD'
 * @returns {boolean} True if date is today
 */
export function isToday(dateString) {
  if (!dateString) return false;
  const date = parseDate(dateString);
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

/**
 * Check if a date string is in the past
 * @param {string} dateString - Date in format 'YYYY-MM-DD'
 * @returns {boolean} True if date is in the past
 */
export function isPastDate(dateString) {
  if (!dateString) return false;
  const date = parseDate(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

/**
 * Get relative date description (Today, Tomorrow, Yesterday, or formatted date)
 * @param {string} dateString - Date in format 'YYYY-MM-DD'
 * @returns {string} Relative description or formatted date
 */
export function getRelativeDateString(dateString) {
  if (!dateString) return '';
  
  const date = parseDate(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const dateOnly = new Date(date);
  dateOnly.setHours(0, 0, 0, 0);
  
  if (dateOnly.getTime() === today.getTime()) return 'Today';
  if (dateOnly.getTime() === tomorrow.getTime()) return 'Tomorrow';
  if (dateOnly.getTime() === yesterday.getTime()) return 'Yesterday';
  
  return formatDateShort(date);
}

