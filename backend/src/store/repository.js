import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Address } from '../models/Address.js';
import { EmailVerification } from '../models/EmailVerification.js';
import { RefreshSession } from '../models/RefreshSession.js';
import { Category } from '../models/Category.js';
import { Product } from '../models/Product.js';
import { SubscriptionPlan } from '../models/SubscriptionPlan.js';
import { BusinessSettings } from '../models/BusinessSettings.js';
import { AuditLog } from '../models/AuditLog.js';
import { Order, ORDER_STATUSES } from '../models/Order.js';
import { Payment } from '../models/Payment.js';
import { Coupon } from '../models/Coupon.js';
import { CouponRedemption } from '../models/CouponRedemption.js';
import { DeliverySlot } from '../models/DeliverySlot.js';
import { Notification } from '../models/Notification.js';
import { Review } from '../models/Review.js';
import { Subscription } from '../models/Subscription.js';
import { Conversation } from '../models/Conversation.js';
import { AutomationLog } from '../models/AutomationLog.js';
import { Ingredient } from '../models/Ingredient.js';
import { InventoryLog } from '../models/InventoryLog.js';
import { Combo } from '../models/Combo.js';
import { Referral } from '../models/Referral.js';
import { computeCustomBowlPrice, bowlOptions } from '../data/bowlOptions.js';
import {
  initialSettings,
  initialCategories,
  initialProducts,
  initialPlans,
  initialSlots,
  initialCoupons,
  initialIngredients,
  initialCombos,
  buildInitialUsers,
  initialAddresses,
} from '../data/seedData.js';

let mongoConnected = false;

const mem = {
  settings: { ...initialSettings },
  categories: initialCategories.map((c) => ({ ...c })),
  products: initialProducts.map((p) => ({ ...p })),
  plans: initialPlans.map((p) => ({ ...p })),
  slots: initialSlots.map((s) => ({ ...s })),
  coupons: initialCoupons.map((c) => ({ ...c })),
  ingredients: initialIngredients.map((i) => ({ ...i })),
  combos: initialCombos.map((c) => ({ ...c })),
  inventoryLogs: [],
  referrals: [],
  users: buildInitialUsers(),
  addresses: initialAddresses.map((a) => ({
    ...a,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })),
  emailVerifications: [],
  refreshSessions: [],
  orders: [],
  payments: [],
  couponRedemptions: [],
  reviews: [],
  subscriptions: [],
  conversations: [],
  automationLogs: [],
  notifications: [
    {
      id: 'notif-seed-1',
      userId: 'u-customer',
      type: 'welcome',
      title: 'Welcome to HRUVITA!',
      message: 'Your account is active. Enjoy 20% OFF your first order with code WELCOME20.',
      emailSent: true,
      read: false,
      createdAt: new Date().toISOString(),
    },
  ],
  auditLogs: [],
};

export async function initDatabase() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    mongoConnected = false;
    console.log('[DB] MONGODB_URI not set — running with seeded in-memory store (zero-config dev mode).');
    return { mode: 'memory' };
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10,
      minPoolSize: 2,
    });
    mongoConnected = true;
    console.log('[DB] Connected to MongoDB Atlas.');
    await seedMongoIfNeeded();
    return { mode: 'mongodb' };
  } catch (err) {
    mongoConnected = false;
    console.warn(`[DB] MongoDB connection failed (${err.message}) — falling back to seeded in-memory store.`);
    return { mode: 'memory', warning: err.message };
  }
}

export function getDbStatus() {
  return {
    mode: mongoConnected ? 'mongodb' : 'memory',
    connected: true,
  };
}

async function seedMongoIfNeeded() {
  if ((await BusinessSettings.countDocuments()) === 0) await BusinessSettings.create(initialSettings);
  if ((await Category.countDocuments()) === 0) await Category.insertMany(initialCategories);
  if ((await Product.countDocuments()) === 0) await Product.insertMany(initialProducts);
  if ((await SubscriptionPlan.countDocuments()) === 0) await SubscriptionPlan.insertMany(initialPlans);
  if ((await DeliverySlot.countDocuments()) === 0) await DeliverySlot.insertMany(initialSlots);
  if ((await Coupon.countDocuments()) === 0) await Coupon.insertMany(initialCoupons);
  if ((await Ingredient.countDocuments()) === 0) await Ingredient.insertMany(initialIngredients);
  if ((await Combo.countDocuments()) === 0) await Combo.insertMany(initialCombos);

  const initialUsers = buildInitialUsers();
  for (const u of initialUsers) {
    const existing = await User.findOne({ $or: [{ email: u.email }, { id: u.id }] })
      .select('+password')
      .lean();
    if (!existing) {
      await User.create(u);
    } else if (!existing.password || !existing.fullName) {
      await User.updateOne(
        { id: existing.id },
        {
          $set: {
            fullName: existing.fullName || existing.name || u.fullName,
            name: existing.name || existing.fullName || u.name,
            password: existing.password || existing.passwordHash || u.password,
            isEmailVerified: true,
            isProfileCompleted: true,
            username: existing.username || u.username,
            mobileNumber: existing.mobileNumber || u.mobileNumber,
          },
        }
      );
    }
  }

  if ((await Address.countDocuments()) === 0) {
    await Address.insertMany(initialAddresses);
  }
}

function stripMongo(doc) {
  if (!doc) return null;
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  delete obj._id;
  delete obj.__v;
  return obj;
}

export function formatAddressForLegacy(addr) {
  if (!addr) return null;
  const lineParts = [addr.doorNumber, addr.apartmentName, addr.street, addr.locality].filter(Boolean);
  return {
    ...addr,
    label: addr.addressLabel || addr.label || 'Home',
    recipient: addr.recipientName || addr.recipient || '',
    phone: addr.mobileNumber || addr.phone || '',
    line1: lineParts.join(', ') || addr.line1 || addr.area || '',
    city: addr.district || addr.city || 'Hyderabad',
    notes: addr.deliveryInstructions || addr.notes || '',
  };
}

export async function sanitizeUser(user) {
  if (!user) return null;
  const clean = stripMongo(user);
  delete clean.password;
  delete clean.passwordHash;
  delete clean.resetPasswordTokenHash;
  delete clean.resetPasswordExpiresAt;
  clean.fullName = clean.fullName || clean.name || 'Customer';
  clean.name = clean.name || clean.fullName;
  clean.mobileNumber = clean.mobileNumber || clean.phone || '';
  clean.phone = clean.phone || clean.mobileNumber || '';

  const userAddresses = await listAddressesByUser(clean.id);
  clean.addresses = userAddresses.map(formatAddressForLegacy);
  return clean;
}

// Short-lived in-memory read cache for hot catalog/settings endpoints (30s TTL)
const CACHE_TTL_MS = 30000;
const fastCache = new Map();
function getCached(key) {
  const entry = fastCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.exp) {
    fastCache.delete(key);
    return null;
  }
  return entry.val;
}
function setCached(key, val) {
  fastCache.set(key, { val, exp: Date.now() + CACHE_TTL_MS });
  return val;
}
export function invalidateCatalogCache() {
  fastCache.clear();
}

// Settings
export async function getSettings() {
  if (mongoConnected) {
    const hit = getCached('settings');
    if (hit) return { ...hit };
    const doc = await BusinessSettings.findOne({ key: 'default' }).lean();
    const val = stripMongo(doc) || { ...initialSettings };
    setCached('settings', val);
    return { ...val };
  }
  return { ...mem.settings };
}

export async function updateSettings(patch) {
  invalidateCatalogCache();
  if (mongoConnected) {
    const doc = await BusinessSettings.findOneAndUpdate(
      { key: 'default' },
      { $set: patch },
      { new: true, upsert: true }
    ).lean();
    return stripMongo(doc);
  }
  mem.settings = { ...mem.settings, ...patch };
  return { ...mem.settings };
}

