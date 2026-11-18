import { Router } from 'express';
import bcrypt from 'bcrypt';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ORDER_STATUSES, Order } from '../models/Order.js';
import { sendUserNotification } from '../utils/emailService.js';
import { notifyAdmins } from '../utils/adminNotifier.js';
import { createRazorpayClient } from '../utils/razorpayClient.js';
import {
  runDailySubscriptionGenerator,
  runLowStockCheck,
  runAbandonedPaymentCleanup,
} from '../jobs/scheduler.js';
import {
  listProducts,
  listCategories,
  listUsers,
  createUser,
  findUserByEmail,
  findUserById,
  updateUser,
  sanitizeUser,
  listAuditLogs,
  recordAudit,
  listAllOrders,
  listAllPayments,
  transitionOrderStatus,
  getOrderById,
  listAllCoupons,
  upsertCoupon,
  deleteCouponByCode,
  listAllSlots,
  updateSlotConfig,
  listAllSubscriptions,
  getSettings,
  listAutomationLogs,
  listIngredients,
  upsertIngredient,
  adjustProductStock,
  adjustIngredientStock,
  listInventoryLogs,
  listCombos,
  upsertCombo,
  deleteCombo,
  listPlans,
  upsertSubscriptionPlan,
  deleteSubscriptionPlan,
  listAllReviews,
  moderateReview,
  listReferrals,
  resolveReferral,
} from '../store/repository.js';

const router = Router();

router.use(requireAuth, requireRole('admin', 'staff'));

router.get('/overview', async (_req, res) => {
  const [products, categories, users, orders, payments, subscriptions, auditLogs, settings] =
    await Promise.all([
      listProducts({ includeInactive: true }),
      listCategories(),
      listUsers(),
      listAllOrders(),
      listAllPayments(),
      listAllSubscriptions(),
      listAuditLogs(25),
      getSettings(),
    ]);

  const lowStock = products.filter((p) => p.stock > 0 && p.stock <= 5);
  const outOfStock = products.filter((p) => p.stock <= 0);
  const customers = users.filter((u) => u.role === 'customer');
  const activeOrders = orders.filter(
    (o) => !['delivered', 'cancelled', 'refunded'].includes(o.status)
  );
  const activeSubscriptions = subscriptions.filter((s) => s.status === 'active');
  const totalRevenue = orders
    .filter((o) => !['cancelled', 'refund_initiated', 'refunded', 'payment_pending'].includes(o.status))
    .reduce((sum, o) => sum + (o.pricing?.grandTotal || 0), 0);

  const todayIso = new Date().toISOString().slice(0, 10);
  const todayOrdersCount = orders.filter(
    (o) => o.scheduledDate === todayIso || String(o.createdAt || '').slice(0, 10) === todayIso
  ).length;
  const pendingOrdersCount = orders.filter((o) =>
    ['placed', 'confirmed', 'preparing', 'packed', 'out_for_delivery', 'payment_pending'].includes(o.status)
  ).length;
  const completedOrdersCount = orders.filter((o) => o.status === 'delivered').length;
  const cancelledOrdersCount = orders.filter((o) => ['cancelled', 'refunded'].includes(o.status)).length;

  const productQtyMap = new Map();
  for (const o of orders) {
    if (['cancelled', 'refunded'].includes(o.status)) continue;
    for (const item of o.items || []) {
      const key = item.name || item.productId || 'Item';
      productQtyMap.set(key, (productQtyMap.get(key) || 0) + Number(item.qty || 1));
    }
  }
  const popularProducts = [...productQtyMap.entries()]
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  res.json({
    stats: {
      totalProducts: products.length,
      totalCategories: categories.length,
      lowStockCount: lowStock.length,
      outOfStockCount: outOfStock.length,
      totalCustomers: customers.length,
      totalOrders: orders.length,
      activeOrdersCount: activeOrders.length,
      todayOrdersCount,
      pendingOrdersCount,
      completedOrdersCount,
      cancelledOrdersCount,
      activeSubscriptionsCount: activeSubscriptions.length,
      totalRevenue,
    },
    popularProducts,
    deliveryBoys: users
      .filter((u) => u.role === 'delivery_boy')
      .map((u) => ({
        id: u.id,
        fullName: u.fullName || u.name,
        phone: u.mobileNumber || u.phone || '',
        email: u.email,
        availability: u.deliveryAvailability || 'available',
        active: !u.blocked,
      })),
    lowStock,
    outOfStock,
    customers,
    orders,
    payments,
    subscriptions,
    settings,
    orderStatuses: ORDER_STATUSES,
    auditLogs,
  });
});

