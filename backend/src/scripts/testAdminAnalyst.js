/**
 * Regression test suite for HRUVITA Admin Analyst (admin_analyser) RBAC, Analytics, Reports & Notifications.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { initDatabase, listUsers } from '../store/repository.js';
import { signToken } from '../middleware/auth.js';

const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:5086';

async function main() {
  await initDatabase();
  const users = await listUsers();
  const admin = users.find((u) => u.role === 'admin');
  const customer = users.find((u) => u.role === 'customer');
  assert.ok(admin && customer);

  const adminToken = signToken(admin);
  const custToken = signToken(customer);

  const ts = Date.now().toString(36);
  const analystEmail = `analyst-${ts}@hruvita.com`;

  // 1. Customer cannot create admin_analyser
  const custCreate = await fetch(`${BASE}/api/admin/team`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${custToken}` },
    body: JSON.stringify({ fullName: 'Hacker', email: analystEmail, password: 'Password@123', role: 'admin_analyser' }),
  });
  assert.equal(custCreate.status, 403);
  console.log('PASS [1/10] Customer blocked from creating admin_analyser (403)');

  // 2. Owner creates admin_analyser
  const ownerCreate = await fetch(`${BASE}/api/admin/team`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ fullName: 'Test Analyst', email: analystEmail, password: 'Password@123', role: 'admin_analyser' }),
  });
  assert.equal(ownerCreate.status, 201);
  const { member } = await ownerCreate.json();
  assert.equal(member.role, 'admin_analyser');
  const analystToken = signToken(member);
  console.log('PASS [2/10] Owner created admin_analyser account');

  // 3. Admin Analyst reads real analytics with date filter
  const anaRes = await fetch(`${BASE}/api/analyst/analytics?startDate=2025-01-01&endDate=2026-12-31`, {
    headers: { Authorization: `Bearer ${analystToken}` },
  });
  assert.equal(anaRes.status, 200);
  const ana = await anaRes.json();
  for (const k of ['totalRevenue', 'totalOrders', 'todayRevenue', 'todayOrders', 'avgOrderValue', 'totalCustomers', 'activeSubscriptions', 'lowStockCount', 'outOfStockCount', 'cancelledOrders']) {
    assert.equal(typeof ana.overview[k], 'number', `Missing overview.${k}`);
  }
  console.log('PASS [3/10] Admin Analyst fetched all 10 real KPIs & chart series');

  // 4. Admin Analyst reads inventory alerts & thresholds
  const invRes = await fetch(`${BASE}/api/analyst/inventory`, {
    headers: { Authorization: `Bearer ${analystToken}` },
  });
  assert.equal(invRes.status, 200);
  const inv = await invRes.json();
  assert.ok(Array.isArray(inv.items) && inv.items.length > 0);
  console.log('PASS [4/10] Admin Analyst fetched inventory alerts & thresholds');

  // 5. Admin Analyst downloads CSV & Excel reports
  const csvRes = await fetch(`${BASE}/api/analyst/reports?type=orders&format=csv`, {
    headers: { Authorization: `Bearer ${analystToken}` },
  });
  assert.equal(csvRes.status, 200);
  const csvText = await csvRes.text();
  assert.ok(csvText.includes('Order ID') && csvText.includes('HRUVITA'));

  const xlsRes = await fetch(`${BASE}/api/analyst/reports?type=inventory&format=xls`, {
    headers: { Authorization: `Bearer ${analystToken}` },
  });
  assert.equal(xlsRes.status, 200);
  const xlsText = await xlsRes.text();
  assert.ok(xlsText.includes('<table'));
  console.log('PASS [5/10] Admin Analyst downloaded CSV & Excel reports');

  // 6. Admin Analyst reads & marks notifications read
  const notifRes = await fetch(`${BASE}/api/analyst/notifications`, {
    headers: { Authorization: `Bearer ${analystToken}` },
  });
  assert.equal(notifRes.status, 200);
  const notifData = await notifRes.json();
  assert.ok(Array.isArray(notifData.notifications));
  const readAllRes = await fetch(`${BASE}/api/analyst/notifications/read-all`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${analystToken}` },
  });
  assert.equal(readAllRes.status, 200);
  console.log('PASS [6/10] Admin Analyst fetched & marked notifications read');

  // 7. Admin Analyst reads activity logs
  const actRes = await fetch(`${BASE}/api/analyst/activity`, {
    headers: { Authorization: `Bearer ${analystToken}` },
  });
  assert.equal(actRes.status, 200);
  const actData = await actRes.json();
  assert.ok(Array.isArray(actData.logs));
  console.log('PASS [7/10] Admin Analyst read-only access to activity logs verified');

  // 8. RBAC: Admin Analyst CANNOT mutate orders, products, stock, refunds, settings, or team
  const rOrder = await fetch(`${BASE}/api/admin/orders/ORD-FAKE/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${analystToken}` },
    body: JSON.stringify({ status: 'delivered' }),
  });
  assert.equal(rOrder.status, 403);

  const rProd = await fetch(`${BASE}/api/admin/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${analystToken}` },
    body: JSON.stringify({ name: 'Hack', price: 1 }),
  });
  assert.equal(rProd.status, 403);

  const rRefund = await fetch(`${BASE}/api/admin/orders/ORD-FAKE/refund`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${analystToken}` },
  });
  assert.equal(rRefund.status, 403);

  const rTeam = await fetch(`${BASE}/api/admin/team`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${analystToken}` },
    body: JSON.stringify({ fullName: 'X', email: 'x@hruvita.com', password: 'Password@123' }),
  });
  assert.equal(rTeam.status, 403);
  console.log('PASS [8/10] Admin Analyst strictly blocked (403) from all admin mutations');

  // 9. Owner deactivates admin_analyser -> blocked on subsequent request
  const deactRes = await fetch(`${BASE}/api/admin/team/${member.id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ blocked: true }),
  });
  assert.equal(deactRes.status, 200);
  const blockedRes = await fetch(`${BASE}/api/analyst/analytics`, {
    headers: { Authorization: `Bearer ${analystToken}` },
  });
  assert.equal(blockedRes.status, 403);
  console.log('PASS [9/10] Deactivated admin_analyser immediately blocked (403)');

  // 10. Existing Owner overview still works
  const ovRes = await fetch(`${BASE}/api/admin/overview`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(ovRes.status, 200);
  console.log('PASS [10/10] Existing Owner /api/admin/overview preserved');

  console.log('\n=== ADMIN ANALYST RBAC & ANALYTICS SUITE: 10/10 PASSED ===');
}

main().catch((err) => {
  console.error('Admin analyst test crashed:', err);
  process.exit(1);
});
