let mapsLoadPromise = null;

export function getGoogleMapsApiKey() {
  return (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
}

export function loadGoogleMapsScript() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.google?.maps) return Promise.resolve(window.google.maps);

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return Promise.resolve(null);

  if (mapsLoadPromise) return mapsLoadPromise;

  mapsLoadPromise = new Promise((resolve) => {
    const existing = document.querySelector('script[data-hruvita-gmaps="1"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google?.maps || null), { once: true });
      existing.addEventListener('error', () => resolve(null), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async`;
    script.async = true;
    script.defer = true;
    script.dataset.hruvitaGmaps = '1';
    script.onload = () => resolve(window.google?.maps || null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });

  return mapsLoadPromise;
}
