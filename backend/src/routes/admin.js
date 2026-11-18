import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ORDER_STATUSES } from '../models/Order.js';
import { sendUserNotification } from '../utils/emailService.js';
import {
  listProducts,
  listCategories,
  listUsers,
  updateUser,
  sanitizeUser,
  listAuditLogs,
  recordAudit,
  listAllOrders,
  listAllPayments,
  transitionOrderStatus,
  getOrderById,
} from '../store/repository.js';

const router = Router();

router.use(requireAuth, requireRole('admin', 'staff'));

router.get('/overview', async (_req, res) => {
  const [products, categories, users, orders, payments, auditLogs] = await Promise.all([
    listProducts({ includeInactive: true }),
    listCategories(),
    listUsers(),
    listAllOrders(),
    listAllPayments(),
    listAuditLogs(25),
  ]);

  const lowStock = products.filter((p) => p.stock > 0 && p.stock <= 5);
  const outOfStock = products.filter((p) => p.stock <= 0);
  const customers = users.filter((u) => u.role === 'customer');
  const activeOrders = orders.filter(
    (o) => !['delivered', 'cancelled', 'refunded'].includes(o.status)
  );
  const totalRevenue = orders
    .filter((o) => !['cancelled', 'refund_initiated', 'refunded', 'payment_pending'].includes(o.status))
    .reduce((sum, o) => sum + (o.pricing?.grandTotal || 0), 0);

  res.json({
    stats: {
      totalProducts: products.length,
      totalCategories: categories.length,
      lowStockCount: lowStock.length,
      outOfStockCount: outOfStock.length,
      totalCustomers: customers.length,
      totalOrders: orders.length,
      activeOrdersCount: activeOrders.length,
      totalRevenue,
    },
    lowStock,
    outOfStock,
    customers,
    orders,
    payments,
    orderStatuses: ORDER_STATUSES,
    auditLogs,
  });
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

    // Step 1: Move to refund_initiated, then complete to refunded (simulating Razorpay instant test refund)
    await transitionOrderStatus({
      orderId: order.id,
      status: 'refund_initiated',
      note: req.body?.reason || 'Refund initiated by Admin',
      by: req.user.email,
    });

    const refunded = await transitionOrderStatus({
      orderId: order.id,
      status: 'refunded',
      note: 'Refund processed via Razorpay test gateway',
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
  res.json({ user: sanitizeUser(updated) });
});

export default router;