// Categories
export async function listCategories() {
  if (mongoConnected) {
    const hit = getCached('categories');
    if (hit) return hit;
    const list = await Category.find({ active: true }).sort({ sortOrder: 1, name: 1 }).lean();
    return setCached('categories', list.map(stripMongo));
  }
  return mem.categories.filter((c) => c.active !== false).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

export async function upsertCategory(catData) {
  invalidateCatalogCache();
  const slug = String(catData.slug || catData.name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const payload = {
    slug,
    name: String(catData.name || '').trim(),
    emoji: catData.emoji || '🍽️',
    image: catData.image || '',
    tint: catData.tint || '#e6f4ea',
    sortOrder: Number(catData.sortOrder) || mem.categories.length + 1,
    active: catData.active !== undefined ? Boolean(catData.active) : true,
  };
  if (mongoConnected) {
    const doc = await Category.findOneAndUpdate({ slug }, { $set: payload }, { new: true, upsert: true }).lean();
    return stripMongo(doc);
  }
  const idx = mem.categories.findIndex((c) => c.slug === slug);
  if (idx >= 0) {
    mem.categories[idx] = { ...mem.categories[idx], ...payload };
    return { ...mem.categories[idx] };
  }
  mem.categories.push(payload);
  return { ...payload };
}

// Products
const unitPrice = (p) => (p.discountPrice != null && p.discountPrice > 0 ? p.discountPrice : p.price);

export async function listProducts(filters = {}) {
  const { q = '', category = '', veg = '', stock = '', max = 0, sort = 'popular', includeInactive = false } = filters;
  let items;
  if (mongoConnected) {
    const isUnfilteredActive = !includeInactive && !category && !veg && !stock;
    if (isUnfilteredActive) {
      const hit = getCached('products:active');
      if (hit) items = [...hit];
    }
    if (!items) {
      const query = includeInactive ? {} : { active: true };
      if (category) query.category = category;
      if (veg === '1' || veg === true) query.veg = true;
      if (stock === '1' || stock === true) query.stock = { $gt: 0 };
      const docs = await Product.find(query).lean();
      items = docs.map(stripMongo);
      if (isUnfilteredActive) setCached('products:active', items);
    }
  } else {
    items = mem.products
      .filter((p) => includeInactive || p.active !== false)
      .filter((p) => !category || p.category === category)
      .filter((p) => !(veg === '1' || veg === true) || p.veg)
      .filter((p) => !(stock === '1' || stock === true) || p.stock > 0)
      .map((p) => ({ ...p }));
  }

  const term = String(q || '').trim().toLowerCase();
  if (term) {
    items = items.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        (p.description || '').toLowerCase().includes(term) ||
        (p.ingredients || []).some((i) => i.toLowerCase().includes(term)) ||
        (p.dietTags || []).some((t) => t.toLowerCase().includes(term))
    );
  }

  const maxNum = Number(max) || 0;
  if (maxNum > 0) {
    items = items.filter((p) => unitPrice(p) <= maxNum);
  }

  const sorters = {
    popular: (a, b) => Number(Boolean(b.bestseller)) - Number(Boolean(a.bestseller)) || (b.rating || 0) - (a.rating || 0),
    'price-asc': (a, b) => unitPrice(a) - unitPrice(b),
    'price-desc': (a, b) => unitPrice(b) - unitPrice(a),
    rating: (a, b) => (b.rating || 0) - (a.rating || 0),
  };
  items.sort(sorters[sort] || sorters.popular);
  return items;
}

export async function getProductById(id) {
  if (mongoConnected) {
    const doc = await Product.findOne({ id }).lean();
    return stripMongo(doc);
  }
  const found = mem.products.find((p) => p.id === id);
  return found ? { ...found } : null;
}

export async function createProduct(data) {
  invalidateCatalogCache();
  const id = data.id || `p${Date.now().toString(36)}`;
  const product = {
    id,
    name: String(data.name || '').trim(),
    category: String(data.category || 'tiffins').trim(),
    emoji: data.emoji || '🍲',
    image:
      String(data.image || '').trim() ||
      'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=700&q=80',
    images: Array.isArray(data.images) ? data.images : [],
    price: Number(data.price) || 0,
    discountPrice:
      data.discountPrice !== null && data.discountPrice !== '' && Number(data.discountPrice) > 0
        ? Number(data.discountPrice)
        : null,
    veg: data.veg !== undefined ? Boolean(data.veg) : true,
    rating: Number(data.rating) || 4.6,
    likes: Number(data.likes) || 24,
    bestseller: Boolean(data.bestseller),
    special: Boolean(data.special),
    stock: Math.max(0, Number(data.stock ?? 20)),
    prepMins: Math.max(0, Number(data.prepMins ?? 10)),
    description: String(data.description || '').trim(),
    ingredients: Array.isArray(data.ingredients)
      ? data.ingredients
      : String(data.ingredients || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
    dietTags: Array.isArray(data.dietTags)
      ? data.dietTags
      : String(data.dietTags || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
    allergenTags: Array.isArray(data.allergenTags)
      ? data.allergenTags
      : String(data.allergenTags || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
    sizes: Array.isArray(data.sizes) && data.sizes.length > 0 ? data.sizes : [{ name: 'Regular', priceDelta: 0 }],
    active: data.active !== undefined ? Boolean(data.active) : true,
  };

  if (mongoConnected) {
    const created = await Product.create(product);
    return stripMongo(created);
  }
  mem.products.push(product);
  return { ...product };
}

export async function updateProduct(id, patch) {
  invalidateCatalogCache();
  const existing = await getProductById(id);
  if (!existing) return null;

  const updated = {
    ...existing,
    ...(patch.name !== undefined ? { name: String(patch.name).trim() } : {}),
    ...(patch.category !== undefined ? { category: String(patch.category).trim() } : {}),
    ...(patch.emoji !== undefined ? { emoji: patch.emoji } : {}),
    ...(patch.image !== undefined ? { image: String(patch.image).trim() } : {}),
    ...(patch.likes !== undefined ? { likes: Math.max(0, Number(patch.likes) || 0) } : {}),
    ...(patch.price !== undefined ? { price: Math.max(0, Number(patch.price) || 0) } : {}),
    ...(patch.discountPrice !== undefined
      ? {
          discountPrice:
            patch.discountPrice !== null && patch.discountPrice !== '' && Number(patch.discountPrice) > 0
              ? Number(patch.discountPrice)
              : null,
        }
      : {}),
    ...(patch.veg !== undefined ? { veg: Boolean(patch.veg) } : {}),
    ...(patch.bestseller !== undefined ? { bestseller: Boolean(patch.bestseller) } : {}),
    ...(patch.special !== undefined ? { special: Boolean(patch.special) } : {}),
    ...(patch.stock !== undefined ? { stock: Math.max(0, Number(patch.stock) || 0) } : {}),
    ...(patch.prepMins !== undefined ? { prepMins: Math.max(0, Number(patch.prepMins) || 0) } : {}),
    ...(patch.description !== undefined ? { description: String(patch.description).trim() } : {}),
    ...(patch.ingredients !== undefined
      ? {
          ingredients: Array.isArray(patch.ingredients)
            ? patch.ingredients
            : String(patch.ingredients)
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
        }
      : {}),
    ...(patch.dietTags !== undefined
      ? {
          dietTags: Array.isArray(patch.dietTags)
            ? patch.dietTags
            : String(patch.dietTags)
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
        }
      : {}),
    ...(patch.allergenTags !== undefined
      ? {
          allergenTags: Array.isArray(patch.allergenTags)
            ? patch.allergenTags
            : String(patch.allergenTags)
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
        }
      : {}),
    ...(patch.active !== undefined ? { active: Boolean(patch.active) } : {}),
  };

  if (mongoConnected) {
    const doc = await Product.findOneAndUpdate({ id }, { $set: updated }, { new: true }).lean();
    return stripMongo(doc);
  }
  const idx = mem.products.findIndex((p) => p.id === id);
  mem.products[idx] = updated;
  return { ...updated };
}

export async function deleteProduct(id) {
  invalidateCatalogCache();
  if (mongoConnected) {
    const res = await Product.findOneAndDelete({ id }).lean();
    return Boolean(res);
  }
  const idx = mem.products.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  mem.products.splice(idx, 1);
  return true;
}

// Plans, Slots, Coupons
export async function listPlans(includeInactive = false) {
  if (mongoConnected) {
    const query = includeInactive ? {} : { active: true };
    const docs = await SubscriptionPlan.find(query).sort({ days: 1 }).lean();
    return docs.map(stripMongo);
  }
  return mem.plans
    .filter((p) => includeInactive || p.active !== false)
    .map((p) => ({ ...p }));
}

export async function upsertSubscriptionPlan(data) {
  const days = Math.max(1, Number(data.days) || 7);
  const id = String(data.id || `plan-${days}`).toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const payload = {
    id,
    name: String(data.name || `${days}-Day Plan`).trim(),
    days,
    price: Math.max(1, Number(data.price) || 499),
    perDay: Math.round((Math.max(1, Number(data.price) || 499)) / days),
    badge: String(data.badge || '').trim(),
    perks: Array.isArray(data.perks)
      ? data.perks
      : String(data.perks || '')
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
    active: data.active !== undefined ? Boolean(data.active) : true,
  };
  if (mongoConnected) {
    const doc = await SubscriptionPlan.findOneAndUpdate(
      { id },
      { $set: payload },
      { new: true, upsert: true }
    ).lean();
    return stripMongo(doc);
  }
  const idx = mem.plans.findIndex((p) => p.id === id);
  if (idx >= 0) {
    mem.plans[idx] = { ...mem.plans[idx], ...payload };
    return { ...mem.plans[idx] };
  }
  mem.plans.push(payload);
  return { ...payload };
}

export async function deleteSubscriptionPlan(id) {
  if (mongoConnected) {
    const res = await SubscriptionPlan.findOneAndDelete({ id }).lean();
    return Boolean(res);
  }
  const idx = mem.plans.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  mem.plans.splice(idx, 1);
  return true;
}

export async function listSlots() {
  if (mongoConnected) {
    const docs = await DeliverySlot.find({ active: true }).lean();
    return docs.map(stripMongo);
  }
  return mem.slots.filter((s) => s.active !== false).map((s) => ({ ...s }));
}

export function getBusinessDateParts(timeZone = 'Asia/Kolkata') {
  const now = new Date();
  const fmtDate = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const fmtHour = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hour12: false,
  });
  const todayStr = fmtDate.format(now);
  const tomorrowStr = fmtDate.format(new Date(now.getTime() + 86400000));
  const rawHour = Number(fmtHour.format(now));
  const currentHour = Number.isFinite(rawHour) ? rawHour % 24 : now.getHours();
  return { todayStr, tomorrowStr, currentHour };
}

export async function listSlotsForDate(dateStr = '') {
  const settings = await getSettings();
  const slots = await listSlots();
  const { todayStr, tomorrowStr, currentHour } = getBusinessDateParts();
  const targetDate = dateStr || todayStr;
  const maxDays = Number(settings.maxPreOrderDays ?? 7);
  const cutoffHour = Number(settings.cutoffHour ?? 21);

  const orders = await listAllOrders();
  const activeOrdersForDate = orders.filter(
    (o) =>
      o.scheduledDate === targetDate &&
      !['cancelled', 'refund_initiated', 'refunded'].includes(o.status)
  );

  const dayDiff = Math.round(
    (new Date(`${targetDate}T00:00:00`).getTime() - new Date(`${todayStr}T00:00:00`).getTime()) /
      86400000
  );

  return slots.map((slot) => {
    const bookedCount = activeOrdersForDate.filter((o) => o.slotId === slot.id).length;
    const maxOrders = Number(slot.maxOrders) || 30;
    const remainingCapacity = Math.max(0, maxOrders - bookedCount);
    const isFull = remainingCapacity <= 0;

    let unavailableReason = '';
    if (dayDiff < 0) {
      unavailableReason = 'Selected date is in the past.';
    } else if (dayDiff > maxDays) {
      unavailableReason = `Pre-orders allowed up to ${maxDays} days ahead.`;
    } else if (isFull) {
      unavailableReason = 'Slot is fully booked for this date.';
    } else if (targetDate === tomorrowStr && slot.id === 'morning' && currentHour >= cutoffHour) {
      unavailableReason = `Morning pre-order cut-off (${cutoffHour}:00) has passed for tomorrow.`;
    }

    return {
      ...slot,
      date: targetDate,
      bookedCount,
      remainingCapacity,
      isFull,
      available: !unavailableReason,
      unavailableReason,
      maxPreOrderDays: maxDays,
      cutoffHour,
    };
  });
}

export async function getBookingAvailability(dateStr = '') {
  const settings = await getSettings();
  const { todayStr, tomorrowStr, currentHour } = getBusinessDateParts();
  const targetDate = dateStr || todayStr;
  const isSameDay = targetDate === todayStr;
  const cutoffHour = Number(settings.cutoffHour ?? 21);
  const maxPreOrderDays = Number(settings.maxPreOrderDays ?? 7);
  const storeOpen = settings.storeOpen !== false;
  const sameDayAvailable = isSameDay && storeOpen && currentHour < cutoffHour;
  const sameDayMessage = !storeOpen
    ? `Store is currently closed. Please choose ${tomorrowStr} or another upcoming date.`
    : sameDayAvailable
      ? "Ordering for today? Great! We'll prepare your order as soon as possible."
      : `Same-day ordering is closed after ${cutoffHour}:00. Please book for ${tomorrowStr} or a future date.`;

  const slots = isSameDay ? [] : await listSlotsForDate(targetDate);
  return {
    date: targetDate,
    isSameDay,
    sameDayAvailable,
    sameDayMessage,
    nextAvailableDate: tomorrowStr,
    cutoffHour,
    maxPreOrderDays,
    slots,
  };
}

export async function validateDeliverySchedule({ scheduledDate, slotId }) {
  const settings = await getSettings();
  const { todayStr, tomorrowStr, currentHour } = getBusinessDateParts();
  const targetDate = scheduledDate || todayStr;
  const maxDays = Number(settings.maxPreOrderDays ?? 7);
  const cutoffHour = Number(settings.cutoffHour ?? 21);

  const dayDiff = Math.round(
    (new Date(`${targetDate}T00:00:00`).getTime() - new Date(`${todayStr}T00:00:00`).getTime()) /
      86400000
  );
  if (Number.isNaN(dayDiff) || dayDiff < 0) {
    throw new Error('Please choose today or a future delivery date.');
  }
  if (dayDiff > maxDays) {
    throw new Error(`Pre-orders are accepted up to ${maxDays} days in advance.`);
  }

  // Same-day ordering: no delivery slot selection required; validate operating hours / cutoff
  if (dayDiff === 0) {
    if (settings.storeOpen === false) {
      throw new Error(`The store is currently closed for same-day orders. Please book for ${tomorrowStr}.`);
    }
    if (currentHour >= cutoffHour) {
      throw new Error(
        `Same-day ordering is closed for today (cut-off ${cutoffHour}:00). Please choose ${tomorrowStr} or a future date.`
      );
    }
    return {
      id: 'same-day',
      name: 'Same-Day Express',
      window: 'Prepared ASAP',
      isSameDay: true,
    };
  }

  // Future-date pre-booking: require a valid, available delivery slot
  const enrichedSlots = await listSlotsForDate(targetDate);
  if (!slotId || slotId === 'same-day') {
    throw new Error('Please select a valid delivery slot for your advance booking.');
  }
  const chosen = enrichedSlots.find((s) => s.id === slotId);
  if (!chosen) {
    throw new Error('Selected delivery slot is not available.');
  }
  if (!chosen.available) {
    throw new Error(chosen.unavailableReason || 'Selected delivery slot is unavailable.');
  }
  return chosen;
}

export async function listAllSlots() {
  if (mongoConnected) {
    const docs = await DeliverySlot.find().lean();
    return docs.map(stripMongo);
  }
  return mem.slots.map((s) => ({ ...s }));
}

export async function updateSlotConfig(id, patch) {
  const allowed = {
    ...(patch.name !== undefined ? { name: String(patch.name).trim() } : {}),
    ...(patch.window !== undefined ? { window: String(patch.window).trim() } : {}),
    ...(patch.maxOrders !== undefined ? { maxOrders: Math.max(1, Number(patch.maxOrders) || 30) } : {}),
    ...(patch.active !== undefined ? { active: Boolean(patch.active) } : {}),
  };
  if (mongoConnected) {
    const doc = await DeliverySlot.findOneAndUpdate({ id }, { $set: allowed }, { new: true }).lean();
    return stripMongo(doc);
  }
  const idx = mem.slots.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  mem.slots[idx] = { ...mem.slots[idx], ...allowed };
  return { ...mem.slots[idx] };
}

const NON_CONSUMING_ORDER_STATUSES = new Set([
  'cancelled',
  'refunded',
  'refund_initiated',
  'payment_pending',
]);

function isCouponWithinValidity(coupon, todayStr) {
  if (coupon.validFrom && todayStr < coupon.validFrom) return false;
  if (coupon.validUntil && todayStr > coupon.validUntil) return false;
  return true;
}

export async function listCoupons({ userId = null, userEmail = '' } = {}) {
  const { todayStr } = getBusinessDateParts();
  let rows;
  if (mongoConnected) {
    const docs = await Coupon.find({ active: true }).lean();
    rows = docs.map(stripMongo);
  } else {
    rows = mem.coupons.filter((c) => c.active !== false).map((c) => ({ ...c }));
  }

  let userValidOrders = null;
  let resolvedEmail = String(userEmail || '').trim().toLowerCase();
  if (userId) {
    const [orders, userDoc] = await Promise.all([
      listOrdersByUser(userId),
      resolvedEmail ? Promise.resolve(null) : findUserById(userId),
    ]);
    userValidOrders = orders.filter((o) => !NON_CONSUMING_ORDER_STATUSES.has(o.status));
    if (!resolvedEmail && userDoc?.email) {
      resolvedEmail = String(userDoc.email).trim().toLowerCase();
    }
  }

  const allRedemptions = await listCouponRedemptions();
  const activeRedemptions = allRedemptions.filter((r) => r.status === 'redeemed');

  return rows.filter((c) => {
    if (c.visibility === 'private') return false;
    if (!isCouponWithinValidity(c, todayStr)) return false;
    const allowedEmails = Array.isArray(c.allowedUserEmails) ? c.allowedUserEmails : [];
    if (allowedEmails.length > 0) {
      if (!resolvedEmail || !allowedEmails.includes(resolvedEmail)) return false;
    }
    const gLimit = Number(c.globalUsageLimit || 0);
    if (gLimit > 0) {
      const globalUsed = activeRedemptions.filter((r) => r.couponCode === c.code).length;
      if (globalUsed >= gLimit) return false;
    }
    if (userId) {
      if (c.firstOrderOnly && userValidOrders && userValidOrders.length > 0) return false;
      const limit = c.firstOrderOnly ? 1 : Number(c.perUserLimit || 0);
      if (limit > 0) {
        const usedByRedemption = activeRedemptions.filter(
          (r) => r.couponCode === c.code && r.customerId === userId
        ).length;
        const usedByOrders = userValidOrders
          ? userValidOrders.filter((o) => o.pricing?.couponCode === c.code).length
          : 0;
        if (Math.max(usedByRedemption, usedByOrders) >= limit) return false;
      }
    }
    return true;
  });
}

export async function listAllCoupons() {
  if (mongoConnected) {
    const docs = await Coupon.find().sort({ createdAt: -1 }).lean();
    return docs.map(stripMongo);
  }
  return mem.coupons.map((c) => ({ ...c }));
}

export async function listCouponRedemptions(limit = 300) {
  if (mongoConnected) {
    const docs = await CouponRedemption.find().sort({ createdAt: -1 }).limit(limit).lean();
    return docs.map(stripMongo);
  }
  return mem.couponRedemptions.slice(0, limit).map((r) => ({ ...r }));
}

export async function recordCouponRedemption({
  couponCode,
  customerId,
  customerEmail = '',
  orderId,
  discountAmount = 0,
  status = 'redeemed',
}) {
  const code = String(couponCode || '').trim().toUpperCase();
  if (!code || !orderId || !customerId) return null;
  const payload = {
    id: `CRED-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    couponCode: code,
    customerId,
    customerEmail: String(customerEmail || '').toLowerCase(),
    orderId,
    discountAmount: Math.max(0, Number(discountAmount) || 0),
    status,
    redeemedAt: new Date().toISOString(),
  };
  if (mongoConnected) {
    const doc = await CouponRedemption.findOneAndUpdate(
      { orderId, couponCode: code },
      { $set: { discountAmount: payload.discountAmount, status: payload.status, customerEmail: payload.customerEmail }, $setOnInsert: { id: payload.id, customerId: payload.customerId, redeemedAt: payload.redeemedAt } },
      { new: true, upsert: true }
    ).lean();
    return stripMongo(doc);
  }
  const idx = mem.couponRedemptions.findIndex((r) => r.orderId === orderId && r.couponCode === code);
  if (idx >= 0) {
    mem.couponRedemptions[idx] = { ...mem.couponRedemptions[idx], discountAmount: payload.discountAmount, status };
    return { ...mem.couponRedemptions[idx] };
  }
  mem.couponRedemptions.unshift(payload);
  return { ...payload };
}

export async function updateCouponRedemptionForOrder(orderId, couponCode, nextStatus) {
  const code = String(couponCode || '').trim().toUpperCase();
  if (!orderId || !code) return null;
  if (nextStatus === 'restored') {
    const coupon = await findCouponByCode(code);
    if (coupon && coupon.restoreOnCancel === false) {
      return null;
    }
  }
  if (mongoConnected) {
    const doc = await CouponRedemption.findOneAndUpdate(
      { orderId, couponCode: code },
      { $set: { status: nextStatus } },
      { new: true }
    ).lean();
    return stripMongo(doc);
  }
  const row = mem.couponRedemptions.find((r) => r.orderId === orderId && r.couponCode === code);
  if (row) row.status = nextStatus;
  return row ? { ...row } : null;
}

export async function upsertCoupon(data) {
  const code = String(data.code || '')
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .trim();
  if (!code) throw new Error('Coupon code is required.');

  const allowedTypes = new Set(['percent', 'flat', 'fixed_total']);
  const normalizeList = (val) =>
    Array.isArray(val)
      ? val.map((x) => String(x).trim()).filter(Boolean)
      : String(val || '')
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean);

  const eligibleProductIds = normalizeList(data.eligibleProductIds);
  const eligibleCategories = normalizeList(data.eligibleCategories).map((c) => c.toLowerCase());
  const allowedUserEmails = normalizeList(data.allowedUserEmails).map((e) => e.toLowerCase());
  const payload = {
    code,
    title: String(data.title || `${code} Offer`).trim(),
    type: allowedTypes.has(data.type) ? data.type : 'percent',
    value: Math.max(1, Number(data.value) || 10),
    minOrder: Math.max(0, Number(data.minOrder) || 0),
    maxDiscount: Math.max(1, Number(data.maxDiscount) || 100),
    firstOrderOnly: Boolean(data.firstOrderOnly),
    visibility: data.visibility === 'private' ? 'private' : 'public',
    validFrom: String(data.validFrom || '').slice(0, 10),
    validUntil: String(data.validUntil || '').slice(0, 10),
    eligibleProductIds,
    eligibleCategories,
    allowedUserEmails,
    perUserLimit: Math.max(0, Number(data.perUserLimit) || 0),
    globalUsageLimit: Math.max(0, Number(data.globalUsageLimit) || 0),
    restoreOnCancel: data.restoreOnCancel !== undefined ? Boolean(data.restoreOnCancel) : true,
    active: data.active !== undefined ? Boolean(data.active) : true,
  };

  if (mongoConnected) {
    const doc = await Coupon.findOneAndUpdate({ code }, { $set: payload }, { new: true, upsert: true }).lean();
    return stripMongo(doc);
  }
  const idx = mem.coupons.findIndex((c) => c.code === code);
  if (idx >= 0) {
    mem.coupons[idx] = { ...mem.coupons[idx], ...payload };
    return { ...mem.coupons[idx] };
  }
  mem.coupons.unshift(payload);
  return { ...payload };
}

export async function deleteCouponByCode(code) {
  const norm = String(code || '').toUpperCase().trim();
  if (mongoConnected) {
    const res = await Coupon.findOneAndDelete({ code: norm }).lean();
    return Boolean(res);
  }
  const idx = mem.coupons.findIndex((c) => c.code === norm);
  if (idx === -1) return false;
  mem.coupons.splice(idx, 1);
  return true;
}

export async function listAllSubscriptions() {
  if (mongoConnected) {
    const docs = await Subscription.find().sort({ createdAt: -1 }).lean();
    return docs.map(stripMongo);
  }
  return mem.subscriptions.map((s) => ({ ...s }));
}

export async function findCouponByCode(code) {
  const norm = String(code || '').toUpperCase().trim();
  if (!norm) return null;
  if (mongoConnected) {
    const doc = await Coupon.findOne({ code: norm, active: true }).lean();
    return stripMongo(doc);
  }
  const found = mem.coupons.find((c) => c.code === norm && c.active !== false);
  return found ? { ...found } : null;
}

// Server-side Checkout Quote & Validation (supports catalog items + size variants + dynamic combos + custom fruit bowls)
export async function calculateCheckoutQuote({
  items = {},
  customBowls = [],
  couponCode = '',
  useRewards = false,
  userId = null,
}) {
  const entries = Object.entries(items || {}).filter(([, qty]) => Number(qty) > 0);
  const validBowls = Array.isArray(customBowls)
    ? customBowls.filter((b) => b && Number(b.qty || 1) > 0)
    : [];

  if (entries.length === 0 && validBowls.length === 0) {
    throw new Error('Your cart is empty.');
  }

  const settings = await getSettings();
  const lineItems = [];
  let subtotal = 0;

  // Track cumulative product qty needed across standard items + combos to prevent overselling
  const neededProductQty = {};

  for (const [rawKey, rawQty] of entries) {
    const qty = Math.max(1, Math.floor(Number(rawQty)));

    // 1. Dynamic Combo item (`combo:<comboId>`)
    if (String(rawKey).startsWith('combo:')) {
      const comboId = String(rawKey).slice(6);
      const combo = await getComboById(comboId);
      if (!combo || combo.active === false) {
        throw new Error(`Combo "${comboId}" is no longer available.`);
      }
      if (!isComboWithinSchedule(combo)) {
        throw new Error(
          `"${combo.name}" is only available between ${combo.scheduleStart} and ${combo.scheduleEnd}.`
        );
      }
      const comboComponents = [];
      for (const comp of combo.items || []) {
        const compProd = await getProductById(comp.productId);
        const compNeed = (Number(comp.qty) || 1) * qty;
        neededProductQty[comp.productId] = (neededProductQty[comp.productId] || 0) + compNeed;
        if (!compProd || compProd.active === false || compProd.stock < neededProductQty[comp.productId]) {
          throw new Error(`"${combo.name}" is currently out of stock (component unavailable).`);
        }
        comboComponents.push({ productId: comp.productId, qty: Number(comp.qty) || 1 });
      }

      const price = Number(combo.price);
      const lineTotal = price * qty;
      subtotal += lineTotal;
      lineItems.push({
        productId: `combo:${combo.id}`,
        name: combo.name,
        emoji: combo.emoji || '🍱',
        unitPrice: price,
        mrp: Number(combo.originalPrice) || price,
        qty,
        lineTotal,
        isCombo: true,
        comboComponents,
      });
      continue;
    }

    // 2. Standard catalog item (optionally with `productId::sizeLabel`)
    const [baseProductId, sizeLabelRaw = ''] = String(rawKey).split('::');
    const product = await getProductById(baseProductId);
    if (!product || product.active === false) {
      throw new Error(`Item "${baseProductId}" is no longer available.`);
    }

    neededProductQty[product.id] = (neededProductQty[product.id] || 0) + qty;
    if (product.stock < neededProductQty[product.id]) {
      throw new Error(
        product.stock <= 0
          ? `"${product.name}" is out of stock.`
          : `Only ${product.stock} left of "${product.name}".`
      );
    }

    let sizeDelta = 0;
    let resolvedSizeLabel = '';
    if (sizeLabelRaw && Array.isArray(product.sizes) && product.sizes.length > 0) {
      const matchedSize = product.sizes.find(
        (s) => String(s.name || s.label || '').toLowerCase() === String(sizeLabelRaw).toLowerCase()
      );
      if (matchedSize) {
        sizeDelta = Number(matchedSize.priceDelta) || 0;
        resolvedSizeLabel = matchedSize.name || matchedSize.label;
      }
    }

    const basePrice = unitPrice(product);
    const finalUnitPrice = Math.max(1, basePrice + sizeDelta);
    const finalMrp = Math.max(finalUnitPrice, (Number(product.price) || basePrice) + sizeDelta);
    const lineTotal = finalUnitPrice * qty;
    subtotal += lineTotal;

    lineItems.push({
      productId: product.id,
      name: resolvedSizeLabel ? `${product.name} (${resolvedSizeLabel})` : product.name,
      emoji: product.emoji || '🍲',
      unitPrice: finalUnitPrice,
      mrp: finalMrp,
      qty,
      lineTotal,
      sizeLabel: resolvedSizeLabel,
    });
  }

  // 3. Custom Fruit Bowls validated against live DB Ingredient prices & stock
  if (validBowls.length > 0) {
    const dbIngredients = await listIngredients(false);
    const neededIngredientQty = {};

    for (const bowl of validBowls) {
      const qty = Math.max(1, Math.floor(Number(bowl.qty || 1)));
      const computed = computeCustomBowlPrice(bowl, dbIngredients);

      for (const ing of computed.chosenIngredients || []) {
        const perBowl = Number(ing.qtyPerBowl) || 1;
        neededIngredientQty[ing.id] = (neededIngredientQty[ing.id] || 0) + perBowl * qty;
        if ((Number(ing.stock) || 0) < neededIngredientQty[ing.id]) {
          throw new Error(`Bowl ingredient "${ing.name}" does not have enough stock right now.`);
        }
      }

      const lineTotal = computed.unitPrice * qty;
      subtotal += lineTotal;
      lineItems.push({
        productId: bowl.id || `custom-bowl-${Date.now().toString(36)}`,
        name: `${computed.name}: ${computed.summary}`,
        emoji: '🥣',
        unitPrice: computed.unitPrice,
        mrp: computed.unitPrice,
        qty,
        lineTotal,
        isCustomBowl: true,
        bowlIngredientIds: computed.ingredientIds || [],
      });
    }
  }

  let couponDiscount = 0;
  let appliedCoupon = '';
  let appliedCouponDoc = null;
  let couponMessage = '';
  if (couponCode && String(couponCode).trim()) {
    const { todayStr } = getBusinessDateParts();
    const coupon = await findCouponByCode(couponCode);
    if (!coupon || coupon.active === false) {
      couponMessage = 'Invalid or expired coupon code.';
    } else if (!isCouponWithinValidity(coupon, todayStr)) {
      couponMessage =
        coupon.validFrom && todayStr < coupon.validFrom
          ? `Coupon ${coupon.code} starts on ${coupon.validFrom}.`
          : `Coupon ${coupon.code} has expired.`;
    } else {
      let userValidOrders = null;
      let customerEmail = '';
      if (userId) {
        const [pastOrders, userDoc] = await Promise.all([
          listOrdersByUser(userId),
          findUserById(userId),
        ]);
        userValidOrders = pastOrders.filter((o) => !NON_CONSUMING_ORDER_STATUSES.has(o.status));
        customerEmail = String(userDoc?.email || '').trim().toLowerCase();
      }

      const eligibleIds = Array.isArray(coupon.eligibleProductIds) ? coupon.eligibleProductIds : [];
      const eligibleCats = Array.isArray(coupon.eligibleCategories)
        ? coupon.eligibleCategories.map((c) => String(c).toLowerCase())
        : [];
      const allowedEmails = Array.isArray(coupon.allowedUserEmails)
        ? coupon.allowedUserEmails.map((e) => String(e).toLowerCase())
        : [];

      const catalogProducts = eligibleCats.length > 0 ? await listProducts() : [];
      const productCatMap = new Map(
        catalogProducts.map((p) => [p.id, String(p.category || '').toLowerCase()])
      );

      const hasProductFilter = eligibleIds.length > 0 || eligibleCats.length > 0;
      const eligibleSubtotal = !hasProductFilter
        ? subtotal
        : lineItems
            .filter((li) => {
              if (li.isCustomBowl) return false;
              const matchProd = eligibleIds.length === 0 || eligibleIds.includes(li.productId);
              const cat = productCatMap.get(li.productId) || '';
              const matchCat = eligibleCats.length === 0 || eligibleCats.includes(cat);
              return matchProd && matchCat;
            })
            .reduce((sum, li) => sum + (li.lineTotal || 0), 0);

      const allRedemptions = await listCouponRedemptions(500);
      const redeemedRows = allRedemptions.filter(
        (r) => r.couponCode === coupon.code && r.status === 'redeemed'
      );
      const globalLimit = Number(coupon.globalUsageLimit || 0);
      const perUserLimit = coupon.firstOrderOnly ? 1 : Number(coupon.perUserLimit || 0);
      const alreadyUsedCount = userId
        ? Math.max(
            redeemedRows.filter((r) => r.customerId === userId).length,
            userValidOrders ? userValidOrders.filter((o) => o.pricing?.couponCode === coupon.code).length : 0
          )
        : 0;

      if (allowedEmails.length > 0 && (!customerEmail || !allowedEmails.includes(customerEmail))) {
        couponMessage = `Coupon ${coupon.code} is not valid for your account.`;
      } else if (globalLimit > 0 && redeemedRows.length >= globalLimit) {
        couponMessage = `Coupon ${coupon.code} has reached its maximum usage limit.`;
      } else if (coupon.firstOrderOnly && !userId) {
        couponMessage = `Please sign in to use first-order coupon ${coupon.code}.`;
      } else if (coupon.firstOrderOnly && userValidOrders && userValidOrders.length > 0) {
        couponMessage = `Coupon ${coupon.code} is valid on your first order only.`;
      } else if (perUserLimit > 0 && !userId) {
        couponMessage = `Please sign in to use coupon ${coupon.code}.`;
      } else if (perUserLimit > 0 && alreadyUsedCount >= perUserLimit) {
        couponMessage = `You have already used coupon ${coupon.code}.`;
      } else if (hasProductFilter && eligibleSubtotal <= 0) {
        couponMessage = `Coupon ${coupon.code} is not valid for the items in your cart.`;
      } else if (eligibleSubtotal < (coupon.minOrder || 0)) {
        couponMessage = `Coupon ${coupon.code} requires a minimum order of ₹${coupon.minOrder}.`;
      } else {
        appliedCoupon = coupon.code;
        appliedCouponDoc = coupon;
        if (coupon.type === 'percent') {
          couponDiscount = Math.min(
            Math.round((eligibleSubtotal * coupon.value) / 100),
            coupon.maxDiscount || eligibleSubtotal
          );
        } else if (coupon.type === 'flat') {
          couponDiscount = Math.min(coupon.value, eligibleSubtotal, coupon.maxDiscount || coupon.value);
        }
        couponMessage = `Coupon ${coupon.code} applied (saved ₹${couponDiscount}).`;
      }
    }
  }

  let rewardPointsUsed = 0;
  let deliveryCharge = 0;
  let taxAmount = 0;
  let grandTotal = 0;
  const freeAbove = Number(settings.freeDeliveryAbove ?? 199);
  const baseDelivery = Number(settings.deliveryCharge ?? 25);
  const taxRate = Number(settings.taxPercent ?? 5);

  if (appliedCouponDoc?.type === 'fixed_total') {
    const targetPayable = Math.max(1, Number(appliedCouponDoc.value) || 2);
    grandTotal = Math.min(subtotal, targetPayable);
    couponDiscount = Math.max(0, subtotal - grandTotal);
    couponMessage = `Coupon ${appliedCouponDoc.code} applied (final payable ₹${grandTotal}).`;
  } else {
    if (useRewards && userId) {
      const user = await findUserById(userId);
      if (user && user.rewardPoints > 0) {
        const remainingAfterCoupon = Math.max(0, subtotal - couponDiscount);
        rewardPointsUsed = Math.min(user.rewardPoints, 50, remainingAfterCoupon);
      }
    }

    const discountedSubtotal = Math.max(0, subtotal - couponDiscount - rewardPointsUsed);
    deliveryCharge = subtotal >= freeAbove ? 0 : baseDelivery;
    taxAmount = Math.round((discountedSubtotal * taxRate) / 100);
    grandTotal = Math.max(0, discountedSubtotal + deliveryCharge + taxAmount);
  }

  return {
    items: lineItems,
    pricing: {
      subtotal,
      couponCode: appliedCoupon,
      couponDiscount,
      couponMessage,
      rewardPointsUsed,
      deliveryCharge,
      freeDeliveryAbove: freeAbove,
      taxPercent: taxRate,
      taxAmount,
      grandTotal,
    },
  };
}

// Atomic Stock Deduction & Restoration (Products + Combo Components + Bowl Ingredients + InventoryLog)
export async function deductOrderStockAtomically(
  lineItems,
  { reason = 'order_deducted', orderId = '', actor = 'system' } = {}
) {
  const productDeductions = [];
  const ingredientDeductions = [];

  for (const item of lineItems || []) {
    if (item.isCombo && Array.isArray(item.comboComponents) && item.comboComponents.length > 0) {
      for (const comp of item.comboComponents) {
        productDeductions.push({
          productId: comp.productId,
          qty: (Number(comp.qty) || 1) * (Number(item.qty) || 1),
          name: `${item.name} (Combo component)`,
          reason: reason === 'order_reserved' ? 'order_reserved' : 'combo_deducted',
        });
      }
    } else if (item.isCustomBowl || String(item.productId || '').startsWith('custom-bowl')) {
      for (const ingId of item.bowlIngredientIds || []) {
        ingredientDeductions.push({
          ingredientId: ingId,
          qty: Number(item.qty) || 1,
          reason: reason === 'order_reserved' ? 'order_reserved' : 'bowl_deducted',
        });
      }
    } else {
      const baseId = String(item.productId || '').split('::')[0];
      if (baseId && !baseId.startsWith('sub-')) {
        productDeductions.push({
          productId: baseId,
          qty: Number(item.qty) || 1,
          name: item.name,
          reason,
        });
      }
    }
  }

  const rolledProducts = [];
  const rolledIngredients = [];

  try {
    // 1. Deduct products atomically
    for (const p of productDeductions) {
      if (mongoConnected) {
        const updated = await Product.findOneAndUpdate(
          { id: p.productId, stock: { $gte: p.qty } },
          { $inc: { stock: -p.qty } },
          { new: true }
        ).lean();
        if (!updated) throw new Error(`Insufficient stock for "${p.name || p.productId}".`);
        rolledProducts.push({ productId: p.productId, qty: p.qty });
        await recordInventoryLog({
          itemType: 'product',
          itemId: p.productId,
          itemName: updated.name,
          change: -p.qty,
          stockAfter: updated.stock,
          reason: p.reason,
          orderId,
          actor,
        });
      } else {
        const prod = mem.products.find((pr) => pr.id === p.productId);
        if (!prod || prod.stock < p.qty) {
          throw new Error(`Insufficient stock for "${p.name || p.productId}".`);
        }
        prod.stock -= p.qty;
        rolledProducts.push({ productId: p.productId, qty: p.qty });
        await recordInventoryLog({
          itemType: 'product',
          itemId: p.productId,
          itemName: prod.name,
          change: -p.qty,
          stockAfter: prod.stock,
          reason: p.reason,
          orderId,
          actor,
        });
      }
    }

    // 2. Deduct custom bowl ingredients atomically
    for (const ingReq of ingredientDeductions) {
      if (mongoConnected) {
        const ingDoc = await Ingredient.findOne({ id: ingReq.ingredientId }).lean();
        if (!ingDoc) continue;
        const deductUnits = (Number(ingDoc.qtyPerBowl) || 1) * ingReq.qty;
        const updated = await Ingredient.findOneAndUpdate(
          { id: ingReq.ingredientId, stock: { $gte: deductUnits } },
          { $inc: { stock: -deductUnits } },
          { new: true }
        ).lean();
        if (!updated) throw new Error(`Insufficient ingredient stock for "${ingDoc.name}".`);
        rolledIngredients.push({ ingredientId: ingReq.ingredientId, qty: deductUnits });
        await recordInventoryLog({
          itemType: 'ingredient',
          itemId: ingReq.ingredientId,
          itemName: updated.name,
          change: -deductUnits,
          stockAfter: updated.stock,
          reason: ingReq.reason,
          orderId,
          actor,
        });
      } else {
        const ing = mem.ingredients.find((x) => x.id === ingReq.ingredientId);
        if (!ing) continue;
        const deductUnits = (Number(ing.qtyPerBowl) || 1) * ingReq.qty;
        if (ing.stock < deductUnits) {
          throw new Error(`Insufficient ingredient stock for "${ing.name}".`);
        }
        ing.stock -= deductUnits;
        rolledIngredients.push({ ingredientId: ingReq.ingredientId, qty: deductUnits });
        await recordInventoryLog({
          itemType: 'ingredient',
          itemId: ingReq.ingredientId,
          itemName: ing.name,
          change: -deductUnits,
          stockAfter: ing.stock,
          reason: ingReq.reason,
          orderId,
          actor,
        });
      }
    }
    return true;
  } catch (err) {
    // Roll back any partial deductions
    for (const prev of rolledProducts) {
      if (mongoConnected) {
        await Product.updateOne({ id: prev.productId }, { $inc: { stock: prev.qty } });
      } else {
        const pr = mem.products.find((x) => x.id === prev.productId);
        if (pr) pr.stock += prev.qty;
      }
    }
    for (const prev of rolledIngredients) {
      if (mongoConnected) {
        await Ingredient.updateOne({ id: prev.ingredientId }, { $inc: { stock: prev.qty } });
      } else {
        const ig = mem.ingredients.find((x) => x.id === prev.ingredientId);
        if (ig) ig.stock += prev.qty;
      }
    }
    throw err;
  }
}

export async function restoreOrderStock(
  lineItems,
  { reason = 'order_cancelled', orderId = '', actor = 'system' } = {}
) {
  for (const item of lineItems || []) {
    if (item.isCombo && Array.isArray(item.comboComponents) && item.comboComponents.length > 0) {
      for (const comp of item.comboComponents) {
        const addQty = (Number(comp.qty) || 1) * (Number(item.qty) || 1);
        if (mongoConnected) {
          const updated = await Product.findOneAndUpdate(
            { id: comp.productId },
            { $inc: { stock: addQty } },
            { new: true }
          ).lean();
          if (updated) {
            await recordInventoryLog({
              itemType: 'product',
              itemId: comp.productId,
              itemName: updated.name,
              change: addQty,
              stockAfter: updated.stock,
              reason,
              orderId,
              actor,
            });
          }
        } else {
          const prod = mem.products.find((p) => p.id === comp.productId);
          if (prod) {
            prod.stock += addQty;
            await recordInventoryLog({
              itemType: 'product',
              itemId: prod.id,
              itemName: prod.name,
              change: addQty,
              stockAfter: prod.stock,
              reason,
              orderId,
              actor,
            });
          }
        }
      }
    } else if (item.isCustomBowl || String(item.productId || '').startsWith('custom-bowl')) {
      for (const ingId of item.bowlIngredientIds || []) {
        if (mongoConnected) {
          const ingDoc = await Ingredient.findOne({ id: ingId }).lean();
          if (!ingDoc) continue;
          const addUnits = (Number(ingDoc.qtyPerBowl) || 1) * (Number(item.qty) || 1);
          const updated = await Ingredient.findOneAndUpdate(
            { id: ingId },
            { $inc: { stock: addUnits } },
            { new: true }
          ).lean();
          if (updated) {
            await recordInventoryLog({
              itemType: 'ingredient',
              itemId: ingId,
              itemName: updated.name,
              change: addUnits,
              stockAfter: updated.stock,
              reason,
              orderId,
              actor,
            });
          }
        } else {
          const ing = mem.ingredients.find((x) => x.id === ingId);
          if (ing) {
            const addUnits = (Number(ing.qtyPerBowl) || 1) * (Number(item.qty) || 1);
            ing.stock += addUnits;
            await recordInventoryLog({
              itemType: 'ingredient',
              itemId: ing.id,
              itemName: ing.name,
              change: addUnits,
              stockAfter: ing.stock,
              reason,
              orderId,
              actor,
            });
          }
        }
      }
    } else {
      const baseId = String(item.productId || '').split('::')[0];
      if (!baseId || baseId.startsWith('sub-')) continue;
      if (mongoConnected) {
        const updated = await Product.findOneAndUpdate(
          { id: baseId },
          { $inc: { stock: item.qty } },
          { new: true }
        ).lean();
        if (updated) {
          await recordInventoryLog({
            itemType: 'product',
            itemId: baseId,
            itemName: updated.name,
            change: item.qty,
            stockAfter: updated.stock,
            reason,
            orderId,
            actor,
          });
        }
      } else {
        const prod = mem.products.find((p) => p.id === baseId);
        if (prod) {
          prod.stock += item.qty;
          await recordInventoryLog({
            itemType: 'product',
            itemId: prod.id,
            itemName: prod.name,
            change: item.qty,
            stockAfter: prod.stock,
            reason,
            orderId,
            actor,
          });
        }
      }
    }
  }
}

// Orders & Payments
export async function createOrderRecord(orderData) {
  if (orderData.idempotencyKey) {
    if (mongoConnected) {
      const existing = await Order.findOne({ idempotencyKey: orderData.idempotencyKey }).lean();
      if (existing) return stripMongo(existing);
    } else {
      const existing = mem.orders.find((o) => o.idempotencyKey === orderData.idempotencyKey);
      if (existing) return { ...existing };
    }
  }

  const now = new Date().toISOString();
  const order = {
    ...orderData,
    createdAt: now,
    updatedAt: now,
  };

  if (mongoConnected) {
    const created = await Order.create(order);
    return stripMongo(created);
  }
  mem.orders.unshift(order);
  return { ...order };
}

export async function createPaymentRecord(paymentData) {
  const now = new Date().toISOString();
  const payment = {
    ...paymentData,
    createdAt: now,
    updatedAt: now,
  };
  if (mongoConnected) {
    const created = await Payment.create(payment);
    return stripMongo(created);
  }
  mem.payments.unshift(payment);
  return { ...payment };
}

export async function getOrderById(id) {
  if (mongoConnected) {
    const doc = await Order.findOne({ id }).lean();
    return stripMongo(doc);
  }
  const found = mem.orders.find((o) => o.id === id);
  return found ? { ...found } : null;
}

export async function getOrderByRazorpayOrderId(razorpayOrderId) {
  if (mongoConnected) {
    const doc = await Order.findOne({ razorpayOrderId }).lean();
    return stripMongo(doc);
  }
  const found = mem.orders.find((o) => o.razorpayOrderId === razorpayOrderId);
  return found ? { ...found } : null;
}

export async function listOrdersByUser(userId) {
  if (mongoConnected) {
    const docs = await Order.find({ userId }).sort({ createdAt: -1 }).lean();
    return docs.map(stripMongo);
  }
  return mem.orders.filter((o) => o.userId === userId).map((o) => ({ ...o }));
}

export async function listAllOrders(statusFilter = '') {
  if (mongoConnected) {
    const query = statusFilter ? { status: statusFilter } : {};
    const docs = await Order.find(query).sort({ createdAt: -1 }).lean();
    return docs.map(stripMongo);
  }
  return mem.orders
    .filter((o) => !statusFilter || o.status === statusFilter)
    .map((o) => ({ ...o }));
}

export async function listPaymentsByUser(userId) {
  if (mongoConnected) {
    const docs = await Payment.find({ userId }).sort({ createdAt: -1 }).lean();
    return docs.map(stripMongo);
  }
  return mem.payments.filter((p) => p.userId === userId).map((p) => ({ ...p }));
}

export async function listAllPayments() {
  if (mongoConnected) {
    const docs = await Payment.find().sort({ createdAt: -1 }).lean();
    return docs.map(stripMongo);
  }
  return mem.payments.map((p) => ({ ...p }));
}

export async function confirmOrderPayment({ orderId, razorpayPaymentId, by = 'customer' }) {
  const order = await getOrderById(orderId);
  if (!order) throw new Error('Order not found.');

  if (order.paymentStatus === 'paid' && order.stockDeducted && !order.stockReserved) {
    return order;
  }

  // If stock wasn't already reserved at order creation, deduct it atomically now
  if (!order.stockDeducted && !order.stockReserved) {
    await deductOrderStockAtomically(order.items, {
      reason: 'order_deducted',
      orderId: order.id,
      actor: by,
    });
  }

  if (order.pricing?.rewardPointsUsed > 0) {
    const user = await findUserById(order.userId);
    if (user) {
      const nextPoints = Math.max(0, (user.rewardPoints || 0) - order.pricing.rewardPointsUsed);
      await updateUser(user.id, { rewardPoints: nextPoints });
    }
  }

  const now = new Date().toISOString();
  const isCodConversion =
    order.originalPaymentMethod === 'COD' || order.paymentMethod === 'cod';
  const nextStatus = order.status === 'payment_pending' ? 'confirmed' : order.status;
  const nextHistory = [
    ...(order.statusHistory || []),
    {
      status: nextStatus,
      note: isCodConversion
        ? `COD converted to Online payment (${razorpayPaymentId})`
        : `Online payment verified (${razorpayPaymentId})`,
      by,
      at: now,
    },
  ];

  const patch = {
    status: nextStatus,
    paymentMethod: 'razorpay',
    originalPaymentMethod: order.originalPaymentMethod || (isCodConversion ? 'COD' : 'Online'),
    currentPaymentMethod: 'Online',
    paymentStatus: 'paid',
    razorpayPaymentId,
    stockDeducted: true,
    stockReserved: false,
    reservationExpiresAt: '',
    'delivery.cashCollectionStatus': 'not_applicable',
    statusHistory: nextHistory,
    updatedAt: now,
  };

  let confirmedOrder;
  if (mongoConnected) {
    await Payment.findOneAndUpdate(
      { orderId },
      {
        $set: {
          method: 'razorpay',
          razorpayOrderId: order.razorpayOrderId || '',
          razorpayPaymentId,
          status: 'captured',
          updatedAt: now,
        },
      },
      { upsert: true }
    );
    const updated = await Order.findOneAndUpdate({ id: orderId }, { $set: patch }, { new: true }).lean();
    confirmedOrder = stripMongo(updated);
  } else {
    const payIdx = mem.payments.findIndex((p) => p.orderId === orderId);
    if (payIdx >= 0) {
      mem.payments[payIdx] = {
        ...mem.payments[payIdx],
        method: 'razorpay',
        razorpayPaymentId,
        status: 'captured',
        updatedAt: now,
      };
    }
    const ordIdx = mem.orders.findIndex((o) => o.id === orderId);
    mem.orders[ordIdx] = {
      ...mem.orders[ordIdx],
      ...patch,
      delivery: { ...(mem.orders[ordIdx].delivery || {}), cashCollectionStatus: 'not_applicable' },
    };
    confirmedOrder = { ...mem.orders[ordIdx] };
  }

  // Credit referral reward if this is the customer's first successful paid order
  await processReferralRewardForOrder(confirmedOrder).catch(() => {});
  return confirmedOrder;
}

export async function transitionOrderStatus({ orderId, status, note = '', by = 'admin' }) {
  if (!ORDER_STATUSES.includes(status)) {
    throw new Error(`Invalid order status: ${status}`);
  }
  const order = await getOrderById(orderId);
  if (!order) throw new Error('Order not found.');

  const now = new Date().toISOString();
  let stockDeducted = order.stockDeducted;
  let stockReserved = Boolean(order.stockReserved);
  let reservationExpiresAt = order.reservationExpiresAt || '';
  let paymentStatus = order.paymentStatus;

  if (status === 'cancelled' && (stockDeducted || stockReserved)) {
    await restoreOrderStock(order.items, {
      reason: stockReserved ? 'order_released' : 'order_cancelled',
      orderId: order.id,
      actor: by,
    });
    stockDeducted = false;
    stockReserved = false;
    reservationExpiresAt = '';
  }

  if (status === 'delivered' && order.paymentMethod === 'cod') {
    paymentStatus = 'paid';
  }

  if (status === 'refund_initiated') {
    paymentStatus = 'refund_initiated';
  } else if (status === 'refunded') {
    paymentStatus = 'refunded';
  }

  const nextHistory = [
    ...(order.statusHistory || []),
    {
      status,
      note: note || `Order moved to ${status.replace(/_/g, ' ')}`,
      by,
      at: now,
    },
  ];

  const patch = {
    status,
    paymentStatus,
    stockDeducted,
    stockReserved,
    reservationExpiresAt,
    statusHistory: nextHistory,
    updatedAt: now,
  };

  let resultOrder;
  if (mongoConnected) {
    if (status === 'refund_initiated' || status === 'refunded') {
      await Payment.findOneAndUpdate(
        { orderId },
        {
          $set: {
            status,
            refundId: status === 'refunded' ? `rfnd_${Date.now().toString(36)}` : '',
            refundReason: note || 'Admin initiated refund',
            refundedAt: status === 'refunded' ? now : '',
          },
        }
      );
    }
    const updated = await Order.findOneAndUpdate({ id: orderId }, { $set: patch }, { new: true }).lean();
    resultOrder = stripMongo(updated);
  } else {
    const payIdx = mem.payments.findIndex((p) => p.orderId === orderId);
    if (payIdx >= 0 && (status === 'refund_initiated' || status === 'refunded' || paymentStatus === 'paid')) {
      mem.payments[payIdx] = {
        ...mem.payments[payIdx],
        status: paymentStatus === 'paid' ? 'captured' : status,
        refundId: status === 'refunded' ? `rfnd_${Date.now().toString(36)}` : mem.payments[payIdx].refundId,
        refundReason: note || mem.payments[payIdx].refundReason,
        refundedAt: status === 'refunded' ? now : mem.payments[payIdx].refundedAt,
        updatedAt: now,
      };
    }

    const ordIdx = mem.orders.findIndex((o) => o.id === orderId);
    mem.orders[ordIdx] = { ...mem.orders[ordIdx], ...patch };
    resultOrder = { ...mem.orders[ordIdx] };
  }

  if (status === 'delivered' && paymentStatus === 'paid') {
    await processReferralRewardForOrder(resultOrder).catch(() => {});
  }
  return resultOrder;
}

// Users (with select('+password') support when needed for login / password verification)
export async function findUserByEmail(email, includePassword = false) {
  const norm = String(email || '').toLowerCase().trim();
  if (!norm) return null;
  if (mongoConnected) {
    const q = User.findOne({ email: norm });
    if (includePassword) q.select('+password +resetPasswordTokenHash +resetPasswordExpiresAt');
    const doc = await q.lean();
    return stripMongo(doc);
  }
  const found = mem.users.find((u) => u.email === norm);
  return found ? { ...found } : null;
}

export async function findUserByUsername(username, includePassword = false) {
  const norm = String(username || '').toLowerCase().trim();
  if (!norm) return null;
  if (mongoConnected) {
    const q = User.findOne({ username: norm });
    if (includePassword) q.select('+password +resetPasswordTokenHash +resetPasswordExpiresAt');
    const doc = await q.lean();
    return stripMongo(doc);
  }
  const found = mem.users.find((u) => u.username && u.username.toLowerCase() === norm);
  return found ? { ...found } : null;
}

export async function findUserByEmailOrUsername(identifier, includePassword = false) {
  const norm = String(identifier || '').toLowerCase().trim();
  if (!norm) return null;
  if (norm.includes('@')) {
    return findUserByEmail(norm, includePassword);
  }
  const byUsername = await findUserByUsername(norm, includePassword);
  if (byUsername) return byUsername;
  return findUserByEmail(norm, includePassword);
}

export async function findUserById(id, includePassword = false) {
  if (!id) return null;
  if (mongoConnected) {
    const q = User.findOne({ id });
    if (includePassword) q.select('+password +resetPasswordTokenHash +resetPasswordExpiresAt');
    const doc = await q.lean();
    return stripMongo(doc);
  }
  const found = mem.users.find((u) => u.id === id);
  return found ? { ...found } : null;
}

export async function findUserByResetTokenHash(tokenHash) {
  if (!tokenHash) return null;
  const now = new Date();
  if (mongoConnected) {
    const doc = await User.findOne({
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpiresAt: { $gt: now },
    })
      .select('+password +resetPasswordTokenHash +resetPasswordExpiresAt')
      .lean();
    return stripMongo(doc);
  }
  const found = mem.users.find(
    (u) =>
      u.resetPasswordTokenHash === tokenHash &&
      u.resetPasswordExpiresAt &&
      new Date(u.resetPasswordExpiresAt) > now
  );
  return found ? { ...found } : null;
}

export async function createUser(userData) {
  const cleanName = String(userData.fullName || userData.name || 'Customer').trim();
  const baseCode = cleanName.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 5) || 'HRUVI';
  const referralCode = userData.referralCode || `${baseCode}${Math.floor(100 + Math.random() * 900)}`;

  const newUser = {
    id: userData.id || `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    role: userData.role || 'customer',
    fullName: cleanName,
    name: cleanName,
    email: String(userData.email).toLowerCase().trim(),
    password: userData.password || userData.passwordHash || '',
    isEmailVerified: Boolean(userData.isEmailVerified),
    username: userData.username ? String(userData.username).toLowerCase().trim() : undefined,
    mobileNumber: String(userData.mobileNumber || userData.phone || '').trim(),
    phone: String(userData.mobileNumber || userData.phone || '').trim(),
    gender: userData.gender || '',
    dateOfBirth: userData.dateOfBirth || null,
    isProfileCompleted: Boolean(userData.isProfileCompleted),
    termsAccepted: Boolean(userData.termsAccepted),
    referralCode,
    referredBy: String(userData.referredBy || '').trim().toUpperCase(),
    rewardPoints: Number(userData.rewardPoints) || 0,
    preferences: userData.preferences || {
      vegOnly: true,
      spiceLevel: 'medium',
      allergies: [],
      deliveryNotes: '',
    },
    wishlist: Array.isArray(userData.wishlist) ? userData.wishlist : [],
    blocked: false,
  };

  if (mongoConnected) {
    const created = await User.create(newUser);
    return stripMongo(created);
  }
  mem.users.push(newUser);
  return { ...newUser };
}

export async function updateUser(id, patch) {
  const normalizedPatch = { ...patch };
  if (normalizedPatch.fullName && !normalizedPatch.name) normalizedPatch.name = normalizedPatch.fullName;
  if (normalizedPatch.name && !normalizedPatch.fullName) normalizedPatch.fullName = normalizedPatch.name;
  if (normalizedPatch.mobileNumber !== undefined && normalizedPatch.phone === undefined) {
    normalizedPatch.phone = normalizedPatch.mobileNumber;
  }
  if (normalizedPatch.phone !== undefined && normalizedPatch.mobileNumber === undefined) {
    normalizedPatch.mobileNumber = normalizedPatch.phone;
  }

  if (mongoConnected) {
    const doc = await User.findOneAndUpdate({ id }, { $set: normalizedPatch }, { new: true }).lean();
    return stripMongo(doc);
  }
  const idx = mem.users.findIndex((u) => u.id === id);
  if (idx === -1) return null;
  mem.users[idx] = { ...mem.users[idx], ...normalizedPatch };
  return { ...mem.users[idx] };
}

export async function deleteUser(id) {
  if (mongoConnected) {
    await Address.deleteMany({ userId: id });
    await RefreshSession.deleteMany({ userId: id });
    await EmailVerification.deleteMany({ userId: id });
    const res = await User.findOneAndDelete({ id }).lean();
    return Boolean(res);
  }
  const idx = mem.users.findIndex((u) => u.id === id);
  if (idx === -1) return false;
  mem.users.splice(idx, 1);
  mem.addresses = mem.addresses.filter((a) => a.userId !== id);
  mem.refreshSessions = mem.refreshSessions.filter((s) => s.userId !== id);
  mem.emailVerifications = mem.emailVerifications.filter((v) => v.userId !== id);
  return true;
}

export async function listUsers() {
  if (mongoConnected) {
    const docs = await User.find().sort({ createdAt: -1 }).lean();
    return Promise.all(docs.map(sanitizeUser));
  }
  return Promise.all(mem.users.map(sanitizeUser));
}

// EmailVerification OTP Repository (Plain 6-digit OTP stored in MongoDB with 10m expiry)
export async function createOrUpdateOtpRecord({ userId, email, otp, isResend = false }) {
  const normEmail = String(email).toLowerCase().trim();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  const now = new Date();

  if (mongoConnected) {
    const existing = await EmailVerification.findOne({ userId }).lean();
    if (existing && isResend) {
      if ((existing.resendCount || 0) >= 5) {
        throw new Error('Maximum OTP resend limit (5) reached. Please wait 10 minutes.');
      }
      if (existing.lastResentAt && Date.now() - new Date(existing.lastResentAt).getTime() < 30 * 1000) {
        throw new Error('Please wait at least 30 seconds before requesting another OTP.');
      }
    }

    const updated = await EmailVerification.findOneAndUpdate(
      { userId },
      {
        $set: {
          userId,
          email: normEmail,
          otp: String(otp),
          expiresAt,
          attempts: 0,
          lastResentAt: now,
        },
        $inc: { resendCount: isResend ? 1 : 0 },
      },
      { new: true, upsert: true }
    ).lean();
    return stripMongo(updated);
  }

  const idx = mem.emailVerifications.findIndex((v) => v.userId === userId);
  if (idx >= 0) {
    const existing = mem.emailVerifications[idx];
    if (isResend) {
      if ((existing.resendCount || 0) >= 5) {
        throw new Error('Maximum OTP resend limit (5) reached. Please wait 10 minutes.');
      }
      if (existing.lastResentAt && Date.now() - new Date(existing.lastResentAt).getTime() < 30 * 1000) {
        throw new Error('Please wait at least 30 seconds before requesting another OTP.');
      }
    }
    mem.emailVerifications[idx] = {
      ...existing,
      email: normEmail,
      otp: String(otp),
      expiresAt,
      attempts: 0,
      resendCount: isResend ? (existing.resendCount || 0) + 1 : existing.resendCount || 0,
      lastResentAt: now,
    };
    return { ...mem.emailVerifications[idx] };
  }

  const record = {
    userId,
    email: normEmail,
    otp: String(otp),
    expiresAt,
    attempts: 0,
    resendCount: 0,
    lastResentAt: now,
    createdAt: now,
  };
  mem.emailVerifications.push(record);
  return { ...record };
}

export async function getOtpRecordByEmail(email) {
  const normEmail = String(email || '').toLowerCase().trim();
  if (mongoConnected) {
    const doc = await EmailVerification.findOne({ email: normEmail }).lean();
    return stripMongo(doc);
  }
  const found = mem.emailVerifications.find((v) => v.email === normEmail);
  return found ? { ...found } : null;
}

export async function incrementOtpAttempts(userId) {
  if (mongoConnected) {
    const doc = await EmailVerification.findOneAndUpdate(
      { userId },
      { $inc: { attempts: 1 } },
      { new: true }
    ).lean();
    return stripMongo(doc);
  }
  const idx = mem.emailVerifications.findIndex((v) => v.userId === userId);
  if (idx === -1) return null;
  mem.emailVerifications[idx].attempts = (mem.emailVerifications[idx].attempts || 0) + 1;
  return { ...mem.emailVerifications[idx] };
}

export async function deleteOtpRecordByUserId(userId) {
  if (mongoConnected) {
    await EmailVerification.deleteMany({ userId });
    return true;
  }
  mem.emailVerifications = mem.emailVerifications.filter((v) => v.userId !== userId);
  return true;
}

// RefreshSession Repository (Refresh-token rotation & revocation)
export async function createRefreshSession({
  userId,
  hashedRefreshToken,
  rememberMe = false,
  userAgent = '',
  ipAddress = '',
  expiresAt,
}) {
  const session = {
    userId,
    hashedRefreshToken,
    rememberMe: Boolean(rememberMe),
    userAgent: String(userAgent || '').slice(0, 250),
    ipAddress: String(ipAddress || '').slice(0, 80),
    expiresAt,
    revokedAt: null,
    createdAt: new Date(),
  };
  if (mongoConnected) {
    const created = await RefreshSession.create(session);
    return stripMongo(created);
  }
  mem.refreshSessions.push(session);
  return { ...session };
}

export async function findValidRefreshSession(hashedRefreshToken) {
  const now = new Date();
  if (mongoConnected) {
    const doc = await RefreshSession.findOne({
      hashedRefreshToken,
      revokedAt: null,
      expiresAt: { $gt: now },
    }).lean();
    return stripMongo(doc);
  }
  const found = mem.refreshSessions.find(
    (s) =>
      s.hashedRefreshToken === hashedRefreshToken &&
      !s.revokedAt &&
      new Date(s.expiresAt) > now
  );
  return found ? { ...found } : null;
}

export async function revokeRefreshSessionByHash(hashedRefreshToken) {
  const now = new Date();
  if (mongoConnected) {
    await RefreshSession.updateOne({ hashedRefreshToken }, { $set: { revokedAt: now } });
    return true;
  }
  for (const s of mem.refreshSessions) {
    if (s.hashedRefreshToken === hashedRefreshToken) s.revokedAt = now;
  }
  return true;
}

export async function revokeAllUserRefreshSessions(userId) {
  const now = new Date();
  if (mongoConnected) {
    await RefreshSession.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: now } });
    return true;
  }
  for (const s of mem.refreshSessions) {
    if (s.userId === userId && !s.revokedAt) s.revokedAt = now;
  }
  return true;
}

