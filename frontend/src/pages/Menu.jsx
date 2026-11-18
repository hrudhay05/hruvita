import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ProductCard from '../components/ProductCard.jsx';
import Button from '../components/Button.jsx';
import { useCatalog } from '../context/CatalogContext.jsx';
import { unitPrice } from '../lib/format.js';
import './Menu.css';

const sorters = {
  popular: (a, b) => Number(b.bestseller) - Number(a.bestseller),
  'price-asc': (a, b) => unitPrice(a) - unitPrice(b),
  'price-desc': (a, b) => unitPrice(b) - unitPrice(a),
};

export default function Menu() {
  const { categories, products, loading } = useCatalog();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const [searchText, setSearchText] = useState(q);
  const category = params.get('category') || '';
  const veg = params.get('veg') === '1';
  const inStock = params.get('stock') === '1';
  const sort = params.get('sort') || 'popular';
  const maxPrice = Number(params.get('max')) || 0;

  useEffect(() => {
    setSearchText(q);
  }, [q]);

  const set = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchText !== q) {
        const next = new URLSearchParams(params);
        if (searchText.trim()) next.set('q', searchText);
        else next.delete('q');
        setParams(next, { replace: true });
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [searchText, q, params, setParams]);

  const list = useMemo(() => {
    const term = searchText.trim().toLowerCase();
    return products
      .filter((p) => !category || p.category === category)
      .filter(
        (p) =>
          !term ||
          p.name.toLowerCase().includes(term) ||
          (p.description || '').toLowerCase().includes(term) ||
          (p.ingredients || []).some((i) => i.toLowerCase().includes(term))
      )
      .filter((p) => !veg || p.veg)
      .filter((p) => !inStock || p.stock > 0)
      .filter((p) => !maxPrice || unitPrice(p) <= maxPrice)
      .sort(sorters[sort] || sorters.popular);
  }, [products, searchText, category, veg, inStock, maxPrice, sort]);

  const reset = () => {
    setSearchText('');
    setParams({}, { replace: true });
  };

  return (
    <div className="container" style={{ paddingBottom: 48 }}>
      <header className="menu-head">
        <div>
          <h1>Explore Our Menu</h1>
          <p>{list.length} fresh item{list.length === 1 ? '' : 's'} available</p>
        </div>
        <Button to="/build-bowl" variant="accent" size="sm">
          Build Your Own Bowl
        </Button>
      </header>

      <div className="menu-chips" role="tablist" aria-label="Categories">
        <button
          type="button"
          className={`menu-chip ${!category ? 'menu-chip-on' : ''}`.trim()}
          onClick={() => set('category', '')}
        >
          All Items
        </button>
        {categories.map((c) => (
          <button
            key={c.slug}
            type="button"
            className={`menu-chip ${category === c.slug ? 'menu-chip-on' : ''}`.trim()}
            onClick={() => set('category', c.slug)}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="menu-filters">
        <input
          id="menu-search"
          name="q"
          type="search"
          className="menu-input"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search fruit bowls, tiffins, juices..."
          aria-label="Search the menu"
        />
        <select
          id="menu-max-price"
          name="maxPrice"
          className="menu-select"
          value={maxPrice || ''}
          onChange={(e) => set('max', e.target.value)}
          aria-label="Maximum price"
        >
          <option value="">Any price</option>
          <option value="50">Under ₹50</option>
          <option value="100">Under ₹100</option>
          <option value="150">Under ₹150</option>
        </select>
        <select
          id="menu-sort"
          name="sort"
          className="menu-select"
          value={sort}
          onChange={(e) => set('sort', e.target.value)}
          aria-label="Sort by"
        >
          <option value="popular">Featured</option>
          <option value="price-asc">Price: Low to High</option>
          <option value="price-desc">Price: High to Low</option>
        </select>
        <label className="menu-check">
          <input
            id="menu-veg"
            name="veg"
            type="checkbox"
            checked={veg}
            onChange={(e) => set('veg', e.target.checked ? '1' : '')}
          />
          Vegetarian
        </label>
        <label className="menu-check">
          <input
            id="menu-stock"
            name="stock"
            type="checkbox"
            checked={inStock}
            onChange={(e) => set('stock', e.target.checked ? '1' : '')}
          />
          Available now
        </label>
      </div>

      {loading ? (
        <div className="menu-cards">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <div key={n} className="skeleton-card" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="menu-empty">
          <p>No items match your current filters.</p>
          <button type="button" className="menu-reset" onClick={reset}>
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="menu-cards">
          {list.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
