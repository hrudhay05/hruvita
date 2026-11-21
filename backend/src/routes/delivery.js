import crypto from 'crypto';
import mongoose from 'mongoose';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { DeliveryPayout } from '../models/DeliveryPayout.js';
import {
  listAllOrders,
  getOrderById,
  updateOrderDeliveryLocation,
  getSettings,
  updateUser,
  recordAudit,
  getBusinessDateParts,
} from '../store/repository.js';
import { Order } from '../models/Order.js';
import {
  sendUserNotification,
  sendDeliveryAcceptedEmail,
  sendOutForDeliveryEmail,
  sendDeliveryCompletedEmail,
  sendDeliveryFailedEmail,
} from '../utils/emailService.js';
import { encryptDeliveryOtp } from '../utils/deliveryOtpCrypto.js';
import { collectAndValidateLocation } from '../utils/locationTracker.js';
import { notifyAdmins } from '../utils/adminNotifier.js';
import { emitToAdmins, emitToDeliveryPartner, emitToUser } from '../utils/socketServer.js';
import { emitDeliveryUpdated, emitOrderUpdated, emitPaymentUpdated } from '../services/realtimeService.js';

const router = Router();

router.use(requireAuth, requireRole('delivery_boy'));

const otpVerifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many OTP verification attempts. Please wait a few minutes.' },
});

const FAILED_STATUSES = new Set([
  'delivery_failed',
  'customer_unavailable',
  'address_not_found',
  'customer_cancelled',
]);

const PERMITTED_STATUSES = new Set([
  'accepted',
  'rejected',
  'picked_up',
  'out_for_delivery',
  'delivered',
  ...FAILED_STATUSES,
]);

function hashDeliveryOtp(otp) {
  return crypto.createHash('sha256').update(String(otp)).digest('hex');
}

function generateNumericOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

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
    originalPaymentMethod: ord.originalPaymentMethod || (ord.paymentMethod === 'cod' ? 'COD' : 'Online'),
    currentPaymentMethod: ord.currentPaymentMethod || (ord.paymentMethod === 'cod' ? 'COD' : 'Online'),
    paymentStatus: ord.paymentStatus,
    grandTotal: ord.pricing?.grandTotal || 0,
    scheduledDate: ord.scheduledDate,
    slotId: ord.slotId,
    slotLabel: ord.slotLabel,
    status: ord.status,
    deliveryStatus: ord.deliveryStatus || 'assigned',
    delivery: ord.delivery
      ? {
          partnerId: ord.delivery.partnerId,
          partnerName: ord.delivery.partnerName,
          partnerPhone: ord.delivery.partnerPhone,
          assignedAt: ord.delivery.assignedAt,
          acceptedAt: ord.delivery.acceptedAt,
          pickedUpAt: ord.delivery.pickedUpAt,
          deliveredAt: ord.delivery.deliveredAt,
          failedAt: ord.delivery.failedAt,
          failureReason: ord.delivery.failureReason,
          otpRequired: Boolean(ord.delivery.otpExpiry),
          collectedCash: ord.delivery.collectedCash || 0,
          cashCollectionStatus: ord.delivery.cashCollectionStatus || 'not_applicable',
        }
      : {},
    deliveryAssignment: ord.deliveryAssignment || {},
    createdAt: ord.createdAt,
  };
}

