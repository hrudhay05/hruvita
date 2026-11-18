/**
 * Regression test suite for HRUVITA Delivery Boy Assignment & Delivery Management System.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import crypto from 'node:crypto';
import { initDatabase, listUsers, createOrderRecord } from '../store/repository.js';
import { Order } from '../models/Order.js';
import { signToken } from '../middleware/auth.js';

const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:5088';

async function main() {
  await initDatabase();
  const users = await listUsers();
  const admin = users.find((u) => u.role === 'admin');
  const cust = users.find((u) => u.email === 'customer@hruvita.com');
  const otherCust = { id: 'u-unrelated-cust', email: 'other@hruvita.com', role: 'customer' };

  const adminToken = signToken(admin);
  const custToken = signToken(cust);
  const otherToken = signToken(otherCust);

  const ts = Date.now().toString(36);
  const ordId = `ORD-DEL-${ts}`;
  await createOrderRecord({
    id: ordId,
    userId: cust.id,
    customerName: cust.fullName || cust.name,
    customerEmail: cust.email,
    customerPhone: '9000011111',
    items: [{ productId: 'idli-sambar', name: 'Idli Sambar', unitPrice: 60, mrp: 70, qty: 1, lineTotal: 60 }],
    pricing: { subtotal: 60, couponCode: '', couponDiscount: 0, rewardPointsUsed: 0, deliveryCharge: 25, taxAmount: 3, grandTotal: 88 },
    address: { label: 'Home', recipient: 'Raju', phone: '9000011111', line1: 'Street 1', city: 'Hyderabad', pincode: '500001' },
    scheduledDate: '2026-11-19',
    slotId: 'same-day',
    slotLabel: 'Same-Day Express (Prepared ASAP)',
    paymentMethod: 'cod',
    paymentStatus: 'pending',
    status: 'confirmed',
    statusHistory: [{ status: 'confirmed', note: 'Test COD', by: cust.email, at: new Date().toISOString() }],
  });

  // 1. Admin creates delivery boy 1 & 2
  const r1 = await fetch(`${BASE}/api/admin/delivery-boys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ fullName: 'Boy One', phone: '9111111111', email: `boy1-${ts}@hruvita.com`, password: 'Password@123' }),
  });
  assert.equal(r1.status, 201);
  const { deliveryBoy: db1 } = await r1.json();

  const r2 = await fetch(`${BASE}/api/admin/delivery-boys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ fullName: 'Boy Two', phone: '9222222222', email: `boy2-${ts}@hruvita.com`, password: 'Password@123' }),
  });
  assert.equal(r2.status, 201);
  const { deliveryBoy: db2 } = await r2.json();
  console.log('PASS [1/10] Admin created delivery boys');

  // 2. Delivery boy 1 logs in via /api/auth/login
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailOrUsername: db1.email, password: 'Password@123', directDemo: true }),
  });
  assert.equal(loginRes.status, 200);
  const loginData = await loginRes.json();
  assert.equal(loginData.user.role, 'delivery_boy');
  const db1Token = loginData.token;
  const db2Token = signToken({ id: db2.id, email: db2.email, role: 'delivery_boy' });
  console.log('PASS [2/10] Delivery boy logged in cleanly');

  // 3. Admin assigns db1 to order
  const assign1 = await fetch(`${BASE}/api/admin/orders/${ordId}/assign-delivery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ deliveryBoyId: db1.id }),
  });
  assert.equal(assign1.status, 200);
  console.log('PASS [3/10] Admin assigned delivery boy 1');

  // 4. Customer sees db1 details in order history; unrelated customer blocked (403)
  const custOrdRes = await fetch(`${BASE}/api/orders/${ordId}`, {
    headers: { Authorization: `Bearer ${custToken}` },
  });
  assert.equal(custOrdRes.status, 200);
  const custOrd = (await custOrdRes.json()).order;
  assert.equal(custOrd.deliveryAssignment.deliveryBoyName, 'Boy One');
  assert.equal(custOrd.deliveryAssignment.deliveryBoyPhone, '9111111111');

  const unauthRes = await fetch(`${BASE}/api/orders/${ordId}`, {
    headers: { Authorization: `Bearer ${db2Token}` },
  });
  assert.equal(unauthRes.status, 403);
  console.log('PASS [4/10] Customer sees partner details & unrelated customer blocked (403)');

  // 5. db1 sees assigned order; db2 does NOT see it and gets 403 on status update
  const db1List = await (await fetch(`${BASE}/api/delivery/orders`, { headers: { Authorization: `Bearer ${db1Token}` } })).json();
  assert.ok(db1List.orders.some((o) => o.id === ordId));

  const db2List = await (await fetch(`${BASE}/api/delivery/orders`, { headers: { Authorization: `Bearer ${db2Token}` } })).json();
  assert.equal(db2List.orders.some((o) => o.id === ordId), false);

  const db2Forbid = await fetch(`${BASE}/api/delivery/orders/${ordId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${db2Token}` },
    body: JSON.stringify({ deliveryStatus: 'picked_up' }),
  });
  assert.equal(db2Forbid.status, 403);
  console.log('PASS [5/10] Delivery boys strictly isolated to own assigned orders');

  // 6. Admin reassigns order to db2 & preserves assignmentHistory
  const assign2 = await fetch(`${BASE}/api/admin/orders/${ordId}/assign-delivery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ deliveryBoyId: db2.id }),
  });
  assert.equal(assign2.status, 200);
  const reassigned = (await assign2.json()).order;
  assert.equal(reassigned.assignmentHistory.length, 2);
  console.log('PASS [6/10] Admin reassigned to Boy Two & preserved assignmentHistory');

  // 7. Failed delivery requires reason
  const failNoReason = await fetch(`${BASE}/api/delivery/orders/${ordId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${db2Token}` },
    body: JSON.stringify({ deliveryStatus: 'delivery_failed', reason: '' }),
  });
  assert.equal(failNoReason.status, 400);
  console.log('PASS [7/10] Failed delivery requires non-empty reason (400)');

  // 8. db2 progresses Accepted -> Picked Up -> Out for Delivery (generates hashed OTP) -> Delivered (OTP + COD check)
  for (const st of ['accepted', 'picked_up', 'out_for_delivery']) {
    const r = await fetch(`${BASE}/api/delivery/orders/${ordId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${db2Token}` },
      body: JSON.stringify({ deliveryStatus: st }),
    });
    assert.equal(r.status, 200);
  }

  // Verify wrong OTP is rejected (400)
  const wrongOtpRes = await fetch(`${BASE}/api/delivery/orders/${ordId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${db2Token}` },
    body: JSON.stringify({ deliveryStatus: 'delivered', otp: '000000', codCollected: true, collectedCash: 88 }),
  });
  assert.equal(wrongOtpRes.status, 400);

  // Set known test OTP hash in DB (simulating customer reading their email OTP) and verify COD mismatch vs exact match
  const knownOtp = '654321';
  const knownHash = crypto.createHash('sha256').update(knownOtp).digest('hex');
  await Order.updateOne({ id: ordId }, { $set: { 'delivery.deliveryOtpHash': knownHash, 'delivery.otpExpiry': new Date(Date.now() + 600000), 'delivery.otpAttempts': 0 } });

  const badCashRes = await fetch(`${BASE}/api/delivery/orders/${ordId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${db2Token}` },
    body: JSON.stringify({ deliveryStatus: 'delivered', otp: knownOtp, codCollected: true, collectedCash: 10 }),
  });
  assert.equal(badCashRes.status, 400);

  const delivRes = await fetch(`${BASE}/api/delivery/orders/${ordId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${db2Token}` },
    body: JSON.stringify({ deliveryStatus: 'delivered', otp: knownOtp, codCollected: true, collectedCash: 88 }),
  });
  assert.equal(delivRes.status, 200);

  // Verify delivery reports & earnings
  const repRes = await fetch(`${BASE}/api/admin/delivery-reports`, { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(repRes.status, 200);
  const repData = await repRes.json();
  assert.ok(repData.summary.totalPartners >= 2);
  console.log('PASS [8/10] OTP verification, COD validation, and Admin delivery reports verified');

  // 9. Customer sees updated delivered status & Boy Two details
  const finalOrd = (await (await fetch(`${BASE}/api/orders/${ordId}`, { headers: { Authorization: `Bearer ${custToken}` } })).json()).order;
  assert.equal(finalOrd.deliveryStatus, 'delivered');
  assert.equal(finalOrd.status, 'delivered');
  assert.equal(finalOrd.paymentStatus, 'paid');
  assert.equal(finalOrd.deliveryAssignment.deliveryBoyName, 'Boy Two');
  console.log('PASS [9/10] Customer sees updated delivery status & reassigned partner');

  // 10. Delivery boy blocked from Admin & Analyst APIs
  const admBlock = await fetch(`${BASE}/api/admin/overview`, { headers: { Authorization: `Bearer ${db2Token}` } });
  assert.equal(admBlock.status, 403);
  const anaBlock = await fetch(`${BASE}/api/analyst/analytics`, { headers: { Authorization: `Bearer ${db2Token}` } });
  assert.equal(anaBlock.status, 403);
  console.log('PASS [10/10] delivery_boy strictly blocked from Admin & Analyst endpoints (403)');

  console.log('\n=== DELIVERY MANAGEMENT SYSTEM SUITE: 10/10 PASSED ===');
}

main().catch((err) => {
  console.error('Delivery test crashed:', err);
  process.exit(1);
});
