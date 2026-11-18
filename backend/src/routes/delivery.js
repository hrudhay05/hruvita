import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  listAllOrders,
  getOrderById,
  updateUser,
  recordAudit,
  getBusinessDateParts,
} from '../store/repository.js';
import { Order } from '../models/Order.js';
import { sendUserNotification } from '../utils/emailService.js';
import { notifyAdmins } from '../utils/adminNotifier.js';

const router = Router();

router.use(requireAuth, requireRole('delivery_boy'));

const FAILED_STATUSES = new Set([
  'delivery_failed',
  'customer_unavailable',
  'address_not_found',
  'customer_cancelled',
]);

const PERMITTED_STATUSES = new Set([
  'picked_up',
  'out_for_delivery',
  'delivered',
  ...FAILED_STATUSES,
]);

function sanitizeOrderForDelivery(ord) {
  return {
    id: ord.id,
    customerName: ord.address?.recipient || ord.customerName,
    customerPhone: ord.address?.phone || ord.customerPhone,
    address: ord.address,
    items: (ord.items || []).map((it) => ({
      name: it.name,
      qty: it.qty,
      sizeLabel: it.sizeLabel || '',
    })),
    paymentMethod: ord.paymentMethod,
    paymentStatus: ord.paymentStatus,
    grandTotal: ord.pricing?.grandTotal || 0,
    scheduledDate: ord.scheduledDate,
    slotId: ord.slotId,
    slotLabel: ord.slotLabel,
    status: ord.status,
    deliveryStatus: ord.deliveryStatus || 'assigned',
    deliveryAssignment: ord.deliveryAssignment || {},
    createdAt: ord.createdAt,
  };
}

router.get('/orders', async (req, res) => {
  const all = await listAllOrders();
  const mine = all
    .filter((o) => o.deliveryAssignment?.deliveryBoyId === req.user.id)
    .map(sanitizeOrderForDelivery);

  const { todayStr } = getBusinessDateParts();
  const stats = {
    totalAssigned: mine.length,
    pendingCount: mine.filter((o) => ['assigned', 'picked_up'].includes(o.deliveryStatus)).length,
    outForDeliveryCount: mine.filter((o) => o.deliveryStatus === 'out_for_delivery').length,
    completedToday: mine.filter(
      (o) =>
        o.deliveryStatus === 'delivered' &&
        String(o.deliveryAssignment?.deliveredAt || '').slice(0, 10) === todayStr
    ).length,
    failedCount: mine.filter((o) => FAILED_STATUSES.has(o.deliveryStatus)).length,
  };

  res.json({
    orders: mine,
    stats,
    profile: {
      id: req.user.id,
      fullName: req.user.fullName || req.user.name,
      email: req.user.email,
      phone: req.user.mobileNumber || req.user.phone,
      availability: req.user.deliveryAvailability || 'available',
    },
  });
});

router.patch('/availability', async (req, res) => {
  const { availability } = req.body || {};
  if (!['available', 'busy', 'offline'].includes(availability)) {
    return res.status(400).json({ error: 'Availability must be available, busy, or offline.' });
  }
  const updated = await updateUser(req.user.id, { deliveryAvailability: availability });
  res.json({ availability: updated?.deliveryAvailability || availability });
});

