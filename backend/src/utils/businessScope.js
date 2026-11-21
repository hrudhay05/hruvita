export const GROCERY_CATEGORY_SLUGS = new Set([
  'fresh-fruits',
  'fresh-vegetables',
  'organic-staples',
  'cooking-essentials',
  'bath-personal-care',
  'home-cleaning',
]);

export function isGroceryCategory(catOrSlug) {
  if (!catOrSlug) return false;
  if (typeof catOrSlug === 'string') {
    const slug = catOrSlug.trim().toLowerCase();
    return GROCERY_CATEGORY_SLUGS.has(slug) || slug.startsWith('grocery-');
  }
  if (catOrSlug.businessType === 'grocery') return true;
  const slug = String(catOrSlug.slug || '').trim().toLowerCase();
  return GROCERY_CATEGORY_SLUGS.has(slug) || slug.startsWith('grocery-');
}

export function isGroceryProduct(product) {
  if (!product) return false;
  if (product.businessType === 'grocery') return true;
  if (product.businessType === 'fruits') return false;
  const cat = String(product.category || '').trim().toLowerCase();
  if (GROCERY_CATEGORY_SLUGS.has(cat) || cat.startsWith('grocery-')) return true;
  if (/^g\d+$/i.test(String(product.id || ''))) return true;
  return false;
}

export function isGroceryOrder(order, productMap) {
  const items = Array.isArray(order?.items) ? order.items : [];
  if (!items.length) return false;
  return items.some((it) => {
    const rawId = String(it.productId || '').replace(/^combo:/, '');
    const prod = productMap?.get(rawId);
    if (prod) return isGroceryProduct(prod);
    return isGroceryProduct({ id: rawId, category: it.category || '' });
  });
}
