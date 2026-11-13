/**
 * Responsive Sizes Constants for Route Logisitics
 * Provides consistent percentage-based sizing across the app
 * Using react-native-responsive-screen for cross-device compatibility
 */

import {
  widthPercentageToDP as wpFunc,
  heightPercentageToDP as hpFunc,
} from 'react-native-responsive-screen';

// Export the base functions
export const wp = wpFunc;
export const hp = hpFunc;

// ============================================================
// SPACING
// ============================================================

export const SPACING = {
  // Tiny spacing (2-4px equivalent)
  TINY: hpFunc('0.3%'),
  TINY_HORIZONTAL: wpFunc('0.5%'),
  
  // Small spacing (6-10px equivalent)
  SMALL: hpFunc('0.8%'),
  SMALL_HORIZONTAL: wpFunc('1.5%'),
  
  // Medium spacing (12-16px equivalent)
  MEDIUM: hpFunc('1.5%'),
  MEDIUM_HORIZONTAL: wpFunc('3%'),
  
  // Large spacing (20-24px equivalent)
  LARGE: hpFunc('2.5%'),
  LARGE_HORIZONTAL: wpFunc('5%'),
  
  // Extra large spacing (32-40px equivalent)
  XLARGE: hpFunc('4%'),
  XLARGE_HORIZONTAL: wpFunc('8%'),
  
  // Section spacing
  SECTION: hpFunc('3%'),
};

// ============================================================
// FONT SIZES
// ============================================================

export const FONT_SIZES = {
  // Small text (8-10px equivalent)
  TINY: Math.max(hpFunc('1%'), 10),      // Min 10px for readability
  
  // Caption text (11-12px equivalent)
  CAPTION: Math.max(hpFunc('1.3%'), 11),  // Min 11px
  
  // Body text (13-14px equivalent)
  SMALL: Math.max(hpFunc('1.5%'), 12),    // Min 12px
  BODY: Math.max(hpFunc('1.8%'), 13),     // Min 13px
  
  // Heading text (16-18px equivalent)
  MEDIUM: Math.max(hpFunc('2%'), 14),     // Min 14px
  HEADING: Math.max(hpFunc('2.5%'), 16),  // Min 16px
  
  // Large heading (20-24px equivalent)
  LARGE: Math.max(hpFunc('3%'), 18),      // Min 18px
  XLARGE: Math.max(hpFunc('3.5%'), 20),   // Min 20px
  
  // Title text (28-32px equivalent)
  TITLE: Math.max(hpFunc('4%'), 24),      // Min 24px
  DISPLAY: Math.max(hpFunc('5%'), 28),    // Min 28px
};

// ============================================================
// COMPONENT SIZES
// ============================================================

export const BUTTON_SIZES = {
  // Button heights
  SMALL: hpFunc('5%'),
  MEDIUM: hpFunc('6%'),
  LARGE: hpFunc('7%'),
  
  // Button paddings
  PADDING_HORIZONTAL: wpFunc('4%'),
  PADDING_VERTICAL: hpFunc('1.5%'),
};

export const ICON_SIZES = {
  TINY: hpFunc('1.5%'),
  SMALL: hpFunc('2%'),
  MEDIUM: hpFunc('2.5%'),
  LARGE: hpFunc('3.5%'),
  XLARGE: hpFunc('5%'),
};

export const INPUT_SIZES = {
  HEIGHT: hpFunc('6%'),
  PADDING: wpFunc('3%'),
  BORDER_RADIUS: hpFunc('1%'),
};

export const CARD_SIZES = {
  PADDING: wpFunc('4%'),
  BORDER_RADIUS: hpFunc('1.2%'),
  SHADOW_RADIUS: hpFunc('0.5%'),
};

// ============================================================
// WIDTHS
// ============================================================

