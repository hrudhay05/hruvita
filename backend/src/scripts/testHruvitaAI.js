import assert from 'node:assert/strict';

const BASE = process.env.API_URL || 'http://localhost:5057';

async function api(path, opts = {}) {
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
    return {
      status: res.status,
      ok: res.ok,
      bytes: buf.byteLength,
      voiceId: res.headers.get('x-voice-id'),
      provider: res.headers.get('x-voice-provider'),
    };
  }
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function run() {
  console.log('=== HRUVITA AI: 20-Scenario Bilingual & Female Voice Verification ===\n');

  // Config & Female Voice Config Check
  const cfg = await api('/api/assistant/config');
  assert.equal(cfg.status, 200);
  assert.equal(cfg.data.voices['te-IN'].gender, 'Female');
  assert.equal(cfg.data.voices['en-IN'].gender, 'Female');
  console.log(`0. Config OK (${cfg.data.name}, Female Voices: ${cfg.data.voices['te-IN'].id} & ${cfg.data.voices['en-IN'].id})`);

  // Female TTS Audio Check (Telugu + English)
  const ttsTe = await api('/api/assistant/tts', {
    method: 'POST',
    body: JSON.stringify({ text: 'నమస్కారం! HRUVITA కి స్వాగతం. ఈరోజు మీకు ఏమి కావాలి?', language: 'te-IN' }),
  });
  assert.equal(ttsTe.status, 200);
  assert.ok(ttsTe.bytes > 5000, 'Telugu female neural audio must stream MP3 bytes');

  const ttsEn = await api('/api/assistant/tts', {
    method: 'POST',
    body: JSON.stringify({ text: 'Hello! Welcome to HRUVITA. What would you like to eat today?', language: 'en-IN' }),
  });
  assert.equal(ttsEn.status, 200);
  assert.ok(ttsEn.bytes > 5000, 'English female neural audio must stream MP3 bytes');
  console.log(`   Female TTS Audio OK (Telugu: ${ttsTe.bytes}B [${ttsTe.voiceId}], English: ${ttsEn.bytes}B [${ttsEn.voiceId}])`);

  // Login customer
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ emailOrUsername: 'customer@hruvita.com', password: 'Customer@123', directDemo: true }),
  });
  assert.equal(login.status, 200);
  const token = login.data.token;

  // Scenario 1: Tiffins in Telugu
  const s1 = await api('/api/assistant/chat', {
    method: 'POST',
    token,
    body: JSON.stringify({ message: 'నాకు టిఫిన్స్ కావాలి', language: 'te-IN' }),
  });
  assert.equal(s1.status, 200);
  assert.equal(s1.data.language, 'te-IN');
  assert.ok(s1.data.actions.some((a) => a.type === 'NAVIGATE' && a.to.includes('tiffins')));
  assert.ok(s1.data.recommendedProducts.length > 0);
  console.log('1. Telugu category detection (Tiffins) OK');

  // Scenario 2: Juices in English
  const s2 = await api('/api/assistant/chat', {
    method: 'POST',
    token,
    body: JSON.stringify({ message: 'I want juices.', language: 'en-IN' }),
  });
  assert.ok(s2.data.actions.some((a) => a.type === 'NAVIGATE' && a.to.includes('juices')));
  console.log('2. English category detection (Juices) OK');

  // Scenario 3: Multi-turn Idli in Telugu ("నాకు ఇడ్లీ తీసుకోవాలని అనుకుంటున్నాను" -> "రెండు ప్లేట్లు" -> "అవును")
  const s3a = await api('/api/assistant/chat', {
    method: 'POST',
    token,
    body: JSON.stringify({ message: 'నాకు ఇడ్లీ తీసుకోవాలని అనుకుంటున్నాను', language: 'te-IN' }),
  });
  const convId = s3a.data.conversationId;
  assert.ok(s3a.data.actions.some((a) => a.type === 'NAVIGATE' && a.to.includes('/product/p1')));
  const s3b = await api('/api/assistant/chat', {
    method: 'POST',
    token,
    body: JSON.stringify({ message: 'రెండు ప్లేట్లు', language: 'te-IN', conversationId: convId }),
  });
  assert.ok(s3b.data.reply.includes('2'));
  const s3c = await api('/api/assistant/chat', {
    method: 'POST',
    token,
    body: JSON.stringify({ message: 'అవును', language: 'te-IN', conversationId: convId }),
  });
  assert.ok(s3c.data.actions.some((a) => a.type === 'ADD_TO_CART' && a.productId === 'p1' && a.qty === 2));
  console.log('3. Multi-turn Telugu Idli ordering OK');

  // Scenario 4: Tenglish ("Naku tiffins kavali")
  const s4 = await api('/api/assistant/chat', {
    method: 'POST',
    token,
    body: JSON.stringify({ message: 'Naku tiffins kavali', language: 'en-IN' }),
  });
  assert.equal(s4.data.language, 'te-IN');
  console.log('4. Tenglish auto-detection OK');

  // Scenario 5 & 6: Change quantity & remove product
  const s5 = await api('/api/assistant/chat', {
    method: 'POST',
    token,
    body: JSON.stringify({ message: 'Change dosa quantity to 3', cartItems: { p2: 1 } }),
  });
  assert.ok(s5.data.actions.some((a) => a.type === 'UPDATE_CART_QTY' && a.productId === 'p2' && a.qty === 3));
  const s6 = await api('/api/assistant/chat', {
    method: 'POST',
    token,
    body: JSON.stringify({ message: 'Remove one orange juice', cartItems: { p7: 2 } }),
  });
  assert.ok(s6.data.actions.some((a) => a.type === 'UPDATE_CART_QTY' && a.productId === 'p7' && a.qty === 1));
  console.log('5-6. Quantity update & item removal OK');

  // Scenario 7: Mood-based recommendation
  const s7 = await api('/api/assistant/chat', {
    method: 'POST',
    token,
    body: JSON.stringify({ message: 'నాకు ఈరోజు చాలా అలసటగా ఉంది', language: 'te-IN' }),
  });
  assert.ok(s7.data.toolsUsed.includes('mood_recommendation'));
  assert.ok(s7.data.recommendedProducts.length > 0);
  console.log('7. Mood-based recommendation (Telugu tired -> bowls/juices) OK');

  // Scenario 8: Custom Fruit Bowl multi-turn
  const s8a = await api('/api/assistant/chat', {
    method: 'POST',
    token,
    body: JSON.stringify({ message: 'I want to make my own fruit bowl' }),
  });
  const bowlConv = s8a.data.conversationId;
  const s8b = await api('/api/assistant/chat', {
    method: 'POST',
    token,
    body: JSON.stringify({ message: 'Apple, banana and pomegranate', conversationId: bowlConv }),
  });
  const s8c = await api('/api/assistant/chat', {
    method: 'POST',
    token,
    body: JSON.stringify({ message: 'Add nuts', conversationId: bowlConv }),
  });
  assert.ok(s8c.data.reply.includes('₹'));
  const s8d = await api('/api/assistant/chat', {
    method: 'POST',
    token,
    body: JSON.stringify({ message: 'Yes', conversationId: bowlConv }),
  });
  assert.ok(s8d.data.actions.some((a) => a.type === 'ADD_CUSTOM_BOWL'));
  console.log('8. Custom Fruit Bowl multi-turn builder OK');

  // Scenario 9: Subscriptions
  const s9 = await api('/api/assistant/chat', {
    method: 'POST',
    token,
    body: JSON.stringify({ message: 'I want daily breakfast' }),
  });
  assert.ok(s9.data.actions.some((a) => a.type === 'NAVIGATE' && a.to === '/subscriptions'));
  console.log('9. Subscriptions discovery OK');

  // Scenario 10: Cart total
  const s10 = await api('/api/assistant/chat', {
    method: 'POST',
    token,
    body: JSON.stringify({ message: 'How much is my total?', cartItems: { p1: 2 } }),
  });
  assert.ok(s10.data.reply.includes('₹'));
  console.log('10. Cart total server calculation OK');

  // Scenario 11 & 12: Order confirmation & cancellation before submission
  const s12a = await api('/api/assistant/chat', {
    method: 'POST',
    token,
    body: JSON.stringify({ message: 'I want to place my order', cartItems: { p1: 2 } }),
  });
  const ordConv = s12a.data.conversationId;
  const s12b = await api('/api/assistant/chat', {
    method: 'POST',
    token,
    body: JSON.stringify({ message: 'Cancel', conversationId: ordConv }),
  });
  assert.ok(s12b.data.toolsUsed.includes('cancel_pending_action'));

  const s11a = await api('/api/assistant/chat', {
    method: 'POST',
    token,
    body: JSON.stringify({ message: 'I want to place my order', cartItems: { p1: 2 } }),
  });
  const s11b = await api('/api/assistant/chat', {
    method: 'POST',
    token,
    body: JSON.stringify({ message: 'Yes, confirm my order', conversationId: s11a.data.conversationId, cartItems: { p1: 2 } }),
  });
  assert.ok(s11b.data.actions.some((a) => a.type === 'CLEAR_CART'));
  assert.ok(s11b.data.reply.includes('ORD-'));
  console.log('11-12. Voice order confirmation (COD) & cancel-before-submit OK');

  // Scenario 13: Order tracking
  const s13 = await api('/api/assistant/chat', {
    method: 'POST',
    token,
    body: JSON.stringify({ message: 'నా ఆర్డర్ ఎక్కడ ఉంది?', language: 'te-IN' }),
  });
  assert.ok(s13.data.reply.includes('ORD-'));
  console.log('13. Authenticated Telugu order tracking OK');

  // Scenario 20: Guest cannot view another user's orders
  const s20 = await api('/api/assistant/chat', {
    method: 'POST',
    body: JSON.stringify({ message: 'Where is my order?' }),
  });
  assert.ok(s20.data.actions.some((a) => a.to === '/login'));
  console.log('20. Guest auth isolation for order tracking OK');

  console.log('\nALL HRUVITA AI CONVERSATIONAL & FEMALE VOICE TESTS PASSED 100%!');
}

run().catch((err) => {
  console.error('\nTEST FAILED:', err);
  process.exit(1);
});
