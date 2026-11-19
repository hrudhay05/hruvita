import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FiBell,
  FiCheckCircle,
  FiDollarSign,
  FiLogOut,
  FiMapPin,
  FiMenu,
  FiMessageCircle,
  FiNavigation,
  FiPackage,
  FiPhone,
  FiSearch,
  FiTruck,
  FiUser,
  FiXCircle,
} from 'react-icons/fi';
import Button from '../components/Button.jsx';
import Logo from '../components/Logo.jsx';
import RealtimeBadge from '../components/RealtimeBadge.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocketEvents } from '../context/SocketContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { apiRequest } from '../lib/api.js';
import { money } from '../lib/format.js';
import './DeliveryDashboard.css';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: FiTruck },
  { id: 'orders', label: 'My Orders', icon: FiPackage },
  { id: 'active', label: 'Active Deliveries', icon: FiTruck },
  { id: 'completed', label: 'Completed Deliveries', icon: FiCheckCircle },
  { id: 'failed', label: 'Failed Deliveries', icon: FiXCircle },
  { id: 'earnings', label: 'Earnings', icon: FiDollarSign },
  { id: 'notifications', label: 'Notifications', icon: FiBell },
  { id: 'profile', label: 'My Profile', icon: FiUser },
];

const FAILED_SET = new Set([
  'delivery_failed',
  'customer_unavailable',
  'address_not_found',
  'customer_cancelled',
]);

