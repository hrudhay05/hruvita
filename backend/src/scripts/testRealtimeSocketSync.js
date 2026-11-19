/**
 * End-to-End Real-Time Socket.IO Synchronization Test across all 4 roles:
 * customer, admin, admin_analyser, delivery_boy.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { io } from '../../../frontend/node_modules/socket.io-client/build/esm/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { initDatabase, listUsers, createOrderRecord } from '../store/repository.js';
import { Order } from '../models/Order.js';
import { signToken } from '../middleware/auth.js';

const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:5089';

function connectRole(token) {
  return new Promise((resolve, reject) => {
    const s = io(BASE, { auth: { token }, transports: ['websocket'] });
    const t = setTimeout(() => reject(new Error('Socket connect timeout')), 5000);
    s.on('connect', () => {
      clearTimeout(t);
      resolve(s);
    });
    s.on('connect_error', (err) => {
      clearTimeout(t);
      reject(err);
    });
  });
}

function waitForEvent(sock, eventName, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout waiting for ${eventName}`)), timeoutMs);
    sock.once(eventName, (payload) => {
      clearTimeout(t);
      resolve(payload);
    });
  });
}

async function main() {
  await initDatabase();
  const users = await listUsers();
  const admin = users.find((u) => u.role === 'admin');
  const analyst = users.find((u) => u.role === 'admin_analyser');
  const cust = users.find((u) => u.email === 'customer@hruvita.com');
  const delBoy = users.find((u) => u.role === 'delivery_boy');
  assert.ok(admin && analyst && cust && delBoy, 'All 4 role accounts must exist');

  const adminToken = signToken(admin);
  const analystToken = signToken(analyst);
  const custToken = signToken(cust);
  const delToken = signToken(delBoy);

  const [sAdmin, sAnalyst, sCust, sDel] = await Promise.all([
    connectRole(adminToken),
    connectRole(analystToken),
    connectRole(custToken),
    connectRole(delToken),
  ]);
  console.log('PASS [1/6] All 4 role Socket.IO sessions connected simultaneously');

  const ts = Date.now().toString(36);
  const ordId = `ORD-RT-${ts}`;
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
    statusHistory: [{ status: 'confirmed', note: 'RT test', by: cust.email, at: new Date().toISOString() }],
  });

  // 2. Admin changes order status -> Customer + Analyst receive events immediately
  const pCustStatus = waitForEvent(sCust, 'order:updated');
  const pAnaStatus = waitForEvent(sAnalyst, 'analytics:updated');
  const stRes = await fetch(`${BASE}/api/admin/orders/${ordId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ status: 'preparing' }),
  });
  assert.equal(stRes.status, 200);
  const evCust = await pCustStatus;
  assert.equal(evCust.orderId, ordId);
  assert.equal(evCust.status, 'preparing');
  await pAnaStatus;
  console.log('PASS [2/6] Admin status update synced in real time to Customer & Admin Analyser');

  // 3. Admin adjusts stock -> Public Catalog & Analyst receive real-time update
  const pCustInv = waitForEvent(sCust, 'inventory:updated');
  const pAnaInv = waitForEvent(sAnalyst, 'analytics:inventory-updated');
  const invRes = await fetch(`${BASE}/api/admin/inventory/products/p1/adjust`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ delta: 1, note: 'RT restock test' }),
  });
  assert.equal(invRes.status, 200);
  await Promise.all([pCustInv, pAnaInv]);
  console.log('PASS [3/6] Admin inventory adjustment synced in real time to Catalog & Analyst');

  // 4. Admin assigns delivery partner -> Delivery Partner + Customer + Analyst notified
  const pDelAssign = waitForEvent(sDel, 'delivery:assigned');
  const pCustAssign = waitForEvent(sCust, 'delivery:assigned');
  const assignRes = await fetch(`${BASE}/api/admin/orders/${ordId}/assign-delivery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ deliveryBoyId: delBoy.id }),
  });
  assert.equal(assignRes.status, 200);
  const evDel = await pDelAssign;
  assert.equal(evDel.orderId, ordId);
  await pCustAssign;
  console.log('PASS [4/6] Delivery assignment synced in real time to Delivery Partner & Customer');

  // 5. Delivery partner starts delivery -> OTP & completes delivery -> Customer & Admin receive real-time events
  await fetch(`${BASE}/api/delivery/orders/${ordId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${delToken}` },
    body: JSON.stringify({ deliveryStatus: 'out_for_delivery' }),
  });
  const testOtp = '123987';
  const testHash = crypto.createHash('sha256').update(testOtp).digest('hex');
  await Order.updateOne({ id: ordId }, { $set: { 'delivery.deliveryOtpHash': testHash, 'delivery.otpExpiry': new Date(Date.now() + 600000) } });

  const pCustDone = waitForEvent(sCust, 'order:delivered');
  const pAdminDone = waitForEvent(sAdmin, 'delivery:completed');
  const doneRes = await fetch(`${BASE}/api/delivery/orders/${ordId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${delToken}` },
    body: JSON.stringify({ deliveryStatus: 'delivered', otp: testOtp, codCollected: true, collectedCash: 88 }),
  });
  assert.equal(doneRes.status, 200);
  await Promise.all([pCustDone, pAdminDone]);
  console.log('PASS [5/6] OTP Delivery completion synced in real time to Customer & Admin');

  // 6. Clean disconnect & reconnect
  sCust.disconnect();
  sCust.connect();
  await waitForEvent(sCust, 'connect');
  console.log('PASS [6/6] Reconnection recovery verified');

  sAdmin.disconnect();
  sAnalyst.disconnect();
  sCust.disconnect();
  sDel.disconnect();
  console.log('\n=== REAL-TIME SOCKET.IO SYNC SUITE: 6/6 PASSED ===');
}

main().catch((err) => {
  console.error('Realtime Socket.IO test crashed:', err);
  process.exit(1);
});