// Phase 5: Kitchen Tomorrow-Prep View grouped by delivery slot
router.get('/kitchen', async (req, res) => {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const targetDate = String(req.query.date || tomorrow).slice(0, 10);

  const [orders, subscriptions, slots] = await Promise.all([
    listAllOrders(),
    listAllSubscriptions(),
    listAllSlots(),
  ]);

  const dayOrders = orders.filter(
    (o) =>
      o.scheduledDate === targetDate &&
      !['cancelled', 'refund_initiated', 'refunded', 'payment_pending'].includes(o.status)
  );

  const activeSubs = subscriptions.filter(
    (s) => s.status === 'active' && s.remainingDeliveries > 0 && s.startDate <= targetDate
  );

  const slotMap = {};
  for (const sl of slots) {
    slotMap[sl.id] = {
      slotId: sl.id,
      slotName: sl.name,
      window: sl.window,
      maxOrders: sl.maxOrders,
      orders: [],
      subscriptions: [],
      itemTotals: {},
    };
  }

  const grandTotals = {};

  for (const ord of dayOrders) {
    const key = slotMap[ord.slotId] ? ord.slotId : 'morning';
    if (!slotMap[key]) {
      slotMap[key] = {
        slotId: key,
        slotName: ord.slotLabel || key,
        window: '',
        maxOrders: 40,
        orders: [],
        subscriptions: [],
        itemTotals: {},
      };
    }
    slotMap[key].orders.push(ord);
    for (const item of ord.items || []) {
      slotMap[key].itemTotals[item.name] = (slotMap[key].itemTotals[item.name] || 0) + item.qty;
      grandTotals[item.name] = (grandTotals[item.name] || 0) + item.qty;
    }
  }

  for (const sub of activeSubs) {
    const key = slotMap[sub.slotId] ? sub.slotId : 'morning';
    if (slotMap[key]) {
      slotMap[key].subscriptions.push(sub);
      const dish = `${sub.preferredBreakfast} (Subscription)`;
      slotMap[key].itemTotals[dish] = (slotMap[key].itemTotals[dish] || 0) + 1;
      grandTotals[dish] = (grandTotals[dish] || 0) + 1;
    }
  }

  res.json({
    date: targetDate,
    totalOrders: dayOrders.length,
    totalSubscriptions: activeSubs.length,
    slots: Object.values(slotMap),
    grandTotals: Object.entries(grandTotals)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty),
  });
});

// Phase 5: Coupons Manager
router.get('/coupons', async (_req, res) => {
  const coupons = await listAllCoupons();
  res.json({ coupons });
});

router.post('/coupons', requireRole('admin'), async (req, res) => {
  try {
    const coupon = await upsertCoupon(req.body || {});
    await recordAudit({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'UPSERT_COUPON',
      entity: 'coupon',
      entityId: coupon.code,
      details: { type: coupon.type, value: coupon.value, active: coupon.active },
    });
    res.status(201).json({ coupon });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not save coupon.' });
  }
});

router.delete('/coupons/:code', requireRole('admin'), async (req, res) => {
  const ok = await deleteCouponByCode(req.params.code);
  if (!ok) return res.status(404).json({ error: 'Coupon not found.' });
  await recordAudit({
    actorId: req.user.id,
    actorEmail: req.user.email,
    action: 'DELETE_COUPON',
    entity: 'coupon',
    entityId: req.params.code.toUpperCase(),
  });
  res.json({ deleted: true });
});

// Phase 5: Delivery Slots Manager
router.get('/slots', async (_req, res) => {
  const slots = await listAllSlots();
  res.json({ slots });
});

router.put('/slots/:id', requireRole('admin'), async (req, res) => {
  const updated = await updateSlotConfig(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'Delivery slot not found.' });
  await recordAudit({
    actorId: req.user.id,
    actorEmail: req.user.email,
    action: 'UPDATE_SLOT',
    entity: 'deliverySlot',
    entityId: updated.id,
    details: { window: updated.window, maxOrders: updated.maxOrders, active: updated.active },
  });
  res.json({ slot: updated });
});

