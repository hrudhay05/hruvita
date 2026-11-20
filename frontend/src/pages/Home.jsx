import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiAward, FiCheckCircle, FiClock, FiFeather, FiHeart, FiTruck } from 'react-icons/fi';
import Button from '../components/Button.jsx';
import SectionHeader from '../components/SectionHeader.jsx';
import ProductCard from '../components/ProductCard.jsx';
import PlanCard from '../components/PlanCard.jsx';
import BowlBuilderSection from '../components/BowlBuilderSection.jsx';
import { useCatalog } from '../context/CatalogContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { apiRequest } from '../lib/api.js';
import { money } from '../lib/format.js';
import './Home.css';

const FEATURED_CATEGORIES = [
  {
    title: 'Fresh Fruit Bowls',
    subtitle: 'Hand-cut seasonal fruits with zero added sugar',
    to: '/menu?category=fruit-bowls',
    image:
      'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=700&q=80',
  },
  {
    title: 'Custom Fruit Bowls',
    subtitle: 'Pick your size, fruits, nuts, seeds & drizzle',
    to: '/build-bowl',
    image:
      'https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?auto=format&fit=crop&w=700&q=80',
  },
  {
    title: 'Healthy Breakfast',
    subtitle: 'Steamed idlis, crisp dosas, pongal & ragi malt',
    to: '/menu?category=tiffins',
    image:
      'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=700&q=80',
  },
  {
    title: 'Daily Subscriptions',
    subtitle: '7, 15 & 30-day wholesome morning plans',
    to: '/subscriptions',
    image:
      'https://images.unsplash.com/photo-1613478223719-2ab802602423?auto=format&fit=crop&w=700&q=80',
  },
];

const WHY_ITEMS = [
  {
    icon: FiFeather,
    title: 'Fresh Ingredients',
    description:
      'Farm-sourced seasonal produce and cold-pressed fruits cut fresh every morning — never frozen or pre-packaged.',
  },
  {
    icon: FiAward,
    title: 'Quality Preparation',
    description:
      'Hygienic kitchen standards with clean ingredients, balanced nutrition, and zero artificial preservatives.',
  },
  {
    icon: FiTruck,
    title: 'Convenient Ordering',
    description:
      'Choose morning, afternoon, or evening slots with saved delivery addresses and flexible subscription pauses.',
  },
  {
    icon: FiHeart,
    title: 'Healthy Choices',
    description:
      'Transparent ingredients, dietary tags, and customizable bowls crafted to support your daily wellness routine.',
  },
];

