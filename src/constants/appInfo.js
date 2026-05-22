/**
 * Application Info Constants
 * Centralized location for app branding, version, and copyright information
 * Update COPYRIGHT_YEAR annually
 */

export const APP_INFO = {
  // Update this each year
  COPYRIGHT_YEAR: 2026,
  
  // Company information
  COMPANY_NAME: 'Workside Software LLC',
  COMPANY_SHORT: 'Workside Software',
  
  // App branding
  APP_NAME: 'miFactotum',
  APP_TAGLINE: 'Route Logistics',
  
  // Copyright notices (pre-formatted for convenience)
  get COPYRIGHT_NOTICE() {
    return `${this.COMPANY_NAME} Copyright ${this.COPYRIGHT_YEAR}`;
  },
  get COPYRIGHT_SHORT() {
    return `© ${this.COPYRIGHT_YEAR}`;
  },
  get COPYRIGHT_FULL() {
    return `© ${this.COPYRIGHT_YEAR} ${this.COMPANY_SHORT}. All rights reserved.`;
  },
};

export default APP_INFO;
