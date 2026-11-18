import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiCheckCircle,
  FiLogOut,
  FiMapPin,
  FiMenu,
  FiMessageCircle,
  FiPackage,
  FiPhone,
  FiTruck,
  FiUser,
  FiXCircle,
} from 'react-icons/fi';
import Button from '../components/Button.jsx';
import Logo from '../components/Logo.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { apiRequest } from '../lib/api.js';
import { money } from '../lib/format.js';
import './DeliveryDashboard.css';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: FiTruck },
  { id: 'assigned', label: 'My Assigned Orders', icon: FiPackage },
  { id: 'active', label: 'Active Deliveries', icon: FiTruck },
  { id: 'completed', label: 'Completed Deliveries', icon: FiCheckCircle },
  { id: 'failed', label: 'Failed Deliveries', icon: FiXCircle },
  { id: 'profile', label: 'My Profile', icon: FiUser },
];

const FAILED_SET = new Set([
  'delivery_failed',
  'customer_unavailable',
  'address_not_found',
  'customer_cancelled',
]);

export default function DeliveryDashboard() {
  const { user, login, logout } = useAuth();
  const { showToast } = useToast();

  const [section, setSection] = useState('dashboard');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState({});
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Login form state
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');

  // Delivery exception / COD collection state per order
  const [codChecks, setCodChecks] = useState({});
  const [failModalOrder, setFailModalOrder] = useState(null);
  const [failStatus, setFailStatus] = useState('delivery_failed');
  const [failReason, setFailReason] = useState('');

  const isDeliveryBoy = user?.role === 'delivery_boy';

  const loadDeliveryOrders = useCallback(async () => {
    if (!isDeliveryBoy) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiRequest('/api/delivery/orders');
      setOrders(data.orders || []);
      setStats(data.stats || {});
      setProfile(data.profile || null);
    } catch (err) {
      setError(err.message || 'Could not load assigned orders.');
    } finally {
      setLoading(false);
    }
  }, [isDeliveryBoy]);

  useEffect(() => {
    loadDeliveryOrders();
  }, [loadDeliveryOrders]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const logged = await login(loginId, password, true, true);
      if (logged?.role !== 'delivery_boy') {
        setError('This account does not have delivery partner permissions.');
      }
    } catch (err) {
      setError(err.message || 'Sign-in failed.');
    }
  };

  const handleStatusUpdate = async (orderId, deliveryStatus, reason = '') => {
    setError('');
    try {
      const codCollected = Boolean(codChecks[orderId]);
      await apiRequest(`/api/delivery/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ deliveryStatus, reason, codCollected }),
      });
      showToast(`Order ${orderId} marked as ${deliveryStatus.replace(/_/g, ' ')}.`);
      setFailModalOrder(null);
      setFailReason('');
      await loadDeliveryOrders();
    } catch (err) {
      setError(err.message || 'Failed to update delivery status.');
    }
  };

  const handleAvailabilityChange = async (availability) => {
    try {
      const res = await apiRequest('/api/delivery/availability', {
        method: 'PATCH',
        body: JSON.stringify({ availability }),
      });
      setProfile((p) => (p ? { ...p, availability: res.availability } : p));
      showToast(`Availability updated to ${res.availability}.`);
    } catch (err) {
      setError(err.message);
    }
  };

  if (!user || !isDeliveryBoy) {
    return (
      <div className="del-login-screen">
        <div className="del-login-card">
          <div style={{ marginBottom: 14 }}>
            <Logo />
          </div>
          <h1>Delivery Partner Portal</h1>
          <p>Sign in with your HRUVITA Delivery Boy credentials.</p>
          {error && <div className="del-alert">{error}</div>}
          <form className="del-form" onSubmit={handleLogin}>
            <label>
              Email or Username
              <input
                type="text"
                required
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="hruvita_delivery or delivery@hruvita.com"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <Button type="submit">Sign In</Button>
          </form>
          <div style={{ marginTop: 16, textAlign: 'center', fontSize: '0.85rem' }}>
            <Link to="/" style={{ color: 'var(--primary)', fontWeight: 600 }}>
              &larr; Return to Storefront
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const filteredOrders = orders.filter((o) => {
    if (section === 'active') return ['assigned', 'picked_up', 'out_for_delivery'].includes(o.deliveryStatus);
    if (section === 'completed') return o.deliveryStatus === 'delivered';
    if (section === 'failed') return FAILED_SET.has(o.deliveryStatus);
    return true;
  });

  return (
    <div className="del-shell">
      <aside className={`del-sidebar ${mobileMenu ? 'del-sidebar-open' : ''}`}>
        <div className="del-brand">
          <strong>HRUVITA Delivery</strong>
          <span>{profile?.fullName || user.fullName}</span>
        </div>
        <nav className="del-nav" aria-label="Delivery navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={`del-nav-btn ${section === item.id ? 'del-nav-active' : ''}`}
                onClick={() => {
                  setSection(item.id);
                  setMobileMenu(false);
                }}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="del-main">
        <header className="del-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              className="del-mobile-toggle"
              onClick={() => setMobileMenu((m) => !m)}
              aria-label="Toggle menu"
            >
              <FiMenu size={18} />
            </button>
            <div>
              <h1>{NAV_ITEMS.find((n) => n.id === section)?.label || 'Dashboard'}</h1>
              <span className="del-sub">Role: delivery_boy &bull; {profile?.phone}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              className="del-select"
              value={profile?.availability || 'available'}
              onChange={(e) => handleAvailabilityChange(e.target.value)}
              aria-label="Availability status"
            >
              <option value="available">Available</option>
              <option value="busy">Busy</option>
              <option value="offline">Offline</option>
            </select>
            <button type="button" className="del-btn" onClick={logout}>
              <FiLogOut size={14} /> Sign Out
            </button>
          </div>
        </header>

        {error && <div className="del-alert">{error}</div>}

        {section === 'dashboard' && (
          <div className="del-kpi-grid">
            <div className="del-kpi"><span>Total Assigned Orders</span><strong>{stats.totalAssigned || 0}</strong></div>
            <div className="del-kpi"><span>Pending Deliveries</span><strong>{stats.pendingCount || 0}</strong></div>
            <div className="del-kpi"><span>Out for Delivery</span><strong>{stats.outForDeliveryCount || 0}</strong></div>
            <div className="del-kpi"><span>Completed Today</span><strong>{stats.completedToday || 0}</strong></div>
            <div className="del-kpi"><span>Failed Deliveries</span><strong>{stats.failedCount || 0}</strong></div>
          </div>
        )}

        {section === 'profile' ? (
          <section className="del-card">
            <h2>My Delivery Profile</h2>
            <p><strong>Name:</strong> {profile?.fullName}</p>
            <p><strong>Phone:</strong> {profile?.phone}</p>
            <p><strong>Email:</strong> {profile?.email}</p>
            <p><strong>Availability:</strong> {profile?.availability}</p>
          </section>
        ) : (
          <section className="del-orders-grid">
            {loading && <p className="del-sub">Loading assigned orders...</p>}
            {!loading && filteredOrders.length === 0 && (
              <div className="del-card"><p className="del-sub">No orders in this section.</p></div>
            )}
            {filteredOrders.map((ord) => {
              const cleanPhone = String(ord.customerPhone || '').replace(/\D/g, '');
              const waPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
              const isDone = ord.deliveryStatus === 'delivered';
              const isFailed = FAILED_SET.has(ord.deliveryStatus);
              return (
                <article key={ord.id} className="del-card">
                  <div className="del-card-top">
                    <div>
                      <strong>{ord.id}</strong>
                      <div className="del-sub">{ord.scheduledDate} &bull; {ord.slotLabel}</div>
                    </div>
                    <span className={`del-badge del-badge-${ord.deliveryStatus}`}>
                      {ord.deliveryStatus.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div className="del-info">
                    <div><strong>Customer:</strong> {ord.customerName}</div>
                    <div><strong>Phone:</strong> {ord.customerPhone}</div>
                    <div>
                      <FiMapPin size={13} />{' '}
                      {[ord.address?.line1, ord.address?.area, ord.address?.city, ord.address?.pincode]
                        .filter(Boolean)
                        .join(', ')}
                    </div>
                    {ord.address?.notes && (
                      <div className="del-note"><strong>Instructions:</strong> {ord.address.notes}</div>
                    )}
                  </div>

                  <div className="del-items">
                    {(ord.items || []).map((it, idx) => (
                      <span key={idx} className="del-item-pill">
                        {it.qty}&times; {it.name}
                      </span>
                    ))}
                  </div>

                  <div className="del-pay-row">
                    <span>
                      <strong>{ord.paymentMethod.toUpperCase()}</strong> ({ord.paymentStatus}) &bull;{' '}
                      <strong>{money(ord.grandTotal)}</strong>
                    </span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <a href={`tel:${ord.customerPhone}`} className="del-btn">
                        <FiPhone size={13} /> Call
                      </a>
                      {waPhone && (
                        <a
                          href={`https://wa.me/${waPhone}?text=${encodeURIComponent(`Hello ${ord.customerName}, I am on the way with your HRUVITA order ${ord.id}.`)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="del-btn"
                        >
                          <FiMessageCircle size={13} /> WhatsApp
                        </a>
                      )}
                    </div>
                  </div>

                  {!isDone && !isFailed && (
                    <div className="del-actions">
                      {ord.deliveryStatus === 'assigned' && (
                        <button
                          type="button"
                          className="del-btn del-btn-primary"
                          onClick={() => handleStatusUpdate(ord.id, 'picked_up')}
                        >
                          Mark Picked Up
                        </button>
                      )}
                      {['assigned', 'picked_up'].includes(ord.deliveryStatus) && (
                        <button
                          type="button"
                          className="del-btn del-btn-primary"
                          onClick={() => handleStatusUpdate(ord.id, 'out_for_delivery')}
                        >
                          Out for Delivery
                        </button>
                      )}
                      {ord.paymentMethod === 'cod' && ord.paymentStatus !== 'paid' && (
                        <label className="del-cod-check">
                          <input
                            type="checkbox"
                            checked={Boolean(codChecks[ord.id])}
                            onChange={(e) =>
                              setCodChecks((prev) => ({ ...prev, [ord.id]: e.target.checked }))
                            }
                          />
                          Confirm COD Cash Collected ({money(ord.grandTotal)})
                        </label>
                      )}
                      <button
                        type="button"
                        className="del-btn del-btn-primary"
                        onClick={() => handleStatusUpdate(ord.id, 'delivered')}
                      >
                        Mark Delivered
                      </button>
                      <button
                        type="button"
                        className="del-btn del-btn-danger"
                        onClick={() => {
                          setFailModalOrder(ord.id);
                          setFailStatus('delivery_failed');
                          setFailReason('');
                        }}
                      >
                        Report Issue / Failed
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        )}

        {failModalOrder && (
          <div className="del-modal-back">
            <div className="del-modal">
              <h3>Report Delivery Exception ({failModalOrder})</h3>
              <select
                className="del-select"
                value={failStatus}
                onChange={(e) => setFailStatus(e.target.value)}
              >
                <option value="delivery_failed">Delivery Failed</option>
                <option value="customer_unavailable">Customer Unavailable</option>
                <option value="address_not_found">Address Not Found</option>
                <option value="customer_cancelled">Customer Cancelled</option>
              </select>
              <textarea
                rows={3}
                placeholder="Reason (required)..."
                value={failReason}
                onChange={(e) => setFailReason(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="del-btn del-btn-danger"
                  onClick={() => handleStatusUpdate(failModalOrder, failStatus, failReason)}
                >
                  Confirm Exception
                </button>
                <button type="button" className="del-btn" onClick={() => setFailModalOrder(null)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
