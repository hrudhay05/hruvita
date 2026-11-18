import { logAI, logAIError } from './aiLogger.js';

const CIRCUIT_OPEN_MS = 30_000;
const FAILURE_THRESHOLD = 2;

// Per-model circuit breaker & latency telemetry
const providerHealth = new Map();

function getState(key) {
  if (!providerHealth.has(key)) {
    providerHealth.set(key, {
      key,
      failures: 0,
      openUntil: 0,
      successCount: 0,
      failCount: 0,
      lastLatencyMs: 0,
      lastStatus: 'healthy',
    });
  }
  return providerHealth.get(key);
}

export function isCircuitOpen(key) {
  const st = getState(key);
  if (st.openUntil > Date.now()) {
    return true;
  }
  if (st.openUntil > 0 && st.openUntil <= Date.now()) {
    // Half-open recovery
    st.openUntil = 0;
    st.failures = 0;
    st.lastStatus = 'half-open';
  }
  return false;
}

export function recordProviderSuccess(key, latencyMs) {
  const st = getState(key);
  st.failures = 0;
  st.openUntil = 0;
  st.successCount += 1;
  st.lastLatencyMs = latencyMs;
  st.lastStatus = 'healthy';
}

export function recordProviderFailure(key, errCode, retryAfterSec = 0) {
  const st = getState(key);
  st.failures += 1;
  st.failCount += 1;
  st.lastStatus = errCode || 'error';
  if (retryAfterSec > 0) {
    st.openUntil = Date.now() + Math.min(60_000, retryAfterSec * 1000);
  } else if (st.failures >= FAILURE_THRESHOLD) {
    st.openUntil = Date.now() + CIRCUIT_OPEN_MS;
    logAIError(`Circuit OPEN for ${key} for ${CIRCUIT_OPEN_MS / 1000}s`, new Error(errCode));
  }
}

export function resetAllCircuits() {
  providerHealth.clear();
}

export function getProviderHealthSnapshot() {
  return Array.from(providerHealth.values());
}

export async function backoffWithJitter(attempt, retryAfterHeader = null) {
  const parsedRetry = retryAfterHeader ? Number(retryAfterHeader) : 0;
  const baseMs = Number.isFinite(parsedRetry) && parsedRetry > 0
    ? Math.min(2000, parsedRetry * 1000)
    : Math.min(1600, 300 * Math.pow(2, attempt));
  const jitter = Math.floor(Math.random() * 180);
  await new Promise((r) => setTimeout(r, baseMs + jitter));
}

export async function fetchWithTimeout(url, options, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function safeParseJsonArgs(rawArgs) {
  if (!rawArgs) return {};
  if (typeof rawArgs === 'object') return rawArgs;
  try {
    const parsed = JSON.parse(String(rawArgs));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    logAI('HRUVITA-ERROR', 'Malformed tool arguments JSON handled safely');
    return {};
  }
}
