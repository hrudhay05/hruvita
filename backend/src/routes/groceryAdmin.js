import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  listProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  listCategories,
  upsertCategory,
  listAllOrders,
  recordAudit,
} from '../store/repository.js';
import { isGroceryCategory, isGroceryProduct } from '../utils/businessScope.js';
import { emitProductUpdated } from '../services/realtimeService.js';

const router = Router();
const EXCLUDED_REV_STATUSES = new Set(['cancelled', 'refund_initiated', 'refunded', 'payment_pending']);

// Strictly restricted to Grocery Admin ONLY (Catalog + Grocery-only Order & Payment History)
router.use(requireAuth, requireRole('grocery_admin'));

function extractGroceryOrdersAndPayments(orders, prodMap) {
  const groceryOrders = [];
  const groceryPayments = [];
  let codTotal = 0;
  let onlineTotal = 0;
  let codCount = 0;
  let onlineCount = 0;

  for (const ord of orders) {
    const gItems = (ord.items || []).filter((it) => {
      const pid = String(it.productId || '');
      if (!pid || pid.startsWith('combo:') || pid.startsWith('custom-')) return false;
      const prod = prodMap.get(pid) || { id: pid, category: it.category || '' };
      return isGroceryProduct(prod);
    });

    if (gItems.length === 0) continue;

    // Strictly sum ONLY grocery items (exclude tiffins/fruits if user combined items in one order)
    const groceryTotal = Math.round(
      gItems.reduce((sum, it) => sum + Number(it.lineTotal || Number(it.unitPrice || 0) * Number(it.qty || 1)), 0)
    );

    const methodType = ord.paymentMethod === 'cod' ? 'COD' : 'Online';
    const isMixedOrder = gItems.length < (ord.items || []).length;

    groceryOrders.push({
      id: ord.id,
      customerName: ord.customerName || ord.address?.recipient || 'Customer',
      customerEmail: ord.customerEmail || '',
      scheduledDate: ord.scheduledDate || '',
      status: ord.status,
      paymentMethod: ord.paymentMethod || 'cod',
      methodType,
      paymentStatus: ord.paymentStatus || 'pending',
      items: gItems,
      groceryTotal,
      isMixedOrder,
      createdAt: ord.createdAt,
    });

    const isValidRev = !EXCLUDED_REV_STATUSES.has(ord.status);
    if (isValidRev) {
      if (methodType === 'COD') {
        codTotal += groceryTotal;
        codCount += 1;
      } else {
        onlineTotal += groceryTotal;
        onlineCount += 1;
      }
    }

    groceryPayments.push({
      id: `gpay-${ord.id}`,
      orderId: ord.id,
      customerName: ord.customerName || ord.address?.recipient || 'Customer',
      methodType,
      rawMethod: ord.paymentMethod || 'cod',
      paymentStatus: ord.paymentStatus || 'pending',
      orderStatus: ord.status,
      groceryAmount: groceryTotal,
      itemCount: gItems.reduce((s, it) => s + Number(it.qty || 1), 0),
      isMixedOrder,
      createdAt: ord.createdAt,
    });
  }

  return {
    groceryOrders,
    groceryPayments,
    paymentSummary: {
      totalGroceryRevenue: codTotal + onlineTotal,
      codTotal,
      onlineTotal,
      codCount,
      onlineCount,
    },
  };
}

