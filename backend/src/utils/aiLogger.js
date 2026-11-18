const SENSITIVE_PATTERNS = [
  /Bearer\s+[A-Za-z0-9\-_.]+/gi,
  /(gsk_|sk_|AIza|rzp_live_|rzp_test_)[A-Za-z0-9_\-]+/g,
  /\b\d{12,19}\b/g, // card-like numbers
];

export function sanitizeForLog(input) {
  let str = typeof input === 'string' ? input : JSON.stringify(input ?? '');
  for (const re of SENSITIVE_PATTERNS) {
    str = str.replace(re, '[REDACTED]');
  }
  return str.slice(0, 500);
}

export function createRequestId() {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function logAI(prefix, message, meta = null) {
  const cleanMsg = sanitizeForLog(message);
  if (meta && process.env.NODE_ENV !== 'production') {
    console.log(`[${prefix}] ${cleanMsg}`, sanitizeForLog(meta));
  } else {
    console.log(`[${prefix}] ${cleanMsg}`);
  }
}

export function logAIError(message, err, meta = null) {
  const errDetail = err?.message || String(err || 'Unknown error');
  if (process.env.NODE_ENV !== 'production' && err?.stack) {
    console.error(`[HRUVITA-ERROR] ${sanitizeForLog(message)}:`, sanitizeForLog(errDetail), meta ? sanitizeForLog(meta) : '');
  } else {
    console.error(`[HRUVITA-ERROR] ${sanitizeForLog(message)}:`, sanitizeForLog(errDetail));
  }
}