// Phase 5: Sales & Inventory Reports
router.get('/reports', async (_req, res) => {
  const [orders, products, subscriptions, users] = await Promise.all([
    listAllOrders(),
    listProducts({ includeInactive: true }),
    listAllSubscriptions(),
    listUsers(),
  ]);

  const validOrders = orders.filter(
    (o) => !['cancelled', 'refund_initiated', 'refunded', 'payment_pending'].includes(o.status)
  );

  const productSales = {};
  const paymentBreakdown = { cod: { count: 0, amount: 0 }, razorpay: { count: 0, amount: 0 } };
  const dailySales = {};

  for (const ord of validOrders) {
    const total = ord.pricing?.grandTotal || 0;
    const method = ord.paymentMethod === 'cod' ? 'cod' : 'razorpay';
    paymentBreakdown[method].count += 1;
    paymentBreakdown[method].amount += total;

    const dayKey = (ord.scheduledDate || ord.createdAt || '').slice(0, 10) || 'Today';
    if (!dailySales[dayKey]) dailySales[dayKey] = { date: dayKey, orders: 0, revenue: 0 };
    dailySales[dayKey].orders += 1;
    dailySales[dayKey].revenue += total;

    for (const it of ord.items || []) {
      if (!productSales[it.name]) productSales[it.name] = { name: it.name, qty: 0, revenue: 0 };
      productSales[it.name].qty += it.qty;
      productSales[it.name].revenue += it.lineTotal;
    }
  }

  const subscriptionRevenue = subscriptions.reduce((sum, s) => sum + (s.price || 0), 0);

  res.json({
    summary: {
      validOrderCount: validOrders.length,
      orderRevenue: validOrders.reduce((s, o) => s + (o.pricing?.grandTotal || 0), 0),
      subscriptionCount: subscriptions.length,
      subscriptionRevenue,
      customerCount: users.filter((u) => u.role === 'customer').length,
      lowStockItems: products.filter((p) => p.stock <= 5).length,
    },
    paymentBreakdown,
    dailySales: Object.values(dailySales).sort((a, b) => b.date.localeCompare(a.date)),
    topProducts: Object.values(productSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10),
  });
});

