import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { categories as fallbackCategories } from '../data/categories.js';
import { products as fallbackProducts } from '../data/products.js';
import { plans as fallbackPlans } from '../data/plans.js';
import { brand as fallbackBrand } from '../config/brand.js';
import { apiRequest } from '../lib/api.js';

const CatalogContext = createContext(null);

export function CatalogProvider({ children }) {
  const [categories, setCategories] = useState(fallbackCategories);
  const [products, setProducts] = useState(fallbackProducts);
  const [plans, setPlans] = useState(fallbackPlans);
  const [settings, setSettings] = useState(fallbackBrand);
  const [loading, setLoading] = useState(true);

  const refreshCatalog = useCallback(async () => {
    try {
      const [catRes, prodRes, planRes, setRes] = await Promise.all([
        apiRequest('/api/categories'),
        apiRequest('/api/products'),
        apiRequest('/api/plans'),
        apiRequest('/api/settings'),
      ]);
      if (catRes.categories?.length) setCategories(catRes.categories);
      if (prodRes.products?.length) setProducts(prodRes.products);
      if (planRes.plans?.length) setPlans(planRes.plans);
      if (setRes.settings) setSettings((prev) => ({ ...prev, ...setRes.settings }));
    } catch {
      // Fallback to local static data if backend is offline
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCatalog();
  }, [refreshCatalog]);

  const categoryBySlug = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.slug, c])),
    [categories]
  );

  const productById = useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, p])),
    [products]
  );

  return (
    <CatalogContext.Provider
      value={{
        categories,
        categoryBySlug,
        products,
        productById,
        plans,
        settings,
        loading,
        refreshCatalog,
      }}
    >
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog() {
  return useContext(CatalogContext);
}
