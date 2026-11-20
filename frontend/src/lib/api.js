// const defaultHost =
//   typeof window !== 'undefined' && window.location?.hostname
//     ? `http://${window.location.hostname}:5000`
//     : 'http://localhost:5000';

// export const API_BASE = (import.meta.env.VITE_API_URL || defaultHost).replace(/\/$/, '');
const defaultHost =
  typeof window !== 'undefined' && window.location?.hostname.endsWith('.ngrok-free.dev')
    ? ''
    : typeof window !== 'undefined' && window.location?.hostname
      ? `http://${window.location.hostname}:5000`
      : 'http://localhost:5000';

export const API_BASE = (import.meta.env.VITE_API_URL || defaultHost).replace(/\/$/, '');
const TOKEN_KEY = 'hruvita_token';

export function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore storage errors
  }
}

export async function apiRequest(path, options = {}, isRetry = false) {
  const token = getStoredToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const controller = !options.signal ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 25000) : null;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: 'include',
      headers,
      signal: options.signal || controller?.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out. The server may be waking up — please try again.');
    }
    throw err;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  if (
    res.status === 401 &&
    !isRetry &&
    !path.startsWith('/api/auth/login') &&
    !path.startsWith('/api/auth/signup') &&
    !path.startsWith('/api/auth/refresh')
  ) {
    try {
      const refreshRes = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json().catch(() => ({}));
        if (refreshData.token) setStoredToken(refreshData.token);
        return apiRequest(path, options, true);
      }
    } catch {
      // ignore refresh error
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