export default function Home() {
  const { products, combos, plans, settings, loading } = useCatalog();
  const { add } = useCart();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [reviews, setReviews] = useState([]);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    apiRequest('/api/reviews')
      .then((data) => setReviews(data.reviews || []))
      .catch(() => setReviews([]));
  }, []);

  const bestSellers = products.filter((p) => p.bestseller).slice(0, 4);

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    if (!reviewComment.trim()) return;
    setSubmittingReview(true);
    try {
      const res = await apiRequest('/api/reviews', {
        method: 'POST',
        body: JSON.stringify({
          rating: reviewRating,
          comment: reviewComment.trim(),
        }),
      });
      if (res.review) {
        setReviews((prev) => [res.review, ...prev]);
        setReviewComment('');
        showToast('Thank you for sharing your review.');
      }
    } catch (err) {
      showToast(err.message || 'Could not post review.', 'error');
    } finally {
      setSubmittingReview(false);
    }
  };

  return (
    <>
      {/* Hero Section */}
      <section className="home-hero">
        <div className="container home-hero-inner">
          <div className="home-hero-copy">
            <span className="home-eyebrow">Prepared Fresh Every Morning in {settings.city}</span>
            <h1>Fresh Choices. Healthier You.</h1>
            <p>
              Discover fresh fruit bowls and wholesome breakfasts made to brighten your everyday
              routine.
            </p>
            <div className="home-hero-cta">
              <Button to="/menu" variant="primary" size="lg">
                Explore Menu
              </Button>
              <Button to="/build-bowl" variant="accent" size="lg">
                Build Your Bowl
              </Button>
            </div>
            <div className="home-hero-pillars">
              <span>
                <FiCheckCircle size={15} /> Hand-Cut Daily
              </span>
              <span>
                <FiClock size={15} /> Morning Slot from 6:30 AM
              </span>
              <span>
                <FiCheckCircle size={15} /> Zero Preservatives
              </span>
            </div>
          </div>

          <div className="home-hero-visual">
            <div className="home-hero-main-img">
              <img
                src="https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=75&fm=webp"
                alt="Fresh colorful seasonal fruit bowl with seeds"
                fetchPriority="high"
                decoding="async"
              />
            </div>
            <div className="home-hero-side-stack">
              <div className="home-hero-side-img">
                <img
                  src="https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=500&q=75&fm=webp"
                  alt="Wholesome South Indian steamed breakfast"
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div className="home-hero-side-img">
                <img
                  src="https://images.unsplash.com/photo-1613478223719-2ab802602423?auto=format&fit=crop&w=500&q=75&fm=webp"
                  alt="Cold-pressed fresh orange juice"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Categories */}
      <section className="container home-section">
        <SectionHeader
          title="Explore Our Kitchen"
          subtitle="Thoughtfully curated categories for every part of your day"
          to="/menu"
          linkLabel="View Full Menu"
        />
        <div className="home-featured-grid">
          {FEATURED_CATEGORIES.map((cat) => (
            <Link key={cat.title} to={cat.to} className="home-featured-card">
              <img src={cat.image} alt={cat.title} loading="lazy" />
              <div className="home-featured-overlay">
                <h3>{cat.title}</h3>
                <p>{cat.subtitle}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Best Sellers */}
      <section className="container home-section">
        <SectionHeader
          title="Best Sellers"
          subtitle="Customer favorites prepared fresh to order"
          to="/menu"
          linkLabel="Browse All Items"
        />
        {loading ? (
          <div className="home-cards">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="skeleton-card" />
            ))}
          </div>
        ) : (
          <div className="home-cards">
            {bestSellers.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>

      {/* Build Your Own Bowl */}
      <section className="home-surface-band" id="build-your-bowl">
        <div className="container">
          <SectionHeader
            title="Build Your Own Fruit Bowl"
            subtitle="Choose your bowl size, seasonal fruits, crunchy toppings, and natural drizzle"
            to="/build-bowl"
            linkLabel="Open Full Builder"
          />
          <BowlBuilderSection />
        </div>
      </section>

      {/* Dynamic Scheduled Combos */}
      {combos.length > 0 && (
        <section className="container home-section">
          <SectionHeader
            title="Fresh Value Combos"
            subtitle="Curated pairings with live kitchen availability & serving hours"
          />
          <div className="home-plans">
            {combos.map((combo) => (
              <article key={combo.id} className="plan-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {combo.image && (
                  <img
                    src={combo.image}
                    alt={combo.name}
                    loading="lazy"
                    style={{ width: '100%', height: 170, objectFit: 'cover', borderRadius: 'var(--radius-sm)' }}
                  />
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span className="home-eyebrow" style={{ margin: 0 }}>
                    {combo.scheduleStart} – {combo.scheduleEnd}
                  </span>
                  <span
                    style={{
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      color: combo.availableNow ? 'var(--primary)' : 'var(--muted)',
                    }}
                  >
                    {combo.availableNow
                      ? 'Available Now'
                      : !combo.inStock
                        ? 'Out of Stock'
                        : 'Scheduled Hours'}
                  </span>
                </div>
                <h3 style={{ margin: 0, fontSize: '1.15rem' }}>{combo.name}</h3>
                <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.88rem', flex: 1 }}>
                  {combo.description}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div>
                    <strong style={{ fontSize: '1.2rem', color: 'var(--primary)' }}>
                      {money(combo.price)}
                    </strong>{' '}
                    {combo.originalPrice > combo.price && (
                      <del style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>
                        {money(combo.originalPrice)}
                      </del>
                    )}
                  </div>
                  <Button
                    size="sm"
                    disabled={!combo.availableNow}
                    onClick={() => {
                      add(`combo:${combo.id}`, 1);
                      showToast(`${combo.name} added to cart.`);
                    }}
                  >
                    {combo.availableNow ? 'Add Combo' : 'Unavailable'}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Daily Subscriptions */}
      <section className="container home-section">
        <SectionHeader
          title="Daily Breakfast Subscriptions"
          subtitle="Nutritious mornings on autopilot — pause or resume anytime"
          to="/subscriptions"
          linkLabel="Compare Plans"
        />
        <div className="home-plans">
          {plans.map((p) => (
            <PlanCard key={p.id} plan={p} />
          ))}
        </div>
      </section>

      {/* Why Choose HRUVITA */}
      <section className="home-surface-band">
        <div className="container">
          <SectionHeader
            title="Why Choose HRUVITA?"
            subtitle="Built around clean ingredients, consistent freshness, and everyday convenience"
          />
          <div className="home-why-grid">
            {WHY_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="home-why-card">
                  <div className="home-why-icon">
                    <Icon size={22} />
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* Customer Testimonials (Real DB reviews only) */}
      <section className="container home-section">
        <SectionHeader
          title="What Our Customers Say"
          subtitle="Genuine feedback from HRUVITA customers"
        />
        {reviews.length > 0 ? (
          <div className="home-reviews-grid">
            {reviews.slice(0, 6).map((rev) => (
              <article key={rev.id} className="home-review-card">
                <div className="home-review-stars" aria-label={`${rev.rating} out of 5 stars`}>
                  {'★'.repeat(rev.rating)}
                  {'☆'.repeat(5 - rev.rating)}
                </div>
                <p>&ldquo;{rev.comment}&rdquo;</p>
                <div className="home-review-author">
                  <strong>{rev.userName}</strong>
                  <span>{rev.verifiedOrder ? 'Verified Customer' : 'HRUVITA Member'}</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="home-review-empty">
            <h3>No customer reviews yet</h3>
            <p style={{ color: 'var(--muted)', maxWidth: 460 }}>
              We only publish real reviews from genuine customers. Order your favorite fruit bowl or
              breakfast and be the first to share your experience.
            </p>
          </div>
        )}

        {user && (
          <form className="home-review-form" onSubmit={handleReviewSubmit}>
            <div className="home-review-form-head">
              <h3>Share Your HRUVITA Experience</h3>
              <p>Tell us what you loved about the freshness, taste, or delivery.</p>
            </div>
            <div className="home-review-field">
              <label htmlFor="home-rev-rating">Rating</label>
              <select
                id="home-rev-rating"
                value={reviewRating}
                onChange={(e) => setReviewRating(Number(e.target.value))}
              >
                <option value={5}>5 Stars — Excellent</option>
                <option value={4}>4 Stars — Very Good</option>
                <option value={3}>3 Stars — Good</option>
                <option value={2}>2 Stars — Fair</option>
                <option value={1}>1 Star — Needs Improvement</option>
              </select>
            </div>
            <div className="home-review-field">
              <label htmlFor="home-rev-comment">Your Review</label>
              <textarea
                id="home-rev-comment"
                rows={3}
                required
                minLength={5}
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Tell us about the freshness, taste, or delivery experience..."
              />
            </div>
            <div className="home-review-actions">
              <Button type="submit" size="sm" disabled={submittingReview}>
                {submittingReview ? 'Submitting...' : 'Submit Review'}
              </Button>
            </div>
          </form>
        )}
      </section>
    </>
  );
}