export const WIDTHS = {
  // Standard widths
  FULL: wpFunc('100%'),
  CONTENT: wpFunc('90%'),          // Main content area
  CONTENT_MAX: wpFunc('95%'),      // Maximum content width
  HALF: wpFunc('45%'),
  THIRD: wpFunc('30%'),
  QUARTER: wpFunc('22%'),
  
  // Modal widths
  MODAL_SMALL: wpFunc('75%'),
  MODAL_MEDIUM: wpFunc('85%'),
  MODAL_LARGE: wpFunc('95%'),
  
  // Card widths
  CARD_SMALL: wpFunc('40%'),
  CARD_MEDIUM: wpFunc('45%'),
  CARD_LARGE: wpFunc('90%'),
};

// ============================================================
// HEIGHTS
// ============================================================

export const HEIGHTS = {
  // Component heights
  HEADER: hpFunc('8%'),
  TAB_BAR: hpFunc('8%'),
  BOTTOM_SHEET: hpFunc('60%'),
  
  // Modal heights
  MODAL_SMALL: hpFunc('30%'),
  MODAL_MEDIUM: hpFunc('50%'),
  MODAL_LARGE: hpFunc('80%'),
  
  // Row heights
  LIST_ITEM: hpFunc('8%'),
  LIST_ITEM_SMALL: hpFunc('6%'),
  LIST_ITEM_LARGE: hpFunc('10%'),
};

// ============================================================
// TOUCH TARGET SIZES
// ============================================================

export const TOUCH_TARGETS = {
  // Minimum touch targets for accessibility (44x44 points)
  MIN_WIDTH: Math.max(wpFunc('10%'), 44),
  MIN_HEIGHT: Math.max(hpFunc('5.5%'), 44),
  
  // Standard touch targets
  SMALL: hpFunc('5%'),
  MEDIUM: hpFunc('6%'),
  LARGE: hpFunc('8%'),
};

// ============================================================
// BORDER RADIUS
// ============================================================

export const BORDER_RADIUS = {
  SMALL: hpFunc('0.5%'),
  MEDIUM: hpFunc('1%'),
  LARGE: hpFunc('1.5%'),
  XLARGE: hpFunc('2%'),
  ROUND: hpFunc('50%'),
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Get responsive width
 * @param {number} percentage - Percentage of screen width (1-100)
 */
export const rw = (percentage) => wpFunc(`${percentage}%`);

/**
 * Get responsive height
 * @param {number} percentage - Percentage of screen height (1-100)
 */
export const rh = (percentage) => hpFunc(`${percentage}%`);

/**
 * Get responsive font size with minimum
 * @param {number} percentage - Percentage of screen height
 * @param {number} min - Minimum font size in pixels
 */
export const rf = (percentage, min = 12) => Math.max(hpFunc(`${percentage}%`), min);

// ============================================================
// RESPONSIVE SIZES OBJECT (backward compatibility)
// ============================================================

export const RESPONSIVE_SIZES = {
  // Spacing
  TINY: SPACING.TINY,
  SMALL: SPACING.SMALL,
  MEDIUM: SPACING.MEDIUM,
  LARGE: SPACING.LARGE,
  XLARGE: SPACING.XLARGE,
  
  // Font sizes
  FONT_TINY: FONT_SIZES.TINY,
  FONT_SMALL: FONT_SIZES.SMALL,
  FONT_BODY: FONT_SIZES.BODY,
  FONT_HEADING: FONT_SIZES.HEADING,
  FONT_LARGE: FONT_SIZES.LARGE,
  
  // Component sizes
  BUTTON_HEIGHT: BUTTON_SIZES.MEDIUM,
  ICON_SMALL: ICON_SIZES.SMALL,
  ICON_MEDIUM: ICON_SIZES.MEDIUM,
  ICON_LARGE: ICON_SIZES.LARGE,
  
  // Widths
  FULL_WIDTH: WIDTHS.FULL,
  CONTENT_WIDTH: WIDTHS.CONTENT,
  HALF_WIDTH: WIDTHS.HALF,
};

// Default export with all constants and functions
export default {
  SPACING,
  FONT_SIZES,
  BUTTON_SIZES,
  ICON_SIZES,
  INPUT_SIZES,
  CARD_SIZES,
  WIDTHS,
  HEIGHTS,
  TOUCH_TARGETS,
  BORDER_RADIUS,
  RESPONSIVE_SIZES,
  rw,
  rh,
  rf,
  wp,
  hp,
};
