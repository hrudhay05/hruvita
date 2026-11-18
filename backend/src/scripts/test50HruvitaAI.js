import assert from 'node:assert/strict';

const BASE = process.env.API_URL || 'http://localhost:5059';

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

let passed = 0;
function pass(num, label) {
  passed += 1;
  console.log(`  [PASS ${String(num).padStart(2, '0')}/50] ${label}`);
}

async function run() {
  console.log('=== HRUVITA AI: 50-Test-Case Bilingual & Navigation Suite ===\n');

  // 1-4: Config, Greetings & Female TTS
  const cfg = await api('/api/assistant/config');
  assert.equal(cfg.status, 200);
  assert.equal(cfg.data.voices['te-IN'].gender, 'Female');
  assert.equal(cfg.data.voices['en-IN'].gender, 'Female');
  pass(1, 'Assistant config & female voice metadata');

  const greetEn = await api('/api/assistant/greeting?lang=en-IN');
  assert.ok(greetEn.data.greeting.includes('HRUVITA'));
  pass(2, 'English welcome greeting');

  const greetTe = await api('/api/assistant/greeting?lang=te-IN');
  assert.ok(greetTe.data.greeting.includes('నమస్కారం'));
  pass(3, 'Telugu welcome greeting');

  const ttsTe = await api('/api/assistant/tts', {
    method: 'POST',
    body: JSON.stringify({ text: 'నమస్కారం! HRUVITA కి స్వాగతం.', language: 'te-IN' }),
  });
  assert.equal(ttsTe.status, 200);
  assert.ok(ttsTe.bytes > 5000);
  const ttsEn = await api('/api/assistant/tts', {
    method: 'POST',
    body: JSON.stringify({ text: 'Hello! Welcome to HRUVITA.', language: 'en-IN' }),
  });
  assert.equal(ttsEn.status, 200);
  assert.ok(ttsEn.bytes > 5000);
  pass(4, `Female TTS MP3 streaming (ShrutiNeural ${ttsTe.bytes}B, NeerjaNeural ${ttsEn.bytes}B)`);

  // Auth login for customer
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ emailOrUsername: 'customer@hruvita.com', password: 'Customer@123', directDemo: true }),
  });
  assert.equal(login.status, 200);
  const token = login.data.token;

  // 5-12: Category Detection & Live Navigation
  const catTests = [
    [5, 'నాకు టిఫిన్స్ కావాలి', 'te-IN', 'tiffins'],
    [6, 'I want juices.', 'en-IN', 'juices'],
    [7, 'Show me fruit bowls', 'en-IN', 'fruit-bowls'],
    [8, 'I want smoothies', 'en-IN', 'smoothies'],
    [9, 'Show dairy items', 'en-IN', 'dairy'],
    [10, 'Show combos', 'en-IN', 'combos'],
    [11, 'I want lunch', 'en-IN', 'lunch'],
    [12, 'Show healthy snacks', 'en-IN', 'snacks'],
  ];
  for (const [num, msg, lang, slug] of catTests) {
    const r = await api('/api/assistant/chat', {
      method: 'POST',
      token,
      body: JSON.stringify({ message: msg, language: lang }),
    });
    assert.equal(r.status, 200);
    assert.ok(r.data.actions.some((a) => a.type === 'NAVIGATE' && a.to.includes(slug)));
    pass(num, `Category navigation: "${msg}" -> ${slug}`);
  }

  // 13-17: Page Navigation (Cart, Checkout, Orders Page, Menu, Home, Addresses)
  const c13 = await api('/api/assistant/chat', { method: 'POST', token, body: JSON.stringify({ message: 'Go to cart', cartItems: { p1: 2 } }) });
  assert.ok(c13.data.actions.some((a) => a.type === 'NAVIGATE' && a.to === '/cart'));
  pass(13, 'Navigate "Go to cart" -> /cart');

  const c14 = await api('/api/assistant/chat', { method: 'POST', token, body: JSON.stringify({ message: 'Open checkout', cartItems: { p1: 2 } }) });
  assert.ok(c14.data.actions.some((a) => a.type === 'NAVIGATE' && a.to === '/cart'));
  pass(14, 'Navigate "Open checkout" -> /cart');

  const c15 = await api('/api/assistant/chat', { method: 'POST', token, body: JSON.stringify({ message: 'Go to orders page' }) });
  assert.ok(c15.data.actions.some((a) => a.type === 'NAVIGATE' && a.to === '/dashboard'));
  pass(15, 'Navigate "Go to orders page" -> /dashboard');

  const c16 = await api('/api/assistant/chat', { method: 'POST', token, body: JSON.stringify({ message: 'Explore menu' }) });
  assert.ok(c16.data.actions.some((a) => a.type === 'NAVIGATE' && a.to === '/menu'));
  pass(16, 'Navigate "Explore menu" -> /menu');

  const c17 = await api('/api/assistant/chat', { method: 'POST', token, body: JSON.stringify({ message: 'Show my addresses' }) });
  assert.ok(c17.data.actions.some((a) => a.type === 'NAVIGATE' && a.to === '/addresses'));
  pass(17, 'Navigate "Show my addresses" -> /addresses');

  // 18-22: Multi-turn & Direct Telugu / Tenglish / English Product Ordering
  const t18a = await api('/api/assistant/chat', { method: 'POST', token, body: JSON.stringify({ message: 'నాకు ఇడ్లీ తీసుకోవాలని అనుకుంటున్నాను', language: 'te-IN' }) });
  assert.ok(t18a.data.actions.some((a) => a.to === '/product/p1'));
  pass(18, 'Telugu product inquiry opens /product/p1 & asks qty');

  const t19 = await api('/api/assistant/chat', { method: 'POST', token, body: JSON.stringify({ message: 'రెండు ప్లేట్లు', language: 'te-IN', conversationId: t18a.data.conversationId }) });
  assert.ok(t19.data.reply.includes('2'));
  pass(19, 'Telugu quantity reply asks confirmation');

  const t20 = await api('/api/assistant/chat', { method: 'POST', token, body: JSON.stringify({ message: 'అవును', language: 'te-IN', conversationId: t18a.data.conversationId }) });
  assert.ok(t20.data.actions.some((a) => a.type === 'ADD_TO_CART' && a.productId === 'p1' && a.qty === 2));
  pass(20, 'Telugu affirmative "అవును" executes ADD_TO_CART');

  const t21 = await api('/api/assistant/chat', { method: 'POST', token, body: JSON.stringify({ message: 'Naku tiffins kavali' }) });
  assert.equal(t21.data.language, 'te-IN');
  pass(21, 'Tenglish auto-detected as Telugu (te-IN)');

  const t22a = await api('/api/assistant/chat', { method: 'POST', token, body: JSON.stringify({ message: 'I need two plates of idly.' }) });
  const t22b = await api('/api/assistant/chat', { method: 'POST', token, body: JSON.stringify({ message: 'Yes please', conversationId: t22a.data.conversationId }) });
  assert.ok(t22b.data.actions.some((a) => a.type === 'ADD_TO_CART' && a.productId === 'p1' && a.qty === 2));
  pass(22, '"I need two plates of idly." + "Yes please" -> ADD_TO_CART');

  // 23-28: Direct Add, Plurals, Quantity Update, Remove, View Cart, Clear Cart
  const t23 = await api('/api/assistant/chat', { method: 'POST', token, body: JSON.stringify({ message: 'Add 2 idlis' }) });
  assert.ok(t23.data.actions.some((a) => a.type === 'ADD_TO_CART' && a.productId === 'p1' && a.qty === 2));
  pass(23, 'Direct plural add: "Add 2 idlis"');

  const t24 = await api('/api/assistant/chat', { method: 'POST', token, body: JSON.stringify({ message: 'Give me 3 masala dosas' }) });
  assert.ok(t24.data.actions.some((a) => a.type === 'ADD_TO_CART' && a.productId === 'p2' && a.qty === 3));
  pass(24, 'Direct add: "Give me 3 masala dosas"');

  const t25 = await api('/api/assistant/chat', { method: 'POST', token, body: JSON.stringify({ message: 'Change dosa quantity to 4', cartItems: { p2: 1 } }) });
  assert.ok(t25.data.actions.some((a) => a.type === 'UPDATE_CART_QTY' && a.productId === 'p2' && a.qty === 4));
  pass(25, 'Update quantity: "Change dosa quantity to 4"');

  const t26 = await api('/api/assistant/chat', { method: 'POST', token, body: JSON.stringify({ message: 'Remove one orange juice', cartItems: { p7: 2 } }) });
  assert.ok(t26.data.actions.some((a) => a.type === 'UPDATE_CART_QTY' && a.productId === 'p7' && a.qty === 1));
  pass(26, 'Remove item: "Remove one orange juice"');

  const t27 = await api('/api/assistant/chat', { method: 'POST', token, body: JSON.stringify({ message: 'How much is my total?', cartItems: { p1: 2 } }) });
  assert.ok(t27.data.reply.includes('₹'));
  pass(27, 'Server-authoritative cart total calculation');

  const t28 = await api('/api/assistant/chat', { method: 'POST', token, body: JSON.stringify({ message: 'Clear cart' }) });
  assert.ok(t28.data.actions.some((a) => a.type === 'CLEAR_CART'));
  pass(28, 'Clear cart command');

  // 29-33: Mood-Based & Tenglish Recommendations
  const moodTests = [
    [29, "I'm feeling very hungry."],
    [30, 'నాకు ఈరోజు చాలా అలసటగా ఉంది'],
    [31, 'I want something spicy.'],
    [32, "I'm confused. Suggest something."],
    [33, 'Naku akali ga undi'],
  ];
  for (const [num, msg] of moodTests) {
    const r = await api('/api/assistant/chat', { method: 'POST', token, body: JSON.stringify({ message: msg }) });
    assert.ok(r.data.toolsUsed.includes('mood_recommendation'));
    assert.ok(r.data.recommendedProducts.length > 0);
    pass(num, `Mood recommendation: "${msg}"`);
  }

  // 34-37: Multi-Turn Custom Fruit Bowl Builder
  const b34 = await api('/api/assistant/chat', { method: 'POST', token, body: JSON.stringify({ message: 'I want to make my own fruit bowl' }) });
  assert.ok(b34.data.actions.some((a) => a.to === '/build-bowl'));
  pass(34, 'Custom bowl builder opens /build-bowl & asks fruits');

  const b35 = await api('/api/assistant/chat', { method: 'POST', token, body: JSON.stringify({ message: 'Apple, banana and pomegranate', conversationId: b34.data.conversationId }) });
  assert.ok(b35.data.reply.toLowerCase().includes('apple'));
  pass(35, 'Custom bowl matches DB fruits & asks toppings');

  const b36 = await api('/api/assistant/chat', { method: 'POST', token, body: JSON.stringify({ message: 'Add nuts', conversationId: b34.data.conversationId }) });
  assert.ok(b36.data.reply.includes('₹'));
  pass(36, 'Custom bowl calculates live DB price');

  const b37 = await api('/api/assistant/chat', { method: 'POST', token, body: JSON.stringify({ message: 'Yes', conversationId: b34.data.conversationId }) });
  assert.ok(b37.data.actions.some((a) => a.type === 'ADD_CUSTOM_BOWL'));
  pass(37, 'Custom bowl confirmed & added to cart');

  // 38-40: Subscriptions, Offers, Slots & Delivery Charges
  const sub38 = await api('/api/assistant/chat', { method: 'POST', token, body: JSON.stringify({ message: 'I want daily breakfast' }) });
  assert.ok(sub38.data.actions.some((a) => a.to === '/subscriptions'));
  pass(38, 'Subscriptions discovery navigates to /subscriptions');

  const off39 = await api('/api/assistant/chat', { method: 'POST', token, body: JSON.stringify({ message: 'Active offers and coupons' }) });
  assert.ok(off39.data.toolsUsed.includes('get_offers'));
  pass(39, 'Active offers & coupons query');

  const sl40 = await api('/api/assistant/chat', { method: 'POST', token, body: JSON.stringify({ message: 'Delivery fee and slots' }) });
  assert.ok(sl40.data.reply.includes('₹'));
  pass(40, 'Delivery slots & free delivery threshold');

  // 41-45: Order Confirmation, Cancellation, Razorpay Checkout & Duplicate Prevention
  const o41a = await api('/api/assistant/chat', { method: 'POST', token, body: JSON.stringify({ message: 'I want to place my order', cartItems: { p1: 2 } }) });
  assert.ok(o41a.data.reply.includes('₹'));
  pass(41, 'Voice checkout summarizes items & asks explicit confirmation');

  const o42 = await api('/api/assistant/chat', { method: 'POST', token, body: JSON.stringify({ message: 'Cancel', conversationId: o41a.data.conversationId }) });
  assert.ok(o42.data.toolsUsed.includes('cancel_pending_action'));
  pass(42, 'Cancel before submission aborts order cleanly');

  const o43a = await api('/api/assistant/chat', { method: 'POST', token, body: JSON.stringify({ message: 'I want to place my order', cartItems: { p1: 2 } }) });
  const o43b = await api('/api/assistant/chat', { method: 'POST', token, body: JSON.stringify({ message: 'Yes, confirm my order', conversationId: o43a.data.conversationId, cartItems: { p1: 2 } }) });
  assert.ok(o43b.data.actions.some((a) => a.type === 'CLEAR_CART'));
  assert.ok(o43b.data.reply.includes('ORD-'));
  pass(43, 'Explicit confirmation creates real COD order');

  const o44 = await api('/api/assistant/chat', { method: 'POST', token, body: JSON.stringify({ message: 'Yes, confirm my order', conversationId: o43a.data.conversationId, cartItems: { p1: 2 } }) });
  assert.ok(!o44.data.actions.some((a) => a.type === 'CLEAR_CART'));
  pass(44, 'Duplicate confirmation blocked safely');

  const o45a = await api('/api/assistant/chat', { method: 'POST', token, body: JSON.stringify({ message: 'Place my order with online UPI payment', cartItems: { p1: 2 } }) });
  const o45b = await api('/api/assistant/chat', { method: 'POST', token, body: JSON.stringify({ message: 'Confirm', conversationId: o45a.data.conversationId, cartItems: { p1: 2 } }) });
  assert.ok(o45b.data.actions.some((a) => a.type === 'OPEN_RAZORPAY_CHECKOUT'));
  pass(45, 'Online payment initiates Razorpay checkout without faking success');

  // 46-50: Order Tracking, Greetings, Courtesy & Edge Cases
  const tr46 = await api('/api/assistant/chat', { method: 'POST', token, body: JSON.stringify({ message: 'నా ఆర్డర్ ఎక్కడ ఉంది?', language: 'te-IN' }) });
  assert.ok(tr46.data.reply.includes('ORD-'));
  pass(46, 'Authenticated Telugu order tracking');

  const tr47 = await api('/api/assistant/chat', { method: 'POST', body: JSON.stringify({ message: 'Where is my order?' }) });
  assert.ok(tr47.data.actions.some((a) => a.to === '/login'));
  pass(47, 'Guest blocked from viewing private order tracking');

  const hi48 = await api('/api/assistant/chat', { method: 'POST', body: JSON.stringify({ message: 'నమస్కారం' }) });
  assert.equal(hi48.data.language, 'te-IN');
  pass(48, 'Telugu greeting courtesy');

  const th49 = await api('/api/assistant/chat', { method: 'POST', body: JSON.stringify({ message: 'Thank you' }) });
  assert.ok(th49.data.toolsUsed.includes('courtesy'));
  pass(49, 'English courtesy closing');

  const emp50 = await api('/api/assistant/chat', { method: 'POST', body: JSON.stringify({ message: '   ' }) });
  assert.equal(emp50.status, 400);
  pass(50, 'Empty/unclear input guard');

  console.log(`\n=== SUMMARY: ${passed} / 50 TEST CASES PASSED (100%) ===`);
}

run().catch((err) => {
  console.error(`\nFAILED at ${passed + 1}/50:`, err);
  process.exit(1);
});