router.patch('/orders/:id/status', async (req, res) => {
  try {
    const { deliveryStatus, reason = '', codCollected = false } = req.body || {};
    if (!PERMITTED_STATUSES.has(deliveryStatus)) {
      return res.status(400).json({ error: 'Invalid delivery status transition.' });
    }
    if (FAILED_STATUSES.has(deliveryStatus) && String(reason).trim().length < 3) {
      return res.status(400).json({ error: 'Please provide a reason for the failed delivery.' });
    }

    const order = await getOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.deliveryAssignment?.deliveryBoyId !== req.user.id) {
      return res.status(403).json({ error: 'You are not assigned to this order.' });
    }

    const nowIso = new Date().toISOString();
    const assignmentPatch = {
      ...(order.deliveryAssignment || {}),
      deliveryBoyId: req.user.id,
      deliveryBoyName: req.user.fullName || req.user.name,
      deliveryBoyPhone: req.user.mobileNumber || req.user.phone || '',
    };

    let nextOrderStatus = order.status;
    let nextPaymentStatus = order.paymentStatus;
    let notifTitle = '';
    let notifMsg = '';

    if (deliveryStatus === 'picked_up') {
      assignmentPatch.pickedUpAt = nowIso;
      notifTitle = `Order Picked Up (${order.id})`;
      notifMsg = `${assignmentPatch.deliveryBoyName} has picked up your HRUVITA order.`;
    } else if (deliveryStatus === 'out_for_delivery') {
      assignmentPatch.outForDeliveryAt = nowIso;
      nextOrderStatus = 'out_for_delivery';
      notifTitle = `Out for Delivery (${order.id})`;
      notifMsg = `${assignmentPatch.deliveryBoyName} is on the way with your order! Call ${assignmentPatch.deliveryBoyPhone} if needed.`;
    } else if (deliveryStatus === 'delivered') {
      assignmentPatch.deliveredAt = nowIso;
      nextOrderStatus = 'delivered';
      if (order.paymentMethod === 'cod' && codCollected === true) {
        assignmentPatch.codCollected = true;
        assignmentPatch.codCollectedAt = nowIso;
        nextPaymentStatus = 'paid';
      }
      notifTitle = `Order Delivered (${order.id})`;
      notifMsg = `Your HRUVITA order ${order.id} has been delivered. Enjoy your meal!`;
    } else if (FAILED_STATUSES.has(deliveryStatus)) {
      assignmentPatch.failedAt = nowIso;
      assignmentPatch.failureReason = String(reason).trim();
      notifTitle = `Delivery Attempt Update (${order.id})`;
      notifMsg = `Delivery could not be completed (${deliveryStatus.replace(/_/g, ' ')}): ${assignmentPatch.failureReason}`;
    }

    const historyEntry = {
      status: nextOrderStatus,
      note:
        deliveryStatus === 'delivered'
          ? `Delivered by ${assignmentPatch.deliveryBoyName}${assignmentPatch.codCollected ? ' (COD collected)' : ''}`
          : FAILED_STATUSES.has(deliveryStatus)
            ? `Delivery exception (${deliveryStatus}): ${assignmentPatch.failureReason}`
            : `Delivery partner status: ${deliveryStatus.replace(/_/g, ' ')}`,
      by: req.user.email,
      at: nowIso,
    };

    const updated = await Order.findOneAndUpdate(
      { id: order.id },
      {
        $set: {
          deliveryStatus,
          deliveryAssignment: assignmentPatch,
          status: nextOrderStatus,
          paymentStatus: nextPaymentStatus,
        },
        $push: { statusHistory: historyEntry },
      },
      { new: true }
    ).lean();

    await recordAudit({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: `DELIVERY_${deliveryStatus.toUpperCase()}`,
      entity: 'order',
      entityId: order.id,
      newValue: { deliveryStatus, codCollected: Boolean(codCollected), reason },
      details: { deliveryStatus, reason },
    });

    if (notifTitle) {
      sendUserNotification({
        userId: order.userId,
        email: order.customerEmail,
        type: 'order',
        title: notifTitle,
        message: notifMsg,
      }).catch(() => {});
    }

    if (deliveryStatus === 'delivered' || FAILED_STATUSES.has(deliveryStatus)) {
      notifyAdmins({
        dedupKey: `del-${order.id}-${deliveryStatus}-${nowIso.slice(0, 16)}`,
        category: 'order',
        title: deliveryStatus === 'delivered' ? `Order Delivered: ${order.id}` : `Delivery Failed: ${order.id}`,
        description: `${assignmentPatch.deliveryBoyName}: ${historyEntry.note}`,
        entityType: 'order',
        entityId: order.id,
      }).catch(() => {});
    }

    return res.json({ order: sanitizeOrderForDelivery(updated || order) });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Could not update delivery status.' });
  }
});

export default router;