export default function DeliveryDashboard() {
  const navigate = useNavigate();
  const { user, login, logout } = useAuth();

  const handleSignOut = async () => {
    await logout();
    navigate('/', { replace: true });
  };
  const { showToast } = useToast();

  const [section, setSection] = useState('dashboard');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState({});
  const [earnings, setEarnings] = useState({});
  const [profile, setProfile] = useState(null);
  const [liveNotifs, setLiveNotifs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Search & filter
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Login form state
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');

  // Delivery OTP & COD amount state per order
  const [otpInputs, setOtpInputs] = useState({});
  const [codAmounts, setCodAmounts] = useState({});
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
      setEarnings(data.earnings || {});
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

  useSocketEvents(
    isDeliveryBoy
      ? {
          'delivery:assigned': (payload) => {
            showToast(`New assignment: Order ${payload.orderId}`);
            setLiveNotifs((prev) => [
              { id: Date.now(), title: `New Assignment: ${payload.orderId}`, desc: `${payload.customerName} (${money(payload.grandTotal)})`, at: new Date().toLocaleTimeString() },
              ...prev,
            ]);
            loadDeliveryOrders();
          },
          'delivery:reassigned': (payload) => {
            showToast(`Assigned order: ${payload.orderId}`);
            loadDeliveryOrders();
          },
          'delivery:assignment-cancelled': (payload) => {
            showToast(`Assignment updated: ${payload.orderId}`);
            loadDeliveryOrders();
          },
          'delivery:order-updated': () => loadDeliveryOrders(),
          'order:updated': () => loadDeliveryOrders(),
          'order:cancelled': () => loadDeliveryOrders(),
        }
      : null,
    [isDeliveryBoy, loadDeliveryOrders]
  );

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

  const handleStatusUpdate = async (order, deliveryStatus, reason = '') => {
    setError('');
    try {
      const otp = otpInputs[order.id] || '';
      const isCod = order.paymentMethod === 'cod' && order.paymentStatus !== 'paid';
      const enteredCash = codAmounts[order.id] !== undefined ? Number(codAmounts[order.id]) : null;
      await apiRequest(`/api/delivery/orders/${order.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          deliveryStatus,
          reason,
          otp,
          codCollected: isCod && enteredCash === Number(order.grandTotal),
          collectedCash: enteredCash,
        }),
      });
      showToast(`Order ${order.id} updated to ${deliveryStatus.replace(/_/g, ' ')}.`);
      setFailModalOrder(null);
      setFailReason('');
      await loadDeliveryOrders();
    } catch (err) {
      setError(err.message || 'Failed to update delivery status.');
    }
  };

  const handleResendOtp = async (orderId) => {
    try {
      await apiRequest(`/api/delivery/orders/${orderId}/resend-otp`, { method: 'POST' });
      showToast('Delivery OTP resent to customer email.');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAvailabilityChange = async (availability) => {
    try {
      const res = await apiRequest('/api/delivery/availability', {
        method: 'PATCH',
        body: JSON.stringify({ availability }),
      });
      setProfile((p) => (p ? { ...p, availability: res.availability } : p));
      showToast(`Status: ${res.availability}`);
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
          <p>Sign in with your HRUVITA Delivery Partner credentials.</p>
          {error && <div className="del-alert">{error}</div>}
          <form className="del-form" onSubmit={handleLogin}>
            <label>
              Email or Mobile / Username
              <input
                type="text"
                required
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="Enter email or username"
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
          <div style={{ marginTop: 14, textAlign: 'center', fontSize: '0.84rem', display: 'flex', justifyContent: 'space-between' }}>
            <Link to="/forgot-password" style={{ color: 'var(--primary)', fontWeight: 600 }}>Forgot password?</Link>
            <Link to="/" style={{ color: 'var(--primary)', fontWeight: 600 }}>Storefront &rarr;</Link>
          </div>
        </div>
      </div>
    );
  }

  const filteredOrders = orders.filter((o) => {
    if (section === 'active' && !['assigned', 'accepted', 'picked_up', 'out_for_delivery'].includes(o.deliveryStatus)) return false;
    if (section === 'completed' && o.deliveryStatus !== 'delivered') return false;
    if (section === 'failed' && !FAILED_SET.has(o.deliveryStatus)) return false;
    if (statusFilter !== 'all') {
      if (statusFilter === 'failed' && !FAILED_SET.has(o.deliveryStatus)) return false;
      else if (statusFilter !== 'failed' && o.deliveryStatus !== statusFilter) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      if (!o.id.toLowerCase().includes(q) && !String(o.customerName || '').toLowerCase().includes(q)) return false;
    }
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
          <button type="button" className="del-nav-btn" onClick={handleSignOut}>
            <FiLogOut size={16} />
            <span>Logout</span>
          </button>
        </nav>
      </aside>

      <main className="del-main">
        <header className="del-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button type="button" className="del-mobile-toggle" onClick={() => setMobileMenu((m) => !m)} aria-label="Toggle menu">
              <FiMenu size={18} />
            </button>
            <div>
              <h1>{NAV_ITEMS.find((n) => n.id === section)?.label || 'Dashboard'}</h1>
              <span className="del-sub">{profile?.phone} &bull; Real-time connected</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <RealtimeBadge />
            <select
              className="del-select"
              value={profile?.availability || 'available'}
              onChange={(e) => handleAvailabilityChange(e.target.value)}
              aria-label="Online/Offline status"
            >
              <option value="available">Online (Available)</option>
              <option value="busy">Busy</option>
              <option value="offline">Offline</option>
            </select>
            <button type="button" className="del-btn" onClick={handleSignOut}>
              <FiLogOut size={14} /> Logout
            </button>
          </div>
        </header>

        {error && <div className="del-alert">{error}</div>}

        {section === 'dashboard' && (
          <div className="del-kpi-grid">
            <div className="del-kpi"><span>Total Assigned</span><strong>{stats.totalAssigned || 0}</strong></div>
            <div className="del-kpi"><span>Pending</span><strong>{stats.pendingCount || 0}</strong></div>
            <div className="del-kpi"><span>Accepted</span><strong>{stats.acceptedCount || 0}</strong></div>
            <div className="del-kpi"><span>Out for Delivery</span><strong>{stats.outForDeliveryCount || 0}</strong></div>
            <div className="del-kpi"><span>Delivered Today</span><strong>{stats.completedToday || 0}</strong></div>
            <div className="del-kpi"><span>Failed</span><strong>{stats.failedCount || 0}</strong></div>
            <div className="del-kpi"><span>Today&apos;s Earnings</span><strong>{money(stats.todayEarnings || 0)}</strong></div>
            <div className="del-kpi"><span>Weekly Earnings</span><strong>{money(stats.weeklyEarnings || 0)}</strong></div>
          </div>
        )}

        {section === 'earnings' && (
          <section className="del-card">
            <h2>Earnings &amp; Commission Summary</h2>
            <p className="del-sub">Note: Cash collected on COD orders belongs to HRUVITA and is separate from your delivery commission.</p>
            <div className="del-kpi-grid">
              <div className="del-kpi"><span>Completed Deliveries</span><strong>{earnings.totalCompleted || 0}</strong></div>
              <div className="del-kpi"><span>Per-Delivery Commission</span><strong>{money(earnings.perDeliveryCommission || 40)}</strong></div>
              <div className="del-kpi"><span>Daily Earnings</span><strong>{money(earnings.daily || 0)}</strong></div>
              <div className="del-kpi"><span>Weekly Earnings</span><strong>{money(earnings.weekly || 0)}</strong></div>
              <div className="del-kpi"><span>Monthly Earnings</span><strong>{money(earnings.monthly || 0)}</strong></div>
              <div className="del-kpi"><span>Total Earned</span><strong>{money(earnings.totalEarned || 0)}</strong></div>
            </div>
          </section>
        )}

        {section === 'notifications' && (
          <section className="del-card">
            <h2>Real-Time Notifications ({liveNotifs.length})</h2>
            {liveNotifs.length === 0 ? (
              <p className="del-sub">No new alerts right now. You will be notified instantly on new assignments.</p>
            ) : (
              liveNotifs.map((n) => (
                <div key={n.id} className="del-note">
                  <strong>{n.title}</strong> &bull; <small>{n.at}</small>
                  <div>{n.desc}</div>
                </div>
              ))
            )}
          </section>
        )}

        {section === 'profile' && (
          <section className="del-card">
            <h2>My Delivery Profile</h2>
            <p><strong>Name:</strong> {profile?.fullName}</p>
            <p><strong>Phone:</strong> {profile?.phone}</p>
            <p><strong>Email:</strong> {profile?.email}</p>
            <p><strong>Address:</strong> {profile?.address || 'Hyderabad'}</p>
            <p><strong>Status:</strong> {profile?.availability}</p>
          </section>
        )}

        {['dashboard', 'orders', 'active', 'completed', 'failed'].includes(section) && (
          <>
            <div className="del-filter-bar">
              <div className="del-search">
                <FiSearch size={14} />
                <input
                  type="search"
                  placeholder="Search by Order ID or Customer..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <select className="del-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All Statuses</option>
                <option value="assigned">New Assignments</option>
                <option value="accepted">Accepted</option>
                <option value="picked_up">Picked Up</option>
                <option value="out_for_delivery">Out for Delivery</option>
                <option value="delivered">Delivered</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            <section className="del-orders-grid">
              {loading && <p className="del-sub">Loading assigned orders...</p>}
              {!loading && filteredOrders.length === 0 && (
                <div className="del-card"><p className="del-sub">No orders match this view.</p></div>
              )}
              {filteredOrders.map((ord) => {
                const cleanPhone = String(ord.customerPhone || '').replace(/\D/g, '');
                const waPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
                const fullAddr = [ord.address?.line1, ord.address?.area, ord.address?.city, ord.address?.pincode].filter(Boolean).join(', ');
                const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullAddr)}`;
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
                      <div><FiMapPin size={13} /> {fullAddr}</div>
                      {ord.address?.notes && <div className="del-note"><strong>Instructions:</strong> {ord.address.notes}</div>}
                    </div>

                    <div className="del-items">
                      {(ord.items || []).map((it, idx) => (
                        <span key={idx} className="del-item-pill">{it.qty}&times; {it.name}</span>
                      ))}
                    </div>

                    <div className="del-pay-row">
                      <span>
                        <strong>{ord.paymentMethod.toUpperCase()}</strong> ({ord.paymentStatus === 'paid' ? 'Payment Successful' : ord.paymentStatus}) &bull;{' '}
                        <strong>{money(ord.grandTotal)}</strong>
                      </span>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <a href={mapsUrl} target="_blank" rel="noreferrer" className="del-btn">
                          <FiNavigation size={13} /> Navigate
                        </a>
                        <a href={`tel:${ord.customerPhone}`} className="del-btn">
                          <FiPhone size={13} /> Call
                        </a>
                        {waPhone && (
                          <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noreferrer" className="del-btn">
                            <FiMessageCircle size={13} /> WhatsApp
                          </a>
                        )}
                      </div>
                    </div>

                    {!isDone && !isFailed && (
                      <div className="del-actions">
                        {ord.deliveryStatus === 'assigned' && (
                          <button type="button" className="del-btn del-btn-primary" onClick={() => handleStatusUpdate(ord, 'accepted')}>
                            Accept Order
                          </button>
                        )}
                        {ord.deliveryStatus === 'accepted' && (
                          <button type="button" className="del-btn del-btn-primary" onClick={() => handleStatusUpdate(ord, 'picked_up')}>
                            Mark Picked Up
                          </button>
                        )}
                        {['assigned', 'accepted', 'picked_up'].includes(ord.deliveryStatus) && (
                          <button type="button" className="del-btn del-btn-primary" onClick={() => handleStatusUpdate(ord, 'out_for_delivery')}>
                            Start Delivery (Send OTP)
                          </button>
                        )}

                        {ord.deliveryStatus === 'out_for_delivery' && (
                          <div className="del-otp-box">
                            <input
                              type="text"
                              maxLength={6}
                              placeholder="Enter 6-digit Customer OTP"
                              value={otpInputs[ord.id] || ''}
                              onChange={(e) => setOtpInputs((p) => ({ ...p, [ord.id]: e.target.value }))}
                              className="del-otp-input"
                            />
                            {ord.paymentMethod === 'cod' && ord.paymentStatus !== 'paid' && (
                              <input
                                type="number"
                                placeholder={`Cash ₹${ord.grandTotal}`}
                                value={codAmounts[ord.id] ?? ''}
                                onChange={(e) => setCodAmounts((p) => ({ ...p, [ord.id]: e.target.value }))}
                                className="del-otp-input"
                              />
                            )}
                            <button type="button" className="del-btn del-btn-primary" onClick={() => handleStatusUpdate(ord, 'delivered')}>
                              Verify OTP &amp; Deliver
                            </button>
                            <button type="button" className="del-btn" onClick={() => handleResendOtp(ord.id)}>
                              Resend OTP
                            </button>
                          </div>
                        )}

                        <button
                          type="button"
                          className="del-btn del-btn-danger"
                          onClick={() => {
                            setFailModalOrder(ord);
                            setFailStatus('delivery_failed');
                            setFailReason('');
                          }}
                        >
                          Mark Failed
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </section>
          </>
        )}

        {failModalOrder && (
          <div className="del-modal-back">
            <div className="del-modal">
              <h3>Mark Delivery Failed ({failModalOrder.id})</h3>
              <select className="del-select" value={failStatus} onChange={(e) => setFailStatus(e.target.value)}>
                <option value="delivery_failed">Customer unavailable / Delivery failed</option>
                <option value="customer_unavailable">Customer phone unreachable</option>
                <option value="address_not_found">Incorrect address</option>
                <option value="customer_cancelled">Customer refused delivery</option>
              </select>
              <textarea
                rows={3}
                placeholder="Additional notes (required)..."
                value={failReason}
                onChange={(e) => setFailReason(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="del-btn del-btn-danger" onClick={() => handleStatusUpdate(failModalOrder, failStatus, failReason)}>
                  Submit Failure
                </button>
                <button type="button" className="del-btn" onClick={() => setFailModalOrder(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </main>

      <nav className="del-bottom-nav" aria-label="Mobile delivery navigation">
        {[
          { id: 'dashboard', label: 'Home', icon: FiTruck },
          { id: 'orders', label: 'Orders', icon: FiPackage },
          { id: 'earnings', label: 'Earnings', icon: FiDollarSign },
          { id: 'notifications', label: 'Alerts', icon: FiBell },
          { id: 'profile', label: 'Profile', icon: FiUser },
        ].map((b) => {
          const Icon = b.icon;
          return (
            <button key={b.id} type="button" className={section === b.id ? 'active' : ''} onClick={() => setSection(b.id)}>
              <Icon size={16} />
              <span>{b.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
