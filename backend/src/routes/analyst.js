import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  listProducts,
  listCategories,
  listUsers,
  listAllOrders,
  listAllPayments,
  listAllSubscriptions,
  listInventoryLogs,
  listAuditLogs,
  recordAudit,
  getSettings,
  getBusinessDateParts,
} from '../store/repository.js';
import {
  notifyAdmins,
  listAdminNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
  clearAdminNotifications,
} from '../utils/adminNotifier.js';

const router = Router();

// Strictly allow only Owner/Admin and Admin Analyst (read-only)
router.use(requireAuth, requireRole('admin', 'admin_analyser'));

const EXCLUDED_REV_STATUSES = new Set(['cancelled', 'refund_initiated', 'refunded', 'payment_pending']);

function inDateRange(isoOrDate, startDate, endDate) {
  if (!startDate && !endDate) return true;
  const day = String(isoOrDate || '').slice(0, 10);
  if (!day) return false;
  if (startDate && day < startDate) return false;
  if (endDate && day > endDate) return false;
  return true;
}

function getPreviousPeriod(startDate, endDate) {
  if (!startDate || !endDate) return { prevStart: '', prevEnd: '' };
  const s = new Date(`${startDate}T00:00:00Z`).getTime();
  const e = new Date(`${endDate}T00:00:00Z`).getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return { prevStart: '', prevEnd: '' };
  const span = e - s + 86400000;
  return {
    prevStart: new Date(s - span).toISOString().slice(0, 10),
    prevEnd: new Date(s - 86400000).toISOString().slice(0, 10),
  };
}

