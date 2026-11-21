import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { FiCrosshair, FiMapPin, FiNavigation } from 'react-icons/fi';
import './LiveDeliveryMap.css';

function buildAddressQuery(address = {}) {
  return [address.line1, address.area, address.city || 'Hyderabad', address.pincode]
    .filter(Boolean)
    .join(', ');
}

function createBikeIcon(label = '', heading = 0, speedKmh = 0) {
  const rot = Number.isFinite(Number(heading)) ? Number(heading) : 0;
  const speedTag = speedKmh > 0 ? `${speedKmh} km/h` : '';
  const tagText = [label, speedTag].filter(Boolean).join(' • ');
  return L.divIcon({
    className: 'ldm-div-icon',
    html: `<div class="ldm-scooter-pin">
      <span class="ldm-scooter-halo"></span>
      <span class="ldm-scooter-bubble" style="transform: rotate(${rot}deg)">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#14532d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="5.5" cy="17.5" r="3" />
          <circle cx="18.5" cy="17.5" r="3" />
          <path d="M5.5 17.5 9 10h5l2.5 4.5M14 10l2-3h2.5" />
          <path d="M9 10 7.5 7.5H5" />
        </svg>
      </span>
      ${tagText ? `<span class="ldm-pin-tag">${tagText}</span>` : ''}
    </div>`,
    iconSize: [52, 52],
    iconAnchor: [26, 26],
  });
}

