import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import * as webpush from 'web-push';
import { PushSubscription } from '../models/PushSubscription.js';
import { BusinessSettings } from '../models/BusinessSettings.js';

const VAPID_FALLBACK_FILE = path.resolve(process.cwd(), '.vapid-keys.json');
const memSubscriptions = [];
let cachedKeys = null;
let vapidConfigured = false;

async function ensureVapidKeys() {
  if (cachedKeys) return cachedKeys;

  const envPub = process.env.VAPID_PUBLIC_KEY?.trim();
  const envPriv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (envPub && envPriv) {
    cachedKeys = { publicKey: envPub, privateKey: envPriv };
  } else if (mongoose.connection.readyState === 1) {
    const doc = await BusinessSettings.findOne({ key: 'default' }).lean();
    if (doc?.vapidPublicKey && doc?.vapidPrivateKey) {
      cachedKeys = { publicKey: doc.vapidPublicKey, privateKey: doc.vapidPrivateKey };
    } else {
      const generated = webpush.generateVAPIDKeys();
      await BusinessSettings.findOneAndUpdate(
        { key: 'default' },
        { $set: { vapidPublicKey: generated.publicKey, vapidPrivateKey: generated.privateKey } },
        { upsert: true }
      );
      cachedKeys = generated;
    }
  } else {
    try {
      if (fs.existsSync(VAPID_FALLBACK_FILE)) {
        const raw = JSON.parse(fs.readFileSync(VAPID_FALLBACK_FILE, 'utf8'));
        if (raw.publicKey && raw.privateKey) cachedKeys = raw;
      }
    } catch {
      // ignore
    }
    if (!cachedKeys) {
      cachedKeys = webpush.generateVAPIDKeys();
      try {
        fs.writeFileSync(VAPID_FALLBACK_FILE, JSON.stringify(cachedKeys, null, 2));
      } catch {
        // ignore read-only fs
      }
    }
  }

  if (!vapidConfigured) {
    const contactEmail = process.env.VAPID_SUBJECT || 'mailto:support@hruvita.com';
    webpush.setVapidDetails(contactEmail, cachedKeys.publicKey, cachedKeys.privateKey);
    vapidConfigured = true;
  }

  return cachedKeys;
}

export async function getVapidPublicKey() {
  const keys = await ensureVapidKeys();
  return keys.publicKey;
}

export async function savePushSubscription(userId, subscription, { deviceName = 'Browser Device', userAgent = '' } = {}) {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    throw new Error('Invalid push subscription payload.');
  }

  if (mongoose.connection.readyState === 1) {
    const doc = await PushSubscription.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      {
        $set: {
          userId,
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
          deviceName: String(deviceName || 'Browser Device').slice(0, 80),
          userAgent: String(userAgent || '').slice(0, 250),
        },
      },
      { upsert: true, new: true }
    ).lean();
    return {
      id: String(doc._id),
      endpoint: doc.endpoint,
      deviceName: doc.deviceName,
      createdAt: doc.createdAt,
    };
  }

  const idx = memSubscriptions.findIndex((s) => s.endpoint === subscription.endpoint);
  const entry = {
    id: `ps-${Date.now()}`,
    userId,
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
    deviceName: String(deviceName || 'Browser Device').slice(0, 80),
    userAgent: String(userAgent || '').slice(0, 250),
    createdAt: new Date().toISOString(),
  };
  if (idx >= 0) memSubscriptions[idx] = entry;
  else memSubscriptions.push(entry);
  return entry;
}

export async function removePushSubscription(userId, endpoint) {
  if (!endpoint) return false;
  if (mongoose.connection.readyState === 1) {
    const res = await PushSubscription.deleteOne({ userId, endpoint });
    return res.deletedCount > 0;
  }
  const idx = memSubscriptions.findIndex((s) => s.userId === userId && s.endpoint === endpoint);
  if (idx >= 0) {
    memSubscriptions.splice(idx, 1);
    return true;
  }
  return false;
}

export async function listUserPushSubscriptions(userId) {
  if (!userId) return [];
  if (mongoose.connection.readyState === 1) {
    const docs = await PushSubscription.find({ userId }).sort({ createdAt: -1 }).lean();
    return docs.map((d) => ({
      id: String(d._id),
      endpoint: d.endpoint,
      keys: d.keys,
      deviceName: d.deviceName,
      createdAt: d.createdAt,
    }));
  }
  return memSubscriptions.filter((s) => s.userId === userId);
}

export async function sendPushToUser(userId, payload = {}) {
  try {
    const subs = await listUserPushSubscriptions(userId);
    if (!subs.length) return { sent: 0, total: 0 };

    await ensureVapidKeys();
    const bodyStr = JSON.stringify({
      title: payload.title || 'HRUVITA',
      body: payload.body || 'You have a new update.',
      url: payload.url || '/account?section=orders',
      tag: payload.tag || 'hruvita-update',
    });

    let sent = 0;
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys },
            bodyStr
          );
          sent += 1;
        } catch (err) {
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await removePushSubscription(userId, sub.endpoint);
          }
        }
      })
    );
    return { sent, total: subs.length };
  } catch {
    return { sent: 0, total: 0 };
  }
}

export async function broadcastPush(payload = {}) {
  await ensureVapidKeys();
  const subs =
    mongoose.connection.readyState === 1
      ? await PushSubscription.find().lean()
      : [...memSubscriptions];

  if (!subs.length) return { sent: 0, total: 0 };
  const bodyStr = JSON.stringify({
    title: payload.title || 'HRUVITA',
    body: payload.body || 'Fresh update from HRUVITA!',
    url: payload.url || '/menu',
    tag: payload.tag || 'hruvita-broadcast',
  });

  let sent = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, bodyStr);
        sent += 1;
      } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await removePushSubscription(sub.userId, sub.endpoint);
        }
      }
    })
  );
  return { sent, total: subs.length };
}
