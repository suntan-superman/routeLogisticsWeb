/**
 * Google Maps Configuration
 * Shared constants for Google Maps API usage across the application
 */

// Google Maps API Key - check environment variables
export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 
                                   import.meta.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || 
                                   '';

// Google Maps Libraries - shared constant to prevent reload issues
// Include all libraries needed by any component to avoid conflicts
export const GOOGLE_MAPS_LIBRARIES = ['places', 'directions'];

// Map container default styles
export const MAP_CONTAINER_STYLE = {
  width: '100%',
  height: '400px',
};

// Default map center (Bakersfield, CA)
export const DEFAULT_MAP_CENTER = {
  lat: 35.3733,
  lng: -119.0187,
};

