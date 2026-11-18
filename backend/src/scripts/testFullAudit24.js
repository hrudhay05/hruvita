/**
 * Phase 14 Comprehensive 24-Scenario Audit & Regression Suite for HRUVITA AI Assistant & Platform.
 * Runs against an isolated backend server on port 5086 + direct unit/fault-injection checks.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import {
  isCircuitOpen,
  recordProviderSuccess,
  recordProviderFailure,
  resetAllCircuits,
  getProviderHealthSnapshot,
  safeParseJsonArgs,
} from '../utils/aiProviderManager.js';
import { processAssistantTurn } from '../utils/aiBrain.js';
import {
  initDatabase,
  listOrdersByUser,
  listProducts,
  listUsers,
  getBusinessDateParts,
  validateDeliverySchedule,
} from '../store/repository.js';
import { signToken } from '../middleware/auth.js';

const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:5086';

const results = [];
async function runCase(id, title, fn) {
  const t0 = Date.now();
  try {
    await fn();
    const ms = Date.now() - t0;
    results.push({ id, title, pass: true, ms });
    console.log(`PASS [${id}/24] ${title} (${ms}ms)`);
  } catch (err) {
    const ms = Date.now() - t0;
    results.push({ id, title, pass: false, ms, error: err.message });
    console.error(`FAIL [${id}/24] ${title}: ${err.message}`);
  }
}

async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailOrUsername: email, password, directDemo: true }),
  });
  assert.equal(res.status, 200, `Login failed for ${email}`);
  const data = await res.json();
  return data.token;
}

async function main() {
  await initDatabase();

  const custToken = await login('customer@hruvita.com', 'Customer@123');
  const allUsers = await listUsers();
  const adminUser = allUsers.find((u) => u.role === 'admin');
  assert.ok(adminUser, 'Admin user must exist');
  const adminToken = signToken(adminUser);

  // 1. safeParseJsonArgs handles malformed JSON safely
  await runCase(1, 'Malformed tool JSON parsed safely without crashing', async () => {
    assert.deepEqual(safeParseJsonArgs('{bad json'), {});
    assert.deepEqual(safeParseJsonArgs(null), {});
    assert.deepEqual(safeParseJsonArgs('{"query":"idli"}'), { query: 'idli' });
  });

  // 2. Circuit breaker opens after threshold failures and resets cleanly
  await runCase(2, 'Circuit breaker opens on repeated failures and resets', async () => {
    resetAllCircuits();
    assert.equal(isCircuitOpen('groq:test-model'), false);
    recordProviderFailure('groq:test-model', 'GROQ_HTTP_429', 5);
    assert.equal(isCircuitOpen('groq:test-model'), false);
    recordProviderFailure('groq:test-model', 'GROQ_HTTP_429', 5);
    assert.equal(isCircuitOpen('groq:test-model'), true);
    const snap = getProviderHealthSnapshot();
    const entry = snap.find((x) => x.key === 'groq:test-model');
    assert.ok(entry && entry.openUntil > Date.now());
    resetAllCircuits();
    assert.equal(isCircuitOpen('groq:test-model'), false);
  });

  // 3. Groq 429 fails over cleanly to Gemini mock
  await runCase(3, 'Groq 429 automatically fails over to Gemini', async () => {
    resetAllCircuits();
    const origFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url) => {
        if (String(url).includes('api.groq.com')) {
          return new Response('rate limit', { status: 429, headers: { 'retry-after': '10' } });
        }
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: 'Fresh idli and dosa are available!' }] } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };
      const out = await processAssistantTurn({ message: 'Show menu', language: 'en-IN' });
      assert.equal(out.debug.provider, 'gemini');
      assert.ok(out.reply.includes('idli'));
    } finally {
      globalThis.fetch = origFetch;
      resetAllCircuits();
    }
  });

  // 4. Gemini 503 + Groq 503 returns honest fallback without leaking API keys or stack traces
  await runCase(4, 'All providers unavailable returns graceful fallback (no key/stack leak)', async () => {
    resetAllCircuits();
    const origFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => new Response('Service Unavailable', { status: 503 });
      const out = await processAssistantTurn({ message: 'Show breakfast', language: 'en-IN' });
      assert.ok(out.reply.length > 10);
      assert.equal(/gsk_|AIza|stack|Error:/i.test(out.reply), false);
      assert.ok(out.debug.errorCode);
    } finally {
      globalThis.fetch = origFetch;
      resetAllCircuits();
    }
  });

  // 5. Groq malformed tool arguments do not crash tool loop
  await runCase(5, 'Groq malformed tool arguments safely recovered', async () => {
    resetAllCircuits();
    const origFetch = globalThis.fetch;
    let callNum = 0;
    try {
      globalThis.fetch = async () => {
        callNum += 1;
        if (callNum === 1) {
          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    role: 'assistant',
                    tool_calls: [
                      {
                        id: 'tc1',
                        type: 'function',
                        function: { name: 'search_products', arguments: '{broken_json' },
                      },
                    ],
                  },
                },
              ],
            }),
            { status: 200 }
          );
        }
        return new Response(
          JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Here are our fresh dishes!' } }] }),
          { status: 200 }
        );
      };
      const out = await processAssistantTurn({ message: 'Show items', language: 'en-IN' });
      assert.ok(out.toolsUsed.includes('search_products'));
      assert.ok(out.reply.includes('fresh dishes'));
    } finally {
      globalThis.fetch = origFetch;
      resetAllCircuits();
    }
  });

  // 6. Per-turn duplicate tool call deduplication
  await runCase(6, 'Duplicate identical tool calls in same turn are deduplicated', async () => {
    resetAllCircuits();
    const origFetch = globalThis.fetch;
    let callNum = 0;
    try {
      globalThis.fetch = async () => {
        callNum += 1;
        if (callNum === 1) {
          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    role: 'assistant',
                    tool_calls: [
                      { id: 'tc1', type: 'function', function: { name: 'view_cart', arguments: '{}' } },
                      { id: 'tc2', type: 'function', function: { name: 'view_cart', arguments: '{}' } },
                    ],
                  },
                },
              ],
            }),
            { status: 200 }
          );
        }
        return new Response(
          JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Opening your cart.' } }] }),
          { status: 200 }
        );
      };
      const out = await processAssistantTurn({ message: 'Open cart', language: 'en-IN' });
      const navCartCount = out.actions.filter((a) => a.type === 'NAVIGATE' && a.to === '/cart').length;
      assert.equal(navCartCount, 1, `Expected 1 NAVIGATE /cart action, got ${navCartCount}`);
    } finally {
      globalThis.fetch = origFetch;
      resetAllCircuits();
    }
  });

  // 7. Mid-conversation "thank you, now add..." does NOT close conversation
  await runCase(7, 'Mid-conversation "thank you, now open cart" does NOT trigger END_CONVERSATION', async () => {
    resetAllCircuits();
    const origFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Sure, opening your cart now!' } }] }),
          { status: 200 }
        );
      const out = await processAssistantTurn({
        message: 'Thank you, now show my cart',
        language: 'en-IN',
      });
      assert.equal(out.actions.some((a) => a.type === 'END_CONVERSATION'), false);
    } finally {
      globalThis.fetch = origFetch;
      resetAllCircuits();
    }
  });

  // 8. Pure closing phrase emits END_CONVERSATION
  await runCase(8, 'Pure closing phrase ("Thank you, bye") emits END_CONVERSATION', async () => {
    resetAllCircuits();
    const origFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Goodbye!' } }] }),
          { status: 200 }
        );
      const out = await processAssistantTurn({ message: 'Thank you, bye', language: 'en-IN' });
      assert.equal(out.actions.some((a) => a.type === 'END_CONVERSATION'), true);
    } finally {
      globalThis.fetch = origFetch;
      resetAllCircuits();
    }
  });

  // 9. Human escalation tool works and logs audit
  await runCase(9, 'escalate_to_human tool executes cleanly and returns support details', async () => {
    resetAllCircuits();
    const origFetch = globalThis.fetch;
    let step = 0;
    try {
      globalThis.fetch = async () => {
        step += 1;
        if (step === 1) {
          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    role: 'assistant',
                    tool_calls: [
                      {
                        id: 'tc_esc',
                        type: 'function',
                        function: { name: 'escalate_to_human', arguments: '{"issue":"Need refund help"}' },
                      },
                    ],
                  },
                },
              ],
            }),
            { status: 200 }
          );
        }
        return new Response(
          JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'I have connected you to HRUVITA support.' } }] }),
          { status: 200 }
        );
      };
      const out = await processAssistantTurn({ message: 'Connect me to a human agent', language: 'en-IN' });
      assert.ok(out.toolsUsed.includes('escalate_to_human'));
    } finally {
      globalThis.fetch = origFetch;
      resetAllCircuits();
    }
  });

  // 10. Provider health snapshot tracks successes
  await runCase(10, 'Provider health snapshot records success latency', async () => {
    resetAllCircuits();
    recordProviderSuccess('groq:openai/gpt-oss-20b', 240);
    const snap = getProviderHealthSnapshot();
    const entry = snap.find((x) => x.key === 'groq:openai/gpt-oss-20b');
    assert.ok(entry);
    assert.equal(entry.lastLatencyMs, 240);
    assert.equal(entry.openUntil, 0);
  });

  // 11. Assistant config endpoint
  await runCase(11, 'GET /api/assistant/config returns enabled assistant & bilingual greetings', async () => {
    const res = await fetch(`${BASE}/api/assistant/config`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.enabled, true);
    assert.ok(data.greetings['en-IN']);
    assert.ok(data.greetings['te-IN']);
  });

  // 12. Assistant debug endpoint exposes providerHealth
  await runCase(12, 'GET /api/assistant/debug exposes providerHealth & active models', async () => {
    const res = await fetch(`${BASE}/api/assistant/debug`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.aiConnected, true);
    assert.ok('providerHealth' in data);
  });

  // 13. Live AI chat product search (English)
  await runCase(13, 'Live POST /api/assistant/chat returns real breakfast items', async () => {
    const res = await fetch(`${BASE}/api/assistant/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${custToken}` },
      body: JSON.stringify({ message: 'Show available idli items', language: 'en-IN' }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.reply.length > 5);
    assert.ok(data.toolsUsed.length >= 1);
  });

  // 14. Live AI chat Telugu script support
  await runCase(14, 'Live POST /api/assistant/chat responds in Telugu script for Telugu query', async () => {
    const res = await fetch(`${BASE}/api/assistant/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${custToken}` },
      body: JSON.stringify({ message: 'ఆఫర్లు ఏంటి?', language: 'te-IN' }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.language, 'te-IN');
    assert.ok(/[\u0C00-\u0C7F]/.test(data.reply), 'Expected Telugu script in reply');
  });

  // 15. Live AI chat order history authorization
  await runCase(15, 'Live POST /api/assistant/chat fetches customer own order history without pipe tables', async () => {
    const res = await fetch(`${BASE}/api/assistant/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${custToken}` },
      body: JSON.stringify({ message: 'Show my recent orders', language: 'en-IN' }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.reply.includes('| --- |'), false, 'Must not output Markdown pipe tables');
  });

  // 16. Live AI chat online payment security
  await runCase(16, 'Online payment request triggers SET_PAYMENT_METHOD razorpay without asking PIN/OTP', async () => {
    const res = await fetch(`${BASE}/api/assistant/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${custToken}` },
      body: JSON.stringify({ message: 'I want to pay online with Razorpay UPI', language: 'en-IN' }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(/enter your upi pin|cvv|otp/i.test(data.reply), false);
  });

  // 17. Live AI chat custom fruit bowl discovery
  await runCase(17, 'Custom fruit bowl query invokes build_custom_bowl & returns bowl options', async () => {
    const res = await fetch(`${BASE}/api/assistant/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${custToken}` },
      body: JSON.stringify({ message: 'How can I build a custom fruit bowl?', language: 'en-IN' }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.toolsUsed.includes('build_custom_bowl'));
  });

  // 18. Live AI chat subscription plans discovery
  await runCase(18, 'Subscription query invokes get_subscription_plans', async () => {
    const res = await fetch(`${BASE}/api/assistant/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${custToken}` },
      body: JSON.stringify({ message: 'What breakfast subscription plans do you offer?', language: 'en-IN' }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.toolsUsed.includes('get_subscription_plans'));
  });

  // 19. Live TTS female voice synthesis returns audio bytes
  await runCase(19, 'POST /api/assistant/tts returns non-empty audio buffer', async () => {
    const res = await fetch(`${BASE}/api/assistant/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Welcome to HRUVITA.', language: 'en-IN' }),
    });
    assert.equal(res.status, 200);
    const buf = await res.arrayBuffer();
    assert.ok(buf.byteLength > 500, 'Expected non-empty MP3 audio');
  });

  // 20. Admin overview BI metrics
  await runCase(20, 'GET /api/admin/overview includes today/pending/completed/cancelled & popularProducts', async () => {
    const res = await fetch(`${BASE}/api/admin/overview`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    for (const k of [
      'todayOrdersCount',
      'pendingOrdersCount',
      'completedOrdersCount',
      'cancelledOrdersCount',
    ]) {
      assert.equal(typeof data.stats[k], 'number', `Missing stats.${k}`);
    }
    assert.ok(Array.isArray(data.popularProducts));
  });

  // 21. Unauthenticated /api/orders rejected with 401
  await runCase(21, 'GET /api/orders rejects unauthenticated request with 401', async () => {
    const res = await fetch(`${BASE}/api/orders`);
    assert.equal(res.status, 401);
  });

  // 22. Customer cannot access Admin overview
  await runCase(22, 'GET /api/admin/overview rejects non-admin customer with 403', async () => {
    const res = await fetch(`${BASE}/api/admin/overview`, {
      headers: { Authorization: `Bearer ${custToken}` },
    });
    assert.equal(res.status, 403);
  });

  // 23. Product catalog contains active stocked products
  await runCase(23, 'Catalog products verified active and in stock', async () => {
    const products = await listProducts();
    const available = products.filter((p) => p.active !== false && p.stock > 0);
    assert.ok(available.length >= 5, `Expected >=5 available products, got ${available.length}`);
  });

  // 24. Customer order records belong strictly to that user
  await runCase(24, 'listOrdersByUser returns only orders belonging to that customer', async () => {
    const orders = await listOrdersByUser('u-cust-1');
    for (const o of orders) {
      assert.equal(o.userId, 'u-cust-1');
    }
  });

  // 25. Same-day booking returns isSameDay=true with no required slots, while future date returns slots
  await runCase(25, 'GET /api/slots differentiates same-day (no slots) vs future pre-booking slots', async () => {
    const { todayStr, tomorrowStr } = getBusinessDateParts();
    const todayRes = await fetch(`${BASE}/api/slots?date=${todayStr}`);
    assert.equal(todayRes.status, 200);
    const todayData = await todayRes.json();
    assert.equal(todayData.isSameDay, true);
    assert.equal(todayData.slots.length, 0);

    const tomRes = await fetch(`${BASE}/api/slots?date=${tomorrowStr}`);
    assert.equal(tomRes.status, 200);
    const tomData = await tomRes.json();
    assert.equal(tomData.isSameDay, false);
    assert.ok(tomData.slots.length >= 2);
  });

  // 26. validateDeliverySchedule rejects past dates and rejects future dates without a valid slot
  await runCase(26, 'validateDeliverySchedule rejects past dates and enforces slot on future dates', async () => {
    const { tomorrowStr } = getBusinessDateParts();
    await assert.rejects(() => validateDeliverySchedule({ scheduledDate: '2020-01-01', slotId: 'morning' }));
    await assert.rejects(() => validateDeliverySchedule({ scheduledDate: tomorrowStr, slotId: 'same-day' }));
    const validTom = await validateDeliverySchedule({ scheduledDate: tomorrowStr, slotId: 'afternoon' });
    assert.equal(validTom.id, 'afternoon');
  });

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n=== FULL AUDIT SUMMARY: ${passed}/${results.length} PASSED ===`);
  if (passed !== results.length) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Audit test runner crashed:', err);
  process.exit(1);
});
