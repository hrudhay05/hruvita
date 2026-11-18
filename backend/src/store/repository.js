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
import { DeliverySlot } from '../models/DeliverySlot.js';
import { Notification } from '../models/Notification.js';
import { Review } from '../models/Review.js';
import { Subscription } from '../models/Subscription.js';
import { Conversation } from '../models/Conversation.js';
import { AutomationLog } from '../models/AutomationLog.js';
import { computeCustomBowlPrice } from '../data/bowlOptions.js';
import {
  initialSettings,
  initialCategories,
  initialProducts,
  initialPlans,
  initialSlots,
  initialCoupons,
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
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
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

// Settings
export async function getSettings() {
  if (mongoConnected) {
    const doc = await BusinessSettings.findOne({ key: 'default' }).lean();
    return stripMongo(doc) || { ...initialSettings };
  }
  return { ...mem.settings };
}

export async function updateSettings(patch) {
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
    const list = await Category.find({ active: true }).sort({ sortOrder: 1, name: 1 }).lean();
    return list.map(stripMongo);
  }
  return mem.categories.filter((c) => c.active !== false).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

export async function upsertCategory(catData) {
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
    const query = includeInactive ? {} : { active: true };
    if (category) query.category = category;
    if (veg === '1' || veg === true) query.veg = true;
    if (stock === '1' || stock === true) query.stock = { $gt: 0 };
    const docs = await Product.find(query).lean();
    items = docs.map(stripMongo);
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
export async function listPlans() {
  if (mongoConnected) {
    const docs = await SubscriptionPlan.find({ active: true }).sort({ days: 1 }).lean();
    return docs.map(stripMongo);
  }
  return mem.plans.filter((p) => p.active !== false).map((p) => ({ ...p }));
}

export async function listSlots() {
  if (mongoConnected) {
    const docs = await DeliverySlot.find({ active: true }).lean();
    return docs.map(stripMongo);
  }
  return mem.slots.filter((s) => s.active !== false).map((s) => ({ ...s }));
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

export async function listCoupons() {
  if (mongoConnected) {
    const docs = await Coupon.find({ active: true }).lean();
    return docs.map(stripMongo);
  }
  return mem.coupons.filter((c) => c.active !== false).map((c) => ({ ...c }));
}

export async function listAllCoupons() {
  if (mongoConnected) {
    const docs = await Coupon.find().sort({ createdAt: -1 }).lean();
    return docs.map(stripMongo);
  }
  return mem.coupons.map((c) => ({ ...c }));
}

export async function upsertCoupon(data) {
  const code = String(data.code || '')
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .trim();
  if (!code) throw new Error('Coupon code is required.');

  const payload = {
    code,
    title: String(data.title || `${code} Offer`).trim(),
    type: data.type === 'flat' ? 'flat' : 'percent',
    value: Math.max(1, Number(data.value) || 10),
    minOrder: Math.max(0, Number(data.minOrder) || 0),
    maxDiscount: Math.max(1, Number(data.maxDiscount) || 100),
    firstOrderOnly: Boolean(data.firstOrderOnly),
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

// Server-side Checkout Quote & Validation (supports catalog items + custom fruit bowls)
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

  for (const [productId, rawQty] of entries) {
    const qty = Math.max(1, Math.floor(Number(rawQty)));
    const product = await getProductById(productId);
    if (!product || product.active === false) {
      throw new Error(`Item "${productId}" is no longer available.`);
    }
    if (product.stock < qty) {
      throw new Error(
        product.stock <= 0
          ? `"${product.name}" is out of stock.`
          : `Only ${product.stock} left of "${product.name}".`
      );
    }
    const price = unitPrice(product);
    const lineTotal = price * qty;
    subtotal += lineTotal;
    lineItems.push({
      productId: product.id,
      name: product.name,
      emoji: product.emoji || '🍲',
      unitPrice: price,
      mrp: product.price,
      qty,
      lineTotal,
    });
  }

  for (const bowl of validBowls) {
    const qty = Math.max(1, Math.floor(Number(bowl.qty || 1)));
    const computed = computeCustomBowlPrice(bowl);
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
    });
  }

  let couponDiscount = 0;
  let appliedCoupon = '';
  let couponMessage = '';
  if (couponCode && String(couponCode).trim()) {
    const coupon = await findCouponByCode(couponCode);
    if (!coupon) {
      couponMessage = 'Invalid or expired coupon code.';
    } else if (subtotal < (coupon.minOrder || 0)) {
      couponMessage = `Coupon ${coupon.code} requires a minimum order of ₹${coupon.minOrder}.`;
    } else {
      appliedCoupon = coupon.code;
      if (coupon.type === 'percent') {
        couponDiscount = Math.min(
          Math.round((subtotal * coupon.value) / 100),
          coupon.maxDiscount || subtotal
        );
      } else {
        couponDiscount = Math.min(coupon.value, subtotal);
      }
      couponMessage = `Coupon ${coupon.code} applied (saved ₹${couponDiscount}).`;
    }
  }

  let rewardPointsUsed = 0;
  if (useRewards && userId) {
    const user = await findUserById(userId);
    if (user && user.rewardPoints > 0) {
      const remainingAfterCoupon = Math.max(0, subtotal - couponDiscount);
      rewardPointsUsed = Math.min(user.rewardPoints, 50, remainingAfterCoupon);
    }
  }

  const discountedSubtotal = Math.max(0, subtotal - couponDiscount - rewardPointsUsed);
  const freeAbove = Number(settings.freeDeliveryAbove ?? 199);
  const baseDelivery = Number(settings.deliveryCharge ?? 25);
  const deliveryCharge = subtotal >= freeAbove ? 0 : baseDelivery;
  const taxRate = Number(settings.taxPercent ?? 5);
  const taxAmount = Math.round((discountedSubtotal * taxRate) / 100);
  const grandTotal = Math.max(0, discountedSubtotal + deliveryCharge + taxAmount);

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

// Atomic Stock Deduction & Restoration (skips custom bowls which deduct dynamically)
export async function deductOrderStockAtomically(lineItems) {
  const catalogItems = (lineItems || []).filter(
    (item) => !item.isCustomBowl && !String(item.productId || '').startsWith('custom-bowl')
  );
  if (mongoConnected) {
    const deducted = [];
    for (const item of catalogItems) {
      const updated = await Product.findOneAndUpdate(
        { id: item.productId, stock: { $gte: item.qty } },
        { $inc: { stock: -item.qty } },
        { new: true }
      );
      if (!updated) {
        for (const prev of deducted) {
          await Product.updateOne({ id: prev.productId }, { $inc: { stock: prev.qty } });
        }
        throw new Error(`Insufficient stock for "${item.name}".`);
      }
      deducted.push(item);
    }
    return true;
  }

  for (const item of catalogItems) {
    const prod = mem.products.find((p) => p.id === item.productId);
    if (!prod || prod.stock < item.qty) {
      throw new Error(`Insufficient stock for "${item?.name || item.productId}".`);
    }
  }
  for (const item of catalogItems) {
    const prod = mem.products.find((p) => p.id === item.productId);
    prod.stock -= item.qty;
  }
  return true;
}

export async function restoreOrderStock(lineItems) {
  for (const item of lineItems) {
    if (mongoConnected) {
      await Product.updateOne({ id: item.productId }, { $inc: { stock: item.qty } });
    } else {
      const prod = mem.products.find((p) => p.id === item.productId);
      if (prod) prod.stock += item.qty;
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

  if (order.paymentStatus === 'paid' && order.stockDeducted) {
    return order;
  }

  if (!order.stockDeducted) {
    await deductOrderStockAtomically(order.items);
  }

  if (order.pricing?.rewardPointsUsed > 0) {
    const user = await findUserById(order.userId);
    if (user) {
      const nextPoints = Math.max(0, (user.rewardPoints || 0) - order.pricing.rewardPointsUsed);
      await updateUser(user.id, { rewardPoints: nextPoints });
    }
  }

  const now = new Date().toISOString();
  const nextHistory = [
    ...(order.statusHistory || []),
    {
      status: 'confirmed',
      note: `Online payment verified (${razorpayPaymentId})`,
      by,
      at: now,
    },
  ];

  const patch = {
    status: 'confirmed',
    paymentStatus: 'paid',
    razorpayPaymentId,
    stockDeducted: true,
    statusHistory: nextHistory,
    updatedAt: now,
  };

  if (mongoConnected) {
    await Payment.findOneAndUpdate(
      { orderId },
      { $set: { razorpayPaymentId, status: 'captured', updatedAt: now } }
    );
    const updated = await Order.findOneAndUpdate({ id: orderId }, { $set: patch }, { new: true }).lean();
    return stripMongo(updated);
  }

  const payIdx = mem.payments.findIndex((p) => p.orderId === orderId);
  if (payIdx >= 0) {
    mem.payments[payIdx] = {
      ...mem.payments[payIdx],
      razorpayPaymentId,
      status: 'captured',
      updatedAt: now,
    };
  }
  const ordIdx = mem.orders.findIndex((o) => o.id === orderId);
  mem.orders[ordIdx] = { ...mem.orders[ordIdx], ...patch };
  return { ...mem.orders[ordIdx] };
}

export async function transitionOrderStatus({ orderId, status, note = '', by = 'admin' }) {
  if (!ORDER_STATUSES.includes(status)) {
    throw new Error(`Invalid order status: ${status}`);
  }
  const order = await getOrderById(orderId);
  if (!order) throw new Error('Order not found.');

  const now = new Date().toISOString();
  let stockDeducted = order.stockDeducted;
  let paymentStatus = order.paymentStatus;

  if (status === 'cancelled' && stockDeducted) {
    await restoreOrderStock(order.items);
    stockDeducted = false;
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
    statusHistory: nextHistory,
    updatedAt: now,
  };

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
    return stripMongo(updated);
  }

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
  return { ...mem.orders[ordIdx] };
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
    createdAt: new Date().toISOString(),
  };
  if (mongoConnected) {
    const created = await Review.create(entry);
    return stripMongo(created);
  }
  mem.reviews.unshift(entry);
  return { ...entry };
}

// Subscriptions Repository
export async function listSubscriptionsByUser(userId) {
  if (mongoConnected) {
    const docs = await Subscription.find({ userId }).sort({ createdAt: -1 }).lean();
    return docs.map(stripMongo);
  }
  return mem.subscriptions.filter((s) => s.userId === userId).map((s) => ({ ...s }));
}

export async function createSubscriptionRecord(data) {
  const entry = {
    id: `SUB-${Date.now().toString(36).toUpperCase()}`,
    ...data,
    pauseCount: 0,
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
  if (mongoConnected) {
    const existing = await Subscription.findOne({ id: subId, userId });
    if (!existing) return null;
    existing.status = existing.status === 'active' ? 'paused' : 'active';
    if (existing.status === 'paused') existing.pauseCount = (existing.pauseCount || 0) + 1;
    await existing.save();
    return stripMongo(existing);
  }
  const idx = mem.subscriptions.findIndex((s) => s.id === subId && s.userId === userId);
  if (idx === -1) return null;
  const nextStatus = mem.subscriptions[idx].status === 'active' ? 'paused' : 'active';
  mem.subscriptions[idx] = {
    ...mem.subscriptions[idx],
    status: nextStatus,
    pauseCount:
      nextStatus === 'paused'
        ? (mem.subscriptions[idx].pauseCount || 0) + 1
        : mem.subscriptions[idx].pauseCount || 0,
  };
  return { ...mem.subscriptions[idx] };
}

// Assistant Conversations Repository
export async function saveConversationTurn({
  conversationId,
  userId = 'guest',
  userName = 'Guest',
  language = 'en-IN',
  userText,
  assistantText,
  toolsUsed = [],
  addedToCart = false,
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
        $set: { language },
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



