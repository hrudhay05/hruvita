import crypto from 'crypto';
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { GroupDrop } from '../models/GroupDrop.js';
import {
  createOrderRecord,
  getDbStatus,
  getProductById,
  listSlots,
  listAddressesByUser,
} from '../store/repository.js';
import { emitOrderCreated } from '../services/realtimeService.js';
import { emitToAdmins } from '../utils/socketServer.js';
import { notifyAdmins } from '../utils/adminNotifier.js';

const router = Router();
const memGroupDrops = [];

function stripDoc(doc) {
  if (!doc) return null;
  const plain = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  delete plain._id;
  delete plain.__v;
  return plain;
}

function isMongoLive() {
  return Boolean(getDbStatus()?.mongoConnected);
}

function generateDropCode() {
  return `GRP-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function recomputeDropTotals(drop) {
  const participants = Array.isArray(drop.participants) ? drop.participants : [];
  let totalAmount = 0;
  for (const p of participants) {
    const items = Array.isArray(p.items) ? p.items : [];
    p.subtotal = items.reduce((s, it) => s + Number(it.lineTotal || 0), 0);
    totalAmount += p.subtotal;
  }
  drop.totalAmount = totalAmount;
  return drop;
}

async function findDropByCode(code) {
  const clean = String(code || '').trim().toUpperCase();
  if (isMongoLive()) {
    const doc = await GroupDrop.findOne({ code: clean }).lean();
    return stripDoc(doc);
  }
  const found = memGroupDrops.find((d) => d.code === clean);
  return found ? { ...found, participants: [...(found.participants || [])] } : null;
}

async function saveDrop(drop) {
  recomputeDropTotals(drop);
  if (isMongoLive()) {
    const updated = await GroupDrop.findOneAndUpdate(
      { code: drop.code },
      { $set: drop },
      { new: true, upsert: true }
    ).lean();
    return stripDoc(updated);
  }
  const idx = memGroupDrops.findIndex((d) => d.code === drop.code);
  const copy = { ...drop, updatedAt: new Date().toISOString() };
  if (idx === -1) {
    copy.createdAt = copy.createdAt || copy.updatedAt;
    memGroupDrops.unshift(copy);
  } else {
    memGroupDrops[idx] = copy;
  }
  return { ...copy };
}

router.get('/my', requireAuth, async (req, res) => {
  const uid = req.user.id;
  if (isMongoLive()) {
    const docs = await GroupDrop.find({
      $or: [{ hostUserId: uid }, { 'participants.userId': uid }],
    })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();
    return res.json({ groupDrops: docs.map(stripDoc) });
  }
  const list = memGroupDrops.filter(
    (d) => d.hostUserId === uid || (d.participants || []).some((p) => p.userId === uid)
  );
  return res.json({ groupDrops: list });
});

router.get('/:code', async (req, res) => {
  const drop = await findDropByCode(req.params.code);
  if (!drop) return res.status(404).json({ error: 'Group Drop not found.' });
  return res.json({ groupDrop: drop });
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const {
      title,
      dropType = 'office',
      addressId = '',
      customAddress = null,
      scheduledDate,
      slotId = 'morning',
      cutoffNote = 'Add your items before 10:00 PM tonight',
    } = req.body || {};

    if (!title || String(title).trim().length < 3) {
      return res.status(400).json({ error: 'Please enter a Group Drop title (at least 3 characters).' });
    }

    let address = null;
    if (addressId) {
      const addrs = await listAddressesByUser(req.user.id);
      const picked = addrs.find((a) => a.id === addressId);
      if (picked) {
        address = {
          label: picked.label || 'Drop Location',
          recipient: picked.recipient || req.user.fullName || req.user.name || 'Host',
          phone: picked.phone || req.user.mobileNumber || req.user.phone || '9999999999',
          line1: picked.line1 || picked.street || '',
          area: picked.area || '',
          city: picked.city || 'Hyderabad',
          pincode: picked.pincode || '',
        };
      }
    }
    if (!address && customAddress?.line1 && customAddress?.pincode) {
      address = {
        label: customAddress.label || (dropType === 'family' ? 'Family Home' : 'Office Drop'),
        recipient: customAddress.recipient || req.user.fullName || req.user.name || 'Host',
        phone: customAddress.phone || req.user.mobileNumber || req.user.phone || '9999999999',
        line1: String(customAddress.line1).trim(),
        area: String(customAddress.area || '').trim(),
        city: String(customAddress.city || 'Hyderabad').trim(),
        pincode: String(customAddress.pincode).trim(),
      };
    }
    if (!address || !address.line1) {
      return res.status(400).json({ error: 'Please select or enter a delivery address for the group drop.' });
    }

    const slots = await listSlots();
    const slot = slots.find((s) => s.id === slotId) || slots[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const drop = {
      code: generateDropCode(),
      title: String(title).trim(),
      dropType: dropType === 'family' ? 'family' : 'office',
      hostUserId: req.user.id,
      hostName: req.user.fullName || req.user.name || 'Host',
      hostPhone: req.user.mobileNumber || req.user.phone || '',
      hostEmail: req.user.email || '',
      address,
      scheduledDate: scheduledDate || tomorrow,
      slotId: slot?.id || 'morning',
      slotLabel: slot ? `${slot.name} (${slot.window})` : 'Morning Slot (6:30 AM – 9:00 AM)',
      cutoffNote: String(cutoffNote || '').trim(),
      status: 'open',
      participants: [],
      totalAmount: 0,
      createdOrderId: '',
    };

    const saved = await saveDrop(drop);
    return res.status(201).json({ groupDrop: saved });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Could not create Group Drop.' });
  }
});

router.post('/:code/items', requireAuth, async (req, res) => {
  try {
    const drop = await findDropByCode(req.params.code);
    if (!drop) return res.status(404).json({ error: 'Group Drop not found.' });
    if (drop.status !== 'open') {
      return res.status(400).json({ error: 'This Group Drop is already placed or closed.' });
    }

    const { productId, qty = 1, note = '', memberName = '' } = req.body || {};
    const product = await getProductById(productId);
    if (!product || product.active === false) {
      return res.status(404).json({ error: 'Product not found or unavailable.' });
    }

    const cleanQty = Math.max(1, Math.min(20, Number(qty) || 1));
    const displayName = String(memberName || req.user.fullName || req.user.name || 'Member').trim();
    const participants = Array.isArray(drop.participants) ? [...drop.participants] : [];
    let part = participants.find((p) => p.userId === req.user.id);
    if (!part) {
      part = {
        userId: req.user.id,
        name: displayName,
        phone: req.user.mobileNumber || req.user.phone || '',
        items: [],
        subtotal: 0,
      };
      participants.push(part);
    } else if (memberName) {
      part.name = displayName;
    }

    part.items = Array.isArray(part.items) ? [...part.items] : [];
    part.items.push({
      id: `gdi-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`,
      productId: product.id,
      name: product.name,
      emoji: product.emoji || '🍲',
      image: product.image || '',
      qty: cleanQty,
      unitPrice: Number(product.price || 0),
      mrp: Number(product.mrp ?? product.price ?? 0),
      lineTotal: Number(product.price || 0) * cleanQty,
      note: String(note || '').trim(),
      addedAt: new Date().toISOString(),
    });

    drop.participants = participants;
    const saved = await saveDrop(drop);
    return res.json({ groupDrop: saved });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Could not add item to Group Drop.' });
  }
});

router.delete('/:code/items/:itemId', requireAuth, async (req, res) => {
  const drop = await findDropByCode(req.params.code);
  if (!drop) return res.status(404).json({ error: 'Group Drop not found.' });
  if (drop.status !== 'open') {
    return res.status(400).json({ error: 'This Group Drop is already placed or closed.' });
  }

  const isHost = drop.hostUserId === req.user.id;
  const nextParticipants = [];
  let removed = false;

  for (const p of drop.participants || []) {
    const canEdit = isHost || p.userId === req.user.id;
    const filteredItems = (p.items || []).filter((it) => {
      if (it.id === req.params.itemId && canEdit) {
        removed = true;
        return false;
      }
      return true;
    });
    if (filteredItems.length > 0) {
      nextParticipants.push({ ...p, items: filteredItems });
    }
  }

  if (!removed) {
    return res.status(404).json({ error: 'Item not found or you cannot remove it.' });
  }

  drop.participants = nextParticipants;
  const saved = await saveDrop(drop);
  return res.json({ groupDrop: saved });
});

router.post('/:code/place-order', requireAuth, async (req, res) => {
  try {
    const drop = await findDropByCode(req.params.code);
    if (!drop) return res.status(404).json({ error: 'Group Drop not found.' });
    if (drop.hostUserId !== req.user.id) {
      return res.status(403).json({ error: 'Only the Group Drop host can place the combined order.' });
    }
    if (drop.status !== 'open') {
      return res.status(400).json({ error: 'This Group Drop has already been placed.' });
    }

    const mergedMap = new Map();
    const breakdownNotes = [];
    for (const p of drop.participants || []) {
      const pLabels = [];
      for (const it of p.items || []) {
        pLabels.push(`${it.name} x${it.qty}${it.note ? ` (${it.note})` : ''}`);
        const prev = mergedMap.get(it.productId);
        if (prev) {
          prev.qty += it.qty;
          prev.lineTotal += it.lineTotal;
        } else {
          mergedMap.set(it.productId, {
            productId: it.productId,
            name: it.name,
            emoji: it.emoji || '🍲',
            image: it.image || '',
            qty: it.qty,
            unitPrice: Number(it.unitPrice || 0),
            mrp: Number(it.mrp ?? it.unitPrice ?? 0),
            lineTotal: Number(it.lineTotal || 0),
          });
        }
      }
      if (pLabels.length > 0) {
        breakdownNotes.push(`${p.name}: ${pLabels.join(', ')}`);
      }
    }

    const items = Array.from(mergedMap.values());
    if (items.length === 0) {
      return res.status(400).json({ error: 'Add at least one item before placing the Group Drop order.' });
    }

    const subtotal = items.reduce((s, it) => s + Number(it.lineTotal || 0), 0);
    const orderId = `HRV-${Date.now().toString().slice(-6)}`;
    const nowIso = new Date().toISOString();
    const hostPhone = drop.address?.phone || drop.hostPhone || req.user.mobileNumber || req.user.phone || '9999999999';
    const hostRecipient = drop.address?.recipient || drop.hostName || req.user.fullName || req.user.name || 'Host';

    const order = await createOrderRecord({
      id: orderId,
      userId: req.user.id,
      customerName: `${drop.title} (Group Drop • ${drop.hostName})`,
      customerEmail: drop.hostEmail || req.user.email,
      customerPhone: hostPhone,
      address: {
        label: drop.address?.label || 'Drop Location',
        recipient: hostRecipient,
        phone: hostPhone,
        line1: drop.address?.line1 || 'Group Drop Location',
        area: drop.address?.area || '',
        city: drop.address?.city || 'Hyderabad',
        pincode: drop.address?.pincode || '500001',
        notes: `Group Drop ${drop.code} | ${breakdownNotes.join(' | ')}`,
      },
      slotId: drop.slotId,
      slotLabel: drop.slotLabel,
      scheduledDate: drop.scheduledDate,
      items,
      pricing: {
        subtotal,
        deliveryCharge: 0,
        taxAmount: 0,
        couponDiscount: 0,
        rewardPointsUsed: 0,
        grandTotal: subtotal,
      },
      paymentMethod: 'cod',
      originalPaymentMethod: 'COD',
      currentPaymentMethod: 'COD',
      paymentStatus: 'pending',
      status: 'confirmed',
      deliveryStatus: 'unassigned',
      statusHistory: [
        {
          status: 'confirmed',
          note: `Group Morning Drop (${drop.code}) placed with ₹0 delivery fee`,
          by: req.user.email,
          at: nowIso,
        },
      ],
    });

    drop.status = 'placed';
    drop.createdOrderId = order.id;
    const saved = await saveDrop(drop);

    emitOrderCreated(order);
    emitToAdmins('order:created', { orderId: order.id });
    notifyAdmins({
      dedupKey: `group-drop-${drop.code}`,
      category: 'order',
      title: `New Group Morning Drop: ${order.id}`,
      description: `${drop.title} (${drop.participants.length} members, ₹${subtotal}, ₹0 delivery)`,
      entityType: 'order',
      entityId: order.id,
    }).catch(() => { });

    return res.status(201).json({ groupDrop: saved, order });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Could not place Group Drop order.' });
  }
});

export default router;
