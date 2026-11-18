/**
 * Regression test suite for HRUVITA Premium Order History & Complete Order Details APIs.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { initDatabase, listUsers, createOrderRecord, createPaymentRecord } from '../store/repository.js';
import { signToken } from '../middleware/auth.js';

const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:5086';

async function main() {
  await initDatabase();
  const users = await listUsers();
  const cust = users.find((u) => u.email === 'customer@hruvita.com');
  const otherUser = users.find((u) => u.role === 'customer' && u.id !== cust.id) || {
    id: 'u-other-test',
    email: 'other@hruvita.com',
    role: 'customer',
  };
  assert.ok(cust, 'Seeded customer must exist');

  const custToken = signToken(cust);
  const otherToken = signToken(otherUser);

  // Create a legacy-like order missing optional image + payment refs, and a paid Razorpay order
  const ts = Date.now().toString(36).toUpperCase();
  const codId = `ORD-TEST-COD-${ts}`;
  const rzpId = `ORD-TEST-RZP-${ts}`;

  await createOrderRecord({
    id: codId,
    userId: cust.id,
    customerName: cust.fullName || cust.name,
    customerEmail: cust.email,
    customerPhone: '9876543210',
    items: [
      { productId: 'idli-sambar', name: 'Idli Sambar', unitPrice: 60, mrp: 70, qty: 2, lineTotal: 120 },
      { productId: 'missing-legacy-item', name: 'Legacy Special', unitPrice: 50, mrp: 50, qty: 1, lineTotal: 50 },
    ],
    pricing: { subtotal: 170, couponCode: '', couponDiscount: 0, rewardPointsUsed: 0, deliveryCharge: 25, taxAmount: 9, grandTotal: 204 },
    address: { label: 'Home', recipient: 'Customer', phone: '9876543210', line1: 'Road 1', city: 'Hyderabad', pincode: '500001' },
    scheduledDate: '2026-11-18',
    slotId: 'same-day',
    slotLabel: 'Same-Day Express (Prepared ASAP)',
    paymentMethod: 'cod',
    paymentStatus: 'pending',
    status: 'confirmed',
    statusHistory: [{ status: 'confirmed', note: 'Same-day COD order', by: cust.email, at: new Date().toISOString() }],
  });

  await createOrderRecord({
    id: rzpId,
    userId: cust.id,
    customerName: cust.fullName || cust.name,
    customerEmail: cust.email,
    customerPhone: '9876543210',
    items: [
      { productId: 'masala-dosa', name: 'Masala Dosa', unitPrice: 80, mrp: 90, qty: 1, lineTotal: 80 },
    ],
    pricing: { subtotal: 80, couponCode: '', couponDiscount: 0, rewardPointsUsed: 0, deliveryCharge: 25, taxAmount: 4, grandTotal: 109 },
    address: { label: 'Home', recipient: 'Customer', phone: '9876543210', line1: 'Road 1', city: 'Hyderabad', pincode: '500001' },
    scheduledDate: '2026-11-20',
    slotId: 'morning',
    slotLabel: 'Morning Slot (6:30 AM – 9:00 AM)',
    paymentMethod: 'razorpay',
    paymentStatus: 'paid',
    razorpayOrderId: `order_test_${ts}`,
    razorpayPaymentId: `pay_test_${ts}`,
    status: 'delivered',
    statusHistory: [
      { status: 'confirmed', note: 'Paid', by: 'system', at: new Date().toISOString() },
      { status: 'delivered', note: 'Delivered', by: 'admin', at: new Date().toISOString() },
    ],
  });
  await createPaymentRecord({
    id: `PAY-TEST-${ts}`,
    orderId: rzpId,
    userId: cust.id,
    method: 'razorpay',
    amount: 109,
    currency: 'INR',
    status: 'captured',
    razorpayOrderId: `order_test_${ts}`,
    razorpayPaymentId: `pay_test_${ts}`,
  });

  // 1. GET /api/orders/my returns enriched catalog images & paymentSummary
  const myRes = await fetch(`${BASE}/api/orders/my`, {
    headers: { Authorization: `Bearer ${custToken}` },
  });
  assert.equal(myRes.status, 200);
  const myData = await myRes.json();
  const codOrd = myData.orders.find((o) => o.id === codId);
  const rzpOrd = myData.orders.find((o) => o.id === rzpId);
  assert.ok(codOrd, 'COD order present in /orders/my');
  assert.ok(rzpOrd, 'Razorpay order present in /orders/my');
  assert.equal(codOrd.items[1].image, '', 'Missing product image gracefully empty string');
  assert.equal(rzpOrd.paymentSummary.razorpayPaymentId, `pay_test_${ts}`);
  console.log('PASS [1/4] GET /api/orders/my returns enriched items + verified paymentSummary');

  // 2. GET /api/orders/:id returns full order details for owner
  const detRes = await fetch(`${BASE}/api/orders/${rzpId}`, {
    headers: { Authorization: `Bearer ${custToken}` },
  });
  assert.equal(detRes.status, 200);
  const detData = await detRes.json();
  assert.equal(detData.order.id, rzpId);
  assert.equal(detData.order.pricing.grandTotal, 109);
  console.log('PASS [2/4] GET /api/orders/:id returns full verified order & pricing');

  // 3. Unauthorized customer cannot view another customer's order details
  const unauthRes = await fetch(`${BASE}/api/orders/${rzpId}`, {
    headers: { Authorization: `Bearer ${otherToken}` },
  });
  assert.equal(unauthRes.status, 403);
  console.log('PASS [3/4] GET /api/orders/:id blocks cross-customer access with 403');

  // 4. Unauthenticated access rejected with 401
  const guestRes = await fetch(`${BASE}/api/orders/${rzpId}`);
  assert.equal(guestRes.status, 401);
  console.log('PASS [4/4] GET /api/orders/:id blocks unauthenticated access with 401');

  console.log('\n=== ORDER HISTORY UI API SUITE: 4/4 PASSED ===');
}

main().catch((err) => {
  console.error('Order history test crashed:', err);
  process.exit(1);
});