router.get('/overview', async (_req, res) => {
  const [products, categories, orders] = await Promise.all([
    listProducts({ includeInactive: true }),
    listCategories(),
    listAllOrders(),
  ]);
  const prodMap = new Map(products.map((p) => [p.id, p]));
  const groceryProducts = products.filter(isGroceryProduct);
  const groceryCategories = categories.filter(isGroceryCategory);
  const { groceryOrders, groceryPayments, paymentSummary } = extractGroceryOrdersAndPayments(orders, prodMap);

  const lowStockCount = groceryProducts.filter((p) => p.stock > 0 && p.stock <= (p.lowStockThreshold ?? 5)).length;
  const outOfStockCount = groceryProducts.filter((p) => p.stock <= 0).length;

  res.json({
    scope: 'grocery',
    stats: {
      totalProducts: groceryProducts.length,
      totalCategories: groceryCategories.length,
      totalGroceryOrders: groceryOrders.length,
      lowStockCount,
      outOfStockCount,
      ...paymentSummary,
    },
    categories: groceryCategories,
    products: groceryProducts,
    orders: groceryOrders,
    payments: groceryPayments,
  });
});

router.get('/categories', async (_req, res) => {
  const categories = await listCategories();
  res.json({ categories: categories.filter(isGroceryCategory) });
});

router.post('/categories', async (req, res) => {
  if (!req.body?.name) {
    return res.status(400).json({ error: 'Category name is required.' });
  }
  const rawSlug = String(req.body.slug || req.body.name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const slug = isGroceryCategory(rawSlug) ? rawSlug : `grocery-${rawSlug}`;

  const category = await upsertCategory({
    ...req.body,
    slug,
    businessType: 'grocery',
  });
  await recordAudit({
    actorId: req.user.id,
    actorEmail: req.user.email,
    action: 'GROCERY_UPSERT_CATEGORY',
    entity: 'category',
    entityId: category.slug,
    details: { name: category.name },
  });
  res.status(201).json({ category });
});

router.get('/products', async (_req, res) => {
  const products = await listProducts({ includeInactive: true });
  res.json({ products: products.filter(isGroceryProduct) });
});

router.post('/products', async (req, res) => {
  const { name, price, category } = req.body || {};
  if (!name || price === undefined || !category) {
    return res.status(400).json({ error: 'Product name, category and price are required.' });
  }
  if (!isGroceryCategory(category)) {
    return res.status(403).json({
      error: 'Grocery Admin can only create products in grocery categories.',
    });
  }
  const product = await createProduct({
    ...req.body,
    businessType: 'grocery',
  });
  await recordAudit({
    actorId: req.user.id,
    actorEmail: req.user.email,
    action: 'GROCERY_CREATE_PRODUCT',
    entity: 'product',
    entityId: product.id,
    details: { name: product.name, price: product.price },
  });
  emitProductUpdated(product, 'product:created');
  res.status(201).json({ product });
});

router.put('/products/:id', async (req, res) => {
  const existing = await getProductById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found.' });
  if (!isGroceryProduct(existing)) {
    return res.status(403).json({ error: 'Forbidden: Grocery Admin cannot modify fruit/kitchen items.' });
  }
  if (req.body?.category && !isGroceryCategory(req.body.category)) {
    return res.status(403).json({ error: 'Cannot move a grocery product into a non-grocery category.' });
  }

  const product = await updateProduct(req.params.id, {
    ...(req.body || {}),
    businessType: 'grocery',
  });
  await recordAudit({
    actorId: req.user.id,
    actorEmail: req.user.email,
    action: 'GROCERY_UPDATE_PRODUCT',
    entity: 'product',
    entityId: product.id,
    details: { name: product.name, stock: product.stock, price: product.price },
  });
  emitProductUpdated(product, 'product:updated');
  res.json({ product });
});

router.delete('/products/:id', async (req, res) => {
  const existing = await getProductById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found.' });
  if (!isGroceryProduct(existing)) {
    return res.status(403).json({ error: 'Forbidden: Grocery Admin cannot delete fruit/kitchen items.' });
  }
  await deleteProduct(req.params.id);
  await recordAudit({
    actorId: req.user.id,
    actorEmail: req.user.email,
    action: 'GROCERY_DELETE_PRODUCT',
    entity: 'product',
    entityId: req.params.id,
  });
  emitProductUpdated({ id: req.params.id }, 'product:deleted');
  res.json({ deleted: true });
});

export default router;
