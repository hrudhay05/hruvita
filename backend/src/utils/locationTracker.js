import { getOrderById, updateOrderDeliveryLocation } from '../store/repository.js';

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function computeBearing(lat1, lng1, lat2, lng2) {
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Collects, validates (bounds, accuracy, anti-teleport speed), computes heading/speed/trail,
 * and persists the delivery partner's live coordinates without any external API keys.
 */
export async function collectAndValidateLocation({
  orderId,
  partnerId,
  lat,
  lng,
  accuracy = null,
  etaMinutes = undefined,
}) {
  const cleanOrderId = String(orderId || '').trim();
  const numLat = Number(lat);
  const numLng = Number(lng);

  if (
    !cleanOrderId ||
    !Number.isFinite(numLat) ||
    !Number.isFinite(numLng) ||
    numLat < -90 ||
    numLat > 90 ||
    numLng < -180 ||
    numLng > 180 ||
    (Math.abs(numLat) < 0.0001 && Math.abs(numLng) < 0.0001)
  ) {
    return { ok: false, status: 400, error: 'Valid latitude and longitude are required.' };
  }

  if (accuracy !== null && Number.isFinite(Number(accuracy)) && Number(accuracy) > 2500) {
    return { ok: false, status: 422, error: 'GPS accuracy too low (>2500m), waiting for better lock.' };
  }

  const order = await getOrderById(cleanOrderId);
  if (!order) {
    return { ok: false, status: 404, error: 'Order not found.' };
  }

  if (
    partnerId &&
    order.deliveryAssignment?.deliveryBoyId !== partnerId &&
    order.delivery?.partnerId !== partnerId
  ) {
    return { ok: false, status: 403, error: 'You are not assigned to this order.' };
  }

  if (order.deliveryStatus !== 'out_for_delivery') {
    return { ok: false, status: 400, error: 'Live tracking is active only during Out for Delivery.' };
  }

  const nowIso = new Date().toISOString();
  const prev = order.delivery?.liveLocation;
  let heading = Number(prev?.heading || 0);
  let speedKmh = 0;

  if (prev?.lat != null && prev?.lng != null) {
    const distKm = haversineKm(Number(prev.lat), Number(prev.lng), numLat, numLng);
    const prevMs = prev.updatedAt ? new Date(prev.updatedAt).getTime() : 0;
    const elapsedSec = prevMs ? Math.max(0.5, (Date.now() - prevMs) / 1000) : 4;
    const impliedSpeed = (distKm / elapsedSec) * 3600;

    // Anti-teleport / GPS glitch guard (> 160 km/h in city delivery)
    if (distKm > 0.05 && impliedSpeed > 160) {
      return { ok: false, status: 422, error: 'Implausible GPS jump rejected by coordinate validator.' };
    }

    if (distKm > 0.003) {
      heading = Math.round(computeBearing(Number(prev.lat), Number(prev.lng), numLat, numLng));
      speedKmh = Math.min(95, Math.round(impliedSpeed));
    }
  }

  const prevTrail = Array.isArray(prev?.trail) ? prev.trail : [];
  const lastTrailPt = prevTrail[prevTrail.length - 1];
  const movedEnoughForTrail =
    !lastTrailPt || haversineKm(Number(lastTrailPt.lat), Number(lastTrailPt.lng), numLat, numLng) >= 0.01;
  const nextTrail = movedEnoughForTrail
    ? [...prevTrail, { lat: numLat, lng: numLng, at: nowIso }].slice(-30)
    : prevTrail;

  const liveLocation = {
    lat: numLat,
    lng: numLng,
    heading,
    speedKmh,
    accuracy: accuracy !== null && Number.isFinite(Number(accuracy)) ? Math.round(Number(accuracy)) : null,
    trail: nextTrail,
    updatedAt: nowIso,
  };

  const patch = { liveLocation };
  if (etaMinutes !== undefined && Number.isFinite(Number(etaMinutes))) {
    const mins = Math.max(1, Math.min(180, Math.round(Number(etaMinutes))));
    patch.etaMinutes = mins;
    patch.estimatedArrivalAt = new Date(Date.now() + mins * 60 * 1000).toISOString();
  }

  const updated = await updateOrderDeliveryLocation(cleanOrderId, patch);
  if (!updated) {
    return { ok: false, status: 404, error: 'Could not update order location.' };
  }

  return { ok: true, order: updated, liveLocation };
}
