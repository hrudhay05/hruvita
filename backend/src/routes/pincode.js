import { Router } from 'express';
import mongoose from 'mongoose';
import { PincodeWaitlist } from '../models/PincodeWaitlist.js';
import { getSettings, updateSettings } from '../store/repository.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
const DEFAULT_PINCODES = ['500001', '500032', '500033', '500034', '500081', '500082', '500084', '505468'];
const memWaitlist = [];

function getActivePincodes(settings) {
  const raw = Array.isArray(settings?.serviceablePincodes) && settings.serviceablePincodes.length
    ? settings.serviceablePincodes
    : DEFAULT_PINCODES;
  return [...new Set(raw.map((p) => String(p).trim()).filter((p) => /^\d{6}$/.test(p)))];
}

router.get('/check', async (req, res) => {
  const pincode = String(req.query.code || req.query.pincode || '').trim();
  if (!/^\d{6}$/.test(pincode)) {
    return res.status(400).json({ error: 'Please enter a valid 6-digit pincode.' });
  }

  const settings = await getSettings();
  const active = getActivePincodes(settings);
  const serviceable = active.includes(pincode);
  const city = settings.city || 'Hyderabad';

  return res.json({
    pincode,
    serviceable,
    city,
    etaText: serviceable ? 'Morning 6:00 AM – 9:00 AM fresh delivery available' : '',
    message: serviceable
      ? `Great news! We deliver fresh to ${pincode} (${city}).`
      : `We haven't launched in ${pincode} yet — join our expansion waitlist to unlock it next!`,
  });
});

router.post('/waitlist', async (req, res) => {
  try {
    const { pincode, area = '', name = '', email = '', phone = '' } = req.body || {};
    const pinClean = String(pincode || '').trim();
    if (!/^\d{6}$/.test(pinClean)) {
      return res.status(400).json({ error: 'Please enter a valid 6-digit pincode.' });
    }
    const emailClean = String(email || '').trim().toLowerCase();
    const phoneClean = String(phone || '').trim();
    if (!emailClean && !phoneClean) {
      return res.status(400).json({ error: 'Please provide your email or phone number so we can notify you.' });
    }

    if (mongoose.connection.readyState === 1) {
      const existing = await PincodeWaitlist.findOne({
        pincode: pinClean,
        ...(emailClean ? { email: emailClean } : { phone: phoneClean }),
      }).lean();
      if (!existing) {
        await PincodeWaitlist.create({
          pincode: pinClean,
          area: String(area).trim().slice(0, 100),
          name: String(name).trim().slice(0, 80),
          email: emailClean,
          phone: phoneClean,
          userId: req.user?.id || null,
        });
      }
      const waitlistCount = await PincodeWaitlist.countDocuments({ pincode: pinClean });
      return res.status(201).json({
        joined: true,
        pincode: pinClean,
        waitlistCount,
        message: `Added to ${pinClean} expansion waitlist! (${waitlistCount} resident${waitlistCount === 1 ? '' : 's'} waiting)`,
      });
    }

    const dup = memWaitlist.find(
      (w) => w.pincode === pinClean && ((emailClean && w.email === emailClean) || (phoneClean && w.phone === phoneClean))
    );
    if (!dup) {
      memWaitlist.push({
        id: `wl-${Date.now()}`,
        pincode: pinClean,
        area: String(area).trim(),
        name: String(name).trim(),
        email: emailClean,
        phone: phoneClean,
        status: 'waiting',
        createdAt: new Date().toISOString(),
      });
    }
    const waitlistCount = memWaitlist.filter((w) => w.pincode === pinClean).length;
    return res.status(201).json({
      joined: true,
      pincode: pinClean,
      waitlistCount,
      message: `Added to ${pinClean} expansion waitlist! (${waitlistCount} resident${waitlistCount === 1 ? '' : 's'} waiting)`,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Could not join waitlist.' });
  }
});

router.get('/admin/overview', requireAuth, requireRole('admin', 'staff'), async (_req, res) => {
  const settings = await getSettings();
  const serviceablePincodes = getActivePincodes(settings);

  const entries =
    mongoose.connection.readyState === 1
      ? await PincodeWaitlist.find().sort({ createdAt: -1 }).limit(300).lean()
      : [...memWaitlist].reverse();

  const demandMap = new Map();
  for (const e of entries) {
    const cur = demandMap.get(e.pincode) || { pincode: e.pincode, area: e.area || '', count: 0 };
    cur.count += 1;
    if (!cur.area && e.area) cur.area = e.area;
    demandMap.set(e.pincode, cur);
  }
  const demandSummary = [...demandMap.values()].sort((a, b) => b.count - a.count);

  return res.json({
    serviceablePincodes,
    demandSummary,
    recentEntries: entries.slice(0, 50).map((e) => ({
      id: String(e._id || e.id),
      pincode: e.pincode,
      area: e.area,
      name: e.name,
      email: e.email,
      phone: e.phone,
      createdAt: e.createdAt,
    })),
  });
});

router.put('/admin/serviceable', requireAuth, requireRole('admin'), async (req, res) => {
  const raw = Array.isArray(req.body?.pincodes) ? req.body.pincodes : [];
  const clean = [...new Set(raw.map((p) => String(p).trim()).filter((p) => /^\d{6}$/.test(p)))];
  if (clean.length === 0) {
    return res.status(400).json({ error: 'Provide at least one valid 6-digit pincode.' });
  }
  await updateSettings({ serviceablePincodes: clean });
  return res.json({ serviceablePincodes: clean });
});

export default router;