router.get('/orders', async (req, res) => {
  const [all, settings] = await Promise.all([listAllOrders(), getSettings()]);
  const mine = all
    .filter(
      (o) =>
        o.deliveryAssignment?.deliveryBoyId === req.user.id ||
        o.delivery?.partnerId === req.user.id
    )
    .map(sanitizeOrderForDelivery);

  const { todayStr } = getBusinessDateParts();
  const nowMs = Date.now();
  const weekAgoIso = new Date(nowMs - 7 * 86400000).toISOString().slice(0, 10);
  const monthPrefix = todayStr.slice(0, 7);

  const deliveredOrders = mine.filter((o) => o.deliveryStatus === 'delivered');
  const deliveredToday = deliveredOrders.filter(
    (o) => String(o.delivery?.deliveredAt || o.deliveryAssignment?.deliveredAt || '').slice(0, 10) === todayStr
  );
  const deliveredWeek = deliveredOrders.filter(
    (o) => String(o.delivery?.deliveredAt || o.deliveryAssignment?.deliveredAt || '').slice(0, 10) >= weekAgoIso
  );
  const deliveredMonth = deliveredOrders.filter(
    (o) => String(o.delivery?.deliveredAt || o.deliveryAssignment?.deliveredAt || '').slice(0, 7) === monthPrefix
  );

  const commission = Number(settings.deliveryCommissionPerOrder ?? 40);
  const incentivePer10 = Number(settings.deliveryIncentivePer10Orders ?? 100);
  const calcEarn = (count) => count * commission + Math.floor(count / 10) * incentivePer10;

  const stats = {
    totalAssigned: mine.length,
    pendingCount: mine.filter((o) => o.deliveryStatus === 'assigned').length,
    acceptedCount: mine.filter((o) => ['accepted', 'picked_up'].includes(o.deliveryStatus)).length,
    outForDeliveryCount: mine.filter((o) => o.deliveryStatus === 'out_for_delivery').length,
    completedToday: deliveredToday.length,
    failedCount: mine.filter((o) => FAILED_STATUSES.has(o.deliveryStatus)).length,
    todayEarnings: calcEarn(deliveredToday.length),
    weeklyEarnings: calcEarn(deliveredWeek.length),
  };

  const earnings = {
    totalCompleted: deliveredOrders.length,
    perDeliveryCommission: commission,
    incentivePer10Orders: incentivePer10,
    daily: calcEarn(deliveredToday.length),
    weekly: calcEarn(deliveredWeek.length),
    monthly: calcEarn(deliveredMonth.length),
    totalEarned: calcEarn(deliveredOrders.length),
    todayCount: deliveredToday.length,
    nextBonusTarget: (Math.floor(deliveredToday.length / 10) + 1) * 10,
  };

  // Last 14 days daily breakdown
  const dayMap = new Map();
  for (const o of deliveredOrders) {
    const dStr = String(o.delivery?.deliveredAt || o.deliveryAssignment?.deliveredAt || o.createdAt || '').slice(0, 10);
    if (!dStr) continue;
    const cur = dayMap.get(dStr) || { date: dStr, deliveries: 0, codCollected: 0 };
    cur.deliveries += 1;
    cur.codCollected += Number(o.delivery?.collectedCash || 0);
    dayMap.set(dStr, cur);
  }
  const dailyBreakdown = [...dayMap.values()]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 14)
    .map((row) => ({
      ...row,
      commission: row.deliveries * commission,
      bonus: Math.floor(row.deliveries / 10) * incentivePer10,
      total: calcEarn(row.deliveries),
    }));

  const codSummary = {
    totalCodCollectedToday: deliveredToday.reduce((s, o) => s + Number(o.delivery?.collectedCash || 0), 0),
    totalCodCollectedAll: deliveredOrders.reduce((s, o) => s + Number(o.delivery?.collectedCash || 0), 0),
  };

  const payouts =
    mongoose.connection.readyState === 1
      ? (await DeliveryPayout.find({ partnerId: req.user.id }).sort({ createdAt: -1 }).limit(20).lean()).map((p) => ({
          id: String(p._id),
          periodLabel: p.periodLabel,
          deliveriesCount: p.deliveriesCount,
          commissionEarned: p.commissionEarned,
          incentiveBonus: p.incentiveBonus,
          totalAmount: p.totalAmount,
          status: p.status,
          utrNumber: p.utrNumber,
          paidAt: p.paidAt,
          createdAt: p.createdAt,
        }))
      : [];

  res.json({
    orders: mine,
    stats,
    earnings,
    dailyBreakdown,
    codSummary,
    payouts,
    profile: {
      id: req.user.id,
      fullName: req.user.fullName || req.user.name,
      email: req.user.email,
      phone: req.user.mobileNumber || req.user.phone,
      address: req.user.address || '',
      profileImage: req.user.profileImage || '',
      availability: req.user.deliveryAvailability || 'available',
    },
  });
});

