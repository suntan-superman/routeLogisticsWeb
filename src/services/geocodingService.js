const GOOGLE_MAPS_API_KEY =
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY ||
  import.meta.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  '';

export async function geocodeAddress(address) {
  if (!address || !address.trim()) {
    return { success: false, error: 'Address is required' };
  }

  if (!GOOGLE_MAPS_API_KEY) {
    return { success: false, error: 'Google Maps API key not configured' };
  }

  try {
    const encodedAddress = encodeURIComponent(address);
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${GOOGLE_MAPS_API_KEY}`
    );

    const data = await response.json();

    if (data.status === 'OK' && data.results.length > 0) {
      const location = data.results[0].geometry?.location;
      if (location && typeof location.lat === 'number' && typeof location.lng === 'number') {
        return {
          success: true,
          latitude: location.lat,
          longitude: location.lng,
        };
      }
    }

    return {
      success: false,
      error: `Geocoding failed: ${data.status || 'Unknown error'}`,
    };
  } catch (error) {
    console.error('Geocoding error:', error);
    return {
      success: false,
      error: error.message || 'Failed to geocode address',
    };
  }
}

export default { geocodeAddress };

