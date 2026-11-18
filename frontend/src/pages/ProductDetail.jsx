import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FiArrowLeft, FiClock, FiHeart, FiMinus, FiPlus, FiSliders } from 'react-icons/fi';
import Button from '../components/Button.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { useCatalog } from '../context/CatalogContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { discountPercent, money, unitPrice } from '../lib/format.js';
import './ProductDetail.css';

const FALLBACK_IMG =
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=700&q=80';

export default function ProductDetail() {
  const { id } = useParams();
  const { productById, products, categoryBySlug, refreshCatalog } = useCatalog();
  const { add, items } = useCart();
  const { user, toggleWishlist } = useAuth();
  const { showToast } = useToast();

  const product = productById[id];
  const [selectedSizeIdx, setSelectedSizeIdx] = useState(0);
  const [qty, setQty] = useState(1);
  const [guestLiked, setGuestLiked] = useState(false);

  if (!product) {
    return (
      <div className="container" style={{ padding: '72px 0', textAlign: 'center' }}>
        <h1>Item not found</h1>
        <p style={{ margin: '8px 0 18px', color: 'var(--muted)' }}>
          This product is currently unavailable.
        </p>
        <Button to="/menu">Back to Menu</Button>
      </div>
    );
  }

  const out = product.stock <= 0;
  const off = discountPercent(product);
  const cat = categoryBySlug[product.category];
  const sizes = product.sizes?.length ? product.sizes : [{ name: 'Regular', priceDelta: 0 }];
  const activeSize = sizes[selectedSizeIdx] || sizes[0];
  const sizeKey = sizes.length > 1 && activeSize?.name ? `${product.id}::${activeSize.name}` : product.id;
  const inCart = items[sizeKey] || 0;
  const displayPrice = unitPrice(product) + (activeSize?.priceDelta || 0);
  const wished = user ? Boolean(user.wishlist?.includes(product.id)) : guestLiked;
  const related = products
    .filter((p) => p.category === product.category && p.id !== product.id)
    .slice(0, 4);

  const handleWishToggle = async () => {
    if (user) {
      await toggleWishlist(product.id);
      await refreshCatalog();
    } else {
      setGuestLiked((v) => !v);
    }
  };

  const handleAddToCart = () => {
    const selectedLabel = sizes.length > 1 && activeSize?.name ? activeSize.name : '';
    add(product.id, qty, selectedLabel);
    showToast(
      `${qty} × ${product.name}${selectedLabel ? ` (${selectedLabel})` : ''} added to cart.`
    );
  };

  return (
    <div className="container">
      <Link to="/menu" className="product-detail-back">
        <FiArrowLeft size={16} /> Back to Menu
      </Link>

      <div className="product-detail-grid">
        <div className="product-detail-art">
          <img
            src={product.image || FALLBACK_IMG}
            alt={product.name}
            className="product-detail-photo"
            onError={(e) => {
              e.currentTarget.src = FALLBACK_IMG;
            }}
          />
          <button
            type="button"
            className={`product-detail-wish ${wished ? 'product-detail-wish-active' : ''}`.trim()}
            onClick={handleWishToggle}
            aria-label={wished ? 'Remove from favorites' : 'Save to favorites'}
          >
            <FiHeart size={17} />
            <span>{wished ? 'Saved' : 'Save'}</span>
          </button>
        </div>

        <div className="product-detail-info">
          <div className="product-detail-meta">
            <span className="product-detail-pill">{cat?.name || product.category}</span>
            <span>{product.veg ? 'Pure Vegetarian' : 'Non-Vegetarian'}</span>
            {product.prepMins > 0 && (
              <span>
                <FiClock size={14} style={{ verticalAlign: 'middle' }} /> {product.prepMins} mins
              </span>
            )}
            <span style={{ color: out ? 'var(--danger)' : 'var(--primary)', fontWeight: 600 }}>
              {out ? 'Currently Unavailable' : 'In Stock'}
            </span>
          </div>

          <h1>{product.name}</h1>
          <p className="product-detail-desc">{product.description}</p>

          <div className="product-detail-price-box">
            <strong>{money(displayPrice)}</strong>
            {product.discountPrice && (
              <del>{money(product.price + (activeSize?.priceDelta || 0))}</del>
            )}
            {off > 0 && <span className="product-detail-pill">{off}% OFF</span>}
          </div>

          {sizes.length > 1 && (
            <div>
              <strong style={{ fontSize: '0.9rem', display: 'block', marginBottom: 8 }}>
                Select Size
              </strong>
              <div className="product-detail-sizes">
                {sizes.map((sz, idx) => (
                  <button
                    key={sz.name}
                    type="button"
                    className={`product-detail-size ${
                      idx === selectedSizeIdx ? 'product-detail-size-active' : ''
                    }`.trim()}
                    onClick={() => setSelectedSizeIdx(idx)}
                  >
                    {sz.name} {sz.priceDelta > 0 ? `(+${money(sz.priceDelta)})` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          {product.ingredients?.length > 0 && (
            <div>
              <strong style={{ fontSize: '0.9rem', display: 'block', marginBottom: 8 }}>
                Ingredients
              </strong>
              <div className="product-detail-tags">
                {product.ingredients.map((ing) => (
                  <span key={ing} className="product-detail-tag">
                    {ing}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(product.dietTags?.length > 0 || product.allergenTags?.length > 0) && (
            <div>
              <strong style={{ fontSize: '0.9rem', display: 'block', marginBottom: 8 }}>
                Dietary &amp; Allergen Notes
              </strong>
              <div className="product-detail-tags">
                {(product.dietTags || []).map((tag) => (
                  <span key={tag} className="product-detail-tag">
                    {tag}
                  </span>
                ))}
                {(product.allergenTags || []).map((alg) => (
                  <span key={alg} className="product-detail-tag product-detail-allergen">
                    Contains: {alg}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="product-detail-actions">
            {!out && (
              <div className="cart-qty" style={{ padding: '4px 10px', border: '1px solid var(--line)', borderRadius: 999, background: 'var(--white)' }}>
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  aria-label="Decrease quantity"
                >
                  <FiMinus size={15} />
                </button>
                <b>{qty}</b>
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.min(product.stock, q + 1))}
                  aria-label="Increase quantity"
                >
                  <FiPlus size={15} />
                </button>
              </div>
            )}

            <Button variant="primary" size="lg" disabled={out} onClick={handleAddToCart}>
              <FiPlus size={18} />
              {out ? 'Unavailable' : inCart > 0 ? `Add to Cart (${inCart} in cart)` : 'Add to Cart'}
            </Button>

            {product.category === 'fruit-bowls' && (
              <Button to="/build-bowl" variant="accent" size="lg">
                <FiSliders size={16} /> Customize Bowl
              </Button>
            )}
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="product-detail-related">
          <h2>More from {cat?.name || 'Our Kitchen'}</h2>
          <div className="product-detail-related-grid">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