router.post('/payouts/request', async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ error: 'Database connection required to request payouts.' });
  }
  const [all, settings] = await Promise.all([listAllOrders(), getSettings()]);
  const { todayStr } = getBusinessDateParts();
  const mineDelivered = all.filter(
    (o) =>
      (o.deliveryAssignment?.deliveryBoyId === req.user.id || o.delivery?.partnerId === req.user.id) &&
      o.deliveryStatus === 'delivered'
  );
  const todayDelivered = mineDelivered.filter(
    (o) => String(o.delivery?.deliveredAt || o.deliveryAssignment?.deliveredAt || '').slice(0, 10) === todayStr
  );
  if (todayDelivered.length === 0) {
    return res.status(400).json({ error: 'Complete at least 1 delivery today before requesting a daily payout.' });
  }

  const existingToday = await DeliveryPayout.findOne({
    partnerId: req.user.id,
    periodLabel: todayStr,
  }).lean();
  if (existingToday) {
    return res.status(409).json({ error: `Payout request for ${todayStr} is already ${existingToday.status}.` });
  }

  const commission = Number(settings.deliveryCommissionPerOrder ?? 40);
  const incentivePer10 = Number(settings.deliveryIncentivePer10Orders ?? 100);
  const deliveriesCount = todayDelivered.length;
  const commissionEarned = deliveriesCount * commission;
  const incentiveBonus = Math.floor(deliveriesCount / 10) * incentivePer10;
  const totalAmount = commissionEarned + incentiveBonus;

  const created = await DeliveryPayout.create({
    partnerId: req.user.id,
    partnerName: req.user.fullName || req.user.name || req.user.email,
    periodLabel: todayStr,
    deliveriesCount,
    commissionEarned,
    incentiveBonus,
    totalAmount,
    status: 'pending',
    notes: String(req.body?.notes || '').trim().slice(0, 200),
  });

  await notifyAdmins({
    type: 'delivery_payout_request',
    title: `Payout Request: ${req.user.fullName || req.user.name}`,
    message: `${req.user.fullName || req.user.name} requested ₹${totalAmount} for ${deliveriesCount} deliveries (${todayStr}).`,
  });

  return res.status(201).json({
    payout: {
      id: String(created._id),
      periodLabel: created.periodLabel,
      deliveriesCount: created.deliveriesCount,
      commissionEarned: created.commissionEarned,
      incentiveBonus: created.incentiveBonus,
      totalAmount: created.totalAmount,
      status: created.status,
      createdAt: created.createdAt,
    },
  });
});

router.patch('/availability', async (req, res) => {
  const { availability } = req.body || {};
  if (!['available', 'busy', 'offline'].includes(availability)) {
    return res.status(400).json({ error: 'Availability must be available, busy, or offline.' });
  }
  const updated = await updateUser(req.user.id, { deliveryAvailability: availability });
  const nextAvail = updated?.deliveryAvailability || availability;
  emitToAdmins(
    nextAvail === 'offline' ? 'delivery:partner-offline' : 'delivery:partner-online',
    { partnerId: req.user.id, name: req.user.fullName || req.user.name, availability: nextAvail }
  );
  res.json({ availability: nextAvail });
});

router.post('/location', async (req, res) => {
  const { orderId, lat, lng, accuracy = null, etaMinutes } = req.body || {};
  const result = await collectAndValidateLocation({
    orderId,
    partnerId: req.user.id,
    lat,
    lng,
    accuracy,
    etaMinutes,
  });

  if (!result.ok) {
    return res.status(result.status || 400).json({ error: result.error });
  }

  const eventPayload = {
    orderId: result.order.id,
    lat: result.liveLocation.lat,
    lng: result.liveLocation.lng,
    heading: result.liveLocation.heading,
    speedKmh: result.liveLocation.speedKmh,
    updatedAt: result.liveLocation.updatedAt,
    delivery: result.order.delivery,
    liveLocation: result.liveLocation,
    order: result.order,
    ts: Date.now(),
  };

  emitToUser(result.order.userId, 'delivery:location-updated', eventPayload);
  emitToUser(result.order.userId, 'order:location-updated', eventPayload);
  emitToAdmins('delivery:location-updated', eventPayload);

  return res.json({ shared: true, liveLocation: result.liveLocation });
});

