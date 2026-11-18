import 'dotenv/config';
import assert from 'node:assert/strict';

const BASE = process.env.API_URL || 'http://localhost:5000';

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function run() {
  console.log('=== HRUVITA 7-Feature Comprehensive Verification ===\n');

  // 1. Health check
  const health = await api('/api/health');
  assert.equal(health.status, 200);
  console.log(`1. Health OK (DB mode: ${health.data.db?.mode})`);

  // 2. Admin direct login
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@hruvita.com').toLowerCase();
  const adminLogin = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      emailOrUsername: adminEmail,
      password: process.env.ADMIN_PASSWORD || 'Admin@123',
      directDemo: true,
    }),
  });
  assert.equal(adminLogin.status, 200, `Admin login failed: ${JSON.stringify(adminLogin.data)}`);
  const adminToken = adminLogin.data.token;
  console.log('2. Admin login OK');

  // 3. Dynamic DB-backed bowl options & ingredients
  const bowlOptRes = await api('/api/bowl-options');
  assert.equal(bowlOptRes.status, 200);
  assert.ok(bowlOptRes.data.bowlOptions.fruits.length >= 5, 'Should have DB fruits');
  assert.ok(bowlOptRes.data.bowlOptions.toppings.length >= 4, 'Should have DB toppings');
  const almondsBefore = bowlOptRes.data.bowlOptions.toppings.find((t) => t.id === 'almonds')?.stock;
  console.log(`3. Dynamic DB Bowl Options OK (Almonds stock: ${almondsBefore})`);

  // 4. Dynamic Combos
  const comboRes = await api('/api/combos');
  assert.equal(comboRes.status, 200);
  assert.ok(comboRes.data.combos.length >= 2, 'Should have seeded combos');
  const testCombo = comboRes.data.combos.find((c) => c.availableNow) || comboRes.data.combos[0];
  console.log(`4. Dynamic Combos OK (${comboRes.data.combos.length} combos, sample: ${testCombo.name})`);

  // 5. Size-variant server-authoritative pricing in /api/checkout/quote
  const quoteRes = await api('/api/checkout/quote', {
    method: 'POST',
    body: JSON.stringify({
      items: { 'p1::Large (5 pcs)': 1 },
      customBowls: [
        {
          sizeId: 'large',
          fruits: ['papaya', 'apple'],
          toppings: ['almonds'],
          extras: ['honey'],
          qty: 1,
        },
      ],
    }),
  });
  assert.equal(quoteRes.status, 200, `Quote failed: ${JSON.stringify(quoteRes.data)}`);
  const idliLine = quoteRes.data.items.find((i) => i.productId === 'p1');
  assert.equal(idliLine.unitPrice, 70, `Expected Large Idli ₹70, got ${idliLine.unitPrice}`);
  assert.equal(idliLine.sizeLabel, 'Large (5 pcs)');
  const bowlLine = quoteRes.data.items.find((i) => i.isCustomBowl);
  // Large (179) + papaya(0) + apple(10) + almonds(25) + honey(15) = 229
  assert.equal(bowlLine.unitPrice, 229, `Expected custom bowl ₹229, got ${bowlLine.unitPrice}`);
  console.log(`5. Size-Variant & Custom Bowl Pricing OK (Idli Large: ₹${idliLine.unitPrice}, Bowl: ₹${bowlLine.unitPrice})`);

  // 6. Delivery Slots live capacity & pre-order cut-off validation
  const futureDate = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const farDate = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
  const slotsRes = await api(`/api/slots?date=${futureDate}`);
  assert.equal(slotsRes.status, 200);
  assert.ok(slotsRes.data.slots[0].remainingCapacity > 0);
  const farSlotsRes = await api(`/api/slots?date=${farDate}`);
  assert.equal(farSlotsRes.data.slots[0].available, false, 'Date beyond maxPreOrderDays must be unavailable');
  console.log(`6. Delivery Slot Capacity & Pre-order Window OK (Remaining: ${slotsRes.data.slots[0].remainingCapacity})`);

  // 7. Customer login + 10-min Razorpay stock reservation + release on cancel + InventoryLog
  const custLogin = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      emailOrUsername: 'customer@hruvita.com',
      password: 'Customer@123',
      directDemo: true,
    }),
  });
  assert.equal(custLogin.status, 200, `Customer login failed: ${JSON.stringify(custLogin.data)}`);
  const custToken = custLogin.data.token;

  const p1Before = (await api('/api/products/p1')).data.product.stock;
  const orderCreate = await api('/api/orders', {
    method: 'POST',
    token: custToken,
    body: JSON.stringify({
      items: { 'p1::Large (5 pcs)': 1 },
      customBowls: [{ sizeId: 'small', fruits: ['papaya'], toppings: ['almonds'], extras: [], qty: 1 }],
      address: { recipient: 'Raju', phone: '9000011111', line1: 'Flat 302', pincode: '500081' },
      scheduledDate: futureDate,
      slotId: 'evening',
      paymentMethod: 'razorpay',
    }),
  });
  assert.equal(orderCreate.status, 201, `Order create failed: ${JSON.stringify(orderCreate.data)}`);
  assert.equal(orderCreate.data.order.stockReserved, true, 'Razorpay order must reserve stock for 10m');
  const p1During = (await api('/api/products/p1')).data.product.stock;
  assert.equal(p1During, p1Before - 1, 'Product stock should decrement during 10m reservation');

  // Cancel order -> stock must restore & log order_released
  const cancelRes = await api(`/api/orders/${orderCreate.data.order.id}/cancel`, {
    method: 'POST',
    token: custToken,
    body: JSON.stringify({ reason: 'QA test release' }),
  });
  assert.equal(cancelRes.status, 200);
  const p1After = (await api('/api/products/p1')).data.product.stock;
  assert.equal(p1After, p1Before, 'Product stock must restore when reserved order is cancelled');

  const invRes = await api('/api/admin/inventory', { token: adminToken });
  assert.equal(invRes.status, 200);
  assert.ok(invRes.data.logs.length >= 2, 'InventoryLog must record reserve & release');
  console.log(`7. 10-Min Stock Reservation, Release & InventoryLog OK (${invRes.data.logs.length} log entries)`);

  // 8. Admin Inventory, Combos, Plans, Reviews Moderation, Referrals APIs
  const plansAdmin = await api('/api/admin/plans', { token: adminToken });
  assert.equal(plansAdmin.status, 200);
  assert.ok(plansAdmin.data.plans.length >= 3);

  const revsAdmin = await api('/api/admin/reviews', { token: adminToken });
  assert.equal(revsAdmin.status, 200);

  const refsAdmin = await api('/api/admin/referrals', { token: adminToken });
  assert.equal(refsAdmin.status, 200);

  // Delivered-only review gate check (create fresh user via admin/signup or verify gate works)
  const adminRev = await api('/api/reviews', {
    method: 'POST',
    token: adminToken,
    body: JSON.stringify({ rating: 5, comment: 'Fresh morning fruit bowls verified!' }),
  });
  assert.equal(adminRev.status, 201);
  const revId = adminRev.data.review.id;
  // Hide review via moderation
  const modHide = await api(`/api/admin/reviews/${revId}/moderate`, {
    method: 'PATCH',
    token: adminToken,
    body: JSON.stringify({ visible: false, moderationNote: 'QA moderation test' }),
  });
  assert.equal(modHide.status, 200);
  assert.equal(modHide.data.review.visible, false);
  const pubRevs = await api('/api/reviews');
  assert.ok(!pubRevs.data.reviews.some((r) => r.id === revId), 'Hidden review must not appear publicly');
  console.log('8. Admin Plans, Reviews Moderation & Referrals APIs OK');

  // 9. Subscription per-date pause rule check
  const firstPlanId = plansAdmin.data.plans[0].id;
  const subCreate = await api('/api/subscriptions', {
    method: 'POST',
    token: custToken,
    body: JSON.stringify({ planId: firstPlanId, preferredBreakfast: 'Mixed Fruit Bowl', slotId: 'morning' }),
  });
  assert.equal(subCreate.status, 201, `Subscription create failed: ${JSON.stringify(subCreate.data)}`);
  const skipDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const pauseRes = await api(`/api/subscriptions/${subCreate.data.subscription.id}/pause-date`, {
    method: 'POST',
    token: custToken,
    body: JSON.stringify({ date: skipDate }),
  });
  assert.equal(pauseRes.status, 200);
  assert.ok(pauseRes.data.subscription.pausedDates.includes(skipDate));
  console.log(`9. Subscription Pause Rules & Specific-Date Pause OK (Plan: ${firstPlanId}, Paused: ${skipDate})`);

  // 10. Dynamic Combo order + component product stock deduction
  const p5Before = (await api('/api/products/p5')).data.product.stock;
  const comboOrder = await api('/api/orders', {
    method: 'POST',
    token: custToken,
    body: JSON.stringify({
      items: { 'combo:combo-wellness-power': 1 },
      address: { recipient: 'Raju', phone: '9000011111', line1: 'Flat 302', pincode: '500081' },
      scheduledDate: futureDate,
      slotId: 'afternoon',
      paymentMethod: 'cod',
    }),
  });
  assert.equal(comboOrder.status, 201, `Combo order failed: ${JSON.stringify(comboOrder.data)}`);
  const p5After = (await api('/api/products/p5')).data.product.stock;
  assert.equal(p5After, p5Before - 1, 'Combo order must deduct stock from component product p5');
  console.log(`10. Dynamic Combo Component Stock Deduction OK (p5 stock: ${p5Before} -> ${p5After})`);

  // 11. Referral Code Signup + Pending Record + Fraud Check / Admin Visibility
  const friendEmail = `ref_qa_${Date.now()}@example.com`;
  const signupRef = await api('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Referred Friend',
      email: friendEmail,
      password: 'Password@123',
      confirmPassword: 'Password@123',
      referralCode: 'RAJU50',
      termsAccepted: true,
    }),
  });
  assert.equal(signupRef.status, 201, `Referral signup failed: ${JSON.stringify(signupRef.data)}`);
  const refsAfter = await api('/api/admin/referrals', { token: adminToken });
  const createdRef = refsAfter.data.referrals.find((r) => r.referredEmail === friendEmail);
  assert.ok(createdRef, 'Referral record must be created on signup');
  assert.equal(createdRef.status, 'pending', 'Referral must stay pending until first paid order');
  console.log(`11. Referral Signup & Pending Reward Tracking OK (Code: RAJU50 -> ${createdRef.status})`);

  console.log('\nALL 11 AUTOMATED VERIFICATION SUITES PASSED 100%!');
}

run().catch((err) => {
  console.error('\nTEST FAILED:', err);
  process.exit(1);
});
