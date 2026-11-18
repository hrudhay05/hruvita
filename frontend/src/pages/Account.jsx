import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  FiCalendar,
  FiCheck,
  FiCheckCircle,
  FiEdit2,
  FiEye,
  FiHeart,
  FiLock,
  FiLogOut,
  FiMapPin,
  FiPackage,
  FiPauseCircle,
  FiPlayCircle,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiShield,
  FiShoppingBag,
  FiStar,
  FiTrash2,
} from 'react-icons/fi';
import Button from '../components/Button.jsx';
import OrderDetailModal from '../components/OrderDetailModal.jsx';
import ProductCard from '../components/ProductCard.jsx';
import Login from './Login.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useCatalog } from '../context/CatalogContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { apiRequest } from '../lib/api.js';
import { money } from '../lib/format.js';
import './Account.css';
import './AuthFlow.css';

function getPasswordChecks(pwd = '') {
  return [
    { label: '8+ characters', ok: pwd.length >= 8 },
    { label: 'Uppercase (A-Z)', ok: /[A-Z]/.test(pwd) },
    { label: 'Lowercase (a-z)', ok: /[a-z]/.test(pwd) },
    { label: 'Number (0-9)', ok: /[0-9]/.test(pwd) },
    { label: 'Special (@#$!)', ok: /[^A-Za-z0-9]/.test(pwd) },
  ];
}