// Separate Address Collection Repository (Multiple Addresses per Customer)
export async function listAddressesByUser(userId) {
  if (!userId) return [];
  if (mongoConnected) {
    const docs = await Address.find({ userId }).sort({ isDefault: -1, createdAt: -1 }).lean();
    return docs.map(stripMongo);
  }
  return mem.addresses
    .filter((a) => a.userId === userId)
    .sort((a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)))
    .map((a) => ({ ...a }));
}

export async function getAddressByIdForUser(addressId, userId) {
  if (!addressId || !userId) return null;
  if (mongoConnected) {
    const doc = await Address.findOne({ id: addressId, userId }).lean();
    return stripMongo(doc);
  }
  const found = mem.addresses.find((a) => a.id === addressId && a.userId === userId);
  return found ? { ...found } : null;
}

export async function createAddressForUser(userId, data) {
  const existingList = await listAddressesByUser(userId);
  const shouldBeDefault = Boolean(data.isDefault) || existingList.length === 0;

  if (shouldBeDefault) {
    if (mongoConnected) {
      await Address.updateMany({ userId, isDefault: true }, { $set: { isDefault: false } });
    } else {
      for (const a of mem.addresses) {
        if (a.userId === userId) a.isDefault = false;
      }
    }
  }

  const labelRaw = String(data.addressLabel || data.label || 'Home').trim();
  const addressLabel = ['Home', 'Office', 'Hostel', 'Other'].includes(labelRaw) ? labelRaw : 'Home';

  const newAddress = {
    id: data.id || `addr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    userId,
    addressLabel,
    recipientName: String(data.recipientName || data.recipient || '').trim(),
    mobileNumber: String(data.mobileNumber || data.phone || '')
      .replace(/\D/g, '')
      .slice(-10),
    alternateMobileNumber: String(data.alternateMobileNumber || '')
      .replace(/\D/g, '')
      .slice(-10),
    doorNumber: String(data.doorNumber || '').trim(),
    apartmentName: String(data.apartmentName || '').trim(),
    street: String(data.street || data.line1 || '').trim(),
    locality: String(data.locality || '').trim(),
    area: String(data.area || '').trim(),
    mandal: String(data.mandal || '').trim(),
    district: String(data.district || data.city || '').trim(),
    state: String(data.state || '').trim(),
    country: String(data.country || 'India').trim() || 'India',
    pincode: String(data.pincode || '').trim(),
    latitude: data.latitude !== undefined && data.latitude !== null && data.latitude !== '' ? Number(data.latitude) : null,
    longitude: data.longitude !== undefined && data.longitude !== null && data.longitude !== '' ? Number(data.longitude) : null,
    deliveryInstructions: String(data.deliveryInstructions || data.notes || '').trim(),
    isDefault: shouldBeDefault,
  };

  if (mongoConnected) {
    const created = await Address.create(newAddress);
    return stripMongo(created);
  }
  const now = new Date().toISOString();
  const memDoc = { ...newAddress, createdAt: now, updatedAt: now };
  mem.addresses.unshift(memDoc);
  return { ...memDoc };
}

export async function updateAddressForUser(addressId, userId, data) {
  const existing = await getAddressByIdForUser(addressId, userId);
  if (!existing) return null;

  const shouldBeDefault = data.isDefault !== undefined ? Boolean(data.isDefault) : existing.isDefault;
  if (shouldBeDefault && !existing.isDefault) {
    if (mongoConnected) {
      await Address.updateMany({ userId, isDefault: true }, { $set: { isDefault: false } });
    } else {
      for (const a of mem.addresses) {
        if (a.userId === userId) a.isDefault = false;
      }
    }
  }

  const labelRaw = data.addressLabel !== undefined ? String(data.addressLabel).trim() : existing.addressLabel;
  const addressLabel = ['Home', 'Office', 'Hostel', 'Other'].includes(labelRaw) ? labelRaw : existing.addressLabel;

  const patch = {
    addressLabel,
    recipientName:
      data.recipientName !== undefined ? String(data.recipientName).trim() : existing.recipientName,
    mobileNumber:
      data.mobileNumber !== undefined
        ? String(data.mobileNumber).replace(/\D/g, '').slice(-10)
        : existing.mobileNumber,
    alternateMobileNumber:
      data.alternateMobileNumber !== undefined
        ? String(data.alternateMobileNumber).replace(/\D/g, '').slice(-10)
        : existing.alternateMobileNumber,
    doorNumber: data.doorNumber !== undefined ? String(data.doorNumber).trim() : existing.doorNumber,
    apartmentName:
      data.apartmentName !== undefined ? String(data.apartmentName).trim() : existing.apartmentName,
    street: data.street !== undefined ? String(data.street).trim() : existing.street,
    locality: data.locality !== undefined ? String(data.locality).trim() : existing.locality,
    area: data.area !== undefined ? String(data.area).trim() : existing.area,
    mandal: data.mandal !== undefined ? String(data.mandal).trim() : existing.mandal,
    district: data.district !== undefined ? String(data.district).trim() : existing.district,
    state: data.state !== undefined ? String(data.state).trim() : existing.state,
    country: data.country !== undefined ? String(data.country).trim() : existing.country,
    pincode: data.pincode !== undefined ? String(data.pincode).trim() : existing.pincode,
    latitude:
      data.latitude !== undefined
        ? data.latitude !== null && data.latitude !== ''
          ? Number(data.latitude)
          : null
        : existing.latitude,
    longitude:
      data.longitude !== undefined
        ? data.longitude !== null && data.longitude !== ''
          ? Number(data.longitude)
          : null
        : existing.longitude,
    deliveryInstructions:
      data.deliveryInstructions !== undefined
        ? String(data.deliveryInstructions).trim()
        : existing.deliveryInstructions,
    isDefault: shouldBeDefault,
  };

  if (mongoConnected) {
    const updated = await Address.findOneAndUpdate(
      { id: addressId, userId },
      { $set: patch },
      { new: true }
    ).lean();
    return stripMongo(updated);
  }

  const idx = mem.addresses.findIndex((a) => a.id === addressId && a.userId === userId);
  if (idx === -1) return null;
  mem.addresses[idx] = { ...mem.addresses[idx], ...patch, updatedAt: new Date().toISOString() };
  return { ...mem.addresses[idx] };
}

export async function setDefaultAddressForUser(addressId, userId) {
  const existing = await getAddressByIdForUser(addressId, userId);
  if (!existing) return null;

  if (mongoConnected) {
    await Address.updateMany({ userId }, { $set: { isDefault: false } });
    const updated = await Address.findOneAndUpdate(
      { id: addressId, userId },
      { $set: { isDefault: true } },
      { new: true }
    ).lean();
    return stripMongo(updated);
  }

  for (const a of mem.addresses) {
    if (a.userId === userId) a.isDefault = a.id === addressId;
  }
  const found = mem.addresses.find((a) => a.id === addressId && a.userId === userId);
  return found ? { ...found } : null;
}

export async function deleteAddressForUser(addressId, userId) {
  const existing = await getAddressByIdForUser(addressId, userId);
  if (!existing) return false;

  if (mongoConnected) {
    await Address.deleteOne({ id: addressId, userId });
    if (existing.isDefault) {
      const nextFirst = await Address.findOne({ userId }).sort({ createdAt: -1 });
      if (nextFirst) {
        nextFirst.isDefault = true;
        await nextFirst.save();
      }
    }
    return true;
  }

  const idx = mem.addresses.findIndex((a) => a.id === addressId && a.userId === userId);
  if (idx === -1) return false;
  mem.addresses.splice(idx, 1);
  if (existing.isDefault) {
    const remaining = mem.addresses.filter((a) => a.userId === userId);
    if (remaining.length > 0) remaining[0].isDefault = true;
  }
  return true;
}

// Audit Logs
export async function recordAudit({ actorId, actorEmail, action, entity, entityId = '', details = {} }) {
  const entry = {
    id: `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    actorId,
    actorEmail,
    action,
    entity,
    entityId,
    details,
    createdAt: new Date().toISOString(),
  };
  if (mongoConnected) {
    await AuditLog.create(entry);
    return entry;
  }
  mem.auditLogs.unshift(entry);
  if (mem.auditLogs.length > 200) mem.auditLogs.length = 200;
  return entry;
}

