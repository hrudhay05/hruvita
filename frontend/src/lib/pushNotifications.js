import { apiRequest } from './api.js';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

async function getSwRegistration() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Worker is not supported in this browser.');
  }
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  // In dev mode if VitePWA devOptions isn't enabled, register /push-sw.js directly
  return navigator.serviceWorker.register('/push-sw.js');
}

export async function getCurrentPushSubscription() {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

export async function subscribeToPush() {
  if (!isPushSupported()) {
    throw new Error('Web Push notifications are not supported in this browser.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was denied. Please allow notifications in browser settings.');
  }

  const { publicKey } = await apiRequest('/api/push/vapid-public-key');
  if (!publicKey) {
    throw new Error('Push server VAPID public key is unavailable.');
  }

  const reg = await getSwRegistration();
  await navigator.serviceWorker.ready.catch(() => reg);

  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const deviceName = /Android/i.test(navigator.userAgent)
    ? 'Android Browser'
    : /iPhone|iPad/i.test(navigator.userAgent)
    ? 'iOS Safari / PWA'
    : 'Desktop Browser';

  return apiRequest('/api/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      deviceName,
    }),
  });
}

export async function unsubscribeFromPush() {
  const sub = await getCurrentPushSubscription();
  const endpoint = sub?.endpoint || '';
  if (sub) {
    await sub.unsubscribe().catch(() => {});
  }
  if (endpoint) {
    await apiRequest('/api/push/unsubscribe', {
      method: 'POST',
      body: JSON.stringify({ endpoint }),
    }).catch(() => {});
  }
  return { unsubscribed: true };
}

export async function sendTestPush() {
  return apiRequest('/api/push/test', { method: 'POST' });
}
