import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FiHeart, FiPlus, FiSliders } from 'react-icons/fi';
import { useCatalog } from '../context/CatalogContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { discountPercent, money, unitPrice } from '../lib/format.js';
import './ProductCard.css';

const FALLBACK_FOOD_IMG =
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=700&q=80';

export default function ProductCard({ product }) {
  const { refreshCatalog } = useCatalog();
  const { add, items } = useCart();
  const { user, toggleWishlist } = useAuth();
  const { showToast } = useToast();

  const [imgSrc, setImgSrc] = useState(product.image || FALLBACK_FOOD_IMG);
  const [guestLiked, setGuestLiked] = useState(false);

  const out = product.stock <= 0;
  const off = discountPercent(product);
  const inCart = items[product.id] || 0;
  const isLiked = user ? Boolean(user.wishlist?.includes(product.id)) : guestLiked;
  const canCustomize = product.category === 'fruit-bowls';

  const handleAddToCart = () => {
    add(product.id);
    showToast(`${product.name} added to cart.`);
  };

  const handleLikeClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (user) {
      await toggleWishlist(product.id);
      await refreshCatalog();
    } else {
      setGuestLiked((prev) => !prev);
    }
  };

  return (
    <article className={`product-card ${out ? 'product-card-out' : ''}`.trim()}>
      <div className="product-media-wrap">
        <Link to={`/product/${product.id}`} className="product-media">
          <img
            src={imgSrc}
            alt={product.name}
            className="product-photo"
            loading="lazy"
            onError={() => setImgSrc(FALLBACK_FOOD_IMG)}
          />
          <div className="product-badges">
            {product.bestseller && <span className="product-badge product-badge-best">Bestseller</span>}
            {off > 0 && !out && <span className="product-badge product-badge-off">{off}% OFF</span>}
            {out && <span className="product-badge product-badge-sold">Unavailable</span>}
          </div>
        </Link>

        <button
          type="button"
          className={`product-like-btn ${isLiked ? 'product-like-active' : ''}`.trim()}
          onClick={handleLikeClick}
          aria-label={isLiked ? `Remove ${product.name} from favorites` : `Save ${product.name} to favorites`}
        >
          <FiHeart size={15} />
        </button>
      </div>

      <div className="product-body">
        <div className="product-meta-row">
          <span className={`product-dot ${product.veg ? 'product-veg' : 'product-nonveg'}`} />
          <span className="product-cat-label">{product.category.replace(/-/g, ' ')}</span>
          {!out && product.prepMins > 0 && (
            <span className="product-prep-label">{product.prepMins} min</span>
          )}
        </div>

        <h3 className="product-name">
          <Link to={`/product/${product.id}`}>{product.name}</Link>
        </h3>
        <p className="product-desc">{product.description}</p>

        <div className="product-foot">
          <div className="product-price">
            <strong>{money(unitPrice(product))}</strong>
            {product.discountPrice && <del>{money(product.price)}</del>}
          </div>

          <div className="product-foot-actions">
            {canCustomize && (
              <Link
                to="/build-bowl"
                className="product-customize-btn"
                title="Customize your own bowl"
              >
                <FiSliders size={13} /> Customize
              </Link>
            )}
            <button
              type="button"
              className={`product-add ${inCart > 0 ? 'product-add-active' : ''}`.trim()}
              disabled={out}
              onClick={handleAddToCart}
              aria-label={`Add ${product.name} to cart`}
            >
              <FiPlus size={15} /> {inCart > 0 ? `In Cart (${inCart})` : 'Add'}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