export async function listAuditLogs(limit = 30) {
  if (mongoConnected) {
    const docs = await AuditLog.find().sort({ createdAt: -1 }).limit(limit).lean();
    return docs.map(stripMongo);
  }
  return mem.auditLogs.slice(0, limit);
}

// Notifications
export async function createNotification({ userId, type = 'order', title, message, emailSent = true }) {
  const entry = {
    id: `notif-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    userId,
    type,
    title,
    message,
    emailSent,
    read: false,
    createdAt: new Date().toISOString(),
  };
  if (mongoConnected) {
    const created = await Notification.create(entry);
    return stripMongo(created);
  }
  mem.notifications.unshift(entry);
  return { ...entry };
}

export async function listUserNotifications(userId) {
  if (mongoConnected) {
    const docs = await Notification.find({ userId }).sort({ createdAt: -1 }).limit(30).lean();
    return docs.map(stripMongo);
  }
  return mem.notifications.filter((n) => n.userId === userId).slice(0, 30);
}

export async function markAllNotificationsRead(userId) {
  if (mongoConnected) {
    await Notification.updateMany({ userId, read: false }, { $set: { read: true } });
    return listUserNotifications(userId);
  }
  for (const n of mem.notifications) {
    if (n.userId === userId) n.read = true;
  }
  return listUserNotifications(userId);
}

export async function clearUserNotifications(userId) {
  if (mongoConnected) {
    await Notification.deleteMany({ userId });
    return [];
  }
  mem.notifications = mem.notifications.filter((n) => n.userId !== userId);
  return [];
}

// Genuine Reviews Repository
export async function listReviews(productId = '') {
  if (mongoConnected) {
    const query = { visible: true };
    if (productId) query.productId = productId;
    const docs = await Review.find(query).sort({ createdAt: -1 }).limit(30).lean();
    return docs.map(stripMongo);
  }
  return mem.reviews
    .filter((r) => r.visible !== false && (!productId || r.productId === productId))
    .slice(0, 30);
}

export async function listAllReviews(limit = 60) {
  if (mongoConnected) {
    const docs = await Review.find().sort({ createdAt: -1 }).limit(limit).lean();
    return docs.map(stripMongo);
  }
  return mem.reviews.slice(0, limit);
}

export async function moderateReview(reviewId, { visible, moderationNote = '' }) {
  const patch = {
    visible: Boolean(visible),
    moderationNote: String(moderationNote || '').trim(),
  };
  if (mongoConnected) {
    const updated = await Review.findOneAndUpdate({ id: reviewId }, { $set: patch }, { new: true }).lean();
    return stripMongo(updated);
  }
  const idx = mem.reviews.findIndex((r) => r.id === reviewId);
  if (idx === -1) return null;
  mem.reviews[idx] = { ...mem.reviews[idx], ...patch };
  return { ...mem.reviews[idx] };
}

export async function createReview(data) {
  const entry = {
    id: `rev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    userId: data.userId,
    userName: data.userName,
    productId: data.productId || 'general',
    productName: data.productName || '',
    rating: Number(data.rating),
    comment: data.comment,
    verifiedOrder: Boolean(data.verifiedOrder),
    visible: true,
    moderationNote: '',
    createdAt: new Date().toISOString(),
  };
  if (mongoConnected) {
    const created = await Review.create(entry);
    return stripMongo(created);
  }
  mem.reviews.unshift(entry);
  return { ...entry };
}

