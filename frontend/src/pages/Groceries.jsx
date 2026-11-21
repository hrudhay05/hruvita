import { useMemo, useState } from 'react';
import { FiSearch, FiShoppingBag } from 'react-icons/fi';
import { Link, useSearchParams } from 'react-router-dom';
import Button from '../components/Button.jsx';
import { ProductGridSkeleton } from '../components/Skeleton.jsx';
import { useCatalog } from '../context/CatalogContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { money, unitPrice } from '../lib/format.js';
import './Groceries.css';

const GROCERY_SLUGS = [
  'fresh-fruits',
  'fresh-vegetables',
  'organic-staples',
  'dairy',
  'cooking-essentials',
  'bath-personal-care',
  'home-cleaning',
];

const AISLES = [
  { slug: 'all', name: 'All Home & Grocery', emoji: '🛒', tint: '#e8f5ec' },
  { slug: 'fresh-fruits', name: 'Fresh Fruits', emoji: '🍎', tint: '#fde8e8' },
  { slug: 'fresh-vegetables', name: 'Farm Vegetables', emoji: '🥬', tint: '#e6f6ea' },
  { slug: 'cooking-essentials', name: 'Cooking & Kitchen', emoji: '🍳', tint: '#fff3e0' },
  { slug: 'organic-staples', name: 'Pantry & Staples', emoji: '🍯', tint: '#fef6e0' },
  { slug: 'bath-personal-care', name: 'Bath & Soaps', emoji: '🧼', tint: '#e8f4fd' },
  { slug: 'home-cleaning', name: 'Home & Cleaning', emoji: '🧹', tint: '#eafaf1' },
  { slug: 'dairy', name: 'Farm Dairy', emoji: '🥛', tint: '#eef2ff' },
];