function createHomeIcon() {
  return L.divIcon({
    className: 'ldm-div-icon',
    html: `<div class="ldm-home-pin">🏠</div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

export default function LiveDeliveryMap({ order = null, orders = null, height = 260 }) {
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const scooterMarkersRef = useRef(new Map());
  const homeMarkerRef = useRef(null);
  const routeLayerRef = useRef(null);
  const routeGlowRef = useRef(null);
  const trailLayerRef = useRef(null);
  const animFramesRef = useRef(new Map());
  const geocodedAddrRef = useRef('');
  const homeCoordsRef = useRef(null);

  const [routeMetrics, setRouteMetrics] = useState(null);

  const activeList = Array.isArray(orders) ? orders : order ? [order] : [];
  const primaryOrder = order || activeList[0] || null;
  const primaryLive = primaryOrder?.delivery?.liveLocation;
  const hasAnyCoords = activeList.some(
    (o) => o.delivery?.liveLocation?.lat != null && o.delivery?.liveLocation?.lng != null
  );
  const hasPrimaryCoords = primaryLive?.lat != null && primaryLive?.lng != null;

  useEffect(() => {
    if (!hasAnyCoords || !mapElRef.current || mapRef.current) return;

    const firstWithCoords = activeList.find(
      (o) => o.delivery?.liveLocation?.lat != null && o.delivery?.liveLocation?.lng != null
    );
    const center = firstWithCoords
      ? [Number(firstWithCoords.delivery.liveLocation.lat), Number(firstWithCoords.delivery.liveLocation.lng)]
      : [17.385, 78.4867];

    const map = L.map(mapElRef.current, {
      center,
      zoom: 15,
      zoomControl: false,
      scrollWheelZoom: false,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Standard OpenStreetMap tiles (100% free, zero API key required)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      for (const frame of animFramesRef.current.values()) cancelAnimationFrame(frame);
      animFramesRef.current.clear();
      scooterMarkersRef.current.clear();
      homeMarkerRef.current = null;
      routeLayerRef.current = null;
      routeGlowRef.current = null;
      trailLayerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [hasAnyCoords]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hasAnyCoords || !mapRef.current || !order?.address) return;
    const addrQuery = buildAddressQuery(order.address);
    if (!addrQuery || geocodedAddrRef.current === addrQuery) return;
    geocodedAddrRef.current = addrQuery;

    fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(addrQuery)}`)
      .then((r) => r.json())
      .then((rows) => {
        if (!Array.isArray(rows) || !rows[0] || !mapRef.current) return;
        const dest = [Number(rows[0].lat), Number(rows[0].lon)];
        homeCoordsRef.current = dest;
        if (homeMarkerRef.current) {
          homeMarkerRef.current.setLatLng(dest);
        } else {
          homeMarkerRef.current = L.marker(dest, { icon: createHomeIcon() })
            .addTo(mapRef.current)
            .bindPopup('<strong>Your Delivery Address</strong>');
        }
      })
      .catch(() => {});
  }, [hasAnyCoords, order?.address]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !hasAnyCoords) return;

    const currentIds = new Set(activeList.map((o) => o.id));
    for (const [id, marker] of scooterMarkersRef.current.entries()) {
      if (!currentIds.has(id)) {
        marker.remove();
        scooterMarkersRef.current.delete(id);
      }
    }

    const bounds = [];

    for (const ord of activeList) {
      const loc = ord.delivery?.liveLocation;
      if (loc?.lat == null || loc?.lng == null) continue;
      const target = [Number(loc.lat), Number(loc.lng)];
      bounds.push(target);

      const partnerLabel = Array.isArray(orders)
        ? `${ord.deliveryAssignment?.deliveryBoyName || ord.id}`
        : '';

      let marker = scooterMarkersRef.current.get(ord.id);
      const nextIcon = createBikeIcon(partnerLabel, loc.heading || 0, loc.speedKmh || 0);
      if (!marker) {
        marker = L.marker(target, { icon: nextIcon, zIndexOffset: 500 })
          .addTo(map)
          .bindPopup(
            `<strong>🏍️ ${ord.deliveryAssignment?.deliveryBoyName || 'Delivery Partner'}</strong><br/>Order: ${ord.id}<br/>ETA: ~${ord.delivery?.etaMinutes || 20} mins`
          );
        scooterMarkersRef.current.set(ord.id, marker);
      } else {
        marker.setIcon(nextIcon);
        const start = marker.getLatLng();
        if (
          Math.abs(start.lat - target[0]) > 0.00001 ||
          Math.abs(start.lng - target[1]) > 0.00001
        ) {
          const prevFrame = animFramesRef.current.get(ord.id);
          if (prevFrame) cancelAnimationFrame(prevFrame);
          const t0 = performance.now();
          const duration = 900;
          const step = (now) => {
            const p = Math.min(1, (now - t0) / duration);
            const eased = 1 - Math.pow(1 - p, 3);
            marker.setLatLng([
              start.lat + (target[0] - start.lat) * eased,
              start.lng + (target[1] - start.lng) * eased,
            ]);
            if (p < 1) {
              animFramesRef.current.set(ord.id, requestAnimationFrame(step));
            }
          };
          animFramesRef.current.set(ord.id, requestAnimationFrame(step));
        }
      }
    }

    if (order && Array.isArray(primaryLive?.trail) && primaryLive.trail.length >= 2) {
      const trailLatLngs = primaryLive.trail.map((pt) => [Number(pt.lat), Number(pt.lng)]);
      if (trailLayerRef.current) trailLayerRef.current.remove();
      trailLayerRef.current = L.polyline(trailLatLngs, {
        color: '#22c55e',
        weight: 4,
        opacity: 0.8,
        dashArray: '5, 7',
      }).addTo(map);
    }

    if (order && hasPrimaryCoords && homeCoordsRef.current) {
      const [sLat, sLng] = [Number(primaryLive.lat), Number(primaryLive.lng)];
      const [dLat, dLng] = homeCoordsRef.current;
      bounds.push([dLat, dLng]);

      fetch(
        `https://router.project-osrm.org/route/v1/driving/${sLng},${sLat};${dLng},${dLat}?overview=full&geometries=geojson`
      )
        .then((r) => r.json())
        .then((data) => {
          if (!mapRef.current) return;
          const route = data?.routes?.[0];
          if (route?.geometry?.coordinates?.length) {
            const latlngs = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
            if (routeGlowRef.current) routeGlowRef.current.remove();
            if (routeLayerRef.current) routeLayerRef.current.remove();

            routeGlowRef.current = L.polyline(latlngs, {
              color: '#22c55e',
              weight: 10,
              opacity: 0.24,
            }).addTo(mapRef.current);

            routeLayerRef.current = L.polyline(latlngs, {
              color: '#15803d',
              weight: 4.5,
              opacity: 0.95,
            }).addTo(mapRef.current);

            setRouteMetrics({
              distanceKm: (route.distance / 1000).toFixed(1),
              durationMin: Math.max(1, Math.round(route.duration / 60)),
            });
          }
        })
        .catch(() => {
          if (!mapRef.current) return;
          if (routeLayerRef.current) routeLayerRef.current.remove();
          routeLayerRef.current = L.polyline([[sLat, sLng], [dLat, dLng]], {
            color: '#15803d',
            weight: 4,
            dashArray: '8, 8',
          }).addTo(mapRef.current);
        });
    }

    if (bounds.length === 1) {
      map.panTo(bounds[0], { animate: true });
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [46, 46] });
    }
  }, [hasAnyCoords, activeList, order, orders, hasPrimaryCoords, primaryLive?.lat, primaryLive?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRecenter = () => {
    if (!mapRef.current || !hasPrimaryCoords) return;
    mapRef.current.setView([Number(primaryLive.lat), Number(primaryLive.lng)], 16, { animate: true });
  };

  if (!hasAnyCoords) {
    const addrQuery = primaryOrder ? buildAddressQuery(primaryOrder.address) : '';
    return (
      <div className="ldm-fallback-card">
        <div className="ldm-fallback-track">
          <div className="ldm-fallback-node" title="HRUVITA Kitchen">🏪</div>
          <div className="ldm-fallback-road">
            <div className="ldm-fallback-progress" />
            <span className="ldm-fallback-bike">🏍️</span>
          </div>
          <div className="ldm-fallback-node" title="Your Address">🏠</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <strong style={{ color: '#123728', fontSize: '0.9rem', display: 'block' }}>
              {primaryOrder
                ? `Waiting for partner GPS lock • ${primaryOrder.address?.area || primaryOrder.address?.city || 'Delivery Zone'}`
                : 'No active GPS coordinates yet'}
            </strong>
            <span style={{ color: '#4c6858', fontSize: '0.8rem' }}>
              {addrQuery || 'Live bike map will appear here as soon as the rider starts moving'}
            </span>
          </div>
          {addrQuery && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addrQuery)}`}
              target="_blank"
              rel="noreferrer"
              className="ldm-hud-btn"
            >
              <FiMapPin size={13} /> View Area
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="ldm-wrap">
      <div className="ldm-map-shell">
        <div ref={mapElRef} className="ldm-leaflet-canvas" style={{ height }} />

        <div className="ldm-hud-top">
          <span className="ldm-eta-pill">
            <span className="ldm-live-dot" />
            {routeMetrics
              ? `Arriving in ~${routeMetrics.durationMin} mins (${routeMetrics.distanceKm} km)`
              : primaryOrder?.delivery?.etaMinutes
              ? `LIVE • ~${primaryOrder.delivery.etaMinutes} mins ETA`
              : '🏍️ Bike Live'}
          </span>

          <div className="ldm-hud-actions">
            {hasPrimaryCoords && (
              <button
                type="button"
                className="ldm-hud-btn"
                onClick={handleRecenter}
                title="Center map on bike"
              >
                <FiCrosshair size={13} /> Center
              </button>
            )}
            {hasPrimaryCoords && (
              <a
                href={`https://www.google.com/maps?q=${primaryLive.lat},${primaryLive.lng}`}
                target="_blank"
                rel="noreferrer"
                className="ldm-hud-btn"
              >
                <FiMapPin size={13} /> Maps
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="ldm-footer-bar">
        <span className="ldm-footer-left">
          <FiNavigation size={13} />
          {primaryLive?.updatedAt
            ? `Last moved ${new Date(primaryLive.updatedAt).toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}`
            : 'Live GPS stream active'}
          {primaryLive?.speedKmh > 0 && (
            <span className="ldm-speed-chip">{primaryLive.speedKmh} km/h</span>
          )}
        </span>
        <span className="ldm-sync-label">HRUVITA Live Bike Radar</span>
      </div>
    </div>
  );
}
