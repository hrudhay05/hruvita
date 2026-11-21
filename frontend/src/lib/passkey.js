import { apiRequest } from './api.js';

function bufferToBase64Url(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function bufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

function base64UrlToUint8Array(b64u = '') {
  const pad = b64u.length % 4 === 0 ? '' : '='.repeat(4 - (b64u.length % 4));
  const b64 = String(b64u).replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function isPasskeySupported() {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.PublicKeyCredential) &&
    Boolean(navigator.credentials?.create) &&
    Boolean(navigator.credentials?.get)
  );
}

export async function registerDevicePasskey(deviceName = '') {
  if (!isPasskeySupported()) {
    throw new Error('Fingerprint / Passkey login is not supported on this browser.');
  }

  const opts = await apiRequest('/api/auth/passkey/register-options', { method: 'POST' });

  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: base64UrlToUint8Array(opts.challenge),
      rp: opts.rp,
      user: {
        id: base64UrlToUint8Array(opts.user.id),
        name: opts.user.name,
        displayName: opts.user.displayName,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
        requireResidentKey: false,
      },
      excludeCredentials: (opts.excludeCredentials || []).map((id) => ({
        type: 'public-key',
        id: base64UrlToUint8Array(id),
      })),
      timeout: 60000,
      attestation: 'none',
    },
  });

  if (!cred) throw new Error('Biometric registration was cancelled.');

  const spkiBuf = cred.response.getPublicKey ? cred.response.getPublicKey() : null;
  if (!spkiBuf) {
    throw new Error('Your browser did not return a public key for this passkey. Try Chrome or Safari.');
  }

  const label =
    deviceName ||
    (/Android/i.test(navigator.userAgent)
      ? 'Android Fingerprint'
      : /iPhone|iPad/i.test(navigator.userAgent)
      ? 'iPhone FaceID / TouchID'
      : 'Device Biometric');

  return apiRequest('/api/auth/passkey/register-verify', {
    method: 'POST',
    body: JSON.stringify({
      credentialId: bufferToBase64Url(cred.rawId),
      publicKeySpki: bufferToBase64(spkiBuf),
      algorithm: cred.response.getPublicKeyAlgorithm ? cred.response.getPublicKeyAlgorithm() : -7,
      clientDataJSON: bufferToBase64Url(cred.response.clientDataJSON),
      deviceName: label,
    }),
  });
}

export async function authenticateWithPasskey(identifier = '', rememberMe = true) {
  if (!isPasskeySupported()) {
    throw new Error('Fingerprint / Passkey login is not supported on this browser.');
  }

  const opts = await apiRequest('/api/auth/passkey/login-options', {
    method: 'POST',
    body: JSON.stringify({ identifier }),
  });

  const allowCredentials = (opts.allowCredentials || []).map((id) => ({
    type: 'public-key',
    id: base64UrlToUint8Array(id),
  }));

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: base64UrlToUint8Array(opts.challenge),
      rpId: opts.rpId,
      ...(allowCredentials.length > 0 ? { allowCredentials } : {}),
      userVerification: 'required',
      timeout: 60000,
    },
  });

  if (!assertion) throw new Error('Biometric authentication cancelled.');

  return apiRequest('/api/auth/passkey/login-verify', {
    method: 'POST',
    body: JSON.stringify({
      credentialId: bufferToBase64Url(assertion.rawId),
      authenticatorData: bufferToBase64Url(assertion.response.authenticatorData),
      clientDataJSON: bufferToBase64Url(assertion.response.clientDataJSON),
      signature: bufferToBase64Url(assertion.response.signature),
      rememberMe,
    }),
  });
}