router.post('/orders/:id/resend-otp', otpVerifyLimiter, async (req, res) => {
  const order = await getOrderById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (order.deliveryAssignment?.deliveryBoyId !== req.user.id && order.delivery?.partnerId !== req.user.id) {
    return res.status(403).json({ error: 'You are not assigned to this order.' });
  }
  if (order.deliveryStatus !== 'out_for_delivery') {
    return res.status(400).json({ error: 'OTP can only be sent when order is Out for Delivery.' });
  }

  const otp = generateNumericOtp();
  const otpHash = hashDeliveryOtp(otp);
  const otpEncrypted = encryptDeliveryOtp(otp);
  const otpExpiry = new Date(Date.now() + 4 * 60 * 60 * 1000);

  const updatedOrder = await Order.findOneAndUpdate(
    { id: order.id },
    {
      $set: {
        'delivery.deliveryOtpHash': otpHash,
        'delivery.deliveryOtpEncrypted': otpEncrypted,
        'delivery.otpExpiry': otpExpiry,
        'delivery.otpAttempts': 0,
      },
    },
    { new: true }
  ).lean();

  emitOrderUpdated(updatedOrder || order);
  emitDeliveryUpdated(updatedOrder || order, 'delivery:otp-refreshed');

  // Never send Delivery OTP via email; notify customer to view it in Order Details
  sendUserNotification({
    userId: order.userId,
    email: '',
    type: 'order',
    title: `Delivery OTP Refreshed (${order.id})`,
    message: 'Your order is out for delivery. Your delivery OTP is available in Order Details.',
    orderId: order.id,
  }).catch(() => {});

  return res.json({ sent: true, message: 'New Delivery OTP generated in customer Order Details.' });
});

router.post('/orders/:id/location', async (req, res) => {
  try {
    const { lat = null, lng = null, etaMinutes = null } = req.body || {};
    const orderDoc = await getOrderById(req.params.id);
    if (!orderDoc) return res.status(404).json({ error: 'Order not found.' });
    const assignedId = orderDoc.deliveryAssignment?.deliveryBoyId || orderDoc.delivery?.partnerId;
    if (assignedId !== req.user.id) {
      return res.status(403).json({ error: 'You are not assigned to this order.' });
    }

    const patch = {};
    if (lat !== null && lng !== null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
      patch.liveLocation = {
        lat: Number(lat),
        lng: Number(lng),
        updatedAt: new Date().toISOString(),
      };
    }
    if (etaMinutes !== null && Number.isFinite(Number(etaMinutes))) {
      const mins = Math.max(1, Math.min(180, Math.round(Number(etaMinutes))));
      patch.etaMinutes = mins;
      patch.estimatedArrivalAt = new Date(Date.now() + mins * 60 * 1000).toISOString();
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'Provide GPS coordinates or ETA minutes.' });
    }

    const updated = await updateOrderDeliveryLocation(orderDoc.id, patch);
    const finalOrd = updated || orderDoc;

    emitOrderUpdated(finalOrd);
    emitDeliveryUpdated(finalOrd, 'delivery:location-updated');
    return res.json({ order: sanitizeOrderForDelivery(finalOrd) });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Could not update live delivery location.' });
  }
});