// Subscriptions Repository (with pause rules: cutoff hour + max pauses + pausedDates)
export async function listSubscriptionsByUser(userId) {
  if (mongoConnected) {
    const docs = await Subscription.find({ userId }).sort({ createdAt: -1 }).lean();
    return docs.map(stripMongo);
  }
  return mem.subscriptions.filter((s) => s.userId === userId).map((s) => ({ ...s }));
}

export async function createSubscriptionRecord(data) {
  const maxPauses = data.days >= 30 ? 8 : data.days >= 15 ? 5 : 3;
  const entry = {
    id: `SUB-${Date.now().toString(36).toUpperCase()}`,
    ...data,
    pauseCount: 0,
    maxPauses,
    pausedDates: [],
    createdAt: new Date().toISOString(),
  };
  if (mongoConnected) {
    const created = await Subscription.create(entry);
    return stripMongo(created);
  }
  mem.subscriptions.unshift(entry);
  return { ...entry };
}

export async function toggleSubscriptionStatus(subId, userId) {
  const settings = await getSettings();
  const pauseCutoffHour = Number(settings.subscriptionPauseCutoffHour ?? 22);
  const currentHour = new Date().getHours();
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  if (mongoConnected) {
    const existing = await Subscription.findOne({ id: subId, userId });
    if (!existing) return null;

    if (existing.status === 'active') {
      const maxPauses = existing.maxPauses || 5;
      if ((existing.pauseCount || 0) >= maxPauses) {
        throw new Error(`Maximum pause limit (${maxPauses}) reached for this subscription.`);
      }
      if (currentHour >= pauseCutoffHour) {
        throw new Error(
          `Pauses for tomorrow's delivery must be requested before ${pauseCutoffHour}:00 (10 PM).`
        );
      }
      existing.status = 'paused';
      existing.pauseCount = (existing.pauseCount || 0) + 1;
      const dates = Array.isArray(existing.pausedDates) ? existing.pausedDates : [];
      if (!dates.includes(tomorrowStr)) dates.push(tomorrowStr);
      existing.pausedDates = dates;
    } else {
      existing.status = 'active';
    }
    await existing.save();
    return stripMongo(existing);
  }

  const idx = mem.subscriptions.findIndex((s) => s.id === subId && s.userId === userId);
  if (idx === -1) return null;
  const existing = mem.subscriptions[idx];
  if (existing.status === 'active') {
    const maxPauses = existing.maxPauses || 5;
    if ((existing.pauseCount || 0) >= maxPauses) {
      throw new Error(`Maximum pause limit (${maxPauses}) reached for this subscription.`);
    }
    if (currentHour >= pauseCutoffHour) {
      throw new Error(
        `Pauses for tomorrow's delivery must be requested before ${pauseCutoffHour}:00 (10 PM).`
      );
    }
    const dates = Array.isArray(existing.pausedDates) ? [...existing.pausedDates] : [];
    if (!dates.includes(tomorrowStr)) dates.push(tomorrowStr);
    mem.subscriptions[idx] = {
      ...existing,
      status: 'paused',
      pauseCount: (existing.pauseCount || 0) + 1,
      pausedDates: dates,
    };
  } else {
    mem.subscriptions[idx] = { ...existing, status: 'active' };
  }
  return { ...mem.subscriptions[idx] };
}

