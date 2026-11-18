import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { bowlOptions } from '../data/bowlOptions.js';
import {
  listReviews,
  createReview,
  listSubscriptionsByUser,
  createSubscriptionRecord,
  toggleSubscriptionStatus,
  listPlans,
  listSlots,
  listOrdersByUser,
} from '../store/repository.js';
import { sendUserNotification } from '../utils/emailService.js';

const router = Router();

// Bowl builder options (server-authoritative pricing)
router.get('/bowl-options', (_req, res) => {
  res.json({ bowlOptions });
});

// Genuine database reviews only
router.get('/reviews', async (req, res) => {
  const productId = req.query.productId || '';
  const reviews = await listReviews(productId);
  res.json({ reviews });
});

router.post('/reviews', requireAuth, async (req, res) => {
  try {
    const { productId = 'general', productName = '', rating, comment } = req.body || {};
    const numRating = Number(rating);
    if (!Number.isFinite(numRating) || numRating < 1 || numRating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5.' });
    }
    if (!comment || String(comment).trim().length < 5) {
      return res.status(400).json({ error: 'Please write a short review (at least 5 characters).' });
    }

    const userOrders = await listOrdersByUser(req.user.id);
    const hasDelivered = userOrders.some((o) => o.status === 'delivered' || o.status === 'confirmed');

    const review = await createReview({
      userId: req.user.id,
      userName: req.user.fullName || req.user.name || 'Customer',
      productId,
      productName,
      rating: numRating,
      comment: String(comment).trim(),
      verifiedOrder: hasDelivered,
    });

    return res.status(201).json({ review });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Could not submit review.' });
  }
});

// Subscriptions
router.get('/subscriptions/my', requireAuth, async (req, res) => {
  const subscriptions = await listSubscriptionsByUser(req.user.id);
  res.json({ subscriptions });
});

router.post('/subscriptions', requireAuth, async (req, res) => {
  try {
    const { planId, preferredBreakfast = 'Mixed Fruit Bowl', slotId = 'morning', startDate } = req.body || {};
    const plans = await listPlans();
    const plan = plans.find((p) => p.id === planId);
    if (!plan) {
      return res.status(404).json({ error: 'Subscription plan not found.' });
    }

    const slots = await listSlots();
    const slot = slots.find((s) => s.id === slotId) || slots[0] || {
      id: 'morning',
      name: 'Morning Slot',
      window: '6:30 AM – 9:00 AM',
    };

    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const subscription = await createSubscriptionRecord({
      userId: req.user.id,
      planId: plan.id,
      planName: plan.name,
      days: plan.days,
      remainingDeliveries: plan.days,
      price: plan.price,
      preferredBreakfast: String(preferredBreakfast).trim(),
      slotId: slot.id,
      slotLabel: `${slot.name} (${slot.window})`,
      startDate: startDate || tomorrow,
      status: 'active',
    });

    await sendUserNotification({
      userId: req.user.id,
      email: req.user.email,
      type: 'order',
      title: `Breakfast Subscription Activated (${plan.name})`,
      message: `Your ${plan.name} (${plan.days} days) starts on ${subscription.startDate} (${subscription.slotLabel}) with ${subscription.preferredBreakfast}.`,
    });

    return res.status(201).json({ subscription });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Could not create subscription.' });
  }
});

router.patch('/subscriptions/:id/toggle', requireAuth, async (req, res) => {
  try {
    const updated = await toggleSubscriptionStatus(req.params.id, req.user.id);
    if (!updated) {
      return res.status(404).json({ error: 'Subscription not found.' });
    }
    return res.json({ subscription: updated });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Could not update subscription.' });
  }
});

export default router;