router.patch('/orders/:id/status', otpVerifyLimiter, async (req, res) => {
  try {
    const {
      deliveryStatus,
      reason = '',
      otp = '',
      codCollected = false,
      collectedCash = null,
    } = req.body || {};

    if (!PERMITTED_STATUSES.has(deliveryStatus)) {
      return res.status(400).json({ error: 'Invalid delivery status transition.' });
    }
    if (FAILED_STATUSES.has(deliveryStatus) && String(reason).trim().length < 3) {
      return res.status(400).json({ error: 'Please provide a reason for the failed delivery.' });
    }

    const orderDoc = await Order.findOne({ id: req.params.id }).select('+delivery.deliveryOtpHash').lean();
    if (!orderDoc) return res.status(404).json({ error: 'Order not found.' });
    const assignedId = orderDoc.deliveryAssignment?.deliveryBoyId || orderDoc.delivery?.partnerId;
    if (assignedId !== req.user.id) {
      return res.status(403).json({ error: 'You are not assigned to this order.' });
    }
    if (orderDoc.deliveryStatus === 'delivered') {
      return res.status(409).json({ error: 'Order is already marked delivered.' });
    }

    const nowDate = new Date();
    const nowIso = nowDate.toISOString();
    const partnerName = req.user.fullName || req.user.name;
    const partnerPhone = req.user.mobileNumber || req.user.phone || '';

    const assignmentPatch = {
      ...(orderDoc.deliveryAssignment || {}),
      deliveryBoyId: req.user.id,
      deliveryBoyName: partnerName,
      deliveryBoyPhone: partnerPhone,
    };

    const deliverySet = {
      'delivery.partnerId': req.user.id,
      'delivery.partnerName': partnerName,
      'delivery.partnerPhone': partnerPhone,
    };

    let nextOrderStatus = orderDoc.status;
    let nextPaymentStatus = orderDoc.paymentStatus;
    let notifTitle = '';
    let notifMsg = '';

    if (deliveryStatus === 'rejected') {
      const rejectNote = String(reason || 'Rejected by delivery partner').trim();
      const updatedRejected = await Order.findOneAndUpdate(
        { id: orderDoc.id },
        {
          $set: {
            deliveryStatus: 'unassigned',
            'deliveryAssignment.deliveryBoyId': '',
            'deliveryAssignment.deliveryBoyName': '',
            'deliveryAssignment.deliveryBoyPhone': '',
            'delivery.partnerId': '',
            'delivery.partnerName': '',
            'delivery.partnerPhone': '',
          },
          $push: {
            assignmentHistory: {
              deliveryBoyId: req.user.id,
              deliveryBoyName: partnerName,
              deliveryBoyPhone: partnerPhone,
              assignedBy: req.user.email,
              assignedAt: nowIso,
              action: 'rejected',
              note: rejectNote,
            },
          },
        },
        { new: true }
      ).lean();

      notifyAdmins({
        dedupKey: `del-rej-${orderDoc.id}-${req.user.id}-${nowIso.slice(0, 16)}`,
        category: 'order',
        title: `Assignment Rejected: ${orderDoc.id}`,
        description: `${partnerName} rejected assignment (${rejectNote}). Please reassign.`,
        entityType: 'order',
        entityId: orderDoc.id,
      }).catch(() => {});
      emitToAdmins('delivery:order-rejected', { orderId: orderDoc.id, partnerId: req.user.id, reason: rejectNote });
      emitOrderUpdated(updatedRejected || orderDoc);
      return res.json({ order: sanitizeOrderForDelivery(updatedRejected || orderDoc), rejected: true });
    }

    if (deliveryStatus === 'accepted') {
      assignmentPatch.acceptedAt = nowIso;
      deliverySet['delivery.acceptedAt'] = nowDate;
      notifTitle = `Delivery Partner Accepted (${orderDoc.id})`;
      notifMsg = `${partnerName} accepted your order and is heading to pick it up.`;
      sendDeliveryAcceptedEmail({ to: orderDoc.customerEmail, orderId: orderDoc.id, partnerName, partnerPhone }).catch(() => {});
      emitToAdmins('delivery:order-accepted', { orderId: orderDoc.id, partnerId: req.user.id, partnerName });
    } else if (deliveryStatus === 'picked_up') {
      assignmentPatch.pickedUpAt = nowIso;
      deliverySet['delivery.pickedUpAt'] = nowDate;
      notifTitle = `Order Picked Up (${orderDoc.id})`;
      notifMsg = `${partnerName} has picked up your HRUVITA order.`;
    } else if (deliveryStatus === 'out_for_delivery') {
      assignmentPatch.outForDeliveryAt = nowIso;
      nextOrderStatus = 'out_for_delivery';

      // Generate secure 6-digit Delivery OTP (stored hashed + encrypted; displayed ONLY in customer Order Details, NOT emailed)
      const generatedOtp = generateNumericOtp();
      deliverySet['delivery.deliveryOtpHash'] = hashDeliveryOtp(generatedOtp);
      deliverySet['delivery.deliveryOtpEncrypted'] = encryptDeliveryOtp(generatedOtp);
      deliverySet['delivery.otpExpiry'] = new Date(Date.now() + 4 * 60 * 60 * 1000);
      deliverySet['delivery.otpAttempts'] = 0;
      deliverySet['delivery.etaMinutes'] = 20;
      deliverySet['delivery.estimatedArrivalAt'] = new Date(Date.now() + 20 * 60 * 1000).toISOString();

      notifTitle = `Out for Delivery (${orderDoc.id})`;
      notifMsg = 'Your order is out for delivery. Your delivery OTP is available in Order Details.';

      sendOutForDeliveryEmail({ to: orderDoc.customerEmail, orderId: orderDoc.id, partnerName, partnerPhone }).catch(() => {});
      emitToAdmins('delivery:order-started', { orderId: orderDoc.id, partnerId: req.user.id });
      emitToUser(orderDoc.userId, 'order:out-for-delivery', { orderId: orderDoc.id, partnerName, partnerPhone });
    } else if (deliveryStatus === 'delivered') {
      // Backend OTP verification
      const storedHash = orderDoc.delivery?.deliveryOtpHash || '';
      const expiry = orderDoc.delivery?.otpExpiry ? new Date(orderDoc.delivery.otpExpiry).getTime() : 0;
      const attempts = Number(orderDoc.delivery?.otpAttempts || 0);

      if (!storedHash) {
        return res.status(400).json({ error: 'Order must be Out for Delivery with an active Delivery OTP before marking delivered.' });
      }
      if (attempts >= 5) {
        return res.status(429).json({ error: 'Too many wrong OTP attempts. Please resend a new Delivery OTP.' });
      }
      if (!expiry || Date.now() > expiry) {
        return res.status(400).json({ error: 'Delivery OTP has expired. Please resend a new OTP.' });
      }
      const submittedHash = hashDeliveryOtp(String(otp || '').trim());
      const validOtp =
        submittedHash.length === storedHash.length &&
        crypto.timingSafeEqual(Buffer.from(submittedHash), Buffer.from(storedHash));

      if (!validOtp) {
        await Order.updateOne({ id: orderDoc.id }, { $inc: { 'delivery.otpAttempts': 1 } });
        return res.status(400).json({ error: 'Invalid Delivery OTP. Please ask the customer for the 6-digit code.' });
      }

      // COD validation
      if (orderDoc.paymentMethod === 'cod') {
        const expectedAmt = Number(orderDoc.pricing?.grandTotal || 0);
        const enteredAmt = collectedCash !== null && collectedCash !== '' ? Number(collectedCash) : (codCollected ? expectedAmt : 0);
        if (!codCollected && enteredAmt <= 0) {
          return res.status(400).json({ error: `Please confirm COD cash collected (₹${expectedAmt}).` });
        }
        if (Math.abs(enteredAmt - expectedAmt) > 1) {
          return res.status(400).json({ error: `Collected cash (₹${enteredAmt}) must match order total (₹${expectedAmt}).` });
        }
        assignmentPatch.codCollected = true;
        assignmentPatch.codCollectedAt = nowIso;
        deliverySet['delivery.collectedCash'] = enteredAmt;
        deliverySet['delivery.cashCollectionStatus'] = 'collected';
        nextPaymentStatus = 'paid';
      }

      // Invalidate OTP and record completion (prevents reuse)
      deliverySet['delivery.deliveryOtpHash'] = '';
      deliverySet['delivery.deliveryOtpEncrypted'] = '';
      deliverySet['delivery.otpExpiry'] = null;
      deliverySet['delivery.deliveredAt'] = nowDate;
      assignmentPatch.deliveredAt = nowIso;
      nextOrderStatus = 'delivered';

      notifTitle = `Order Delivered (${orderDoc.id})`;
      notifMsg = `Your HRUVITA order ${orderDoc.id} has been delivered by ${partnerName}. Enjoy your meal!`;

      sendDeliveryCompletedEmail({ to: orderDoc.customerEmail, orderId: orderDoc.id, partnerName }).catch(() => {});
      emitToAdmins('delivery:order-completed', { orderId: orderDoc.id, partnerId: req.user.id, deliveredAt: nowIso });
      emitToUser(orderDoc.userId, 'order:delivered', { orderId: orderDoc.id, deliveredAt: nowIso, partnerName });
    } else if (FAILED_STATUSES.has(deliveryStatus)) {
      assignmentPatch.failedAt = nowIso;
      assignmentPatch.failureReason = String(reason).trim();
      deliverySet['delivery.failedAt'] = nowDate;
      deliverySet['delivery.failureReason'] = assignmentPatch.failureReason;
      notifTitle = `Delivery Attempt Update (${orderDoc.id})`;
      notifMsg = `Delivery could not be completed (${deliveryStatus.replace(/_/g, ' ')}): ${assignmentPatch.failureReason}`;

      sendDeliveryFailedEmail({ to: orderDoc.customerEmail, orderId: orderDoc.id, partnerName, reason: assignmentPatch.failureReason }).catch(() => {});
      emitToAdmins('delivery:order-failed', { orderId: orderDoc.id, partnerId: req.user.id, reason: assignmentPatch.failureReason });
      emitToUser(orderDoc.userId, 'order:delivery-failed', { orderId: orderDoc.id, reason: assignmentPatch.failureReason });
    }

    const historyEntry = {
      status: nextOrderStatus,
      note:
        deliveryStatus === 'delivered'
          ? `Delivered by ${partnerName}${assignmentPatch.codCollected ? ` (COD ₹${deliverySet['delivery.collectedCash']} collected)` : ''}`
          : FAILED_STATUSES.has(deliveryStatus)
            ? `Delivery exception (${deliveryStatus}): ${assignmentPatch.failureReason}`
            : `Delivery partner status: ${deliveryStatus.replace(/_/g, ' ')}`,
      by: req.user.email,
      at: nowIso,
    };

    const updated = await Order.findOneAndUpdate(
      { id: orderDoc.id },
      {
        $set: {
          deliveryStatus,
          deliveryAssignment: assignmentPatch,
          status: nextOrderStatus,
          paymentStatus: nextPaymentStatus,
          ...deliverySet,
        },
        $push: { statusHistory: historyEntry },
      },
      { new: true }
    ).lean();

    emitToDeliveryPartner(req.user.id, 'delivery:order-updated', { orderId: orderDoc.id, deliveryStatus });
    const finalOrd = updated || orderDoc;
    if (deliveryStatus === 'delivered' || FAILED_STATUSES.has(deliveryStatus)) {
      emitToDeliveryPartner(req.user.id, 'delivery:tracking-stopped', { orderId: orderDoc.id, deliveryStatus });
    }
    emitDeliveryUpdated(finalOrd, `delivery:${deliveryStatus === 'out_for_delivery' ? 'started' : deliveryStatus === 'delivered' ? 'completed' : deliveryStatus === 'accepted' ? 'accepted' : FAILED_STATUSES.has(deliveryStatus) ? 'failed' : 'updated'}`);
    emitOrderUpdated(finalOrd);
    if (deliveryStatus === 'delivered' && assignmentPatch.codCollected) {
      emitPaymentUpdated(finalOrd, 'payment:cod-collected');
    }

    await recordAudit({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: `DELIVERY_${deliveryStatus.toUpperCase()}`,
      entity: 'order',
      entityId: orderDoc.id,
      newValue: { deliveryStatus, codCollected: Boolean(assignmentPatch.codCollected), reason },
      details: { deliveryStatus, reason },
    });

    if (notifTitle) {
      sendUserNotification({
        userId: orderDoc.userId,
        email: '',
        type: 'order',
        title: notifTitle,
        message: notifMsg,
        orderId: orderDoc.id,
      }).catch(() => {});
    }

    if (deliveryStatus === 'delivered' || FAILED_STATUSES.has(deliveryStatus)) {
      notifyAdmins({
        dedupKey: `del-${orderDoc.id}-${deliveryStatus}-${nowIso.slice(0, 16)}`,
        category: 'order',
        title: deliveryStatus === 'delivered' ? `Order Delivered: ${orderDoc.id}` : `Delivery Failed: ${orderDoc.id}`,
        description: `${partnerName}: ${historyEntry.note}`,
        entityType: 'order',
        entityId: orderDoc.id,
      }).catch(() => {});
    }

    return res.json({ order: sanitizeOrderForDelivery(updated || orderDoc) });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Could not update delivery status.' });
  }
});

export default router;
