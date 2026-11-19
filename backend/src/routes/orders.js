import crypto from 'crypto';
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { sendUserNotification } from '../utils/emailService.js';
import { notifyAdmins } from '../utils/adminNotifier.js';
import {
  emitOrderCreated,
  emitOrderUpdated,
  emitOrderCancelled,
  emitPaymentUpdated,
} from '../services/realtimeService.js';
import {
  getRazorpayKeyId,
  getRazorpaySecret,
  getWebhookSecret,
  isRealRazorpayConfigured,
  createRazorpayClient,
} from '../utils/razorpayClient.js';
import {
  listSlotsForDate,
  getBookingAvailability,
  validateDeliverySchedule,
  listCoupons,
  getSettings,
  calculateCheckoutQuote,
  deductOrderStockAtomically,
  createOrderRecord,
  createPaymentRecord,
  getOrderById,
  getOrderByRazorpayOrderId,
  listOrdersByUser,
  listPaymentsByUser,
  listProducts,
  listCombos,
  confirmOrderPayment,
  transitionOrderStatus,
  findUserById,
  updateUser,
} from '../store/repository.js';

const router = Router();

export function signRazorpayPair(razorpayOrderId, razorpayPaymentId) {
  return crypto
    .createHmac('sha256', getRazorpaySecret())
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');
}

// Public delivery slots (same-day ASAP vs advance booking slots for ?date=YYYY-MM-DD)
router.get('/slots', async (req, res) => {
  const dateStr = String(req.query.date || '').slice(0, 10);
  const booking = await getBookingAvailability(dateStr);
  res.json(booking);
});

router.get('/coupons', async (_req, res) => {
  const coupons = await listCoupons();
  res.json({ coupons });
});

// Server-side price quote (never trust browser totals)
router.post('/checkout/quote', async (req, res) => {
  try {
    const { items = {}, customBowls = [], couponCode = '', useRewards = false, userId = null } = req.body || {};
    const quote = await calculateCheckoutQuote({ items, customBowls, couponCode, useRewards, userId });
    res.json(quote);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not calculate cart total.' });
  }
});