export async function pauseSubscriptionForDate(subId, userId, dateStr) {
  const settings = await getSettings();
  const pauseCutoffHour = Number(settings.subscriptionPauseCutoffHour ?? 22);
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const targetDate = String(dateStr || tomorrowStr).slice(0, 10);
  if (targetDate === tomorrowStr && new Date().getHours() >= pauseCutoffHour) {
    throw new Error(
      `Tomorrow's delivery can only be paused before ${pauseCutoffHour}:00 (10 PM).`
    );
  }

  if (mongoConnected) {
    const existing = await Subscription.findOne({ id: subId, userId });
    if (!existing) return null;
    const dates = Array.isArray(existing.pausedDates) ? existing.pausedDates : [];
    if (dates.includes(targetDate)) return stripMongo(existing);
    const maxPauses = existing.maxPauses || 5;
    if ((existing.pauseCount || 0) >= maxPauses) {
      throw new Error(`Maximum pause limit (${maxPauses}) reached for this subscription.`);
    }
    dates.push(targetDate);
    existing.pausedDates = dates;
    existing.pauseCount = (existing.pauseCount || 0) + 1;
    await existing.save();
    return stripMongo(existing);
  }

  const idx = mem.subscriptions.findIndex((s) => s.id === subId && s.userId === userId);
  if (idx === -1) return null;
  const existing = mem.subscriptions[idx];
  const dates = Array.isArray(existing.pausedDates) ? [...existing.pausedDates] : [];
  if (dates.includes(targetDate)) return { ...existing };
  const maxPauses = existing.maxPauses || 5;
  if ((existing.pauseCount || 0) >= maxPauses) {
    throw new Error(`Maximum pause limit (${maxPauses}) reached for this subscription.`);
  }
  dates.push(targetDate);
  mem.subscriptions[idx] = {
    ...existing,
    pausedDates: dates,
    pauseCount: (existing.pauseCount || 0) + 1,
  };
  return { ...mem.subscriptions[idx] };
}

