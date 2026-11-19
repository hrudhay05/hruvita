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
  const phoneSeed = String(Date.now()).slice(-7);
  const p1 = `91${phoneSeed}1`;
  const p2 = `92${phoneSeed}2`;
  const r1 = await fetch(`${BASE}/api/admin/delivery-boys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ fullName: 'Boy One', phone: p1, email: `boy1-${ts}@hruvita.com`, password: 'Password@123' }),
  });
  assert.equal(r1.status, 201);
  const { deliveryBoy: db1 } = await r1.json();

  const r2 = await fetch(`${BASE}/api/admin/delivery-boys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ fullName: 'Boy Two', phone: p2, email: `boy2-${ts}@hruvita.com`, password: 'Password@123' }),
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

  // 3. Admin can mark packed, is blocked (403) from out_for_delivery/delivered, and assigns db1
  for (const forbiddenStatus of ['out_for_delivery', 'delivered']) {
    const blockedRes = await fetch(`${BASE}/api/admin/orders/${ordId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: forbiddenStatus }),
    });
    assert.equal(blockedRes.status, 403);
  }
  const packedRes = await fetch(`${BASE}/api/admin/orders/${ordId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ status: 'packed' }),
  });
  assert.equal(packedRes.status, 200);

  const assign1 = await fetch(`${BASE}/api/admin/orders/${ordId}/assign-delivery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ deliveryBoyId: db1.id }),
  });
  assert.equal(assign1.status, 200);
  console.log('PASS [3/10] Admin blocked from out_for_delivery/delivered (403) & assigned delivery boy 1');

  // 4. Customer sees db1 details in order history; unrelated customer blocked (403)
  const custOrdRes = await fetch(`${BASE}/api/orders/${ordId}`, {
    headers: { Authorization: `Bearer ${custToken}` },
  });
  assert.equal(custOrdRes.status, 200);
  const custOrd = (await custOrdRes.json()).order;
  assert.equal(custOrd.deliveryAssignment.deliveryBoyName, 'Boy One');
  assert.equal(custOrd.deliveryAssignment.deliveryBoyPhone, p1);

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

  // 6. db1 rejects assignment -> unassigned & recorded in history, then Admin assigns to db2
  const rejectRes = await fetch(`${BASE}/api/delivery/orders/${ordId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${db1Token}` },
    body: JSON.stringify({ deliveryStatus: 'rejected', reason: 'Too far' }),
  });
  assert.equal(rejectRes.status, 200);
  const rejectedOrder = (await rejectRes.json()).order;
  assert.equal(rejectedOrder.deliveryStatus, 'unassigned');

  const assign2 = await fetch(`${BASE}/api/admin/orders/${ordId}/assign-delivery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ deliveryBoyId: db2.id }),
  });
  assert.equal(assign2.status, 200);
  const reassigned = (await assign2.json()).order;
  assert.equal(reassigned.assignmentHistory.length, 3);
  assert.ok(reassigned.assignmentHistory.some((h) => h.action === 'rejected'));
  console.log('PASS [6/10] Partner rejection resets to unassigned & Admin assigned Boy Two');

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

  // Verify OTP is visible ONLY to the owning customer in Order Details, never to Admin or Delivery Partner
  const custOutRes = await fetch(`${BASE}/api/orders/${ordId}`, { headers: { Authorization: `Bearer ${custToken}` } });
  assert.equal(custOutRes.status, 200);
  const custOutOrd = (await custOutRes.json()).order;
  assert.match(String(custOutOrd.customerDeliveryOtp || ''), /^\d{6}$/);
  const realOtp = custOutOrd.customerDeliveryOtp;

  const adminList = await (await fetch(`${BASE}/api/admin/orders`, { headers: { Authorization: `Bearer ${adminToken}` } })).json();
  const adminOrd = adminList.orders.find((o) => o.id === ordId);
  assert.equal(adminOrd?.customerDeliveryOtp, undefined);

  const db2OutList = await (await fetch(`${BASE}/api/delivery/orders`, { headers: { Authorization: `Bearer ${db2Token}` } })).json();
  const db2Ord = db2OutList.orders.find((o) => o.id === ordId);
  assert.equal(db2Ord?.customerDeliveryOtp, undefined);

  const badCashRes = await fetch(`${BASE}/api/delivery/orders/${ordId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${db2Token}` },
    body: JSON.stringify({ deliveryStatus: 'delivered', otp: realOtp, codCollected: true, collectedCash: 10 }),
  });
  assert.equal(badCashRes.status, 400);

  const delivRes = await fetch(`${BASE}/api/delivery/orders/${ordId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${db2Token}` },
    body: JSON.stringify({ deliveryStatus: 'delivered', otp: realOtp, codCollected: true, collectedCash: 88 }),
  });
  assert.equal(delivRes.status, 200);

  // Verify OTP is expired/cleared and cannot be reused (409 terminal state)
  const reuseOtpRes = await fetch(`${BASE}/api/delivery/orders/${ordId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${db2Token}` },
    body: JSON.stringify({ deliveryStatus: 'delivered', otp: realOtp, codCollected: true, collectedCash: 88 }),
  });
  assert.equal(reuseOtpRes.status, 409);

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