function pctChange(curr, prev) {
  if (!prev || prev <= 0) return null; // Never return misleading percentages when baseline is 0
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

function csvCell(v) {
  const s = String(v ?? '');
  return `"${s.replace(/"/g, '""')}"`;
}

function buildCsv({ businessName, reportType, dateRange, headers, rows }) {
  const meta = [
    `Business,${csvCell(businessName)}`,
    `Report,${csvCell(reportType)}`,
    `Date Range,${csvCell(dateRange)}`,
    `Generated At,${csvCell(new Date().toISOString())}`,
    '',
  ];
  const headerLine = headers.map(csvCell).join(',');
  const bodyLines = rows.map((r) => headers.map((h) => csvCell(r[h])).join(','));
  return [...meta, headerLine, ...bodyLines].join('\r\n');
}

function buildExcelHtml({ businessName, reportType, dateRange, headers, rows }) {
  const esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  const ths = headers.map((h) => `<th style="background:#1b4d38;color:#fff;padding:6px;">${esc(h)}</th>`).join('');
  const trs = rows
    .map((r) => `<tr>${headers.map((h) => `<td style="padding:5px;border:1px solid #ddd;">${esc(r[h])}</td>`).join('')}</tr>`)
    .join('');
  return `<html><head><meta charset="utf-8"/></head><body>
    <h2>${esc(businessName)} - ${esc(reportType)}</h2>
    <p>Date Range: ${esc(dateRange)} | Generated: ${esc(new Date().toISOString())}</p>
    <table border="1" cellspacing="0"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>
  </body></html>`;
}

async function syncOperationalNotifications({ products, subscriptions, orders, todayStr }) {
  for (const p of products) {
    const threshold = Number(p.lowStockThreshold ?? 5);
    if (p.stock <= 0) {
      await notifyAdmins({
        dedupKey: `oos-${p.id}-${todayStr}`,
        category: 'inventory',
        title: `Out of Stock: ${p.name}`,
        description: `${p.name} has 0 units remaining.`,
        entityType: 'product',
        entityId: p.id,
      });
    } else if (p.stock <= threshold) {
      await notifyAdmins({
        dedupKey: `low-${p.id}-${todayStr}`,
        category: 'inventory',
        title: `Low Stock Alert: ${p.name}`,
        description: `${p.name} has ${p.stock} left (threshold: ${threshold}).`,
        entityType: 'product',
        entityId: p.id,
      });
    }
  }

  for (const sub of subscriptions) {
    if (sub.status === 'active' && sub.endDate) {
      const daysLeft = Math.ceil((new Date(`${sub.endDate}T00:00:00Z`).getTime() - Date.now()) / 86400000);
      if (daysLeft >= 0 && daysLeft <= 3) {
        await notifyAdmins({
          dedupKey: `sub-exp-${sub.id}-${sub.endDate}`,
          category: 'subscription',
          title: `Subscription Expiring Soon: ${sub.id}`,
          description: `${sub.planName || 'Subscription'} ends on ${sub.endDate}.`,
          entityType: 'subscription',
          entityId: sub.id,
        });
      }
    }
  }

  const todayCancels = orders.filter(
    (o) => ['cancelled', 'refunded'].includes(o.status) && String(o.updatedAt || o.createdAt || '').slice(0, 10) === todayStr
  ).length;
  if (todayCancels >= 3) {
    await notifyAdmins({
      dedupKey: `cancel-spike-${todayStr}`,
      category: 'cancellation',
      title: 'Unusual Cancellation Activity',
      description: `${todayCancels} orders cancelled/refunded today (${todayStr}).`,
      entityType: 'order',
      entityId: '',
    });
  }
}

router.get('/analytics', async (req, res) => {
  try {
    const { startDate = '', endDate = '', category = '' } = req.query || {};
    const { todayStr } = getBusinessDateParts();
    const [products, categories, users, orders, subscriptions, inventoryLogs] = await Promise.all([
      listProducts(),
      listCategories(),
      listUsers(),
      listAllOrders(),
      listAllSubscriptions(),
      listInventoryLogs(200),
    ]);

    const prodMap = new Map(products.map((p) => [p.id, p]));
    const rangeOrders = orders.filter((o) => inDateRange(o.createdAt || o.scheduledDate, startDate, endDate));
    const { prevStart, prevEnd } = getPreviousPeriod(startDate, endDate);
    const prevOrders = prevStart
      ? orders.filter((o) => inDateRange(o.createdAt || o.scheduledDate, prevStart, prevEnd))
      : [];

    const filterOrderItemsByCat = (ord) => {
      if (!category) return ord.items || [];
      return (ord.items || []).filter((it) => {
        const prod = prodMap.get(String(it.productId || '').replace(/^combo:/, ''));
        return prod?.category === category;
      });
    };

    const validOrders = rangeOrders.filter((o) => !EXCLUDED_REV_STATUSES.has(o.status));
    const prevValidOrders = prevOrders.filter((o) => !EXCLUDED_REV_STATUSES.has(o.status));

    const totalRevenue = validOrders.reduce((s, o) => {
      if (!category) return s + Number(o.pricing?.grandTotal || 0);
      return s + filterOrderItemsByCat(o).reduce((isum, it) => isum + Number(it.lineTotal || 0), 0);
    }, 0);
    const prevRevenue = prevValidOrders.reduce((s, o) => s + Number(o.pricing?.grandTotal || 0), 0);

    const todayOrdersList = orders.filter(
      (o) => String(o.createdAt || '').slice(0, 10) === todayStr || o.scheduledDate === todayStr
    );
    const todayRevenue = todayOrdersList
      .filter((o) => !EXCLUDED_REV_STATUSES.has(o.status))
      .reduce((s, o) => s + Number(o.pricing?.grandTotal || 0), 0);

    const customers = users.filter((u) => u.role === 'customer');
    const activeSubs = subscriptions.filter((s) => s.status === 'active');
    const lowStockProducts = products.filter((p) => p.stock > 0 && p.stock <= Number(p.lowStockThreshold ?? 5));
    const outOfStockProducts = products.filter((p) => p.stock <= 0);
    const cancelledOrdersCount = rangeOrders.filter((o) => ['cancelled', 'refunded'].includes(o.status)).length;
    const avgOrderValue = validOrders.length > 0 ? Math.round(totalRevenue / validOrders.length) : 0;

    // Revenue & Order series
    const dailyMap = new Map();
    const weekdayMap = new Map([['Sun', 0], ['Mon', 0], ['Tue', 0], ['Wed', 0], ['Thu', 0], ['Fri', 0], ['Sat', 0]]);
    const statusMap = new Map();
    const catRevMap = new Map();
    const payRevMap = new Map();
    const payCountMap = new Map();
    let sameDayCount = 0;
    let advanceCount = 0;
    const prodStatsMap = new Map();
    const bowlComboMap = new Map();

    for (const o of rangeOrders) {
      const day = String(o.createdAt || o.scheduledDate || todayStr).slice(0, 10);
      const isRev = !EXCLUDED_REV_STATUSES.has(o.status);
      const amt = Number(o.pricing?.grandTotal || 0);

      if (!dailyMap.has(day)) dailyMap.set(day, { date: day, revenue: 0, orders: 0 });
      const dEntry = dailyMap.get(day);
      dEntry.orders += 1;
      if (isRev) dEntry.revenue += amt;

      const wd = new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
      weekdayMap.set(wd, (weekdayMap.get(wd) || 0) + 1);

      statusMap.set(o.status, (statusMap.get(o.status) || 0) + 1);
      if (o.slotId === 'same-day') sameDayCount += 1;
      else advanceCount += 1;

      const pm = (o.paymentMethod || 'cod').toUpperCase();
      payCountMap.set(pm, (payCountMap.get(pm) || 0) + 1);
      if (isRev) payRevMap.set(pm, (payRevMap.get(pm) || 0) + amt);

      for (const it of o.items || []) {
        const baseId = String(it.productId || '').replace(/^combo:/, '');
        const prod = prodMap.get(baseId);
        const cat = prod?.category || (it.isCustomBowl ? 'custom-bowls' : 'other');
        if (isRev) {
          catRevMap.set(cat, (catRevMap.get(cat) || 0) + Number(it.lineTotal || 0));
        }
        const ps = prodStatsMap.get(it.name) || { name: it.name, qty: 0, revenue: 0, stock: prod?.stock ?? null };
        ps.qty += Number(it.qty || 1);
        if (isRev) ps.revenue += Number(it.lineTotal || 0);
        prodStatsMap.set(it.name, ps);

        if (it.isCustomBowl && Array.isArray(it.bowlIngredientIds) && it.bowlIngredientIds.length) {
          const comboKey = it.bowlIngredientIds.slice().sort().join(' + ');
          bowlComboMap.set(comboKey, (bowlComboMap.get(comboKey) || 0) + Number(it.qty || 1));
        }
      }
    }

    const dailySeries = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));
    const monthlyMap = new Map();
    const yearlyMap = new Map();
    for (const d of dailySeries) {
      const m = d.date.slice(0, 7);
      const y = d.date.slice(0, 4);
      monthlyMap.set(m, (monthlyMap.get(m) || 0) + d.revenue);
      yearlyMap.set(y, (yearlyMap.get(y) || 0) + d.revenue);
    }

    // Customer analytics
    const ordersByCustomer = new Map();
    for (const o of orders) {
      ordersByCustomer.set(o.userId, (ordersByCustomer.get(o.userId) || 0) + 1);
    }
    let newCust = 0;
    let returningCust = 0;
    for (const u of customers) {
      const cnt = ordersByCustomer.get(u.id) || 0;
      if (cnt > 1) returningCust += 1;
      else if (cnt === 1) newCust += 1;
    }
    const custWithOrders = newCust + returningCust;
    const repeatOrderRate = custWithOrders > 0 ? Math.round((returningCust / custWithOrders) * 1000) / 10 : 0;
    const mostActiveCustomers = customers
      .map((u) => ({
        id: u.id,
        name: u.fullName || u.name || 'Customer',
        ordersCount: ordersByCustomer.get(u.id) || 0,
      }))
      .filter((c) => c.ordersCount > 0)
      .sort((a, b) => b.ordersCount - a.ordersCount)
      .slice(0, 8);

    // Subscriptions analytics
    const subPlanMap = new Map();
    let expiringSubs = 0;
    let cancelledSubs = 0;
    for (const s of subscriptions) {
      const label = `${s.durationDays || 7}-day`;
      subPlanMap.set(label, (subPlanMap.get(label) || 0) + 1);
      if (s.status === 'cancelled') cancelledSubs += 1;
      if (s.status === 'active' && s.endDate) {
        const dLeft = Math.ceil((new Date(`${s.endDate}T00:00:00Z`).getTime() - Date.now()) / 86400000);
        if (dLeft >= 0 && dLeft <= 3) expiringSubs += 1;
      }
    }

    const sortedProds = [...prodStatsMap.values()].sort((a, b) => b.qty - a.qty);
    const hasCostData = products.some((p) => typeof p.costPrice === 'number' && p.costPrice > 0);
    const inventoryValuation = hasCostData
      ? products.reduce((sum, p) => sum + (Number(p.costPrice) || 0) * Math.max(0, Number(p.stock) || 0), 0)
      : null;

    res.json({
      overview: {
        totalRevenue,
        totalOrders: rangeOrders.length,
        todayRevenue,
        todayOrders: todayOrdersList.length,
        avgOrderValue,
        totalCustomers: customers.length,
        activeSubscriptions: activeSubs.length,
        lowStockCount: lowStockProducts.length,
        outOfStockCount: outOfStockProducts.length,
        cancelledOrders: cancelledOrdersCount,
        comparisons: {
          revenueChangePct: pctChange(totalRevenue, prevRevenue),
          ordersChangePct: pctChange(rangeOrders.length, prevOrders.length),
        },
      },
      revenueAnalytics: {
        daily: dailySeries,
        monthly: [...monthlyMap.entries()].map(([label, value]) => ({ label, value })),
        yearly: [...yearlyMap.entries()].map(([label, value]) => ({ label, value })),
        byCategory: [...catRevMap.entries()].map(([label, value]) => ({ label, value })),
        byPaymentMethod: [...payRevMap.entries()].map(([label, value]) => ({ label, value })),
      },
      orderAnalytics: {
        daily: dailySeries,
        statusDistribution: [...statusMap.entries()].map(([label, value]) => ({ label, value })),
        codVsOnline: [...payCountMap.entries()].map(([label, value]) => ({ label, value })),
        sameDayVsAdvance: [
          { label: 'Same-Day Express', value: sameDayCount },
          { label: 'Advance Booking', value: advanceCount },
        ],
        deliveredVsCancelled: [
          { label: 'Delivered', value: statusMap.get('delivered') || 0 },
          { label: 'Cancelled / Refunded', value: cancelledOrdersCount },
        ],
        byWeekday: [...weekdayMap.entries()].map(([label, value]) => ({ label, value })),
      },
      inventoryAnalytics: {
        stockLevels: products.slice(0, 15).map((p) => ({ label: p.name, value: p.stock })),
        lowStockProducts: lowStockProducts.map((p) => ({
          id: p.id,
          name: p.name,
          stock: p.stock,
          threshold: Number(p.lowStockThreshold ?? 5),
        })),
        outOfStockCount: outOfStockProducts.length,
        fastMoving: sortedProds.slice(0, 6),
        slowMoving: [...sortedProds].reverse().slice(0, 6),
        stockMovement: inventoryLogs.slice(0, 20),
        valuationAvailable: hasCostData,
        inventoryValuation,
      },
      customerAnalytics: {
        newVsReturning: [
          { label: 'New Customers', value: newCust },
          { label: 'Returning Customers', value: returningCust },
        ],
        repeatOrderRate,
        mostActiveCustomers,
      },
      subscriptionAnalytics: {
        planBreakdown: [...subPlanMap.entries()].map(([label, value]) => ({ label, value })),
        activeCount: activeSubs.length,
        expiringCount: expiringSubs,
        cancelledCount: cancelledSubs,
      },
      productPerformance: {
        topProducts: sortedProds.slice(0, 10),
        leastSelling: [...sortedProds].reverse().slice(0, 5),
        popularBowls: [...bowlComboMap.entries()].map(([combo, qty]) => ({ combo, qty })).slice(0, 5),
      },
      categories: categories.map((c) => c.slug),
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to compute analytics.' });
  }
});

router.get('/inventory', async (req, res) => {
  const { category = '', status = '', startDate = '', endDate = '' } = req.query || {};
  const [products, logs] = await Promise.all([listProducts(), listInventoryLogs(200)]);

  const items = products
    .map((p) => {
      const threshold = Number(p.lowStockThreshold ?? 5);
      const stockStatus = p.stock <= 0 ? 'Out of Stock' : p.stock <= threshold ? 'Low Stock' : 'In Stock';
      return {
        id: p.id,
        name: p.name,
        image: p.image || '',
        category: p.category,
        stock: p.stock,
        lowStockThreshold: threshold,
        stockStatus,
        costPrice: p.costPrice ?? null,
        expiryDate: p.expiryDate || '',
        updatedAt: p.updatedAt || p.createdAt || '',
      };
    })
    .filter((p) => {
      if (category && p.category !== category) return false;
      if (status && p.stockStatus !== status) return false;
      return true;
    });

  const movements = logs.filter((l) => inDateRange(l.createdAt, startDate, endDate));
  res.json({
    items,
    movements,
    hasCostData: products.some((p) => typeof p.costPrice === 'number' && p.costPrice > 0),
    hasExpiryData: products.some((p) => Boolean(p.expiryDate)),
  });
});

router.get('/reports', async (req, res) => {
  const {
    type = 'orders',
    startDate = '',
    endDate = '',
    category = '',
    status = '',
    q = '',
    sortBy = '',
    sortDir = 'desc',
    page = '1',
    limit = '25',
    format = 'json',
  } = req.query || {};

  const settings = await getSettings();
  const businessName = settings.name || 'HRUVITA';
  const dateRangeLabel = startDate || endDate ? `${startDate || 'Start'} to ${endDate || 'Today'}` : 'All Time';

  let headers = [];
  let rows = [];

  if (type === 'sales' || type === 'orders') {
    const orders = await listAllOrders();
    const filtered = orders.filter((o) => {
      if (!inDateRange(o.createdAt || o.scheduledDate, startDate, endDate)) return false;
      if (status && o.status !== status) return false;
      if (q && !o.id.toLowerCase().includes(q.toLowerCase()) && !String(o.customerName || '').toLowerCase().includes(q.toLowerCase())) {
        return false;
      }
      return true;
    });
    headers = ['Order ID', 'Date', 'Schedule', 'Customer', 'Status', 'Payment', 'Total (INR)'];
    rows = filtered.map((o) => ({
      'Order ID': o.id,
      Date: String(o.createdAt || o.scheduledDate || '').slice(0, 10),
      Schedule: `${o.scheduledDate} (${o.slotId === 'same-day' ? 'Same-Day Express' : o.slotLabel})`,
      Customer: o.customerName,
      Status: o.status,
      Payment: `${o.paymentMethod} (${o.paymentStatus})`,
      'Total (INR)': Number(o.pricing?.grandTotal || 0),
    }));
  } else if (type === 'inventory') {
    const products = await listProducts();
    headers = ['Product ID', 'Name', 'Category', 'Stock', 'Threshold', 'Status'];
    rows = products
      .filter((p) => (!category || p.category === category) && (!q || p.name.toLowerCase().includes(q.toLowerCase())))
      .map((p) => {
        const th = Number(p.lowStockThreshold ?? 5);
        const st = p.stock <= 0 ? 'Out of Stock' : p.stock <= th ? 'Low Stock' : 'In Stock';
        return {
          'Product ID': p.id,
          Name: p.name,
          Category: p.category,
          Stock: p.stock,
          Threshold: th,
          Status: st,
        };
      })
      .filter((r) => !status || r.Status === status);
  } else if (type === 'products') {
    const [orders, products] = await Promise.all([listAllOrders(), listProducts()]);
    const prodMap = new Map(products.map((p) => [p.id, p]));
    const perf = new Map();
    for (const o of orders) {
      if (!inDateRange(o.createdAt || o.scheduledDate, startDate, endDate)) continue;
      if (EXCLUDED_REV_STATUSES.has(o.status)) continue;
      for (const it of o.items || []) {
        const p = prodMap.get(String(it.productId || '').replace(/^combo:/, ''));
        if (category && p?.category !== category) continue;
        const curr = perf.get(it.name) || { Product: it.name, Category: p?.category || 'other', 'Qty Sold': 0, 'Revenue (INR)': 0 };
        curr['Qty Sold'] += Number(it.qty || 1);
        curr['Revenue (INR)'] += Number(it.lineTotal || 0);
        perf.set(it.name, curr);
      }
    }
    headers = ['Product', 'Category', 'Qty Sold', 'Revenue (INR)'];
    rows = [...perf.values()].filter((r) => !q || r.Product.toLowerCase().includes(q.toLowerCase()));
  } else if (type === 'customers') {
    const [users, orders] = await Promise.all([listUsers(), listAllOrders()]);
    const counts = new Map();
    for (const o of orders) counts.set(o.userId, (counts.get(o.userId) || 0) + 1);
    headers = ['Customer ID', 'Name', 'Joined', 'Total Orders', 'Status'];
    rows = users
      .filter((u) => u.role === 'customer' && (!q || String(u.fullName || u.name || '').toLowerCase().includes(q.toLowerCase())))
      .map((u) => ({
        'Customer ID': u.id,
        Name: u.fullName || u.name || 'Customer',
        Joined: String(u.createdAt || '').slice(0, 10),
        'Total Orders': counts.get(u.id) || 0,
        Status: u.blocked ? 'Suspended' : 'Active',
      }));
  } else if (type === 'subscriptions') {
    const subs = await listAllSubscriptions();
    headers = ['Subscription ID', 'Plan', 'Duration (Days)', 'Status', 'Start Date', 'End Date'];
    rows = subs
      .filter((s) => (!status || s.status === status) && (!q || String(s.planName || s.id).toLowerCase().includes(q.toLowerCase())))
      .map((s) => ({
        'Subscription ID': s.id,
        Plan: s.planName || s.planId,
        'Duration (Days)': s.durationDays || 7,
        Status: s.status,
        'Start Date': s.startDate || '',
        'End Date': s.endDate || '',
      }));
  } else if (type === 'payments') {
    const payments = await listAllPayments();
    headers = ['Payment ID', 'Order ID', 'Method', 'Amount (INR)', 'Status', 'Date'];
    rows = payments
      .filter((p) => inDateRange(p.createdAt, startDate, endDate) && (!status || p.status === status))
      .map((p) => ({
        'Payment ID': p.id,
        'Order ID': p.orderId,
        Method: p.method,
        'Amount (INR)': p.amount,
        Status: p.status,
        Date: String(p.createdAt || '').slice(0, 10),
      }));
  } else if (type === 'activity') {
    const logs = await listAuditLogs(200);
    headers = ['Log ID', 'Admin', 'Action', 'Entity', 'Record ID', 'Timestamp'];
    rows = logs
      .filter((l) => inDateRange(l.createdAt, startDate, endDate))
      .map((l) => ({
        'Log ID': l.id,
        Admin: l.actorEmail,
        Action: l.action,
        Entity: l.entity,
        'Record ID': l.entityId || '',
        Timestamp: l.createdAt || '',
      }));
  }

  if (sortBy && headers.includes(sortBy)) {
    const dir = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => (a[sortBy] > b[sortBy] ? dir : a[sortBy] < b[sortBy] ? -dir : 0));
  }

  if (format === 'csv') {
    await recordAudit({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'REPORT_DOWNLOADED',
      entity: 'report',
      entityId: type,
      details: { format: 'csv', dateRange: dateRangeLabel, count: rows.length },
    }).catch(() => {});
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="hruvita-${type}-report.csv"`);
    return res.send(buildCsv({ businessName, reportType: `${type.toUpperCase()} REPORT`, dateRange: dateRangeLabel, headers, rows }));
  }

  if (format === 'xls') {
    await recordAudit({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'REPORT_DOWNLOADED',
      entity: 'report',
      entityId: type,
      details: { format: 'xls', dateRange: dateRangeLabel, count: rows.length },
    }).catch(() => {});
    res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="hruvita-${type}-report.xls"`);
    return res.send(buildExcelHtml({ businessName, reportType: `${type.toUpperCase()} REPORT`, dateRange: dateRangeLabel, headers, rows }));
  }

  const pNum = Math.max(1, Number(page) || 1);
  const pLim = Math.min(100, Math.max(5, Number(limit) || 25));
  const total = rows.length;
  const paged = rows.slice((pNum - 1) * pLim, pNum * pLim);

  return res.json({
    businessName,
    reportType: type,
    dateRange: dateRangeLabel,
    headers,
    rows: paged,
    total,
    page: pNum,
    totalPages: Math.max(1, Math.ceil(total / pLim)),
  });
});

router.get('/notifications', async (req, res) => {
  const { category = '', unreadOnly = '0' } = req.query || {};
  const { todayStr } = getBusinessDateParts();
  const [products, subscriptions, orders] = await Promise.all([
    listProducts(),
    listAllSubscriptions(),
    listAllOrders(),
  ]);
  await syncOperationalNotifications({ products, subscriptions, orders, todayStr });
  const data = await listAdminNotifications(req.user.id, {
    category,
    unreadOnly: unreadOnly === '1',
  });
  res.json(data);
});

router.post('/notifications/:id/read', async (req, res) => {
  await markAdminNotificationRead(req.params.id, req.user.id);
  res.json({ ok: true });
});

router.post('/notifications/read-all', async (req, res) => {
  await markAllAdminNotificationsRead(req.user.id);
  res.json({ ok: true });
});

router.delete('/notifications', async (_req, res) => {
  await clearAdminNotifications();
  res.json({ ok: true, notifications: [] });
});

router.get('/activity', async (req, res) => {
  const logs = await listAuditLogs(150);
  res.json({ logs });
});

export default router;
