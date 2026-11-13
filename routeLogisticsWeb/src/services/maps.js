let loading;
export function loadMaps() {
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps);
  if (loading) return loading;
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!key) return Promise.reject(new Error('Maps is not configured. Contact your administrator.'));
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = setTimeout(() => { loading = null; script.remove(); reject(new Error('Maps did not load. Check connectivity and try again.')); }, 20000);
    window.__rlMapsReady = () => { clearTimeout(timeout); delete window.__rlMapsReady; resolve(window.google.maps); };
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=__rlMapsReady`;
    script.async = true; script.onerror = () => { clearTimeout(timeout); loading = null; script.remove(); reject(new Error('Maps could not be loaded.')); };
    document.head.appendChild(script);
  });
  return loading;
}