// Assistant Conversations Repository
export async function getConversationById(conversationId) {
  if (!conversationId) return null;
  if (mongoConnected) {
    const doc = await Conversation.findOne({ id: conversationId }).lean();
    return stripMongo(doc);
  }
  const found = mem.conversations.find((c) => c.id === conversationId);
  return found ? { ...found } : null;
}

export async function saveConversationTurn({
  conversationId,
  userId = 'guest',
  userName = 'Guest',
  language = 'en-IN',
  userText,
  assistantText,
  toolsUsed = [],
  addedToCart = false,
  sessionState = { pendingIntent: null, customBowlDraft: null },
}) {
  const now = new Date().toISOString();
  const newMsgs = [
    { role: 'user', text: userText, toolsUsed: [], at: now },
    { role: 'assistant', text: assistantText, toolsUsed, at: now },
  ];

  if (mongoConnected) {
    const doc = await Conversation.findOneAndUpdate(
      { id: conversationId },
      {
        $setOnInsert: { id: conversationId, userId, userName },
        $set: { language, sessionState },
        $push: { messages: { $each: newMsgs } },
        $inc: { cartActionsCount: addedToCart ? 1 : 0 },
      },
      { new: true, upsert: true }
    ).lean();
    return stripMongo(doc);
  }

  const idx = mem.conversations.findIndex((c) => c.id === conversationId);
  if (idx >= 0) {
    mem.conversations[idx] = {
      ...mem.conversations[idx],
      language,
      sessionState,
      messages: [...mem.conversations[idx].messages, ...newMsgs],
      cartActionsCount: (mem.conversations[idx].cartActionsCount || 0) + (addedToCart ? 1 : 0),
      updatedAt: now,
    };
    return { ...mem.conversations[idx] };
  }

  const entry = {
    id: conversationId,
    userId,
    userName,
    language,
    sessionState,
    messages: newMsgs,
    cartActionsCount: addedToCart ? 1 : 0,
    createdAt: now,
    updatedAt: now,
  };
  mem.conversations.unshift(entry);
  return { ...entry };
}

export async function listConversations(limit = 40) {
  if (mongoConnected) {
    const docs = await Conversation.find().sort({ updatedAt: -1 }).limit(limit).lean();
    return docs.map(stripMongo);
  }
  return mem.conversations.slice(0, limit);
}

// Automation Logs & Subscription Delivery Decrement
export async function decrementSubscriptionDelivery(subId) {
  if (mongoConnected) {
    const doc = await Subscription.findOne({ id: subId });
    if (!doc) return null;
    doc.remainingDeliveries = Math.max(0, (doc.remainingDeliveries || 0) - 1);
    if (doc.remainingDeliveries === 0) doc.status = 'completed';
    await doc.save();
    return stripMongo(doc);
  }
  const idx = mem.subscriptions.findIndex((s) => s.id === subId);
  if (idx === -1) return null;
  const rem = Math.max(0, (mem.subscriptions[idx].remainingDeliveries || 0) - 1);
  mem.subscriptions[idx] = {
    ...mem.subscriptions[idx],
    remainingDeliveries: rem,
    status: rem === 0 ? 'completed' : mem.subscriptions[idx].status,
  };
  return { ...mem.subscriptions[idx] };
}

export async function recordAutomationLog({ jobName, status = 'success', summary, details = {} }) {
  const entry = {
    id: `auto-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    jobName,
    status,
    summary,
    details,
    createdAt: new Date().toISOString(),
  };
  if (mongoConnected) {
    const created = await AutomationLog.create(entry);
    return stripMongo(created);
  }
  mem.automationLogs.unshift(entry);
  if (mem.automationLogs.length > 100) mem.automationLogs.length = 100;
  return entry;
}

export async function listAutomationLogs(limit = 30) {
  if (mongoConnected) {
    const docs = await AutomationLog.find().sort({ createdAt: -1 }).limit(limit).lean();
    return docs.map(stripMongo);
  }
  return mem.automationLogs.slice(0, limit);
}

// ============================================================
// Bowl Ingredients & Inventory Logs Repository
// ============================================================
export async function listIngredients(includeInactive = false) {
  if (mongoConnected) {
    const query = includeInactive ? {} : { active: true };
    const docs = await Ingredient.find(query).sort({ category: 1, name: 1 }).lean();
    return docs.map(stripMongo);
  }
  return mem.ingredients
    .filter((i) => includeInactive || i.active !== false)
    .map((i) => ({ ...i }));
}

export async function getDynamicBowlOptions() {
  const all = await listIngredients(false);
  const available = all.filter((i) => (Number(i.stock) || 0) > 0);
  return {
    sizes: bowlOptions.sizes,
    fruits: available.filter((i) => i.category === 'fruits'),
    toppings: available.filter((i) => i.category === 'toppings'),
    extras: available.filter((i) => i.category === 'extras'),
  };
}

export async function upsertIngredient(data) {
  const id = String(data.id || data.name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-|-$/g, '');
  if (!id || !data.name) throw new Error('Ingredient name is required.');

  const payload = {
    id,
    name: String(data.name).trim(),
    category: ['fruits', 'toppings', 'extras'].includes(data.category) ? data.category : 'fruits',
    price: Math.max(0, Number(data.price) || 0),
    included: Boolean(data.included),
    stock: Math.max(0, Number(data.stock) || 0),
    unit: String(data.unit || 'portions').trim(),
    qtyPerBowl: Math.max(1, Number(data.qtyPerBowl) || 1),
    lowStockThreshold: Math.max(1, Number(data.lowStockThreshold) || 8),
    active: data.active !== undefined ? Boolean(data.active) : true,
  };

  if (mongoConnected) {
    const doc = await Ingredient.findOneAndUpdate(
      { id },
      { $set: payload },
      { new: true, upsert: true }
    ).lean();
    return stripMongo(doc);
  }

  const idx = mem.ingredients.findIndex((i) => i.id === id);
  if (idx >= 0) {
    mem.ingredients[idx] = { ...mem.ingredients[idx], ...payload };
    return { ...mem.ingredients[idx] };
  }
  mem.ingredients.push(payload);
  return { ...payload };
}

export async function recordInventoryLog({
  itemType,
  itemId,
  itemName,
  change,
  stockAfter,
  reason,
  orderId = '',
  actor = 'system',
  note = '',
}) {
  const entry = {
    id: `inv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    itemType,
    itemId,
    itemName,
    change: Number(change),
    stockAfter: Number(stockAfter),
    reason,
    orderId,
    actor,
    note,
    createdAt: new Date().toISOString(),
  };
  if (mongoConnected) {
    await InventoryLog.create(entry);
    return entry;
  }
  mem.inventoryLogs.unshift(entry);
  if (mem.inventoryLogs.length > 300) mem.inventoryLogs.length = 300;
  return entry;
}

export async function listInventoryLogs(limit = 80) {
  if (mongoConnected) {
    const docs = await InventoryLog.find().sort({ createdAt: -1 }).limit(limit).lean();
    return docs.map(stripMongo);
  }
  return mem.inventoryLogs.slice(0, limit);
}