export default function Groceries() {
  const { products, loading } = useCatalog();
  const { items, add, setQty, count } = useCart();
  const { showToast } = useToast();
  const [params, setParams] = useSearchParams();
  const initialAisle = params.get('aisle') || 'all';
  const [aisle, setAisle] = useState(initialAisle);
  const [search, setSearch] = useState('');

  const groceryProducts = useMemo(
    () => products.filter((p) => GROCERY_SLUGS.includes(p.category)),
    [products]
  );

  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groceryProducts.filter((p) => {
      if (aisle !== 'all' && p.category !== aisle) return false;
      if (q) {
        const match =
          p.name.toLowerCase().includes(q) ||
          String(p.description || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [groceryProducts, aisle, search]);

  const selectAisle = (slug) => {
    setAisle(slug);
    const next = new URLSearchParams(params);
    if (slug === 'all') next.delete('aisle');
    else next.set('aisle', slug);
    setParams(next, { replace: true });
  };

  return (
    <div className="container groc-page">
      <section className="groc-hero">
        <div>
          <span className="groc-badge">⚡ HRUVITA INSTAMART &bull; HOME &amp; GROCERY</span>
          <h1>Fruits, Cooking, Bath Soaps &amp; Home Cleaning</h1>
          <p>
            Everything your home needs — farm produce, cold-pressed oils, rice, atta, bath soaps, shampoo, dishwash &amp; floor cleaners in one quick cart.
          </p>
          <div className="groc-hero-perks">
            <span className="groc-hero-perk">🌅 6:00 AM – 9:00 AM Express</span>
            <span className="groc-hero-perk">🧼 Bath, Kitchen &amp; Cleaning</span>
            <span className="groc-hero-perk">🍎 Zero Wax &amp; Fresh Produce</span>
          </div>
        </div>
        <div className="groc-hero-mosaic" aria-hidden="true">
          <img
            src="https://images.unsplash.com/photo-1610832958506-aa56368176cf?auto=format&fit=crop&w=400&q=80"
            alt="Fresh fruits"
            loading="lazy"
          />
          <img
            src="https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=400&q=80"
            alt="Cooking staples"
            loading="lazy"
          />
          <img
            src="https://images.unsplash.com/photo-1600857062241-98e5dba7f214?auto=format&fit=crop&w=400&q=80"
            alt="Bath soaps"
            loading="lazy"
          />
          <img
            src="https://images.unsplash.com/photo-1585421514738-01798e348b17?auto=format&fit=crop&w=400&q=80"
            alt="Home cleaning"
            loading="lazy"
          />
        </div>
      </section>

      <section className="groc-aisles" aria-label="Grocery Aisles">
        {AISLES.map((a) => {
          const aisleCount =
            a.slug === 'all'
              ? groceryProducts.length
              : groceryProducts.filter((p) => p.category === a.slug).length;
          return (
            <button
              key={a.slug}
              type="button"
              className={`groc-aisle-card ${aisle === a.slug ? 'groc-aisle-active' : ''}`}
              onClick={() => selectAisle(a.slug)}
            >
              <span className="groc-aisle-icon" style={{ background: a.tint }}>
                {a.emoji}
              </span>
              <div>
                <div className="groc-aisle-title">{a.name}</div>
                <div className="groc-aisle-count">{aisleCount} items</div>
              </div>
            </button>
          );
        })}
      </section>

      <div className="groc-toolbar">
        <div className="groc-search">
          <FiSearch size={16} color="#5e7668" />
          <input
            type="search"
            placeholder="Search soaps, atta, rice, oil, shampoo, dishwash, fruits..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button to="/cart" size="sm">
          <FiShoppingBag size={15} /> View Cart ({count})
        </Button>
      </div>

      {loading ? (
        <ProductGridSkeleton count={8} className="groc-grid" />
      ) : visibleProducts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--muted)' }}>
          <p>No items match your search right now.</p>
          <Button type="button" size="sm" onClick={() => { setSearch(''); selectAisle('all'); }}>
            Show All Items
          </Button>
        </div>
      ) : (
        <div className="groc-grid">
          {visibleProducts.map((p) => {
            const finalPrice = unitPrice(p);
            const mrp = Number(p.price || finalPrice);
            const offPct = mrp > finalPrice ? Math.round(((mrp - finalPrice) / mrp) * 100) : 0;
            const packLabel = p.sizes?.[0]?.name || '';
            const cartKey = packLabel ? `${p.id}::${packLabel}` : p.id;
            const inCartQty = Number(items?.[cartKey] || 0);

            return (
              <article key={p.id} className="im-card">
                <div>
                  <Link to={`/product/${p.id}`} className="im-img-wrap">
                    <img src={p.image} alt={p.name} loading="lazy" />
                    {offPct > 0 && <span className="im-off-badge">{offPct}% OFF</span>}
                  </Link>
                  <div style={{ display: 'grid', gap: 3, marginTop: 6 }}>
                    <span className="im-eta-pill">⚡ {p.prepMins || 5} MINS PACK</span>
                    <Link to={`/product/${p.id}`} className="im-title" title={p.name}>
                      {p.name}
                    </Link>
                    <span className="im-pack">{packLabel || 'Standard Pack'}</span>
                  </div>
                </div>

                <div className="im-bottom">
                  <div className="im-price-col">
                    <span className="im-price">{money(finalPrice)}</span>
                    {mrp > finalPrice && <span className="im-mrp">{money(mrp)}</span>}
                  </div>

                  {inCartQty > 0 ? (
                    <div className="im-stepper" aria-label={`Quantity for ${p.name}`}>
                      <button
                        type="button"
                        onClick={() => setQty(cartKey, inCartQty - 1)}
                        aria-label="Decrease quantity"
                      >
                        −
                      </button>
                      <span>{inCartQty}</span>
                      <button
                        type="button"
                        onClick={() => setQty(cartKey, inCartQty + 1)}
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="im-add-btn"
                      onClick={() => {
                        add(p.id, 1, packLabel);
                        showToast(`Added ${p.name} to cart`);
                      }}
                    >
                      ADD
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
