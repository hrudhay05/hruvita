import { apiRequest } from './api.js';

/**
 * PART 5: USE MY CURRENT LOCATION
 * - Requests browser location permission via navigator.geolocation.
 * - Sends latitude & longitude to backend reverse-geocoding endpoint.
 * - Never invents missing fields (leaves unidentified fields blank '').
 * - Properly surfaces permission denial, unavailable location, and network errors.
 */
export async function detectCurrentLocation() {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new Error('Geolocation is not supported by your browser. Please enter your address manually.');
  }

  let coords;
  try {
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      });
    });
    coords = pos.coords;
  } catch (geoErr) {
    if (geoErr?.code === 1) {
      throw new Error(
        'Location permission was denied. Please allow location access in your browser or enter your address fields manually.'
      );
    }
    if (geoErr?.code === 2) {
      throw new Error(
        'Your current location is unavailable right now. Please enter your address fields manually.'
      );
    }
    if (geoErr?.code === 3) {
      throw new Error(
        'Location request timed out. Please try again or enter your address fields manually.'
      );
    }
    throw new Error('Could not access browser location. Please enter your address manually.');
  }

  const latitude = Number(coords.latitude.toFixed(6));
  const longitude = Number(coords.longitude.toFixed(6));

  const data = await apiRequest(
    `/api/addresses/reverse-geocode?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`
  );

  const d = data.detected || {};
  return {
    doorNumber: d.doorNumber || '',
    apartmentName: d.apartmentName || '',
    street: d.street || '',
    locality: d.locality || '',
    area: d.area || '',
    mandal: d.mandal || '',
    district: d.district || '',
    state: d.state || '',
    country: d.country || '',
    pincode: d.pincode || '',
    latitude,
    longitude,
    displayName: d.displayName || '',
    line1: [d.doorNumber, d.apartmentName, d.street, d.locality].filter(Boolean).join(', '),
    city: d.district || '',
  };
}
