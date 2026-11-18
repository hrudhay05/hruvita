import { Router } from 'express';
import {
  getSettings,
  updateSettings,
  listCategories,
  upsertCategory,
  listProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  listPlans,
  recordAudit,
} from '../store/repository.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// Business Settings
router.get('/settings', async (_req, res) => {
  const settings = await getSettings();
  res.json({ settings });
});

router.put('/settings', requireAuth, requireRole('admin'), async (req, res) => {
  const allowed = [
    'name',
    'tagline',
    'city',
    'phone',
    'email',
    'hours',
    'currency',
    'deliveryCharge',
    'freeDeliveryAbove',
    'taxPercent',
    'cutoffHour',
    'storeOpen',
    'aiEnabled',
  ];
  const patch = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) patch[key] = req.body[key];
  }
  const settings = await updateSettings(patch);
  await recordAudit({
    actorId: req.user.id,
    actorEmail: req.user.email,
    action: 'UPDATE_SETTINGS',
    entity: 'settings',
    entityId: 'default',
    details: patch,
  });
  res.json({ settings });
});

// Categories
router.get('/categories', async (_req, res) => {
  const categories = await listCategories();
  res.json({ categories });
});

router.post('/categories', requireAuth, requireRole('admin', 'staff'), async (req, res) => {
  if (!req.body?.name) {
    return res.status(400).json({ error: 'Category name is required.' });
  }
  const category = await upsertCategory(req.body);
  await recordAudit({
    actorId: req.user.id,
    actorEmail: req.user.email,
    action: 'UPSERT_CATEGORY',
    entity: 'category',
    entityId: category.slug,
    details: { name: category.name },
  });
  res.status(201).json({ category });
});

// Products
router.get('/products', async (req, res) => {
  const products = await listProducts({
    q: req.query.q || '',
    category: req.query.category || '',
    veg: req.query.veg || '',
    stock: req.query.stock || '',
    max: req.query.max || 0,
    sort: req.query.sort || 'popular',
    includeInactive: req.query.all === '1',
  });
  res.json({ products });
});

router.get('/products/:id', async (req, res) => {
  const product = await getProductById(req.params.id);
  if (!product) {
    return res.status(404).json({ error: 'Product not found.' });
  }
  res.json({ product });
});

router.post('/products', requireAuth, requireRole('admin', 'staff'), async (req, res) => {
  const { name, price, category } = req.body || {};
  if (!name || price === undefined || !category) {
    return res.status(400).json({ error: 'Product name, category and price are required.' });
  }
  const product = await createProduct(req.body);
  await recordAudit({
    actorId: req.user.id,
    actorEmail: req.user.email,
    action: 'CREATE_PRODUCT',
    entity: 'product',
    entityId: product.id,
    details: { name: product.name, price: product.price },
  });
  res.status(201).json({ product });
});

router.put('/products/:id', requireAuth, requireRole('admin', 'staff'), async (req, res) => {
  const product = await updateProduct(req.params.id, req.body || {});
  if (!product) {
    return res.status(404).json({ error: 'Product not found.' });
  }
  await recordAudit({
    actorId: req.user.id,
    actorEmail: req.user.email,
    action: 'UPDATE_PRODUCT',
    entity: 'product',
    entityId: product.id,
    details: { name: product.name, stock: product.stock, price: product.price },
  });
  res.json({ product });
});

router.delete('/products/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const ok = await deleteProduct(req.params.id);
  if (!ok) {
    return res.status(404).json({ error: 'Product not found.' });
  }
  await recordAudit({
    actorId: req.user.id,
    actorEmail: req.user.email,
    action: 'DELETE_PRODUCT',
    entity: 'product',
    entityId: req.params.id,
  });
  res.json({ deleted: true });
});

// Subscription Plans
router.get('/plans', async (_req, res) => {
  const plans = await listPlans();
  res.json({ plans });
});

export default router;
