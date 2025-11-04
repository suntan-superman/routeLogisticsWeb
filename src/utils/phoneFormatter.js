/**
 * Phone number formatting utility
 * Formats phone numbers as (XXX) XXX-XXXX
 */

/**
 * Formats a phone number string to (XXX) XXX-XXXX format
 * @param {string} value - The phone number string (can include formatting)
 * @returns {string} - Formatted phone number
 */
export const formatPhoneNumber = (value) => {
  // Handle null/undefined
  if (!value) return '';
  
  // Convert to string if needed
  const stringValue = String(value);
  
  // Remove all non-numeric characters
  const phoneNumber = stringValue.replace(/\D/g, '');
  
  // Return empty string if no digits
  if (!phoneNumber) return '';
  
  // Limit to 10 digits (US phone number)
  const limitedNumber = phoneNumber.slice(0, 10);
  
  // Format based on length
  if (limitedNumber.length <= 3) {
    return `(${limitedNumber}`;
  } else if (limitedNumber.length <= 6) {
    return `(${limitedNumber.slice(0, 3)}) ${limitedNumber.slice(3)}`;
  } else {
    return `(${limitedNumber.slice(0, 3)}) ${limitedNumber.slice(3, 6)}-${limitedNumber.slice(6)}`;
  }
};

/**
 * Validates if a phone number is complete (10 digits)
 * @param {string} value - The phone number string
 * @returns {boolean} - True if valid 10-digit phone number
 */
export const isValidPhoneNumber = (value) => {
  const phoneNumber = value.replace(/\D/g, '');
  return phoneNumber.length === 10;
};

/**
 * Gets the unformatted phone number (digits only)
 * @param {string} value - The formatted phone number
 * @returns {string} - Unformatted phone number (digits only)
 */
export const getUnformattedPhone = (value) => {
  return value.replace(/\D/g, '');
};

/**
 * Handles phone number input change
 * Formats the input as the user types
 * @param {Event} e - The input event
 * @param {Function} setValue - State setter function
 * @returns {string} - Formatted phone number
 */
export const handlePhoneInputChange = (e, setValue) => {
  const input = e.target.value;
  const formatted = formatPhoneNumber(input);
  setValue(formatted);
  // Return formatted value to allow event to continue
  return formatted;
};

/**
 * Direct handler for phone input that can be used inline
 * @param {string} value - The input value
 * @returns {string} - Formatted phone number
 */
export const formatPhoneInput = (value) => {
  return formatPhoneNumber(value);
};

