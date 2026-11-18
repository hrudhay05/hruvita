import assert from 'node:assert/strict';

const BASE = (process.env.API_URL || 'http://127.0.0.1:5060').trim();

async function api(path, opts = {}) {
  if (path === '/api/assistant/chat') {
    await new Promise((r) => setTimeout(r, 1200));
  }
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('audio/')) {
    const buf = await res.arrayBuffer();
    return { status: res.status, bytes: buf.byteLength, voiceId: res.headers.get('x-voice-id'), ttsMs: res.headers.get('x-tts-duration-ms') };
  }
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function run() {
  console.log('=== HRUVITA REAL LLM TOOL-CALLING AGENT LIVE TESTS ===\n');

  const dbg = await api('/api/assistant/debug');
  assert.equal(dbg.status, 200);
  assert.equal(dbg.data.aiConnected, true, 'Real AI API key must be connected');
  console.log(`0. AI Debug Status OK -> Provider: ${dbg.data.primaryProvider}, Model: ${dbg.data.aiModel}`);

  const login = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ emailOrUsername: 'customer@hruvita.com', password: 'Customer@123', directDemo: true }),
  });
  assert.equal(login.status, 200);
  const token = login.data.token;

  // 1. User's exact failed phrase with EMPTY cart -> LLM calls open_checkout, reports empty cart naturally in Telugu
  const t1 = await api('/api/assistant/chat', {
    method: 'POST',
    token,
    body: JSON.stringify({ message: 'చెక్ అవుట్ ఓపెన్ చేయండి', language: 'te-IN', cartItems: {} }),
  });
  assert.equal(t1.status, 200);
  assert.ok(t1.data.toolsUsed.includes('open_checkout'), `Expected open_checkout tool, got ${t1.data.toolsUsed}`);
  assert.ok(!t1.data.actions.some((a) => a.type === 'NAVIGATE' && a.to === '/cart'), 'Should NOT navigate to checkout on empty cart');
  console.log(`1. Empty cart checkout ("చెక్ అవుట్ ఓపెన్ చేయండి") OK [${t1.data.debug?.totalDurationMs}ms] -> "${t1.data.reply}"`);

  // 2. Non-empty cart checkout -> LLM calls open_checkout and navigates to /cart
  const t2 = await api('/api/assistant/chat', {
    method: 'POST',
    token,
    body: JSON.stringify({ message: 'చెక్ అవుట్ ఓపెన్ చేయండి', language: 'te-IN', cartItems: { p1: 2 } }),
  });
  assert.ok(t2.data.toolsUsed.includes('open_checkout'));
  assert.ok(t2.data.actions.some((a) => a.type === 'NAVIGATE' && a.to === '/cart'));
  console.log(`2. Non-empty cart checkout OK [${t2.data.debug?.totalDurationMs}ms] -> "${t2.data.reply}"`);

  // 3. Natural Telugu product order ("నాకు రెండు ఇడ్లీ ప్లేట్లు కావాలి.")
  const t3 = await api('/api/assistant/chat', {
    method: 'POST',
    token,
    body: JSON.stringify({ message: 'నాకు రెండు ఇడ్లీ ప్లేట్లు కావాలి.', language: 'te-IN' }),
  });
  assert.ok(t3.data.toolsUsed.length >= 1);
  console.log(`3. Telugu natural ordering OK [${t3.data.debug?.totalDurationMs}ms, tools=${t3.data.toolsUsed.join(',')}] -> "${t3.data.reply}"`);

  // 4. Unexpected natural question ("What can I get within ₹100?")
  const t4 = await api('/api/assistant/chat', {
    method: 'POST',
    token,
    body: JSON.stringify({ message: 'What can I get within ₹100?', language: 'en-IN' }),
  });
  assert.ok(t4.data.toolsUsed.includes('search_products'));
  assert.ok(t4.data.recommendedProducts.length > 0);
  console.log(`4. Unexpected question ("What can I get within ₹100?") OK [${t4.data.debug?.totalDurationMs}ms] -> "${t4.data.reply}"`);

  // 5. Tenglish mixed ("Naku tiffins kavali, spicy ga emunnayi?")
  const t5 = await api('/api/assistant/chat', {
    method: 'POST',
    token,
    body: JSON.stringify({ message: 'Naku tiffins kavali, spicy ga emunnayi?' }),
  });
  assert.equal(t5.data.language, 'te-IN');
  assert.ok(t5.data.toolsUsed.length >= 1);
  console.log(`5. Tenglish mixed query OK [${t5.data.debug?.totalDurationMs}ms] -> "${t5.data.reply}"`);

  // 6. Custom fruit bowl
  const t6 = await api('/api/assistant/chat', {
    method: 'POST',
    token,
    body: JSON.stringify({ message: 'Can I make a custom fruit bowl with apple, banana and almonds?' }),
  });
  assert.ok(t6.data.toolsUsed.includes('build_custom_bowl'));
  console.log(`6. Custom fruit bowl tool OK [${t6.data.debug?.totalDurationMs}ms]`);

  // 7. Subscriptions
  const t7 = await api('/api/assistant/chat', {
    method: 'POST',
    token,
    body: JSON.stringify({ message: 'What is the difference between your subscription plans?' }),
  });
  assert.ok(t7.data.toolsUsed.includes('get_subscription_plans'));
  console.log(`7. Subscriptions tool OK [${t7.data.debug?.totalDurationMs}ms]`);

  // 8. Authenticated Order Tracking & Unauthorized Guest check
  const t8 = await api('/api/assistant/chat', {
    method: 'POST',
    token,
    body: JSON.stringify({ message: 'Where is my previous order?' }),
  });
  assert.ok(t8.data.toolsUsed.some((t) => t === 'get_my_orders' || t === 'track_order'));

  const t9 = await api('/api/assistant/chat', {
    method: 'POST',
    body: JSON.stringify({ message: 'Where is my previous order?' }),
  });
  assert.ok(!t9.data.reply.includes('ORD-'), 'Guest must never see real order IDs');
  console.log(`8. Auth order tracking & guest isolation OK [${t8.data.debug?.totalDurationMs}ms]`);

  // 9. Female Telugu & English TTS latency check
  const ttsTe = await api('/api/assistant/tts', {
    method: 'POST',
    body: JSON.stringify({ text: 'నమస్కారం! HRUVITA కి స్వాగతం.', language: 'te-IN' }),
  });
  const ttsEn = await api('/api/assistant/tts', {
    method: 'POST',
    body: JSON.stringify({ text: 'Hello! Welcome to HRUVITA.', language: 'en-IN' }),
  });
  assert.equal(ttsTe.status, 200);
  assert.equal(ttsEn.status, 200);
  console.log(`9. Female TTS OK (Telugu ${ttsTe.ttsMs}ms, English ${ttsEn.ttsMs}ms)`);

  // 10. Open specific product details page ("ఈ ఇడ్లీ ఓపెన్ చేయండి")
  const t10 = await api('/api/assistant/chat', {
    method: 'POST',
    token,
    body: JSON.stringify({ message: 'ఈ ఇడ్లీ ఓపెన్ చేయండి', language: 'te-IN' }),
  });
  assert.ok(
    t10.data.actions.some((a) => a.type === 'NAVIGATE' && a.to.startsWith('/product/')),
    `Expected NAVIGATE /product/:id, got ${JSON.stringify(t10.data.actions)}`
  );
  console.log(`10. Product page navigation ("ఈ ఇడ్లీ ఓపెన్ చేయండి") OK -> ${t10.data.actions.find((a) => a.type === 'NAVIGATE')?.to}`);

  // 11. Online Payment security policy & COD selection
  const t11 = await api('/api/assistant/chat', {
    method: 'POST',
    token,
    body: JSON.stringify({ message: 'I want to pay using Online Payment UPI', language: 'en-IN', cartItems: { p1: 2 } }),
  });
  assert.ok(t11.data.toolsUsed.includes('select_payment_method'));
  assert.ok(t11.data.actions.some((a) => a.type === 'SET_PAYMENT_METHOD' && a.method === 'razorpay'));
  console.log(`11. Online Payment security response OK -> "${t11.data.reply}"`);

  console.log('\nALL LIVE REAL-LLM TOOL-CALLING TESTS PASSED 100%!');
}

run().catch((err) => {
  console.error('\nLIVE TEST FAILED:', err);
  process.exit(1);
});