// Phase 5: Free CSV Export (Orders, Inventory, Customers)
function csvEscape(val) {
  const s = String(val ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

router.get('/export/:type', async (req, res) => {
  const type = req.params.type;
  let headers = [];
  let rows = [];

  if (type === 'orders') {
    const orders = await listAllOrders();
    headers = ['Order ID', 'Date', 'Slot', 'Customer', 'Phone', 'Payment Method', 'Payment Status', 'Order Status', 'Subtotal', 'Discount', 'Delivery', 'Tax', 'Grand Total'];
    rows = orders.map((o) => [
      o.id,
      o.scheduledDate,
      o.slotLabel,
      o.customerName,
      o.customerPhone,
      o.paymentMethod,
      o.paymentStatus,
      o.status,
      o.pricing?.subtotal || 0,
      o.pricing?.couponDiscount || 0,
      o.pricing?.deliveryCharge || 0,
      o.pricing?.taxAmount || 0,
      o.pricing?.grandTotal || 0,
    ]);
  } else if (type === 'inventory') {
    const products = await listProducts({ includeInactive: true });
    headers = ['Product ID', 'Name', 'Category', 'MRP', 'Offer Price', 'Stock', 'Prep Mins', 'Veg', 'Bestseller'];
    rows = products.map((p) => [
      p.id,
      p.name,
      p.category,
      p.price,
      p.discountPrice || '',
      p.stock,
      p.prepMins,
      p.veg ? 'Yes' : 'No',
      p.bestseller ? 'Yes' : 'No',
    ]);
  } else if (type === 'customers') {
    const users = await listUsers();
    const customers = users.filter((u) => u.role === 'customer');
    headers = ['User ID', 'Full Name', 'Username', 'Email', 'Mobile', 'Email Verified', 'Referral Code', 'Reward Points', 'Blocked'];
    rows = customers.map((u) => [
      u.id,
      u.fullName || u.name,
      u.username || '',
      u.email,
      u.mobileNumber || u.phone || '',
      u.isEmailVerified ? 'Yes' : 'No',
      u.referralCode || '',
      u.rewardPoints || 0,
      u.blocked ? 'Yes' : 'No',
    ]);
  } else {
    return res.status(400).json({ error: 'Invalid export type. Use orders, inventory, or customers.' });
  }

  const csvContent = [
    headers.map(csvEscape).join(','),
    ...rows.map((r) => r.map(csvEscape).join(',')),
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="hruvita-${type}-${new Date().toISOString().slice(0, 10)}.csv"`);
  return res.send(csvContent);
});

router.get('/orders', async (req, res) => {
  const status = req.query.status || '';
  const orders = await listAllOrders(status);
  res.json({ orders, statuses: ORDER_STATUSES });
});

router.patch('/orders/:id/status', async (req, res) => {
  try {
    const { status, note = '' } = req.body || {};
    const updated = await transitionOrderStatus({
      orderId: req.params.id,
      status,
      note,
      by: req.user.email,
    });
    await recordAudit({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'UPDATE_ORDER_STATUS',
      entity: 'order',
      entityId: updated.id,
      details: { status: updated.status, note },
    });
    await sendUserNotification({
      userId: updated.userId,
      email: updated.customerEmail,
      type: 'order',
      title: `Order ${updated.id} Status: ${updated.status.replace(/_/g, ' ').toUpperCase()}`,
      message: `Your HRUVITA order ${updated.id} is now "${updated.status.replace(/_/g, ' ')}".`,
    });
    return res.json({ order: updated });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to update order status.' });
  }
});

router.post('/orders/:id/refund', requireRole('admin'), async (req, res) => {
  try {
    const order = await getOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    await transitionOrderStatus({
      orderId: order.id,
      status: 'refund_initiated',
      note: req.body?.reason || 'Refund initiated by Admin',
      by: req.user.email,
    });

    let gatewayNote = 'Refund processed via payment gateway';
    const rzpClient = createRazorpayClient();
    if (
      rzpClient &&
      order.paymentMethod === 'razorpay' &&
      order.razorpayPaymentId &&
      !order.razorpayPaymentId.startsWith('pay_test_')
    ) {
      const rzpRefund = await rzpClient.payments.refund(order.razorpayPaymentId, {
        speed: 'normal',
        notes: {
          hruvitaOrderId: order.id,
          reason: req.body?.reason || 'Admin initiated refund',
        },
      });
      gatewayNote = `Razorpay refund processed (${rzpRefund.id})`;
    }

    const refunded = await transitionOrderStatus({
      orderId: order.id,
      status: 'refunded',
      note: gatewayNote,
      by: req.user.email,
    });

    await recordAudit({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'REFUND_ORDER',
      entity: 'order',
      entityId: refunded.id,
      details: { amount: refunded.pricing?.grandTotal },
    });

    await sendUserNotification({
      userId: refunded.userId,
      email: refunded.customerEmail,
      type: 'order',
      title: `Refund Processed for Order ${refunded.id}`,
      message: `A refund of ₹${refunded.pricing?.grandTotal} has been processed for your order ${refunded.id}.`,
    });

    return res.json({ order: refunded });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Refund failed.' });
  }
});

router.patch('/users/:id/block', requireRole('admin'), async (req, res) => {
  const blocked = Boolean(req.body?.blocked);
  const updated = await updateUser(req.params.id, { blocked });
  if (!updated) {
    return res.status(404).json({ error: 'User not found.' });
  }
  await recordAudit({
    actorId: req.user.id,
    actorEmail: req.user.email,
    action: blocked ? 'BLOCK_USER' : 'UNBLOCK_USER',
    entity: 'user',
    entityId: updated.id,
    details: { email: updated.email, blocked },
  });
  res.json({ user: await sanitizeUser(updated) });
});

// Phase 7: Automation logs & manual job triggers
router.get('/automation/logs', async (_req, res) => {
  const logs = await listAutomationLogs(30);
  res.json({ logs });
});

router.post('/automation/run/:job', requireRole('admin'), async (req, res) => {
  try {
    const job = req.params.job;
    let log;
    if (job === 'subscriptions') log = await runDailySubscriptionGenerator();
    else if (job === 'low-stock') log = await runLowStockCheck();
    else if (job === 'cleanup') log = await runAbandonedPaymentCleanup();
    else return res.status(400).json({ error: 'Unknown job. Use subscriptions, low-stock, or cleanup.' });

    await recordAudit({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'RUN_AUTOMATION_JOB',
      entity: 'automation',
      entityId: job,
      details: { summary: log.summary },
    });

    res.json({ log });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Automation job failed.' });
  }
});

// Inventory, Bowl Ingredients & Stock History Logs
router.get('/inventory', async (_req, res) => {
  const [products, ingredients, logs] = await Promise.all([
    listProducts({ includeInactive: true }),
    listIngredients(true),
    listInventoryLogs(80),
  ]);
  const lowProducts = products.filter((p) => p.stock <= 5);
  const lowIngredients = ingredients.filter((i) => i.stock <= (i.lowStockThreshold || 8));
  res.json({ products, ingredients, logs, lowProducts, lowIngredients });
});

router.post('/inventory/products/:id/adjust', requireRole('admin'), async (req, res) => {
  try {
    const { delta, reason = 'admin_adjustment', note = '' } = req.body || {};
    const product = await adjustProductStock({
      productId: req.params.id,
      delta,
      reason,
      actor: req.user.email,
      note,
    });
    await recordAudit({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'ADJUST_PRODUCT_STOCK',
      entity: 'product',
      entityId: product.id,
      details: { delta: Number(delta), stockAfter: product.stock, note },
    });
    res.json({ product });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not adjust stock.' });
  }
});

router.post('/ingredients', requireRole('admin'), async (req, res) => {
  try {
    const ingredient = await upsertIngredient(req.body || {});
    await recordAudit({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'UPSERT_INGREDIENT',
      entity: 'ingredient',
      entityId: ingredient.id,
      details: { category: ingredient.category, price: ingredient.price, stock: ingredient.stock },
    });
    res.status(201).json({ ingredient });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not save ingredient.' });
  }
});

router.post('/ingredients/:id/adjust', requireRole('admin'), async (req, res) => {
  try {
    const { delta, reason = 'admin_adjustment', note = '' } = req.body || {};
    const ingredient = await adjustIngredientStock({
      ingredientId: req.params.id,
      delta,
      reason,
      actor: req.user.email,
      note,
    });
    await recordAudit({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'ADJUST_INGREDIENT_STOCK',
      entity: 'ingredient',
      entityId: ingredient.id,
      details: { delta: Number(delta), stockAfter: ingredient.stock, note },
    });
    res.json({ ingredient });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not adjust ingredient stock.' });
  }
});

// Dynamic Combo Builder CRUD
router.get('/combos', async (_req, res) => {
  const combos = await listCombos(true);
  res.json({ combos });
});

router.post('/combos', requireRole('admin'), async (req, res) => {
  try {
    const combo = await upsertCombo(req.body || {});
    await recordAudit({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'UPSERT_COMBO',
      entity: 'combo',
      entityId: combo.id,
      details: { price: combo.price, active: combo.active, items: combo.items },
    });
    res.status(201).json({ combo });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not save combo.' });
  }
});

router.delete('/combos/:id', requireRole('admin'), async (req, res) => {
  const ok = await deleteCombo(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Combo not found.' });
  await recordAudit({
    actorId: req.user.id,
    actorEmail: req.user.email,
    action: 'DELETE_COMBO',
    entity: 'combo',
    entityId: req.params.id,
  });
  res.json({ deleted: true });
});

// Subscription Plans CRUD
router.get('/plans', async (_req, res) => {
  const plans = await listPlans(true);
  res.json({ plans });
});

router.post('/plans', requireRole('admin'), async (req, res) => {
  try {
    const plan = await upsertSubscriptionPlan(req.body || {});
    await recordAudit({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'UPSERT_SUBSCRIPTION_PLAN',
      entity: 'subscriptionPlan',
      entityId: plan.id,
      details: { days: plan.days, price: plan.price, active: plan.active },
    });
    res.status(201).json({ plan });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not save subscription plan.' });
  }
});

router.delete('/plans/:id', requireRole('admin'), async (req, res) => {
  const ok = await deleteSubscriptionPlan(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Plan not found.' });
  await recordAudit({
    actorId: req.user.id,
    actorEmail: req.user.email,
    action: 'DELETE_SUBSCRIPTION_PLAN',
    entity: 'subscriptionPlan',
    entityId: req.params.id,
  });
  res.json({ deleted: true });
});

// Review Moderation
router.get('/reviews', async (_req, res) => {
  const reviews = await listAllReviews(100);
  res.json({ reviews });
});

router.patch('/reviews/:id/moderate', requireRole('admin'), async (req, res) => {
  const { visible, moderationNote = '' } = req.body || {};
  const review = await moderateReview(req.params.id, { visible, moderationNote });
  if (!review) return res.status(404).json({ error: 'Review not found.' });
  await recordAudit({
    actorId: req.user.id,
    actorEmail: req.user.email,
    action: visible ? 'SHOW_REVIEW' : 'HIDE_REVIEW',
    entity: 'review',
    entityId: review.id,
    details: { visible, moderationNote },
  });
  res.json({ review });
});

// Referrals & Fraud Review
router.get('/referrals', async (_req, res) => {
  const referrals = await listReferrals();
  res.json({ referrals });
});

router.post('/referrals/:id/resolve', requireRole('admin'), async (req, res) => {
  try {
    const action = req.body?.action === 'approve' ? 'approve' : 'reject';
    const referral = await resolveReferral(req.params.id, action);
    await recordAudit({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: action === 'approve' ? 'APPROVE_REFERRAL' : 'REJECT_REFERRAL',
      entity: 'referral',
      entityId: referral.id,
      details: { status: referral.status, rewardAmount: referral.rewardAmount },
    });
    res.json({ referral });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not resolve referral.' });
  }
});

// Owner/Super Admin: Admin Team & Admin Analyst Management
router.get('/team', requireRole('admin'), async (_req, res) => {
  const users = await listUsers();
  const team = users
    .filter((u) => ['admin', 'staff', 'admin_analyser'].includes(u.role))
    .map((u) => ({
      id: u.id,
      fullName: u.fullName || u.name,
      email: u.email,
      role: u.role,
      blocked: Boolean(u.blocked),
      createdAt: u.createdAt,
    }));
  res.json({ team });
});

router.post('/team', requireRole('admin'), async (req, res) => {
  try {
    const { fullName, email, password, role = 'admin_analyser' } = req.body || {};
    if (!fullName || !email || !password || String(password).length < 8) {
      return res.status(400).json({ error: 'Full name, valid email, and password (8+ chars) are required.' });
    }
    if (!['admin_analyser', 'staff'].includes(role)) {
      return res.status(400).json({ error: 'Role must be admin_analyser or staff.' });
    }
    const normEmail = String(email).trim().toLowerCase();
    const existing = await findUserByEmail(normEmail);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    const passwordHash = await bcrypt.hash(String(password), 12);
    const created = await createUser({
      id: `u-team-${Date.now().toString(36)}`,
      fullName: String(fullName).trim(),
      name: String(fullName).trim(),
      email: normEmail,
      password: passwordHash,
      role,
      isEmailVerified: true,
      isProfileCompleted: true,
      termsAccepted: true,
      blocked: false,
    });
    await recordAudit({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'ADMIN_ACCOUNT_CREATED',
      entity: 'user',
      entityId: created.id,
      newValue: { email: normEmail, role },
      details: { email: normEmail, role },
    });
    return res.status(201).json({
      member: {
        id: created.id,
        fullName: created.fullName,
        email: created.email,
        role: created.role,
        blocked: false,
      },
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Could not create team account.' });
  }
});

router.patch('/team/:id/status', requireRole('admin'), async (req, res) => {
  const target = await findUserById(req.params.id);
  if (!target) return res.status(404).json({ error: 'Account not found.' });
  if (target.id === req.user.id) {
    return res.status(400).json({ error: 'You cannot deactivate your own owner account.' });
  }
  const blocked = Boolean(req.body?.blocked);
  const updated = await updateUser(target.id, { blocked });
  await recordAudit({
    actorId: req.user.id,
    actorEmail: req.user.email,
    action: blocked ? 'ADMIN_ACCOUNT_DEACTIVATED' : 'ADMIN_ACCOUNT_ACTIVATED',
    entity: 'user',
    entityId: target.id,
    previousValue: { blocked: Boolean(target.blocked) },
    newValue: { blocked },
    details: { email: target.email, role: target.role, blocked },
  });
  res.json({ member: { id: updated.id, email: updated.email, role: updated.role, blocked: Boolean(updated.blocked) } });
});

// Delivery Boy Management & Order Assignment
router.get('/delivery-boys', async (_req, res) => {
  const [users, orders] = await Promise.all([listUsers(), listAllOrders()]);
  const boys = users
    .filter((u) => u.role === 'delivery_boy')
    .map((u) => {
      const assignedOrders = orders.filter((o) => o.deliveryAssignment?.deliveryBoyId === u.id);
      const completed = assignedOrders.filter((o) => o.deliveryStatus === 'delivered').length;
      const failed = assignedOrders.filter((o) =>
        ['delivery_failed', 'customer_unavailable', 'address_not_found', 'customer_cancelled'].includes(o.deliveryStatus)
      ).length;
      const active = assignedOrders.filter((o) =>
        ['assigned', 'picked_up', 'out_for_delivery'].includes(o.deliveryStatus)
      ).length;
      return {
        id: u.id,
        fullName: u.fullName || u.name,
        phone: u.mobileNumber || u.phone || '',
        email: u.email,
        username: u.username || '',
        active: !u.blocked,
        availability: u.deliveryAvailability || 'available',
        stats: {
          totalAssigned: assignedOrders.length,
          active,
          completed,
          failed,
          completionRate:
            completed + failed > 0 ? Math.round((completed / (completed + failed)) * 100) : 100,
        },
        createdAt: u.createdAt,
      };
    });
  res.json({ deliveryBoys: boys });
});

router.post('/delivery-boys', requireRole('admin'), async (req, res) => {
  try {
    const { fullName, phone, email, password, availability = 'available' } = req.body || {};
    if (!fullName || !phone || !email || !password || String(password).length < 8) {
      return res
        .status(400)
        .json({ error: 'Full name, phone number, email, and password (8+ chars) are required.' });
    }
    const normEmail = String(email).trim().toLowerCase();
    const existing = await findUserByEmail(normEmail);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    const passwordHash = await bcrypt.hash(String(password), 12);
    const created = await createUser({
      id: `u-del-${Date.now().toString(36)}`,
      fullName: String(fullName).trim(),
      name: String(fullName).trim(),
      email: normEmail,
      mobileNumber: String(phone).trim(),
      phone: String(phone).trim(),
      password: passwordHash,
      role: 'delivery_boy',
      deliveryAvailability: ['available', 'busy', 'offline'].includes(availability)
        ? availability
        : 'available',
      isEmailVerified: true,
      isProfileCompleted: true,
      termsAccepted: true,
      blocked: false,
    });
    await recordAudit({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'DELIVERY_BOY_CREATED',
      entity: 'user',
      entityId: created.id,
      newValue: { email: normEmail, phone: created.phone },
      details: { email: normEmail, phone: created.phone },
    });
    return res.status(201).json({
      deliveryBoy: {
        id: created.id,
        fullName: created.fullName,
        phone: created.phone,
        email: created.email,
        availability: created.deliveryAvailability,
        active: true,
      },
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Could not create delivery boy.' });
  }
});

router.patch('/delivery-boys/:id', requireRole('admin'), async (req, res) => {
  const target = await findUserById(req.params.id);
  if (!target || target.role !== 'delivery_boy') {
    return res.status(404).json({ error: 'Delivery partner not found.' });
  }
  const { fullName, phone, availability, active, password } = req.body || {};
  const patch = {};
  if (fullName !== undefined) {
    patch.fullName = String(fullName).trim();
    patch.name = String(fullName).trim();
  }
  if (phone !== undefined) {
    patch.mobileNumber = String(phone).trim();
    patch.phone = String(phone).trim();
  }
  if (['available', 'busy', 'offline'].includes(availability)) {
    patch.deliveryAvailability = availability;
  }
  if (active !== undefined) {
    patch.blocked = !active;
  }
  if (password && String(password).length >= 8) {
    patch.password = await bcrypt.hash(String(password), 12);
  }
  const updated = await updateUser(target.id, patch);
  await recordAudit({
    actorId: req.user.id,
    actorEmail: req.user.email,
    action: 'DELIVERY_BOY_UPDATED',
    entity: 'user',
    entityId: target.id,
    details: { fullName: updated.fullName, blocked: updated.blocked, availability: updated.deliveryAvailability },
  });
  res.json({ deliveryBoy: updated });
});

router.post('/orders/:id/assign-delivery', async (req, res) => {
  try {
    const { deliveryBoyId, note = '' } = req.body || {};
    if (!deliveryBoyId) {
      return res.status(400).json({ error: 'Please select a delivery partner.' });
    }
    const [order, boy] = await Promise.all([
      getOrderById(req.params.id),
      findUserById(deliveryBoyId),
    ]);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (!boy || boy.role !== 'delivery_boy') {
      return res.status(404).json({ error: 'Delivery partner not found.' });
    }
    if (boy.blocked) {
      return res.status(400).json({ error: 'Cannot assign an inactive delivery partner.' });
    }
    if (['cancelled', 'refunded', 'delivered'].includes(order.status)) {
      return res.status(400).json({ error: `Cannot assign delivery to a ${order.status} order.` });
    }
    if (
      order.deliveryAssignment?.deliveryBoyId === boy.id &&
      ['assigned', 'picked_up', 'out_for_delivery'].includes(order.deliveryStatus)
    ) {
      return res.status(409).json({ error: 'This delivery partner is already assigned to this order.' });
    }

    const isReassign = Boolean(order.deliveryAssignment?.deliveryBoyId);
    const nowIso = new Date().toISOString();
    const assignment = {
      deliveryBoyId: boy.id,
      deliveryBoyName: boy.fullName || boy.name,
      deliveryBoyPhone: boy.mobileNumber || boy.phone || '',
      assignedAt: nowIso,
      assignedBy: req.user.email,
      pickedUpAt: '',
      outForDeliveryAt: '',
      deliveredAt: '',
      failedAt: '',
      failureReason: '',
      codCollected: Boolean(order.deliveryAssignment?.codCollected),
      codCollectedAt: order.deliveryAssignment?.codCollectedAt || '',
    };

    const historyItem = {
      deliveryBoyId: boy.id,
      deliveryBoyName: assignment.deliveryBoyName,
      deliveryBoyPhone: assignment.deliveryBoyPhone,
      assignedBy: req.user.email,
      assignedAt: nowIso,
      action: isReassign ? 'reassigned' : 'assigned',
      note: String(note || ''),
    };

    const updated = await Order.findOneAndUpdate(
      { id: order.id },
      {
        $set: {
          deliveryStatus: 'assigned',
          deliveryAssignment: assignment,
        },
        $push: { assignmentHistory: historyItem },
      },
      { new: true }
    ).lean();

    await recordAudit({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: isReassign ? 'DELIVERY_BOY_REASSIGNED' : 'DELIVERY_BOY_ASSIGNED',
      entity: 'order',
      entityId: order.id,
      previousValue: order.deliveryAssignment?.deliveryBoyId
        ? { deliveryBoyId: order.deliveryAssignment.deliveryBoyId, name: order.deliveryAssignment.deliveryBoyName }
        : null,
      newValue: { deliveryBoyId: boy.id, name: assignment.deliveryBoyName },
      details: { deliveryBoyId: boy.id, name: assignment.deliveryBoyName },
    });

    sendUserNotification({
      userId: order.userId,
      email: order.customerEmail,
      type: 'order',
      title: isReassign
        ? `Delivery Partner Updated (${order.id})`
        : `Delivery Partner Assigned (${order.id})`,
      message: `${assignment.deliveryBoyName} (${assignment.deliveryBoyPhone}) will deliver your HRUVITA order.`,
    }).catch(() => {});

    notifyAdmins({
      dedupKey: `assign-${order.id}-${boy.id}-${nowIso.slice(0, 16)}`,
      category: 'order',
      title: `${isReassign ? 'Reassigned' : 'Assigned'}: ${order.id}`,
      description: `Assigned to ${assignment.deliveryBoyName} (${assignment.deliveryBoyPhone}).`,
      entityType: 'order',
      entityId: order.id,
    }).catch(() => {});

    return res.json({ order: updated || order });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Could not assign delivery partner.' });
  }
});

export default router;