export async function adjustProductStock({ productId, delta, reason = 'admin_adjustment', actor = 'admin', note = '' }) {
  const change = Number(delta);
  if (!Number.isFinite(change) || change === 0) throw new Error('Stock adjustment must be a non-zero number.');
  const existing = await getProductById(productId);
  if (!existing) throw new Error('Product not found.');
  const nextStock = Math.max(0, (Number(existing.stock) || 0) + change);
  const updated = await updateProduct(productId, { stock: nextStock });
  await recordInventoryLog({
    itemType: 'product',
    itemId: existing.id,
    itemName: existing.name,
    change: nextStock - (Number(existing.stock) || 0),
    stockAfter: nextStock,
    reason: change > 0 && reason === 'admin_adjustment' ? 'restock' : reason,
    actor,
    note,
  });
  return updated;
}

export async function adjustIngredientStock({ ingredientId, delta, reason = 'admin_adjustment', actor = 'admin', note = '' }) {
  const change = Number(delta);
  if (!Number.isFinite(change) || change === 0) throw new Error('Stock adjustment must be a non-zero number.');

  if (mongoConnected) {
    const existing = await Ingredient.findOne({ id: ingredientId }).lean();
    if (!existing) throw new Error('Ingredient not found.');
    const nextStock = Math.max(0, (Number(existing.stock) || 0) + change);
    const updated = await Ingredient.findOneAndUpdate(
      { id: ingredientId },
      { $set: { stock: nextStock } },
      { new: true }
    ).lean();
    await recordInventoryLog({
      itemType: 'ingredient',
      itemId: existing.id,
      itemName: existing.name,
      change: nextStock - (Number(existing.stock) || 0),
      stockAfter: nextStock,
      reason: change > 0 && reason === 'admin_adjustment' ? 'restock' : reason,
      actor,
      note,
    });
    return stripMongo(updated);
  }

  const idx = mem.ingredients.findIndex((i) => i.id === ingredientId);
  if (idx === -1) throw new Error('Ingredient not found.');
  const existing = mem.ingredients[idx];
  const nextStock = Math.max(0, (Number(existing.stock) || 0) + change);
  mem.ingredients[idx] = { ...existing, stock: nextStock };
  await recordInventoryLog({
    itemType: 'ingredient',
    itemId: existing.id,
    itemName: existing.name,
    change: nextStock - (Number(existing.stock) || 0),
    stockAfter: nextStock,
    reason: change > 0 && reason === 'admin_adjustment' ? 'restock' : reason,
    actor,
    note,
  });
  return { ...mem.ingredients[idx] };
}

// ============================================================
// Dynamic Combo Builder Repository
// ============================================================
export function isComboWithinSchedule(combo, nowDate = new Date()) {
  if (!combo) return false;
  const start = String(combo.scheduleStart || '00:00');
  const end = String(combo.scheduleEnd || '23:59');
  const hh = String(nowDate.getHours()).padStart(2, '0');
  const mm = String(nowDate.getMinutes()).padStart(2, '0');
  const cur = `${hh}:${mm}`;
  if (start <= end) return cur >= start && cur <= end;
  return cur >= start || cur <= end;
}

export async function listCombos(includeInactive = false) {
  let raw = [];
  if (mongoConnected) {
    const query = includeInactive ? {} : { active: true };
    const docs = await Combo.find(query).sort({ featured: -1, createdAt: -1 }).lean();
    raw = docs.map(stripMongo);
  } else {
    raw = mem.combos.filter((c) => includeInactive || c.active !== false).map((c) => ({ ...c }));
  }

  const allProducts = await listProducts({ includeInactive: true });
  const prodMap = Object.fromEntries(allProducts.map((p) => [p.id, p]));

  return raw.map((combo) => {
    const componentDetails = (combo.items || []).map((it) => {
      const p = prodMap[it.productId];
      return {
        productId: it.productId,
        qty: Number(it.qty) || 1,
        name: p ? p.name : it.productId,
        stock: p ? p.stock : 0,
        active: p ? p.active !== false : false,
      };
    });
    const inStock =
      componentDetails.length > 0 &&
      componentDetails.every((c) => c.active && c.stock >= c.qty);
    const inSchedule = isComboWithinSchedule(combo);
    return {
      ...combo,
      componentDetails,
      inStock,
      inSchedule,
      availableNow: combo.active !== false && inStock && inSchedule,
    };
  });
}

export async function getComboById(id) {
  if (!id) return null;
  if (mongoConnected) {
    const doc = await Combo.findOne({ id }).lean();
    return stripMongo(doc);
  }
  const found = mem.combos.find((c) => c.id === id);
  return found ? { ...found } : null;
}

export async function upsertCombo(data) {
  const id = String(data.id || `combo-${String(data.name || Date.now()).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`);
  if (!data.name || !Number(data.price)) {
    throw new Error('Combo name and price are required.');
  }
  const items = Array.isArray(data.items)
    ? data.items
        .filter((it) => it && it.productId)
        .map((it) => ({ productId: String(it.productId), qty: Math.max(1, Number(it.qty) || 1) }))
    : [];
  if (items.length === 0) {
    throw new Error('Select at least one component product for this combo.');
  }

  const payload = {
    id,
    name: String(data.name).trim(),
    description: String(data.description || '').trim(),
    image: String(data.image || '').trim(),
    emoji: data.emoji || '🍱',
    price: Math.max(1, Number(data.price)),
    originalPrice: Math.max(Number(data.price), Number(data.originalPrice) || Number(data.price)),
    items,
    scheduleStart: String(data.scheduleStart || '06:00'),
    scheduleEnd: String(data.scheduleEnd || '22:00'),
    active: data.active !== undefined ? Boolean(data.active) : true,
    featured: data.featured !== undefined ? Boolean(data.featured) : true,
  };

  if (mongoConnected) {
    const doc = await Combo.findOneAndUpdate({ id }, { $set: payload }, { new: true, upsert: true }).lean();
    return stripMongo(doc);
  }
  const idx = mem.combos.findIndex((c) => c.id === id);
  if (idx >= 0) {
    mem.combos[idx] = { ...mem.combos[idx], ...payload };
    return { ...mem.combos[idx] };
  }
  mem.combos.unshift(payload);
  return { ...payload };
}

export async function deleteCombo(id) {
  if (mongoConnected) {
    const res = await Combo.findOneAndDelete({ id }).lean();
    return Boolean(res);
  }
  const idx = mem.combos.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  mem.combos.splice(idx, 1);
  return true;
}

// ============================================================
// Referral Program & Fraud Checks Repository
// ============================================================
export async function findUserByReferralCode(code) {
  const norm = String(code || '').toUpperCase().trim();
  if (!norm) return null;
  if (mongoConnected) {
    const doc = await User.findOne({ referralCode: norm }).lean();
    return stripMongo(doc);
  }
  const found = mem.users.find((u) => String(u.referralCode || '').toUpperCase() === norm);
  return found ? { ...found } : null;
}

export async function createReferralRecord({ referrer, referredUser, referralCode }) {
  if (!referrer || !referredUser) return null;
  if (referrer.id === referredUser.id || referrer.email === referredUser.email) {
    throw new Error('Self-referral is not allowed.');
  }

  const settings = await getSettings();
  const rewardAmount = Math.max(10, Number(settings.referralRewardPoints ?? 50));
  const fraudFlags = [];

  if (
    referrer.mobileNumber &&
    referredUser.mobileNumber &&
    referrer.mobileNumber === referredUser.mobileNumber
  ) {
    fraudFlags.push('Matching mobile number with referrer');
  }

  const entry = {
    id: `ref-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    referrerUserId: referrer.id,
    referrerEmail: referrer.email,
    referredUserId: referredUser.id,
    referredEmail: referredUser.email,
    referralCode: String(referralCode).toUpperCase().trim(),
    rewardAmount,
    status: fraudFlags.length > 0 ? 'flagged' : 'pending',
    fraudFlags,
    orderId: '',
    creditedAt: '',
    createdAt: new Date().toISOString(),
  };

  if (mongoConnected) {
    const existing = await Referral.findOne({ referredUserId: referredUser.id }).lean();
    if (existing) return stripMongo(existing);
    const created = await Referral.create(entry);
    return stripMongo(created);
  }

  const existing = mem.referrals.find((r) => r.referredUserId === referredUser.id);
  if (existing) return { ...existing };
  mem.referrals.unshift(entry);
  return { ...entry };
}

export async function processReferralRewardForOrder(order) {
  if (!order || !order.userId) return null;
  let ref = null;
  if (mongoConnected) {
    ref = await Referral.findOne({ referredUserId: order.userId, status: 'pending' }).lean();
  } else {
    ref = mem.referrals.find((r) => r.referredUserId === order.userId && r.status === 'pending');
  }
  if (!ref) return null;

  // Fraud check: compare phone & shipping address with referrer
  const referrer = await findUserById(ref.referrerUserId);
  const referred = await findUserById(ref.referredUserId);
  if (!referrer || !referred) return null;

  const referrerAddresses = await listAddressesByUser(referrer.id);
  const fraudFlags = [...(ref.fraudFlags || [])];

  const cleanOrderPhone = String(order.customerPhone || order.address?.phone || '').replace(/\D/g, '').slice(-10);
  const cleanRefPhone = String(referrer.mobileNumber || referrer.phone || '').replace(/\D/g, '').slice(-10);
  if (cleanOrderPhone && cleanRefPhone && cleanOrderPhone === cleanRefPhone) {
    fraudFlags.push('Same delivery phone number as referrer');
  }

  const orderLine = String(order.address?.line1 || '').toLowerCase().trim();
  const orderPin = String(order.address?.pincode || '').trim();
  const sharesAddress = referrerAddresses.some((a) => {
    const refLine = [a.doorNumber, a.apartmentName, a.street, a.locality].filter(Boolean).join(', ').toLowerCase().trim();
    return a.pincode === orderPin && refLine && orderLine && (refLine.includes(orderLine) || orderLine.includes(refLine));
  });
  if (sharesAddress) {
    fraudFlags.push('Same delivery address as referrer');
  }

  const now = new Date().toISOString();
  if (fraudFlags.length > 0) {
    if (mongoConnected) {
      await Referral.updateOne(
        { id: ref.id },
        { $set: { status: 'flagged', fraudFlags, orderId: order.id } }
      );
    } else {
      const idx = mem.referrals.findIndex((r) => r.id === ref.id);
      if (idx >= 0) mem.referrals[idx] = { ...mem.referrals[idx], status: 'flagged', fraudFlags, orderId: order.id };
    }
    return { ...ref, status: 'flagged', fraudFlags };
  }

  // Clean first paid order -> credit BOTH referrer & referred user!
  const pts = Number(ref.rewardAmount) || 50;
  await updateUser(referrer.id, { rewardPoints: (referrer.rewardPoints || 0) + pts });
  await updateUser(referred.id, { rewardPoints: (referred.rewardPoints || 0) + pts });

  if (mongoConnected) {
    await Referral.updateOne(
      { id: ref.id },
      { $set: { status: 'credited', orderId: order.id, creditedAt: now } }
    );
  } else {
    const idx = mem.referrals.findIndex((r) => r.id === ref.id);
    if (idx >= 0) {
      mem.referrals[idx] = { ...mem.referrals[idx], status: 'credited', orderId: order.id, creditedAt: now };
    }
  }

  await createNotification({
    userId: referrer.id,
    type: 'offer',
    title: `Referral Reward Credited (+${pts} pts)!`,
    message: `Your friend ${referred.fullName || referred.email} completed their first order. You earned ${pts} reward points!`,
  });
  await createNotification({
    userId: referred.id,
    type: 'offer',
    title: `Welcome Referral Bonus (+${pts} pts)!`,
    message: `Thanks for completing your first order via referral code ${ref.referralCode}. ${pts} reward points have been added to your account!`,
  });

  return { ...ref, status: 'credited', orderId: order.id, creditedAt: now };
}

export async function listReferrals() {
  if (mongoConnected) {
    const docs = await Referral.find().sort({ createdAt: -1 }).limit(100).lean();
    return docs.map(stripMongo);
  }
  return mem.referrals.slice(0, 100);
}

export async function listReferralsByUser(userId) {
  if (mongoConnected) {
    const docs = await Referral.find({ referrerUserId: userId }).sort({ createdAt: -1 }).lean();
    return docs.map(stripMongo);
  }
  return mem.referrals.filter((r) => r.referrerUserId === userId);
}

export async function resolveReferral(referralId, action) {
  let ref = null;
  if (mongoConnected) {
    ref = await Referral.findOne({ id: referralId }).lean();
  } else {
    ref = mem.referrals.find((r) => r.id === referralId);
  }
  if (!ref) throw new Error('Referral record not found.');
  if (ref.status === 'credited') return ref;

  const now = new Date().toISOString();
  if (action === 'approve') {
    const referrer = await findUserById(ref.referrerUserId);
    const referred = await findUserById(ref.referredUserId);
    const pts = Number(ref.rewardAmount) || 50;
    if (referrer) await updateUser(referrer.id, { rewardPoints: (referrer.rewardPoints || 0) + pts });
    if (referred) await updateUser(referred.id, { rewardPoints: (referred.rewardPoints || 0) + pts });

    if (mongoConnected) {
      const updated = await Referral.findOneAndUpdate(
        { id: referralId },
        { $set: { status: 'credited', creditedAt: now } },
        { new: true }
      ).lean();
      return stripMongo(updated);
    }
    const idx = mem.referrals.findIndex((r) => r.id === referralId);
    mem.referrals[idx] = { ...mem.referrals[idx], status: 'credited', creditedAt: now };
    return { ...mem.referrals[idx] };
  }

  if (mongoConnected) {
    const updated = await Referral.findOneAndUpdate(
      { id: referralId },
      { $set: { status: 'rejected' } },
      { new: true }
    ).lean();
    return stripMongo(updated);
  }
  const idx = mem.referrals.findIndex((r) => r.id === referralId);
  mem.referrals[idx] = { ...mem.referrals[idx], status: 'rejected' };
  return { ...mem.referrals[idx] };
}



