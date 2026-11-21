import crypto from 'crypto';
import { Router } from 'express';
import { ContactMessage } from '../models/ContactMessage.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getDbStatus } from '../store/repository.js';
import { notifyAdmins } from '../utils/adminNotifier.js';
import { emitToAdmins } from '../utils/socketServer.js';

const router = Router();
const memMessages = [];

function isMongoLive() {
  return Boolean(getDbStatus()?.mongoConnected);
}

function stripDoc(doc) {
  if (!doc) return null;
  const plain = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  delete plain._id;
  delete plain.__v;
  return plain;
}

router.post('/', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const message = String(req.body?.message || '').trim();

    if (name.length < 2) {
      return res.status(400).json({ error: 'Please enter your name.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (message.length < 5) {
      return res.status(400).json({ error: 'Please enter a message (at least 5 characters).' });
    }

    const nowIso = new Date().toISOString();
    const record = {
      id: `msg-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`,
      name,
      email,
      message,
      status: 'open',
      adminNote: '',
      resolvedBy: '',
      resolvedAt: '',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    let saved;
    if (isMongoLive()) {
      const created = await ContactMessage.create(record);
      saved = stripDoc(created);
    } else {
      memMessages.unshift(record);
      saved = { ...record };
    }

    emitToAdmins('contact:new-message', { contactMessage: saved });
    notifyAdmins({
      dedupKey: `contact-${saved.id}`,
      category: 'order',
      title: `New Contact Message from ${name}`,
      description: message.slice(0, 120),
      entityType: 'contact',
      entityId: saved.id,
    }).catch(() => {});

    return res.status(201).json({ saved: true, contactMessage: saved });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Could not send message.' });
  }
});

router.get('/admin', requireAuth, requireRole('admin', 'staff'), async (_req, res) => {
  if (isMongoLive()) {
    const docs = await ContactMessage.find().sort({ createdAt: -1 }).limit(100).lean();
    return res.json({ messages: docs.map(stripDoc) });
  }
  return res.json({ messages: memMessages });
});

router.patch('/admin/:id', requireAuth, requireRole('admin', 'staff'), async (req, res) => {
  const status = req.body?.status === 'open' ? 'open' : 'resolved';
  const adminNote = req.body?.adminNote !== undefined ? String(req.body.adminNote).trim() : undefined;
  const nowIso = new Date().toISOString();

  if (isMongoLive()) {
    const updateObj = {
      status,
      resolvedBy: status === 'resolved' ? req.user.email : '',
      resolvedAt: status === 'resolved' ? nowIso : '',
      ...(adminNote !== undefined ? { adminNote } : {}),
    };
    const updated = await ContactMessage.findOneAndUpdate(
      { id: req.params.id },
      { $set: updateObj },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ error: 'Message not found.' });
    return res.json({ contactMessage: stripDoc(updated) });
  }

  const idx = memMessages.findIndex((m) => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Message not found.' });
  memMessages[idx] = {
    ...memMessages[idx],
    status,
    resolvedBy: status === 'resolved' ? req.user.email : '',
    resolvedAt: status === 'resolved' ? nowIso : '',
    ...(adminNote !== undefined ? { adminNote } : {}),
    updatedAt: nowIso,
  };
  return res.json({ contactMessage: { ...memMessages[idx] } });
});

router.delete('/admin/:id', requireAuth, requireRole('admin'), async (req, res) => {
  if (isMongoLive()) {
    const resDel = await ContactMessage.findOneAndDelete({ id: req.params.id }).lean();
    if (!resDel) return res.status(404).json({ error: 'Message not found.' });
    return res.json({ deleted: true });
  }
  const idx = memMessages.findIndex((m) => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Message not found.' });
  memMessages.splice(idx, 1);
  return res.json({ deleted: true });
});

export default router;