export default function Account() {
  const navigate = useNavigate();
  const {
    user,
    addresses,
    selectedAddressId,
    setSelectedAddressId,
    isAdmin,
    logout,
    updateProfile,
    changePassword,
    setDefaultAddress,
    removeAddress,
    deleteAccount,
  } = useAuth();
  const { productById, refreshCatalog } = useCatalog();
  const { setQty, count } = useCart();
  const { showToast } = useToast();

  const [section, setSection] = useState('orders');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [myOrders, setMyOrders] = useState([]);
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [mySubscriptions, setMySubscriptions] = useState([]);
  const [myReferrals, setMyReferrals] = useState([]);
  const [referralSummary, setReferralSummary] = useState({
    totalReferred: 0,
    creditedCount: 0,
    pendingCount: 0,
    flaggedCount: 0,
    totalEarnedPoints: 0,
  });

  const [profileForm, setProfileForm] = useState({
    fullName: '',
    username: '',
    mobileNumber: '',
    gender: 'Male',
    dateOfBirth: '',
    vegOnly: true,
    spiceLevel: 'medium',
    deliveryNotes: '',
  });

  const [pwdForm, setPwdForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const loadDashboardData = useCallback(async () => {
    if (!user) return;
    try {
      const [ordRes, subRes, refRes] = await Promise.all([
        apiRequest('/api/orders/my'),
        apiRequest('/api/subscriptions/my'),
        apiRequest('/api/referrals/my').catch(() => ({ referrals: [], summary: null })),
      ]);
      setMyOrders(ordRes.orders || []);
      setMySubscriptions(subRes.subscriptions || []);
      setMyReferrals(refRes.referrals || []);
      if (refRes.summary) setReferralSummary(refRes.summary);
    } catch {
      // ignore if offline
    }
  }, [user]);

  useEffect(() => {
    const onOrderPlaced = () => {
      setSection('orders');
      loadDashboardData();
    };
    window.addEventListener('hruvita:order-placed', onOrderPlaced);
    return () => window.removeEventListener('hruvita:order-placed', onOrderPlaced);
  }, [loadDashboardData]);

  useEffect(() => {
    if (user) {
      setProfileForm({
        fullName: user.fullName || user.name || '',
        username: user.username || '',
        mobileNumber: user.mobileNumber || user.phone || '',
        gender: user.gender || 'Male',
        dateOfBirth: user.dateOfBirth
          ? new Date(user.dateOfBirth).toISOString().slice(0, 10)
          : '',
        vegOnly: user.preferences?.vegOnly ?? true,
        spiceLevel: user.preferences?.spiceLevel || 'medium',
        deliveryNotes: user.preferences?.deliveryNotes || '',
      });
      loadDashboardData();
    } else {
      setMyOrders([]);
      setMySubscriptions([]);
    }
  }, [user, loadDashboardData]);

  if (!user) {
    return <Login />;
  }
  if (user.role === 'admin_analyser') {
    return <Navigate to="/admin-analyst" replace />;
  }

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await updateProfile({
        fullName: profileForm.fullName,
        username: profileForm.username,
        mobileNumber: profileForm.mobileNumber,
        gender: profileForm.gender,
        dateOfBirth: profileForm.dateOfBirth,
        preferences: {
          vegOnly: profileForm.vegOnly,
          spiceLevel: profileForm.spiceLevel,
          deliveryNotes: profileForm.deliveryNotes,
        },
      });
      showToast('Profile saved successfully.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setError('');
    if (pwdForm.newPassword !== pwdForm.confirmPassword) {
      setError('New password and Confirm password do not match.');
      return;
    }
    setBusy(true);
    try {
      await changePassword(pwdForm.currentPassword, pwdForm.newPassword, pwdForm.confirmPassword);
      setPwdForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      showToast('Password updated successfully.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRepeatOrder = (order) => {
    let addedCount = 0;
    let skippedCount = 0;
    let priceChanged = false;
    for (const item of order.items || []) {
      const baseId = String(item.productId || '').replace(/^combo:/, '');
      const prod = productById[baseId];
      if (prod && prod.active !== false && prod.stock > 0) {
        const livePrice = Number(prod.discountPrice > 0 ? prod.discountPrice : prod.price);
        if (livePrice && Number(item.unitPrice) && livePrice !== Number(item.unitPrice)) {
          priceChanged = true;
        }
        setQty(prod.id, Math.min(item.qty || 1, prod.stock));
        addedCount += 1;
      } else {
        skippedCount += 1;
      }
    }
    if (addedCount === 0) {
      showToast('None of the items in this order are currently available.', 'error');
      return;
    }
    if (skippedCount > 0 || priceChanged) {
      showToast(
        `Added ${addedCount} available item(s) at current menu prices${skippedCount ? ` (${skippedCount} unavailable)` : ''}.`
      );
    } else {
      showToast('Items added to cart at current prices.');
    }
    setSelectedOrder(null);
    navigate('/cart');
  };

  const handleCancelOrder = async (orderId) => {
    setError('');
    try {
      await apiRequest(`/api/orders/${orderId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Customer requested cancellation' }),
      });
      showToast(`Order ${orderId} cancelled.`);
      await Promise.all([loadDashboardData(), refreshCatalog()]);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleSubscription = async (subId) => {
    try {
      const res = await apiRequest(`/api/subscriptions/${subId}/toggle`, {
        method: 'PATCH',
      });
      setMySubscriptions((prev) =>
        prev.map((s) => (s.id === subId ? res.subscription : s))
      );
      showToast(
        res.subscription.status === 'paused'
          ? 'Subscription paused.'
          : 'Subscription resumed.'
      );
    } catch (err) {
      showToast(err.message || 'Could not update subscription.', 'error');
    }
  };

  const handlePauseTomorrow = async (subId) => {
    try {
      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const res = await apiRequest(`/api/subscriptions/${subId}/pause-date`, {
        method: 'POST',
        body: JSON.stringify({ date: tomorrow }),
      });
      setMySubscriptions((prev) =>
        prev.map((s) => (s.id === subId ? res.subscription : s))
      );
      showToast(`Paused tomorrow's delivery (${tomorrow}).`);
    } catch (err) {
      showToast(err.message || 'Could not pause tomorrow.', 'error');
    }
  };

  const wishedProducts = (user.wishlist || [])
    .map((id) => productById[id])
    .filter(Boolean);

  const changePwdRules = getPasswordChecks(pwdForm.newPassword);

  return (
    <div className="container account-page">
      <div className="account-header">
        <div>
          <span className="home-eyebrow">Customer Dashboard</span>
          <h1 style={{ marginTop: 8 }}>Welcome, {user.fullName || user.name}</h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.92rem', marginTop: 4 }}>
            {user.username ? `@${user.username} · ` : ''}
            {user.email}
            {user.mobileNumber ? ` · ${user.mobileNumber}` : ''}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button to="/cart" variant="ghost" size="sm">
            <FiShoppingBag size={15} /> Cart ({count})
          </Button>
          <Button to="/addresses/new" size="sm">
            <FiPlus size={15} /> Add Address
          </Button>
          {isAdmin && (
            <Button to="/admin" variant="accent" size="sm">
              <FiShield size={15} /> Admin Portal
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={logout}>
            <FiLogOut size={15} /> Logout
          </Button>
        </div>
      </div>

      {error && <div className="account-alert" role="alert">{error}</div>}

      <div className="account-nav-pills" role="tablist" aria-label="Dashboard sections">
        <button
          type="button"
          className={`account-nav-pill ${section === 'orders' ? 'account-nav-pill-active' : ''}`.trim()}
          onClick={() => setSection('orders')}
        >
          <FiPackage size={15} /> Orders ({myOrders.length})
        </button>
        <button
          type="button"
          className={`account-nav-pill ${section === 'subscriptions' ? 'account-nav-pill-active' : ''}`.trim()}
          onClick={() => setSection('subscriptions')}
        >
          <FiCalendar size={15} /> Subscriptions ({mySubscriptions.length})
        </button>
        <button
          type="button"
          className={`account-nav-pill ${section === 'addresses' ? 'account-nav-pill-active' : ''}`.trim()}
          onClick={() => setSection('addresses')}
        >
          <FiMapPin size={15} /> Saved Addresses ({addresses.length})
        </button>
        <button
          type="button"
          className={`account-nav-pill ${section === 'likes' ? 'account-nav-pill-active' : ''}`.trim()}
          onClick={() => setSection('likes')}
        >
          <FiHeart size={15} /> Favorites ({wishedProducts.length})
        </button>
        <button
          type="button"
          className={`account-nav-pill ${section === 'referrals' ? 'account-nav-pill-active' : ''}`.trim()}
          onClick={() => setSection('referrals')}
        >
          Referrals &amp; Rewards ({user.rewardPoints || 0} pts)
        </button>
        <button
          type="button"
          className={`account-nav-pill ${section === 'security' ? 'account-nav-pill-active' : ''}`.trim()}
          onClick={() => setSection('security')}
        >
          <FiLock size={15} /> Account Settings
        </button>
      </div>

      {section === 'orders' && (
        <section className="account-card">
          <div className="account-orders-head">
            <div>
              <h2>Order History ({myOrders.length})</h2>
              <span className="account-orders-sub">Click any order card to inspect products, payment &amp; receipt</span>
            </div>
          </div>

          {myOrders.length > 0 && (
            <div className="account-orders-controls">
              <div className="account-order-search">
                <FiSearch size={15} />
                <input
                  type="search"
                  placeholder="Search by Order ID or item..."
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                />
              </div>
              <div className="account-order-filters">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'active', label: 'Active' },
                  { id: 'delivered', label: 'Delivered' },
                  { id: 'cancelled', label: 'Cancelled / Refunded' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`account-filter-pill ${orderStatusFilter === f.id ? 'account-filter-active' : ''}`}
                    onClick={() => setOrderStatusFilter(f.id)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {myOrders.length === 0 ? (
            <div style={{ padding: '20px 0' }}>
              <p style={{ color: 'var(--muted)', marginBottom: 16 }}>
                You haven&apos;t placed an order yet.
              </p>
              <Button to="/menu" size="sm">
                Explore Menu
              </Button>
            </div>
          ) : (() => {
            const q = orderSearch.trim().toLowerCase();
            const filtered = myOrders.filter((ord) => {
              if (orderStatusFilter === 'active' && ['delivered', 'cancelled', 'refunded', 'refund_initiated'].includes(ord.status)) return false;
              if (orderStatusFilter === 'delivered' && ord.status !== 'delivered') return false;
              if (orderStatusFilter === 'cancelled' && !['cancelled', 'refunded', 'refund_initiated'].includes(ord.status)) return false;
              if (q) {
                const matchId = ord.id.toLowerCase().includes(q);
                const matchItem = (ord.items || []).some((it) => String(it.name || '').toLowerCase().includes(q));
                if (!matchId && !matchItem) return false;
              }
              return true;
            });

            if (filtered.length === 0) {
              return <p style={{ color: 'var(--muted)', padding: '16px 0' }}>No matching orders found.</p>;
            }

            return (
              <div className="account-orders-list">
                {filtered.map((ord) => {
                  const items = ord.items || [];
                  const totalQty = items.reduce((s, it) => s + Number(it.qty || 1), 0);
                  const isSameDay = ord.slotId === 'same-day';
                  const isCancelled = ['cancelled', 'refunded', 'refund_initiated'].includes(ord.status);
                  const placedStr = ord.createdAt
                    ? new Date(ord.createdAt).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : ord.scheduledDate;

                  return (
                    <article
                      key={ord.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedOrder(ord)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedOrder(ord);
                        }
                      }}
                      className={`account-order-card account-order-clickable ${
                        isCancelled
                          ? 'account-order-cancelled'
                          : ord.status === 'delivered'
                            ? 'account-order-delivered'
                            : ''
                      }`.trim()}
                    >
                      <div className="account-order-visual-row">
                        <div className={`account-order-collage ${items.length > 1 ? 'account-collage-multi' : ''}`}>
                          {items.slice(0, 4).map((it, idx) => {
                            const baseId = String(it.productId || '').replace(/^combo:/, '');
                            const img = it.image || productById[baseId]?.image || '';
                            return img ? (
                              <img key={`${baseId}-${idx}`} src={img} alt={it.name} loading="lazy" />
                            ) : (
                              <div key={`${baseId}-${idx}`} className="account-collage-fallback" aria-hidden="true">
                                {it.emoji || '🥗'}
                              </div>
                            );
                          })}
                          {items.length > 4 && (
                            <span className="account-collage-more">+{items.length - 4}</span>
                          )}
                        </div>

                        <div className="account-order-main">
                          <div className="account-order-top">
                            <div className="account-order-id-wrap">
                              <span className="account-order-id">{ord.id}</span>
                              <span className="account-order-schedule">
                                Placed {placedStr} &bull; Delivery {ord.scheduledDate}
                                {!isSameDay && ord.slotLabel ? ` (${ord.slotLabel})` : ' (Same-Day Express)'}
                              </span>
                            </div>
                            <span className={`account-status-badge account-status-${ord.status}`}>
                              {ord.status.replace(/_/g, ' ')}
                            </span>
                          </div>

                          <ul className="account-order-items">
                            {items.slice(0, 3).map((it, i) => (
                              <li key={`${it.productId || i}-${i}`} className="account-order-item-row">
                                <span className="account-item-qty">{it.qty}&times;</span>
                                <span className="account-item-name">{it.name}</span>
                                <span className="account-item-price">{money(it.lineTotal)}</span>
                              </li>
                            ))}
                            {items.length > 3 && (
                              <li className="account-item-more">+{items.length - 3} more item(s)</li>
                            )}
                          </ul>
                        </div>
                      </div>

                      <div className="account-order-foot">
                        <div className="account-order-pay">
                          <span className="account-pay-chip">
                            {totalQty} item{totalQty === 1 ? '' : 's'} &bull; {ord.paymentMethod.toUpperCase()} ({ord.paymentStatus})
                          </span>
                          <strong className="account-order-total">
                            {money(ord.pricing?.grandTotal)}
                          </strong>
                        </div>
                        <div className="account-order-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="admin-mini-btn"
                            onClick={() => setSelectedOrder(ord)}
                          >
                            <FiEye size={12} /> View Details
                          </button>
                          <button
                            type="button"
                            className="admin-mini-btn"
                            onClick={() => handleRepeatOrder(ord)}
                          >
                            <FiRefreshCw size={12} /> Order Again
                          </button>
                          {['pending', 'payment_pending', 'confirmed', 'placed'].includes(ord.status) && (
                            <button
                              type="button"
                              className="admin-mini-btn admin-mini-danger"
                              onClick={() => handleCancelOrder(ord.id)}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            );
          })()}
        </section>
      )}

      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onReorder={handleRepeatOrder}
          onCancel={async (id) => {
            await handleCancelOrder(id);
            setSelectedOrder(null);
          }}
          onReviewSubmitted={loadDashboardData}
        />
      )}

      {section === 'subscriptions' && (
        <section className="account-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
            <h2 style={{ marginBottom: 0 }}>Daily Breakfast Subscriptions ({mySubscriptions.length})</h2>
            <Button to="/subscriptions" size="sm">
              Browse Plans
            </Button>
          </div>
          {mySubscriptions.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>
              No active subscriptions yet. Choose a 7, 15, or 30-day breakfast plan to get started.
            </p>
          ) : (
            <div className="account-orders-list">
              {mySubscriptions.map((sub) => (
                <div key={sub.id} className="account-order-card">
                  <div className="account-order-top">
                    <div>
                      <strong>{sub.planName}</strong> ({sub.days} days)
                      <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                        Meal: {sub.preferredBreakfast} &bull; {sub.slotLabel}
                      </div>
                    </div>
                    <span
                      className={`account-status-badge ${
                        sub.status === 'paused' ? 'account-status-pending' : ''
                      }`.trim()}
                    >
                      {sub.status}
                    </span>
                  </div>
                  <div className="account-order-top" style={{ fontSize: '0.86rem', color: 'var(--muted)' }}>
                    <span>
                      Starts: <strong>{sub.startDate}</strong> &bull; Remaining:{' '}
                      <strong>{sub.remainingDeliveries} deliveries</strong> &bull; Pauses used:{' '}
                      <strong>
                        {sub.pauseCount || 0}/{sub.maxPauses || 5}
                      </strong>{' '}
                      &bull; {money(sub.price)}
                      {sub.pausedDates?.length > 0 && (
                        <> &bull; Skipped: {sub.pausedDates.join(', ')}</>
                      )}
                    </span>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {sub.status === 'active' && (
                        <button
                          type="button"
                          className="admin-mini-btn"
                          onClick={() => handlePauseTomorrow(sub.id)}
                        >
                          Skip Tomorrow
                        </button>
                      )}
                      <button
                        type="button"
                        className="admin-mini-btn"
                        onClick={() => handleToggleSubscription(sub.id)}
                      >
                        {sub.status === 'active' ? (
                          <>
                            <FiPauseCircle size={13} /> Pause Plan
                          </>
                        ) : (
                          <>
                            <FiPlayCircle size={13} /> Resume Plan
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {section === 'referrals' && (
        <section className="account-card">
          <h2>Refer Friends &amp; Earn Rewards</h2>
          <p style={{ color: 'var(--muted)', marginBottom: 16 }}>
            Share your unique referral code. When a friend signs up and completes their first paid
            order, both of you receive reward points automatically!
          </p>
          <div className="account-order-card" style={{ marginBottom: 18 }}>
            <div className="account-order-top">
              <div>
                <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>Your Referral Code</div>
                <strong style={{ fontSize: '1.35rem', color: 'var(--primary)', letterSpacing: '0.06em' }}>
                  {user.referralCode || 'HRUVITA'}
                </strong>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const link = `${window.location.origin}/signup?ref=${encodeURIComponent(
                      user.referralCode || ''
                    )}`;
                    navigator.clipboard?.writeText(link);
                    showToast('Referral signup link copied!');
                  }}
                >
                  Copy Invite Link
                </Button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `Order fresh fruit bowls & healthy breakfasts from HRUVITA! Use my referral code ${
                      user.referralCode || ''
                    } at ${window.location.origin}/signup?ref=${encodeURIComponent(
                      user.referralCode || ''
                    )} to earn reward points on your first order.`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-primary btn-sm"
                >
                  Share on WhatsApp
                </a>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: '0.88rem', marginTop: 10 }}>
              <span>
                Reward Balance: <strong>{user.rewardPoints || 0} pts</strong>
              </span>
              <span>
                Friends Invited: <strong>{referralSummary.totalReferred}</strong>
              </span>
              <span>
                Credited: <strong>{referralSummary.creditedCount}</strong>
              </span>
              <span>
                Pending First Order: <strong>{referralSummary.pendingCount}</strong>
              </span>
            </div>
          </div>

          {myReferrals.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>No referrals yet — share your code to start earning!</p>
          ) : (
            <div className="account-orders-list">
              {myReferrals.map((ref) => (
                <div key={ref.id} className="account-order-card">
                  <div className="account-order-top">
                    <div>
                      <strong>{ref.referredEmail}</strong>
                      <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                        Code: {ref.referralCode} &bull; Reward: {ref.rewardAmount} pts
                      </div>
                    </div>
                    <span className="account-status-badge">{ref.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {section === 'addresses' && (
        <section className="account-card">
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <h2 style={{ marginBottom: 0 }}>Saved Delivery Addresses ({addresses.length})</h2>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button to="/addresses" variant="outline" size="sm">
                Manage All
              </Button>
              <Button to="/addresses/new" size="sm">
                <FiPlus size={15} /> Add Address
              </Button>
            </div>
          </div>

          {addresses.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>
              No saved addresses yet. Add your Home, Office, or Hostel address.
            </p>
          ) : (
            <div className="addr-cards-grid">
              {addresses.map((addr) => {
                const isSelected = selectedAddressId === addr.id;
                const fullStreet = [
                  addr.doorNumber,
                  addr.apartmentName,
                  addr.street,
                  addr.locality,
                  addr.area,
                ]
                  .filter(Boolean)
                  .join(', ');
                const fullRegion = [addr.mandal, addr.district, addr.state, addr.country]
                  .filter(Boolean)
                  .join(', ');

                return (
                  <article
                    key={addr.id}
                    className={`addr-card ${isSelected ? 'addr-card-selected' : ''}`.trim()}
                  >
                    <div className="addr-card-top">
                      <div className="addr-badge-group">
                        <span className="addr-type-pill">{addr.addressLabel}</span>
                        {addr.isDefault && <span className="addr-default-pill">Default</span>}
                        {isSelected && (
                          <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--primary)' }}>
                            <FiCheckCircle size={12} style={{ verticalAlign: 'middle' }} /> Selected
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <strong style={{ color: 'var(--primary)' }}>{addr.recipientName}</strong>
                      <div style={{ fontSize: '0.84rem', color: 'var(--muted)' }}>
                        {addr.mobileNumber}
                      </div>
                    </div>

                    <div style={{ fontSize: '0.88rem', color: 'var(--ink)' }}>
                      {fullStreet && <div>{fullStreet}</div>}
                      {fullRegion && <div>{fullRegion}</div>}
                      <div>
                        <strong>PIN: {addr.pincode}</strong>
                      </div>
                    </div>

                    <div className="addr-actions-bar">
                      <button
                        type="button"
                        className="admin-mini-btn"
                        onClick={() => {
                          setSelectedAddressId(addr.id);
                          showToast(`${addr.addressLabel} address selected.`);
                        }}
                      >
                        {isSelected ? 'Selected' : 'Select'}
                      </button>
                      {!addr.isDefault && (
                        <button
                          type="button"
                          className="admin-mini-btn"
                          onClick={async () => {
                            await setDefaultAddress(addr.id);
                            showToast('Default address updated.');
                          }}
                        >
                          <FiStar size={12} /> Set Default
                        </button>
                      )}
                      <Link to={`/addresses/${addr.id}/edit`} className="admin-mini-btn">
                        <FiEdit2 size={12} /> Edit
                      </Link>
                      <button
                        type="button"
                        className="admin-mini-btn admin-mini-danger"
                        onClick={async () => {
                          if (window.confirm(`Delete ${addr.addressLabel} address?`)) {
                            await removeAddress(addr.id);
                            showToast('Address removed.');
                          }
                        }}
                      >
                        <FiTrash2 size={12} /> Delete
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {section === 'likes' && (
        <section className="account-card">
          <h2>Saved Favorites ({wishedProducts.length})</h2>
          {wishedProducts.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>
              Tap the heart icon on any item to save your favorites here.
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 18 }}>
              {wishedProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </section>
      )}

      {section === 'security' && (
        <div className="account-grid">
          <section className="account-card">
            <h2>Profile Information</h2>
            <form className="account-form" onSubmit={handleProfileSave}>
              <div className="account-field">
                <label htmlFor="prof-name">Full Name</label>
                <input
                  id="prof-name"
                  name="fullName"
                  type="text"
                  required
                  value={profileForm.fullName}
                  onChange={(e) => setProfileForm({ ...profileForm, fullName: e.target.value })}
                />
              </div>
              <div className="account-field">
                <label htmlFor="prof-username">Username</label>
                <input
                  id="prof-username"
                  name="username"
                  type="text"
                  required
                  value={profileForm.username}
                  onChange={(e) =>
                    setProfileForm({
                      ...profileForm,
                      username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                    })
                  }
                />
              </div>
              <div className="account-field">
                <label htmlFor="prof-phone">Mobile Number</label>
                <input
                  id="prof-phone"
                  name="mobileNumber"
                  type="tel"
                  maxLength={10}
                  value={profileForm.mobileNumber}
                  onChange={(e) =>
                    setProfileForm({
                      ...profileForm,
                      mobileNumber: e.target.value.replace(/\D/g, '').slice(0, 10),
                    })
                  }
                />
              </div>
              <div className="auth-row-2">
                <div className="account-field">
                  <label htmlFor="prof-gender">Gender</label>
                  <select
                    id="prof-gender"
                    name="gender"
                    value={profileForm.gender}
                    onChange={(e) => setProfileForm({ ...profileForm, gender: e.target.value })}
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </div>
                <div className="account-field">
                  <label htmlFor="prof-dob">Date of Birth</label>
                  <input
                    id="prof-dob"
                    name="dateOfBirth"
                    type="date"
                    value={profileForm.dateOfBirth}
                    onChange={(e) => setProfileForm({ ...profileForm, dateOfBirth: e.target.value })}
                  />
                </div>
              </div>
              <Button type="submit" size="sm" disabled={busy}>
                Save Changes
              </Button>
            </form>
          </section>

          <section className="account-card">
            <h2>Change Password</h2>
            <form className="account-form" onSubmit={handlePasswordChange}>
              <div className="account-field">
                <label htmlFor="sec-cur-pwd">Current Password</label>
                <input
                  id="sec-cur-pwd"
                  name="currentPassword"
                  type="password"
                  required
                  value={pwdForm.currentPassword}
                  onChange={(e) => setPwdForm({ ...pwdForm, currentPassword: e.target.value })}
                />
              </div>
              <div className="account-field">
                <label htmlFor="sec-new-pwd">New Password</label>
                <input
                  id="sec-new-pwd"
                  name="newPassword"
                  type="password"
                  required
                  value={pwdForm.newPassword}
                  onChange={(e) => setPwdForm({ ...pwdForm, newPassword: e.target.value })}
                />
              </div>
              <div className="account-field">
                <label htmlFor="sec-confirm-pwd">Confirm New Password</label>
                <input
                  id="sec-confirm-pwd"
                  name="confirmPassword"
                  type="password"
                  required
                  value={pwdForm.confirmPassword}
                  onChange={(e) => setPwdForm({ ...pwdForm, confirmPassword: e.target.value })}
                />
              </div>
              <div className="account-pwd-rules">
                {changePwdRules.map((r) => (
                  <span
                    key={r.label}
                    className={`account-pwd-rule ${r.ok ? 'account-pwd-rule-ok' : ''}`.trim()}
                  >
                    <FiCheck size={12} /> {r.label}
                  </span>
                ))}
              </div>
              <Button type="submit" variant="outline" size="sm" disabled={busy}>
                Update Password
              </Button>
            </form>

            {user.role !== 'admin' && (
              <div style={{ marginTop: 22, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                <button
                  type="button"
                  className="account-delete-btn"
                  onClick={() => {
                    if (window.confirm('Permanently delete your HRUVITA account?')) {
                      deleteAccount();
                    }
                  }}
                >
                  <FiTrash2 size={14} /> Delete Account
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
