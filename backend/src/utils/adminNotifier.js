import { AdminNotification } from '../models/AdminNotification.js';
import { emitNotificationCreated } from '../services/realtimeService.js';

const memAdminNotifications = [];

/**
 * Create a deduplicated operational notification for Owner/Admin/Admin Analyst.
 * Non-blocking and safe for both MongoDB and in-memory fallback modes.
 */
export async function notifyAdmins({
  dedupKey = '',
  category = 'order',
  title,
  description,
  entityType = '',
  entityId = '',
}) {
  try {
    const id = `ANOT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6)}`;
    if (dedupKey) {
      const existing = await AdminNotification.findOne({ dedupKey }).lean().catch(() => null);
      if (existing) return existing;
      if (memAdminNotifications.some((n) => n.dedupKey === dedupKey)) return null;
    }

    const doc = {
      id,
      ...(dedupKey ? { dedupKey } : {}),
      category,
      title: String(title || 'System Alert'),
      description: String(description || ''),
      entityType,
      entityId,
      readBy: [],
      createdAt: new Date().toISOString(),
    };

    try {
      await AdminNotification.create(doc);
    } catch {
      memAdminNotifications.unshift(doc);
      if (memAdminNotifications.length > 200) memAdminNotifications.pop();
    }
    emitNotificationCreated(doc, 'admin');
    return doc;
  } catch {
    return null;
  }
}

export async function listAdminNotifications(userId, { category = '', unreadOnly = false, limit = 50 } = {}) {
  let rows = [];
  try {
    const query = category ? { category } : {};
    rows = await AdminNotification.find(query).sort({ createdAt: -1 }).limit(limit).lean();
  } catch {
    rows = memAdminNotifications.filter((n) => !category || n.category === category).slice(0, limit);
  }

  const mapped = rows.map((n) => ({
    id: n.id,
    category: n.category,
    title: n.title,
    description: n.description,
    entityType: n.entityType || '',
    entityId: n.entityId || '',
    read: Array.isArray(n.readBy) && userId ? n.readBy.includes(userId) : false,
    createdAt: n.createdAt,
  }));

  const filtered = unreadOnly ? mapped.filter((n) => !n.read) : mapped;
  const unreadCount = mapped.filter((n) => !n.read).length;
  return { notifications: filtered, unreadCount };
}

export async function markAdminNotificationRead(id, userId) {
  if (!userId) return;
  try {
    await AdminNotification.updateOne({ id }, { $addToSet: { readBy: userId } });
  } catch {
    const row = memAdminNotifications.find((n) => n.id === id);
    if (row && !row.readBy.includes(userId)) row.readBy.push(userId);
  }
}

export async function markAllAdminNotificationsRead(userId) {
  if (!userId) return;
  try {
    await AdminNotification.updateMany({}, { $addToSet: { readBy: userId } });
  } catch {
    for (const row of memAdminNotifications) {
      if (!row.readBy.includes(userId)) row.readBy.push(userId);
    }
  }
}
