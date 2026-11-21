import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  getVapidPublicKey,
  savePushSubscription,
  removePushSubscription,
  listUserPushSubscriptions,
  sendPushToUser,
  broadcastPush,
} from '../utils/webPushService.js';

const router = Router();

router.get('/vapid-public-key', async (_req, res) => {
  const publicKey = await getVapidPublicKey();
  return res.json({ publicKey });
});

router.get('/status', requireAuth, async (req, res) => {
  const subs = await listUserPushSubscriptions(req.user.id);
  return res.json({
    subscriptions: subs.map((s) => ({
      id: s.id,
      endpoint: s.endpoint,
      deviceName: s.deviceName,
      createdAt: s.createdAt,
    })),
  });
});

router.post('/subscribe', requireAuth, async (req, res) => {
  try {
    const { subscription, deviceName = 'Browser Device' } = req.body || {};
    const saved = await savePushSubscription(req.user.id, subscription, {
      deviceName,
      userAgent: req.headers['user-agent'] || '',
    });
    return res.status(201).json({ subscribed: true, subscription: saved });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Could not save push subscription.' });
  }
});

router.post('/unsubscribe', requireAuth, async (req, res) => {
  const endpoint = String(req.body?.endpoint || '').trim();
  const removed = await removePushSubscription(req.user.id, endpoint);
  return res.json({ unsubscribed: removed });
});

router.post('/test', requireAuth, async (req, res) => {
  const result = await sendPushToUser(req.user.id, {
    title: 'HRUVITA Push Alerts Active! 🍓',
    body: 'You will now receive instant alerts for order updates & morning delivery.',
    url: '/account?section=orders',
    tag: 'hruvita-test',
  });
  return res.json(result);
});

router.post('/admin/broadcast', requireAuth, requireRole('admin'), async (req, res) => {
  const { title, body, url = '/menu' } = req.body || {};
  if (!title || !body) {
    return res.status(400).json({ error: 'Title and body are required for push broadcast.' });
  }
  const result = await broadcastPush({ title, body, url });
  return res.json(result);
});

export default router;