// Create Order (COD or Razorpay Online)
router.post('/orders', requireAuth, async (req, res) => {
  try {
    const {
      items = {},
      customBowls = [],
      couponCode = '',
      useRewards = false,
      address,
      scheduledDate,
      slotId = 'morning',
      paymentMethod = 'razorpay',
      idempotencyKey = '',
    } = req.body || {};

    if (!address || !address.recipient || !address.phone || !address.line1 || !address.pincode) {
      return res.status(400).json({ error: 'Complete delivery address is required.' });
    }

    const settings = await getSettings();
    if (settings.storeOpen === false) {
      return res.status(400).json({ error: 'The store is currently closed for new orders.' });
    }

    if (paymentMethod === 'cod' && settings.codEnabled === false) {
      return res.status(400).json({ error: 'Cash on Delivery is currently disabled by admin.' });
    }

    const now = new Date().toISOString();
    const orderId = `ORD-${Date.now().toString(36).toUpperCase()}`;
    const deliveryDate = scheduledDate || now.slice(0, 10);

    // Enforce slot capacity, cut-off hour, and max pre-order days on the server
    const slot = await validateDeliverySchedule({
      scheduledDate: deliveryDate,
      slotId,
    });

    const quote = await calculateCheckoutQuote({
      items,
      customBowls,
      couponCode,
      useRewards,
      userId: req.user.id,
    });

    if (paymentMethod === 'cod') {
      // Deduct product/combo/ingredient stock atomically for confirmed COD orders
      await deductOrderStockAtomically(quote.items, {
        reason: 'order_deducted',
        orderId,
        actor: req.user.email,
      });

      if (quote.pricing.rewardPointsUsed > 0) {
        const user = await findUserById(req.user.id);
        if (user) {
          const nextPoints = Math.max(0, (user.rewardPoints || 0) - quote.pricing.rewardPointsUsed);
          await updateUser(user.id, { rewardPoints: nextPoints });
        }
      }

      const order = await createOrderRecord({
        id: orderId,
        idempotencyKey: idempotencyKey || `${req.user.id}-${orderId}`,
        userId: req.user.id,
        customerName: req.user.name,
        customerEmail: req.user.email,
        customerPhone: address.phone || req.user.phone,
        items: quote.items,
        pricing: quote.pricing,
        address,
        scheduledDate: deliveryDate,
        slotId: slot.id,
        slotLabel: `${slot.name} (${slot.window})`,
        paymentMethod: 'cod',
        paymentStatus: 'pending',
        status: 'confirmed',
        stockDeducted: true,
        statusHistory: [
          {
            status: 'confirmed',
            note: 'Order placed with Cash on Delivery',
            by: req.user.email,
            at: now,
          },
        ],
      });

      const payment = await createPaymentRecord({
        id: `PAY-${Date.now().toString(36).toUpperCase()}`,
        orderId: order.id,
        userId: req.user.id,
        method: 'cod',
        amount: quote.pricing.grandTotal,
        currency: 'INR',
        status: 'created',
      });

      await sendUserNotification({
        userId: req.user.id,
        email: req.user.email,
        type: 'order',
        title: `Order Confirmed (${order.id})`,
        message: `Your COD order of ₹${quote.pricing.grandTotal} is confirmed for ${deliveryDate} (${slot.name}).`,
      });

      notifyAdmins({
        dedupKey: `new-cod-${order.id}`,
        category: 'order',
        title: `New COD Order ${order.id}`,
        description: `₹${quote.pricing.grandTotal} COD order from ${req.user.name || req.user.email}.`,
        entityType: 'order',
        entityId: order.id,
      }).catch(() => {});

      emitOrderCreated(order);
      return res.status(201).json({ order, payment });
    }

    // Razorpay Online Flow: reserve stock for 10 minutes while customer completes payment
    await deductOrderStockAtomically(quote.items, {
      reason: 'order_reserved',
      orderId,
      actor: req.user.email,
    });

    const amountPaise = Math.round(quote.pricing.grandTotal * 100);
    const reservationExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const rzpClient = createRazorpayClient();
    let rzpOrderId = `order_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    let isRealGateway = false;

    if (rzpClient) {
      const rzpOrder = await rzpClient.orders.create({
        amount: amountPaise,
        currency: 'INR',
        receipt: orderId,
        notes: {
          hruvitaOrderId: orderId,
          userId: req.user.id,
        },
      });
      rzpOrderId = rzpOrder.id;
      isRealGateway = true;
    }

    const order = await createOrderRecord({
      id: orderId,
      idempotencyKey: idempotencyKey || `${req.user.id}-${orderId}`,
      userId: req.user.id,
      customerName: req.user.name,
      customerEmail: req.user.email,
      customerPhone: address.phone || req.user.phone,
      items: quote.items,
      pricing: quote.pricing,
      address,
      scheduledDate: deliveryDate,
      slotId: slot.id,
      slotLabel: `${slot.name} (${slot.window})`,
      paymentMethod: 'razorpay',
      paymentStatus: 'pending',
      razorpayOrderId: rzpOrderId,
      status: 'payment_pending',
      stockDeducted: true,
      stockReserved: true,
      reservationExpiresAt,
      statusHistory: [
        {
          status: 'payment_pending',
          note: `Razorpay order created (${rzpOrderId}); stock reserved for 10 mins`,
          by: req.user.email,
          at: now,
        },
      ],
    });

    const payment = await createPaymentRecord({
      id: `PAY-${Date.now().toString(36).toUpperCase()}`,
      orderId: order.id,
      userId: req.user.id,
      method: 'razorpay',
      amount: quote.pricing.grandTotal,
      currency: 'INR',
      razorpayOrderId: rzpOrderId,
      status: 'created',
    });

    const samplePaymentId = isRealGateway ? null : `pay_test_${Date.now().toString(36)}`;
    const sampleSignature = isRealGateway ? null : signRazorpayPair(rzpOrderId, samplePaymentId);

    return res.status(201).json({
      order,
      payment,
      razorpay: {
        keyId: getRazorpayKeyId(),
        orderId: rzpOrderId,
        amount: quote.pricing.grandTotal,
        amountPaise,
        currency: 'INR',
        isRealGateway,
        ...(isRealGateway
          ? {}
          : {
              testPayload: {
                razorpay_order_id: rzpOrderId,
                razorpay_payment_id: samplePaymentId,
                razorpay_signature: sampleSignature,
              },
            }),
      },
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to create order.' });
  }
});

// Verify Razorpay Payment Signature
router.post('/orders/:id/verify-payment', requireAuth, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing Razorpay payment verification parameters.' });
    }

    const order = await getOrderById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    if (order.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    const expectedSig = signRazorpayPair(razorpay_order_id, razorpay_payment_id);
    if (expectedSig !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid payment signature.' });
    }

    const confirmed = await confirmOrderPayment({
      orderId: order.id,
      razorpayPaymentId: razorpay_payment_id,
      by: req.user.email,
    });
    emitPaymentUpdated(confirmed, 'payment:successful');
    emitOrderUpdated(confirmed, 'order:confirmed');

    await sendUserNotification({
      userId: order.userId,
      email: order.customerEmail,
      type: 'order',
      title: `Payment Received & Order Confirmed (${confirmed.id})`,
      message: `Payment ${razorpay_payment_id} of ₹${confirmed.pricing?.grandTotal} verified. Scheduled for ${confirmed.scheduledDate} (${confirmed.slotLabel}).`,
    });

    return res.json({ order: confirmed });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Payment verification failed.' });
  }
});

// Razorpay Webhook (Safety net if customer closes browser tab)
router.post('/webhooks/razorpay', async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'] || '';
    const bodyString = JSON.stringify(req.body || {});
    const expected = crypto
      .createHmac('sha256', getWebhookSecret())
      .update(bodyString)
      .digest('hex');

    if (signature && signature !== expected) {
      return res.status(400).json({ error: 'Invalid webhook signature.' });
    }

    const event = req.body?.event;
    if (event === 'payment.captured') {
      const entity = req.body?.payload?.payment?.entity || {};
      const order = await getOrderByRazorpayOrderId(entity.order_id);
      if (order) {
        await confirmOrderPayment({
          orderId: order.id,
          razorpayPaymentId: entity.id || `pay_wh_${Date.now().toString(36)}`,
          by: 'razorpay-webhook',
        });
      }
    } else if (event === 'refund.processed') {
      const entity = req.body?.payload?.refund?.entity || {};
      const order = await getOrderByRazorpayOrderId(entity.order_id);
      if (order) {
        await transitionOrderStatus({
          orderId: order.id,
          status: 'refunded',
          note: `Webhook confirmed refund (${entity.id || 'rfnd'})`,
          by: 'razorpay-webhook',
        });
      }
    }

    return res.json({ received: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Webhook processing error.' });
  }
});

async function enrichOrdersWithCatalogAndPayments(orders, payments = []) {
  const [products, combos] = await Promise.all([listProducts(), listCombos()]);
  const prodMap = new Map(products.map((p) => [p.id, p]));
  const comboMap = new Map(combos.map((c) => [c.id, c]));
  const payByOrder = new Map();
  for (const p of payments) {
    if (p.orderId) payByOrder.set(p.orderId, p);
  }

  return orders.map((ord) => {
    const pay = payByOrder.get(ord.id);
    const enrichedItems = (ord.items || []).map((it) => {
      const baseId = String(it.productId || '').replace(/^combo:/, '');
      const catalogEntry = it.isCombo ? comboMap.get(baseId) : prodMap.get(baseId);
      return {
        ...it,
        image: it.image || catalogEntry?.image || '',
        description: it.description || catalogEntry?.description || '',
      };
    });
    const paymentSummary = pay
      ? {
          id: pay.id,
          method: pay.method,
          amount: pay.amount,
          currency: pay.currency || 'INR',
          status: pay.status,
          razorpayOrderId: pay.razorpayOrderId || ord.razorpayOrderId || '',
          razorpayPaymentId: pay.razorpayPaymentId || ord.razorpayPaymentId || '',
          refundId: pay.refundId || '',
          refundStatus: pay.refundStatus || '',
          createdAt: pay.createdAt,
        }
      : null;

    return {
      ...ord,
      items: enrichedItems,
      paymentSummary,
    };
  });
}

// Customer's orders & payment history
router.get('/orders/my', requireAuth, async (req, res) => {
  const [orders, payments] = await Promise.all([
    listOrdersByUser(req.user.id),
    listPaymentsByUser(req.user.id),
  ]);
  const enriched = await enrichOrdersWithCatalogAndPayments(orders, payments);
  res.json({ orders: enriched, payments });
});

router.get('/orders/:id', requireAuth, async (req, res) => {
  const order = await getOrderById(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Order not found.' });
  }
  if (order.userId !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'staff') {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  const payments = await listPaymentsByUser(order.userId);
  const [enriched] = await enrichOrdersWithCatalogAndPayments([order], payments);
  res.json({ order: enriched });
});

router.post('/orders/:id/cancel', requireAuth, async (req, res) => {
  try {
    const order = await getOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden.' });
    }
    if (!['pending', 'payment_pending', 'confirmed'].includes(order.status)) {
      return res.status(400).json({ error: 'Order is already being prepared and cannot be self-cancelled.' });
    }

    const nextStatus = order.paymentStatus === 'paid' ? 'refund_initiated' : 'cancelled';
    const updated = await transitionOrderStatus({
      orderId: order.id,
      status: nextStatus,
      note: req.body?.reason || 'Cancelled by customer',
      by: req.user.email,
    });
    notifyAdmins({
      dedupKey: `cancel-${order.id}-${nextStatus}`,
      category: nextStatus === 'refund_initiated' ? 'payment' : 'cancellation',
      title: nextStatus === 'refund_initiated' ? `Refund Requested: ${order.id}` : `Order Cancelled: ${order.id}`,
      description: `${order.id} updated to ${nextStatus} by customer.`,
      entityType: 'order',
      entityId: order.id,
    }).catch(() => {});
    emitOrderCancelled(updated);
    return res.json({ order: updated });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Could not cancel order.' });
  }
});

export default router;
