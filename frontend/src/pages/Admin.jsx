import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FiActivity,
  FiBarChart2,
  FiBox,
  FiCheck,
  FiChevronDown,
  FiCoffee,
  FiDownload,
  FiEdit2,
  FiExternalLink,
  FiGrid,
  FiLayers,
  FiLogOut,
  FiMenu,
  FiPhone,
  FiPlus,
  FiPrinter,
  FiSettings,
  FiShield,
  FiShoppingBag,
  FiStar,
  FiTag,
  FiTrash2,
  FiTruck,
  FiUsers,
  FiGift,
  FiPackage,
  FiCalendar,
  FiSliders,
  FiX,
} from 'react-icons/fi';
import Button from '../components/Button.jsx';
import AdminAnalystDashboard from '../components/AdminAnalystDashboard.jsx';
import Logo from '../components/Logo.jsx';
import RealtimeBadge from '../components/RealtimeBadge.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocketEvents } from '../context/SocketContext.jsx';
import { useCatalog } from '../context/CatalogContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { apiRequest, getStoredToken } from '../lib/api.js';
import { money } from '../lib/format.js';
import './Admin.css';

const ALL_STATUSES = [
  'pending',
  'payment_pending',
  'confirmed',
  'accepted',
  'preparing',
  'packed',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'refund_initiated',
  'refunded',
];

const emptyProductForm = {
  id: '',
  name: '',
  category: 'tiffins',
  emoji: '🍲',
  image:
    'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=700&q=80',
  price: '',
  discountPrice: '',
  stock: 25,
  prepMins: 10,
  description: '',
  ingredients: '',
  dietTags: '',
  veg: true,
  bestseller: false,
  special: false,
};

function getStatusThemeClass(st) {
  if (st === 'delivered') return { dot: 'admin-dot-green', btn: 'admin-picker-green' };
  if (st === 'cancelled' || st === 'refunded' || st === 'refund_initiated') {
    return { dot: 'admin-dot-red', btn: 'admin-picker-red' };
  }
  if (st === 'packed' || st === 'out_for_delivery') {
    return { dot: 'admin-dot-purple', btn: 'admin-picker-purple' };
  }
  if (st === 'confirmed' || st === 'accepted' || st === 'preparing') {
    return { dot: 'admin-dot-blue', btn: 'admin-picker-blue' };
  }
  return { dot: 'admin-dot-amber', btn: 'admin-picker-amber' };
}

function OrderStatusPicker({ order, onChange, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDocDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  const options = ALL_STATUSES.filter(
    (st) => (st !== 'out_for_delivery' && st !== 'delivered') || st === order.status
  );
  const currentTheme = getStatusThemeClass(order.status);

  return (
    <div className="admin-custom-select" ref={wrapRef}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        className={`admin-custom-select-btn ${currentTheme.btn} ${open ? 'admin-custom-select-btn-open' : ''}`.trim()}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <span className={`admin-custom-dot ${currentTheme.dot}`} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {order.status.replace(/_/g, ' ')}
          </span>
        </span>
        <FiChevronDown size={14} style={{ flexShrink: 0, opacity: 0.75 }} />
      </button>
      {open && (
        <div className="admin-custom-menu" role="listbox" aria-label={ariaLabel}>
          <div className="admin-custom-menu-head">Update Order Status</div>
          {options.map((st) => {
            const isSelected = st === order.status;
            const isBlocked = st === 'out_for_delivery' || st === 'delivered';
            const optTheme = getStatusThemeClass(st);
            return (
              <button
                key={st}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={isBlocked}
                className={`admin-custom-option ${isSelected ? 'admin-custom-option-active' : ''}`.trim()}
                onClick={() => {
                  setOpen(false);
                  if (!isSelected && !isBlocked) onChange(order.id, st);
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span className={`admin-custom-dot ${optTheme.dot}`} />
                  <span>{st.replace(/_/g, ' ')}</span>
                </span>
                {isSelected && <FiCheck size={14} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PartnerAssignPicker({ order, partners, onAssign, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDocDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  const activePartners = (partners || []).filter((b) => b.active);
  const q = query.trim().toLowerCase();
  const filtered = !q
    ? activePartners
    : activePartners.filter((b) =>
        [b.fullName, b.phone, b.email, b.availability]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      );
  const assignedId = order.deliveryAssignment?.deliveryBoyId || '';
  const assignedName = order.deliveryAssignment?.deliveryBoyName || '';

  return (
    <div className="admin-custom-select" ref={wrapRef}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        className={`admin-custom-select-btn ${assignedName ? 'admin-picker-green' : 'admin-picker-empty'} ${
          open ? 'admin-custom-select-btn-open' : ''
        }`.trim()}
        onClick={() => {
          setOpen((v) => {
            if (v) setQuery('');
            return !v;
          });
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <FiTruck size={14} style={{ flexShrink: 0 }} />
          <span style={{ display: 'grid', minWidth: 0 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {assignedName || 'Assign Partner'}
            </span>
            {assignedName && (
              <span style={{ fontSize: '0.66rem', opacity: 0.82, fontWeight: 600 }}>
                {order.deliveryStatus?.replace(/_/g, ' ') || 'assigned'}
              </span>
            )}
          </span>
        </span>
        <FiChevronDown size={14} style={{ flexShrink: 0, opacity: 0.75 }} />
      </button>
      {open && (
        <div className="admin-custom-menu" role="listbox" aria-label={ariaLabel} style={{ minWidth: 256 }}>
          <div className="admin-custom-menu-head">Choose Delivery Partner</div>
          <input
            type="search"
            autoFocus
            className="admin-custom-search"
            aria-label="Search partner by name or phone"
            placeholder="Search name, phone, email..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClick={(e) => e.stopPropagation()}
          />
          {filtered.length === 0 ? (
            <div style={{ padding: '8px 10px', fontSize: '0.78rem', color: 'var(--muted)' }}>
              {activePartners.length === 0 ? 'No active partners available' : `No partner matches "${query}"`}
            </div>
          ) : (
            filtered.map((b) => {
              const isSelected = b.id === assignedId;
              const availClass =
                b.availability === 'available'
                  ? 'admin-avail-available'
                  : b.availability === 'busy'
                  ? 'admin-avail-busy'
                  : 'admin-avail-offline';
              return (
                <button
                  key={b.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`admin-custom-option ${isSelected ? 'admin-custom-option-active' : ''}`.trim()}
                  onClick={() => {
                    setOpen(false);
                    setQuery('');
                    if (!isSelected) onAssign(order.id, b.id);
                  }}
                >
                  <span style={{ display: 'grid', minWidth: 0 }}>
                    <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {b.fullName}
                    </span>
                    <span style={{ fontSize: '0.7rem', opacity: 0.78 }}>{b.phone}</span>
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span className={`admin-avail-pill ${availClass}`}>{b.availability}</span>
                    {isSelected && <FiCheck size={14} style={{ flexShrink: 0 }} />}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default function Admin() {
  const navigate = useNavigate();
  const { user, isAdmin, login, logout } = useAuth();

  const handleSignOut = async () => {
    await logout();
    navigate('/', { replace: true });
  };
  const { categories, products, refreshCatalog } = useCatalog();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [email, setEmail] = useState('admin@hruvita.com');
  const [password, setPassword] = useState('Admin@123');
  const [error, setError] = useState('');
  const [overview, setOverview] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [orderDateFilter, setOrderDateFilter] = useState('');
  const [orderProductFilter, setOrderProductFilter] = useState('');
  const [prodSearch, setProdSearch] = useState('');
  const [ordersPage, setOrdersPage] = useState(1);
  const [productsPage, setProductsPage] = useState(1);
  const PAGE_SIZE = 8;
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [kitchenSlipOrder, setKitchenSlipOrder] = useState(null);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [prodForm, setProdForm] = useState(emptyProductForm);
  const [catForm, setCatForm] = useState({
    name: '',
    emoji: '🥗',
    image:
      'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=400&q=80',
    tint: '#e6f4ea',
  });

  // Phase 5 state: Kitchen View, Coupons, Reports, Settings & Slots
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const [kitchenDate, setKitchenDate] = useState(tomorrowStr);
  const [kitchenData, setKitchenData] = useState(null);
  const [coupons, setCoupons] = useState([]);
  const [couponForm, setCouponForm] = useState({
    code: '',
    title: '',
    type: 'percent',
    value: 15,
    minOrder: 100,
    maxDiscount: 60,
    visibility: 'public',
    validFrom: '',
    validUntil: '',
    eligibleProductIds: [],
    eligibleCategories: [],
    allowedUserEmails: '',
    perUserLimit: 0,
    globalUsageLimit: 0,
    restoreOnCancel: true,
    firstOrderOnly: false,
    active: true,
  });
  const [reports, setReports] = useState(null);
  const [slots, setSlots] = useState([]);
  const [settingsForm, setSettingsForm] = useState(null);
  const [conversations, setConversations] = useState([]);

  // Inventory & Ingredients, Combos, Plans, Reviews, Referrals
  const [inventoryData, setInventoryData] = useState({ products: [], ingredients: [], logs: [] });
  const [ingredientForm, setIngredientForm] = useState({
    id: '',
    name: '',
    category: 'fruits',
    price: 15,
    stock: 40,
    qtyPerBowl: 1,
    active: true,
  });
  const [combos, setCombos] = useState([]);
  const [comboForm, setComboForm] = useState({
    id: '',
    name: '',
    description: '',
    image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=700&q=80',
    price: 99,
    originalPrice: 120,
    scheduleStart: '06:00',
    scheduleEnd: '12:00',
    item1Id: 'p1',
    item2Id: 'p7',
    active: true,
  });
  const [adminPlans, setAdminPlans] = useState([]);
  const [planForm, setPlanForm] = useState({
    id: '',
    name: '',
    days: 7,
    price: 599,
    badge: '',
    perks: 'Fresh morning delivery\nFree pause before 10 PM',
    active: true,
  });
  const [adminReviews, setAdminReviews] = useState([]);
  const [adminReferrals, setAdminReferrals] = useState([]);

  const loadOverview = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const [ov, cp, sl, rp, convRes, invRes, cmbRes, plRes, revRes, refRes] = await Promise.all([
        apiRequest('/api/admin/overview'),
        apiRequest('/api/admin/coupons'),
        apiRequest('/api/admin/slots'),
        apiRequest('/api/admin/reports'),
        apiRequest('/api/assistant/conversations').catch(() => ({ conversations: [] })),
        apiRequest('/api/admin/inventory').catch(() => ({ products: [], ingredients: [], logs: [] })),
        apiRequest('/api/admin/combos').catch(() => ({ combos: [] })),
        apiRequest('/api/admin/plans').catch(() => ({ plans: [] })),
        apiRequest('/api/admin/reviews').catch(() => ({ reviews: [] })),
        apiRequest('/api/admin/referrals').catch(() => ({ referrals: [] })),
      ]);
      setOverview(ov);
      setCoupons(cp.coupons || []);
      setSlots(sl.slots || []);
      setReports(rp);
      setConversations(convRes.conversations || []);
      setInventoryData(invRes);
      setCombos(cmbRes.combos || []);
      setAdminPlans(plRes.plans || []);
      setAdminReviews(revRes.reviews || []);
      setAdminReferrals(refRes.referrals || []);
      if (ov.settings) setSettingsForm(ov.settings);
    } catch (err) {
      setError(err.message);
    }
  }, [isAdmin]);

  const loadKitchen = useCallback(
    async (dateStr) => {
      if (!isAdmin) return;
      try {
        const data = await apiRequest(`/api/admin/kitchen?date=${encodeURIComponent(dateStr)}`);
        setKitchenData(data);
      } catch (err) {
        setError(err.message);
      }
    },
    [isAdmin]
  );

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (isAdmin && activeTab === 'kitchen') {
      loadKitchen(kitchenDate);
    }
  }, [isAdmin, activeTab, kitchenDate, loadKitchen]);

  useSocketEvents(
    isAdmin
      ? {
          'order:created': (p) => {
            showToast(`New order received: ${p?.orderId || ''}`);
            loadOverview();
          },
          'order:updated': () => loadOverview(),
          'order:cancelled': (p) => {
            showToast(`Order cancelled: ${p?.orderId || ''}`);
            loadOverview();
          },
          'payment:successful': () => loadOverview(),
          'payment:refunded': () => loadOverview(),
          'inventory:updated': () => {
            loadOverview();
            refreshCatalog();
          },
          'inventory:low-stock': (p) => {
            showToast(`Low stock alert: ${p?.item?.name || p?.productId || ''}`);
            loadOverview();
          },
          'inventory:out-of-stock': (p) => {
            showToast(`Out of stock: ${p?.item?.name || p?.productId || ''}`, 'error');
            loadOverview();
          },
          'delivery:assigned': () => loadOverview(),
          'delivery:accepted': () => loadOverview(),
          'delivery:started': () => loadOverview(),
          'delivery:completed': (p) => {
            showToast(`Order delivered: ${p?.orderId || ''}`);
            loadOverview();
          },
          'delivery:failed': (p) => {
            showToast(`Delivery failed: ${p?.orderId || ''}`, 'error');
            loadOverview();
          },
          'customer:registered': () => loadOverview(),
          'subscription:created': () => loadOverview(),
          'subscription:updated': () => loadOverview(),
        }
      : null,
    [isAdmin, loadOverview, refreshCatalog]
  );

  const [team, setTeam] = useState([]);
  const [teamForm, setTeamForm] = useState({ fullName: '', email: '', password: '', role: 'admin_analyser' });
  const [deliveryBoysList, setDeliveryBoysList] = useState([]);
  const [deliverySearch, setDeliverySearch] = useState('');
  const [selectedPartnerId, setSelectedPartnerId] = useState(null);
  const [deliveryBoyForm, setDeliveryBoyForm] = useState({
    id: '',
    fullName: '',
    phone: '',
    email: '',
    password: '',
    availability: 'available',
  });

  const loadDeliveryBoys = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await apiRequest('/api/admin/delivery-boys');
      setDeliveryBoysList(res.deliveryBoys || []);
    } catch {
      /* ignore */
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin && activeTab === 'delivery') loadDeliveryBoys();
  }, [isAdmin, activeTab, loadDeliveryBoys]);

  const handleSaveDeliveryBoy = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (deliveryBoyForm.id) {
        await apiRequest(`/api/admin/delivery-boys/${deliveryBoyForm.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            fullName: deliveryBoyForm.fullName,
            phone: deliveryBoyForm.phone,
            availability: deliveryBoyForm.availability,
            ...(deliveryBoyForm.password ? { password: deliveryBoyForm.password } : {}),
          }),
        });
        showToast('Delivery partner updated.');
      } else {
        await apiRequest('/api/admin/delivery-boys', {
          method: 'POST',
          body: JSON.stringify(deliveryBoyForm),
        });
        showToast(`Created delivery partner ${deliveryBoyForm.fullName}.`);
      }
      setDeliveryBoyForm({ id: '', fullName: '', phone: '', email: '', password: '', availability: 'available' });
      await Promise.all([loadDeliveryBoys(), loadOverview()]);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleDeliveryBoy = async (boy) => {
    try {
      await apiRequest(`/api/admin/delivery-boys/${boy.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !boy.active }),
      });
      showToast(`${boy.fullName} ${boy.active ? 'deactivated' : 'activated'}.`);
      await Promise.all([loadDeliveryBoys(), loadOverview()]);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAssignDeliveryBoy = async (orderId, deliveryBoyId) => {
    if (!deliveryBoyId) return;
    setError('');
    try {
      await apiRequest(`/api/admin/orders/${orderId}/assign-delivery`, {
        method: 'POST',
        body: JSON.stringify({ deliveryBoyId }),
      });
      showToast(`Delivery partner assigned to ${orderId}.`);
      await Promise.all([loadOverview(), loadDeliveryBoys()]);
    } catch (err) {
      setError(err.message);
    }
  };

  const loadTeam = useCallback(async () => {
    if (user?.role !== 'admin') return;
    try {
      const res = await apiRequest('/api/admin/team');
      setTeam(res.team || []);
    } catch {
      /* ignore */
    }
  }, [user?.role]);

  useEffect(() => {
    if (user?.role === 'admin' && activeTab === 'team') loadTeam();
  }, [user?.role, activeTab, loadTeam]);

  const handleCreateTeamMember = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await apiRequest('/api/admin/team', { method: 'POST', body: JSON.stringify(teamForm) });
      showToast(`Created ${teamForm.role} account for ${teamForm.email}`);
      setTeamForm({ fullName: '', email: '', password: '', role: 'admin_analyser' });
      await Promise.all([loadTeam(), loadOverview()]);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleTeamStatus = async (member) => {
    try {
      await apiRequest(`/api/admin/team/${member.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ blocked: !member.blocked }),
      });
      showToast(`${member.email} ${member.blocked ? 'activated' : 'deactivated'}.`);
      await Promise.all([loadTeam(), loadOverview()]);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const logged = await login(email, password, true, true);
      if (!['admin', 'staff', 'admin_analyser'].includes(logged?.role)) {
        setError('This account does not have admin permissions.');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  if (user?.role === 'admin_analyser') {
    return <AdminAnalystDashboard user={user} onLogout={handleSignOut} />;
  }

  if (!user || !isAdmin) {
    return (
      <div className="admin-login-screen">
        <div className="admin-login-card">
          <div style={{ marginBottom: 16 }}>
            <Logo />
          </div>
          <h1 style={{ fontSize: '1.45rem', color: 'var(--primary)', marginBottom: 6 }}>
            <FiShield size={20} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Admin Control Center
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginBottom: 18 }}>
            Sign in with your administrator credentials.
          </p>
          {error && <div className="account-alert" role="alert">{error}</div>}
          <form className="admin-form" onSubmit={handleAdminLogin}>
            <div className="admin-field">
              <label htmlFor="admin-email">Admin Email or Username</label>
              <input
                id="admin-email"
                name="email"
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="admin-field">
              <label htmlFor="admin-password">Password</label>
              <input
                id="admin-password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit">Sign In to Admin</Button>
          </form>
          <div style={{ marginTop: 18, textAlign: 'center', fontSize: '0.85rem' }}>
            <Link to="/" style={{ color: 'var(--primary)', fontWeight: 600 }}>
              &larr; Return to Storefront
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const handleOrderStatusChange = async (orderId, newStatus) => {
    setError('');
    try {
      await apiRequest(`/api/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      showToast(`Order ${orderId} updated to ${newStatus.replace(/_/g, ' ')}.`);
      await Promise.all([loadOverview(), refreshCatalog()]);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRefundOrder = async (orderId) => {
    setError('');
    try {
      await apiRequest(`/api/admin/orders/${orderId}/refund`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Admin initiated refund' }),
      });
      showToast(`Refund processed for ${orderId}.`);
      await loadOverview();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleProductSave = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        ...prodForm,
        price: Number(prodForm.price),
        discountPrice: prodForm.discountPrice ? Number(prodForm.discountPrice) : null,
        stock: Number(prodForm.stock),
        prepMins: Number(prodForm.prepMins),
      };
      if (prodForm.id) {
        await apiRequest(`/api/products/${prodForm.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showToast(`Updated "${prodForm.name}".`);
      } else {
        await apiRequest('/api/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast(`Added "${prodForm.name}" to catalog.`);
      }
      setProdForm(emptyProductForm);
      setProductModalOpen(false);
      await Promise.all([refreshCatalog(), loadOverview()]);
    } catch (err) {
      setError(err.message);
    }
  };

  const openEditModal = (p) => {
    setProdForm({
      id: p.id,
      name: p.name,
      category: p.category,
      emoji: p.emoji || '🍲',
      image: p.image || '',
      price: p.price,
      discountPrice: p.discountPrice || '',
      stock: p.stock,
      prepMins: p.prepMins || 10,
      description: p.description || '',
      ingredients: (p.ingredients || []).join(', '),
      dietTags: (p.dietTags || []).join(', '),
      veg: Boolean(p.veg),
      bestseller: Boolean(p.bestseller),
      special: Boolean(p.special),
    });
    setProductModalOpen(true);
  };

  const handleDeleteProduct = async (p) => {
    setError('');
    try {
      await apiRequest(`/api/products/${p.id}`, { method: 'DELETE' });
      showToast(`Removed "${p.name}".`);
      await Promise.all([refreshCatalog(), loadOverview()]);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleQuickStock = async (p, delta) => {
    try {
      const nextStock = Math.max(0, (p.stock || 0) + delta);
      await apiRequest(`/api/products/${p.id}`, {
        method: 'PUT',
        body: JSON.stringify({ stock: nextStock }),
      });
      await Promise.all([refreshCatalog(), loadOverview()]);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await apiRequest('/api/categories', {
        method: 'POST',
        body: JSON.stringify(catForm),
      });
      showToast(`Category "${catForm.name}" saved.`);
      setCatForm({
        name: '',
        emoji: '🥗',
        image:
          'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=400&q=80',
        tint: '#e6f4ea',
      });
      await Promise.all([refreshCatalog(), loadOverview()]);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSaveCoupon = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await apiRequest('/api/admin/coupons', {
        method: 'POST',
        body: JSON.stringify(couponForm),
      });
      showToast(`Coupon ${couponForm.code.toUpperCase()} saved.`);
      setCouponForm({
        code: '',
        title: '',
        type: 'percent',
        value: 15,
        minOrder: 100,
        maxDiscount: 60,
        visibility: 'public',
        validFrom: '',
        validUntil: '',
        eligibleProductIds: [],
        eligibleCategories: [],
        allowedUserEmails: '',
        perUserLimit: 0,
        globalUsageLimit: 0,
        restoreOnCancel: true,
        firstOrderOnly: false,
        active: true,
      });
      await loadOverview();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteCoupon = async (code) => {
    try {
      await apiRequest(`/api/admin/coupons/${code}`, { method: 'DELETE' });
      showToast(`Coupon ${code} deleted.`);
      await loadOverview();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleCouponActive = async (c) => {
    try {
      await apiRequest('/api/admin/coupons', {
        method: 'POST',
        body: JSON.stringify({ ...c, active: c.active === false }),
      });
      showToast(`Coupon ${c.code} ${c.active === false ? 'activated' : 'deactivated'}.`);
      await loadOverview();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await apiRequest('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(settingsForm),
      });
      showToast('Business settings saved.');
      await Promise.all([refreshCatalog(), loadOverview()]);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpdateSlot = async (slot) => {
    try {
      await apiRequest(`/api/admin/slots/${slot.id}`, {
        method: 'PUT',
        body: JSON.stringify(slot),
      });
      showToast(`${slot.name} updated.`);
      await loadOverview();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDownloadCsv = async (type) => {
    try {
      const host =
        typeof window !== 'undefined' && window.location?.hostname
          ? `http://${window.location.hostname}:5000`
          : 'http://localhost:5000';
      const apiBase = (import.meta.env.VITE_API_URL || host).replace(/\/$/, '');
      const token = getStoredToken();
      const res = await fetch(`${apiBase}/api/admin/export/${type}`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Export failed.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hruvita-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast(`Downloaded ${type} CSV report.`);
    } catch (err) {
      showToast(err.message || 'CSV download failed.', 'error');
    }
  };

  const handleToggleBlockUser = async (cust) => {
    try {
      await apiRequest(`/api/admin/users/${cust.id}/block`, {
        method: 'PATCH',
        body: JSON.stringify({ blocked: !cust.blocked }),
      });
      await loadOverview();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAdjustProductStock = async (prodId, delta, note = 'Admin quick adjust') => {
    try {
      await apiRequest(`/api/admin/inventory/products/${prodId}/adjust`, {
        method: 'POST',
        body: JSON.stringify({ delta, note }),
      });
      showToast(`Product stock adjusted (${delta > 0 ? `+${delta}` : delta}).`);
      await Promise.all([refreshCatalog(), loadOverview()]);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAdjustIngredientStock = async (ingId, delta) => {
    try {
      await apiRequest(`/api/admin/ingredients/${ingId}/adjust`, {
        method: 'POST',
        body: JSON.stringify({ delta, note: 'Admin restock/adjustment' }),
      });
      showToast(`Ingredient stock updated.`);
      await loadOverview();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSaveIngredient = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await apiRequest('/api/admin/ingredients', {
        method: 'POST',
        body: JSON.stringify(ingredientForm),
      });
      showToast(`Ingredient "${ingredientForm.name}" saved.`);
      setIngredientForm({
        id: '',
        name: '',
        category: 'fruits',
        price: 15,
        stock: 40,
        qtyPerBowl: 1,
        active: true,
      });
      await loadOverview();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSaveCombo = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const items = [comboForm.item1Id, comboForm.item2Id]
        .filter(Boolean)
        .map((productId) => ({ productId, qty: 1 }));
      await apiRequest('/api/admin/combos', {
        method: 'POST',
        body: JSON.stringify({
          id: comboForm.id || undefined,
          name: comboForm.name,
          description: comboForm.description,
          image: comboForm.image,
          price: Number(comboForm.price),
          originalPrice: Number(comboForm.originalPrice),
          scheduleStart: comboForm.scheduleStart,
          scheduleEnd: comboForm.scheduleEnd,
          active: comboForm.active,
          items,
        }),
      });
      showToast(`Combo "${comboForm.name}" saved.`);
      setComboForm({
        id: '',
        name: '',
        description: '',
        image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=700&q=80',
        price: 99,
        originalPrice: 120,
        scheduleStart: '06:00',
        scheduleEnd: '12:00',
        item1Id: 'p1',
        item2Id: 'p7',
        active: true,
      });
      await Promise.all([refreshCatalog(), loadOverview()]);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteCombo = async (comboId) => {
    try {
      await apiRequest(`/api/admin/combos/${comboId}`, { method: 'DELETE' });
      showToast('Combo deleted.');
      await Promise.all([refreshCatalog(), loadOverview()]);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSavePlan = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await apiRequest('/api/admin/plans', {
        method: 'POST',
        body: JSON.stringify(planForm),
      });
      showToast(`Plan "${planForm.name}" saved.`);
      setPlanForm({
        id: '',
        name: '',
        days: 7,
        price: 599,
        badge: '',
        perks: 'Fresh morning delivery\nFree pause before 10 PM',
        active: true,
      });
      await Promise.all([refreshCatalog(), loadOverview()]);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeletePlan = async (planId) => {
    try {
      await apiRequest(`/api/admin/plans/${planId}`, { method: 'DELETE' });
      showToast('Subscription plan deleted.');
      await Promise.all([refreshCatalog(), loadOverview()]);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleModerateReview = async (rev) => {
    try {
      await apiRequest(`/api/admin/reviews/${rev.id}/moderate`, {
        method: 'PATCH',
        body: JSON.stringify({
          visible: !rev.visible,
          moderationNote: rev.visible ? 'Hidden by admin' : 'Restored by admin',
        }),
      });
      showToast(rev.visible ? 'Review hidden from storefront.' : 'Review restored.');
      await loadOverview();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleResolveReferral = async (refId, action) => {
    try {
      await apiRequest(`/api/admin/referrals/${refId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      showToast(action === 'approve' ? 'Referral approved & reward points credited.' : 'Referral rejected.');
      await loadOverview();
    } catch (err) {
      setError(err.message);
    }
  };

  const stats = overview?.stats || {
    totalRevenue: 0,
    totalOrders: 0,
    activeOrdersCount: 0,
    totalProducts: products.length,
    outOfStockCount: products.filter((p) => p.stock <= 0).length,
    totalCustomers: 0,
    activeSubscriptionsCount: 0,
  };

  const allOrders = overview?.orders || [];
  const filteredOrders = allOrders.filter((o) => {
    if (statusFilter && o.status !== statusFilter) return false;
    if (orderDateFilter) {
      const createdDay = String(o.createdAt || '').slice(0, 10);
      if (o.scheduledDate !== orderDateFilter && createdDay !== orderDateFilter) return false;
    }
    if (orderProductFilter.trim()) {
      const q = orderProductFilter.trim().toLowerCase();
      const hasMatch =
        String(o.id || '').toLowerCase().includes(q) ||
        String(o.customerName || '').toLowerCase().includes(q) ||
        String(o.customerPhone || '').toLowerCase().includes(q) ||
        (o.items || []).some((it) => String(it.name || '').toLowerCase().includes(q));
      if (!hasMatch) return false;
    }
    return true;
  });

  const filteredProducts = products.filter(
    (p) =>
      !prodSearch.trim() ||
      p.name.toLowerCase().includes(prodSearch.toLowerCase()) ||
      p.category.toLowerCase().includes(prodSearch.toLowerCase())
  );

  const catalogTabs = [
    { id: 'products', label: 'Products', count: products.length, icon: FiBox },
    { id: 'inventory', label: 'Inventory & Bowl', count: inventoryData.ingredients?.length || 0, icon: FiSliders },
    { id: 'combos', label: 'Combos', count: combos.length, icon: FiPackage },
    { id: 'plans', label: 'Plans', count: adminPlans.length, icon: FiCalendar },
    { id: 'categories', label: 'Categories', count: categories.length, icon: FiLayers },
  ];
  const marketingTabs = [
    { id: 'coupons', label: 'Coupons', count: coupons.length, icon: FiTag },
    { id: 'reviews', label: 'Reviews', count: adminReviews.length, icon: FiStar },
    { id: 'referrals', label: 'Referrals', count: adminReferrals.length, icon: FiGift },
  ];
  const systemTabs = [
    { id: 'settings', label: 'Settings & Slots', icon: FiSettings },
    ...(user?.role === 'admin' ? [{ id: 'team', label: 'Admin Team', icon: FiShield }] : []),
    { id: 'audit', label: 'Audit Logs', icon: FiActivity },
  ];

  const isCatalogTab = catalogTabs.some((t) => t.id === activeTab);
  const isMarketingTab = marketingTabs.some((t) => t.id === activeTab);
  const isSystemTab = systemTabs.some((t) => t.id === activeTab);

  const sidebarItems = [
    { id: 'overview', label: 'Overview', icon: FiGrid, active: activeTab === 'overview' },
    { id: 'kitchen', label: 'Kitchen Prep', icon: FiCoffee, active: activeTab === 'kitchen' },
    { id: 'orders', label: 'Orders', count: allOrders.length, icon: FiShoppingBag, active: activeTab === 'orders' },
    { id: 'delivery', label: 'Delivery Team', count: overview?.deliveryBoys?.length || 0, icon: FiTruck, active: activeTab === 'delivery' },
    { id: 'products', label: 'Catalog & Menu', count: products.length, icon: FiBox, active: isCatalogTab },
    { id: 'customers', label: 'Customers', count: overview?.customers?.length || 0, icon: FiUsers, active: activeTab === 'customers' },
    { id: 'coupons', label: 'Marketing', count: coupons.length + adminReviews.length, icon: FiTag, active: isMarketingTab },
    { id: 'reports', label: 'Reports & CSV', icon: FiBarChart2, active: activeTab === 'reports' },
    { id: 'settings', label: 'Settings & Admin', icon: FiSettings, active: isSystemTab },
  ];

  const allTabTitles = [
    { id: 'overview', label: 'Overview' },
    { id: 'kitchen', label: 'Kitchen Prep' },
    { id: 'orders', label: 'Orders Queue' },
    { id: 'delivery', label: 'Delivery Team' },
    ...catalogTabs,
    { id: 'customers', label: 'Customers' },
    ...marketingTabs,
    { id: 'reports', label: 'Reports & CSV' },
    ...systemTabs,
  ];
  const activeSubTabs = isCatalogTab ? catalogTabs : isMarketingTab ? marketingTabs : isSystemTab ? systemTabs : null;

  return (
    <div className="admin-shell">
      {mobileNavOpen && (
        <div
          className="admin-mobile-backdrop"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside className={`admin-sidebar ${mobileNavOpen ? 'admin-sidebar-open' : ''}`.trim()}>
        <div className="admin-brand-row">
          <Logo light />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="admin-brand-badge">Admin</span>
            <button
              type="button"
              className="admin-mobile-close-btn"
              aria-label="Close admin menu"
              onClick={() => setMobileNavOpen(false)}
            >
              <FiX size={18} />
            </button>
          </div>
        </div>

        <nav className="admin-nav" aria-label="Admin sections">
          <div className="admin-nav-group">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
            return (
                <button
                  key={item.id}
                  type="button"
                  className={`admin-nav-btn ${item.active ? 'admin-nav-btn-active' : ''}`.trim()}
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileNavOpen(false);
                    setError('');
                  }}
                >
                  <span className="admin-nav-btn-left">
                    <span className="admin-nav-icon-wrap">
                      <Icon size={16} />
                    </span>
                    <span>{item.label}</span>
                  </span>
                  {typeof item.count === 'number' && (
                    <span className="admin-nav-count">{item.count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="admin-sidebar-foot">
          <div className="admin-sidebar-user" title={user.email}>{user.email}</div>
          <div className="admin-sidebar-foot-actions">
            <Link to="/admin-analyser" className="admin-sidebar-foot-link">
              <FiBarChart2 size={13} /> Analyst
            </Link>
            <Link to="/" className="admin-sidebar-foot-link">
              <FiExternalLink size={13} /> Storefront
            </Link>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="admin-sidebar-signout"
          >
            <FiLogOut size={14} /> Sign Out
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <button
              type="button"
              className="admin-mobile-menu-btn"
              aria-label="Open admin menu"
              onClick={() => setMobileNavOpen(true)}
            >
              <FiMenu size={20} />
            </button>
            <div className="admin-topbar-title">
              <h1>{allTabTitles.find((n) => n.id === activeTab)?.label || 'Dashboard'}</h1>
              <p>HRUVITA Operations &bull; Live Store Management</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <RealtimeBadge />
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setProdForm(emptyProductForm);
                setProductModalOpen(true);
              }}
            >
              <FiPlus size={16} /> Add Product
            </Button>
          </div>
        </header>

        <div className="admin-content">
          {error && <div className="account-alert" role="alert">{error}</div>}

          {activeSubTabs && (
            <div className="admin-subtabs" role="tablist" aria-label="Section sub-tabs">
              {activeSubTabs.map((sub) => {
                const SubIcon = sub.icon;
            return (
                  <button
                    key={sub.id}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === sub.id}
                    className={`admin-subtab-btn ${activeTab === sub.id ? 'admin-subtab-btn-active' : ''}`.trim()}
                    onClick={() => {
                      setActiveTab(sub.id);
                      setError('');
                    }}
                  >
                    <SubIcon size={15} />
                    <span>{sub.label}</span>
                    {typeof sub.count === 'number' && (
                      <span style={{ opacity: 0.75, fontSize: '0.76rem' }}>({sub.count})</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {activeTab === 'overview' && (
            <>
              <div className="admin-hero-banner">
                <div>
                  <h2>Welcome back to HRUVITA Command Center</h2>
                  <p>
                    {stats.activeOrdersCount || 0} active orders &bull; {stats.todayOrdersCount || 0} orders today &bull;{' '}
                    {overview?.deliveryBoys?.filter((d) => d.isActive && d.availabilityStatus === 'available').length || 0} partners available
                  </p>
                </div>
                <div className="admin-hero-actions">
                  <button type="button" className="admin-hero-btn" onClick={() => setActiveTab('orders')}>
                    <FiShoppingBag size={15} /> Live Orders
                  </button>
                  <button type="button" className="admin-hero-btn" onClick={() => setActiveTab('kitchen')}>
                    <FiCoffee size={15} /> Kitchen Prep
                  </button>
                  <button type="button" className="admin-hero-btn" onClick={() => setActiveTab('delivery')}>
                    <FiTruck size={15} /> Dispatch
                  </button>
                </div>
              </div>

              <div className="admin-kpi-grid">
                <div className="admin-kpi-card">
                  <div>
                    <span>Total Revenue</span>
                    <strong>{money(stats.totalRevenue || 0)}</strong>
                  </div>
                  <div className="admin-kpi-icon">
                    <FiBarChart2 size={19} />
                  </div>
                </div>
                <div className="admin-kpi-card">
                  <div>
                    <span>Active / Total Orders</span>
                    <strong>
                      {stats.activeOrdersCount || 0} / {stats.totalOrders || 0}
                    </strong>
                  </div>
                  <div className="admin-kpi-icon admin-kpi-icon-orange">
                    <FiShoppingBag size={19} />
                  </div>
                </div>
                <div className="admin-kpi-card">
                  <div>
                    <span>Today&apos;s Orders</span>
                    <strong>{stats.todayOrdersCount || 0}</strong>
                  </div>
                  <div className="admin-kpi-icon admin-kpi-icon-blue">
                    <FiCalendar size={19} />
                  </div>
                </div>
                <div className="admin-kpi-card">
                  <div>
                    <span>Active Subscriptions</span>
                    <strong>{stats.activeSubscriptionsCount || 0}</strong>
                  </div>
                  <div className="admin-kpi-icon">
                    <FiPackage size={19} />
                  </div>
                </div>
                <div className="admin-kpi-card">
                  <div>
                    <span>Out of Stock</span>
                    <strong style={{ color: stats.outOfStockCount > 0 ? 'var(--danger)' : 'var(--green-900)' }}>
                      {stats.outOfStockCount}
                    </strong>
                  </div>
                  <div className={`admin-kpi-icon ${stats.outOfStockCount > 0 ? 'admin-kpi-icon-red' : ''}`}>
                    <FiBox size={19} />
                  </div>
                </div>
                <div className="admin-kpi-card">
                  <div>
                    <span>Pending / Done / Cancelled</span>
                    <strong style={{ fontSize: '1.15rem' }}>
                      {stats.pendingOrdersCount || 0} / {stats.completedOrdersCount || 0} / {stats.cancelledOrdersCount || 0}
                    </strong>
                  </div>
                  <div className="admin-kpi-icon admin-kpi-icon-orange">
                    <FiActivity size={19} />
                  </div>
                </div>
                <div className="admin-kpi-card">
                  <div>
                    <span>Customers</span>
                    <strong>{stats.totalCustomers}</strong>
                  </div>
                  <div className="admin-kpi-icon admin-kpi-icon-blue">
                    <FiUsers size={19} />
                  </div>
                </div>
              </div>

              <div className="admin-overview-grid">
                <section className="admin-panel">
                  <div className="admin-panel-head">
                    <h2>Order Fulfillment Pipeline</h2>
                  </div>
                  <div className="admin-status-bars">
                    {[
                      { label: 'Pending / Confirmed', count: stats.pendingOrdersCount || 0 },
                      { label: 'Active in Kitchen / Transit', count: stats.activeOrdersCount || 0 },
                      { label: 'Delivered & Completed', count: stats.completedOrdersCount || 0 },
                      { label: 'Cancelled / Refunded', count: stats.cancelledOrdersCount || 0 },
                    ].map((row) => {
                      const total = Math.max(stats.totalOrders || 1, 1);
                      const pct = Math.min(100, Math.round((row.count / total) * 100));
            return (
                        <div key={row.label} className="admin-status-bar-row">
                          <div className="admin-status-bar-head">
                            <span>{row.label}</span>
                            <span>{row.count} ({pct}%)</span>
                          </div>
                          <div className="admin-status-bar-track">
                            <div className="admin-status-bar-fill" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="admin-panel">
                  <div className="admin-panel-head">
                    <h2>Quick Shortcuts &amp; Top Items</h2>
                  </div>
                  <div className="admin-quick-actions" style={{ marginBottom: 16 }}>
                    <button type="button" className="admin-quick-btn" onClick={() => setActiveTab('products')}>
                      <FiBox size={15} /> Products ({products.length})
                    </button>
                    <button type="button" className="admin-quick-btn" onClick={() => setActiveTab('inventory')}>
                      <FiSliders size={15} /> Inventory
                    </button>
                    <button type="button" className="admin-quick-btn" onClick={() => setActiveTab('coupons')}>
                      <FiTag size={15} /> Coupons ({coupons.length})
                    </button>
                    <button type="button" className="admin-quick-btn" onClick={() => setActiveTab('reports')}>
                      <FiBarChart2 size={15} /> Reports &amp; CSV
                    </button>
                  </div>
                  {Array.isArray(overview?.popularProducts) && overview.popularProducts.length > 0 ? (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {overview.popularProducts.map((p, idx) => (
                        <span
                          key={p.name}
                          style={{
                            background: idx === 0 ? '#edf7f0' : '#f8faf9',
                            border: `1px solid ${idx === 0 ? '#b7dfc4' : '#e2e8f0'}`,
                            borderRadius: 999,
                            padding: '5px 11px',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            color: 'var(--green-900)',
                          }}
                        >
                          #{idx + 1} {p.name} ({p.qty})
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p style={{ color: 'var(--muted)', fontSize: '0.86rem' }}>
                      No product order data yet.
                    </p>
                  )}
                </section>
              </div>
            </>
          )}

          {/* Kitchen Tomorrow-Prep View */}
          {activeTab === 'kitchen' && (
            <div style={{ display: 'grid', gap: 24 }}>
              <section className="admin-panel">
                <div className="admin-panel-head">
                  <div>
                    <h2>Kitchen Preparation Sheet</h2>
                    <p style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>
                      Pre-orders and active breakfast subscriptions grouped by delivery slot.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="date"
                      value={kitchenDate}
                      onChange={(e) => setKitchenDate(e.target.value)}
                      className="menu-select"
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
                      <FiPrinter size={15} /> Print Prep Sheet
                    </Button>
                  </div>
                </div>

                {kitchenData?.grandTotals?.length > 0 ? (
                  <div className="admin-table-wrap" style={{ marginBottom: 24 }}>
                    <h3 style={{ marginBottom: 10, fontSize: '1.05rem' }}>
                      Total Quantities to Prepare ({kitchenData.date})
                    </h3>
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Dish / Bowl</th>
                          <th>Total Quantity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kitchenData.grandTotals.map((row) => (
                          <tr key={row.name}>
                            <td>
                              <strong>{row.name}</strong>
                            </td>
                            <td>
                              <strong>{row.qty}</strong>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p style={{ color: 'var(--muted)', marginBottom: 20 }}>
                    No scheduled pre-orders or active subscriptions for {kitchenDate}.
                  </p>
                )}

                <div className="addr-cards-grid">
                  {(kitchenData?.slots || []).map((sl) => (
                    <div key={sl.slotId} className="addr-card">
                      <div className="addr-card-top">
                        <strong>{sl.slotName}</strong>
                        <span className="addr-type-pill">
                          {sl.orders.length + sl.subscriptions.length} / {sl.maxOrders}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{sl.window}</span>
                      {Object.keys(sl.itemTotals).length === 0 ? (
                        <p style={{ fontSize: '0.86rem', color: 'var(--muted)' }}>No items scheduled.</p>
                      ) : (
                        <ul style={{ display: 'grid', gap: 4, fontSize: '0.88rem' }}>
                          {Object.entries(sl.itemTotals).map(([dish, qty]) => (
                            <li key={dish} style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>{dish}</span>
                              <strong>&times; {qty}</strong>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activeTab === 'overview' && (
            <section className="admin-panel" style={{ padding: '16px 20px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h2 style={{ fontSize: '1.05rem', marginBottom: 4 }}>Quick Operations</h2>
                  <p style={{ fontSize: '0.84rem', color: 'var(--muted)' }}>
                    Jump directly to Orders Queue or Catalog Inventory.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Button type="button" size="sm" onClick={() => setActiveTab('orders')}>
                    Open Orders Queue ({filteredOrders.length})
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setActiveTab('products')}>
                    Open Catalog Inventory ({filteredProducts.length})
                  </Button>
                </div>
              </div>
            </section>
          )}

          {activeTab === 'orders' && (() => {
            const selectedOrder = selectedOrderId ? allOrders.find((o) => o.id === selectedOrderId) || null : null;
            const selectedPayment = selectedOrder
              ? (overview?.payments || []).find((p) => p.orderId === selectedOrder.id) || null
              : null;
            return (
              <>
                <section className="admin-panel">
              <div className="admin-panel-head">
                <h2>Orders Queue ({filteredOrders.length})</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <input
                    type="date"
                    aria-label="Filter orders by date"
                    className="menu-select"
                    value={orderDateFilter}
                    onChange={(e) => {
                      setOrderDateFilter(e.target.value);
                      setOrdersPage(1);
                    }}
                  />
                  <input
                    type="search"
                    aria-label="Search by Order ID, product, or customer"
                    placeholder="Search Order ID, product, customer..."
                    className="menu-select"
                    style={{ minWidth: 230 }}
                    value={orderProductFilter}
                    onChange={(e) => {
                      setOrderProductFilter(e.target.value);
                      setOrdersPage(1);
                    }}
                  />
                  <label htmlFor="admin-status-filter" style={{ fontSize: '0.84rem', fontWeight: 600 }}>
                    Status:
                  </label>
                  <select
                    id="admin-status-filter"
                    name="statusFilter"
                    className="menu-select"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="">All 11 Statuses ({allOrders.length})</option>
                    {ALL_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {filteredOrders.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: '0.92rem' }}>
                  No orders in this view yet.
                </p>
              ) : (
                <div className="admin-table-wrap admin-orders-table-wrap">
                  <table className="admin-table admin-orders-table">
                    <thead>
                      <tr>
                        <th>Order &amp; Slot</th>
                        <th>Customer &amp; Address</th>
                        <th>Items</th>
                        <th>Amount &amp; Payment</th>
                        <th>Order Status</th>
                        <th>Delivery Partner</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders
                        .slice((ordersPage - 1) * PAGE_SIZE, ordersPage * PAGE_SIZE)
                        .map((ord) => {
                        const cleanDigits = String(ord.customerPhone || '').replace(/[^0-9]/g, '');
                        const waUrl = `https://wa.me/${cleanDigits}?text=${encodeURIComponent(
                          `Hello ${ord.customerName}, update on your HRUVITA order ${ord.id}: status is now ${ord.status.replace(/_/g, ' ')}.`
                        )}`;
            return (
                          <tr
                            key={ord.id}
                            className={`admin-order-row-clickable ${selectedOrderId === ord.id ? 'admin-order-row-selected' : ''}`.trim()}
                            onClick={() => setSelectedOrderId(ord.id)}
                          >
                            <td>
                              <strong>{ord.id}</strong>
                              <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                                {ord.scheduledDate} &bull; {ord.slotLabel}
                              </div>
                            </td>
                            <td>
                              <strong>{ord.customerName}</strong>
                              <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                                {ord.address?.line1}, {ord.address?.pincode}
                              </div>
                              <div
                                style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: '0.78rem' }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <a href={`tel:${ord.customerPhone}`} style={{ color: 'var(--primary)', fontWeight: 600 }}>
                                  <FiPhone size={11} /> Call
                                </a>
                                <a href={waUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', fontWeight: 600 }}>
                                  WhatsApp
                                </a>
                              </div>
                            </td>
                            <td>
                              {(ord.items || []).map((it) => (
                                <div key={it.productId} style={{ fontSize: '0.84rem' }}>
                                  {it.name} &times; <strong>{it.qty}</strong>
                                </div>
                              ))}
                            </td>
                            <td>
                              <strong>{money(ord.pricing?.grandTotal)}</strong>
                              <div style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>
                                {ord.originalPaymentMethod === 'COD' && (ord.currentPaymentMethod === 'Online' || ord.paymentMethod === 'razorpay') && ord.paymentStatus === 'paid' ? (
                                  <span style={{ color: '#166534', fontWeight: 700 }}>COD &rarr; Online (PAID)</span>
                                ) : ord.paymentMethod === 'cod' && ord.paymentStatus !== 'paid' ? (
                                  <span>COD &ndash; Payment Pending</span>
                                ) : (
                                  <span style={{ textTransform: 'uppercase' }}>{ord.paymentMethod} ({ord.paymentStatus})</span>
                                )}
                              </div>
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              <div className="admin-status-stack">
                                <OrderStatusPicker
                                  order={ord}
                                  ariaLabel={`Status for ${ord.id}`}
                                  onChange={handleOrderStatusChange}
                                />
                              </div>
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              <div className="admin-partner-box">
                                <PartnerAssignPicker
                                  order={ord}
                                  partners={overview?.deliveryBoys}
                                  ariaLabel={`Assign delivery boy for ${ord.id}`}
                                  onAssign={handleAssignDeliveryBoy}
                                />
                              </div>
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              <div className="admin-row-actions">
                                <button
                                  type="button"
                                  className="admin-mini-btn"
                                  onClick={() => setKitchenSlipOrder(ord)}
                                  title="Print Kitchen Slip"
                                >
                                  <FiPrinter size={13} /> Slip
                                </button>
                                {ord.paymentStatus === 'paid' && ord.status !== 'refunded' && (
                                  <button
                                    type="button"
                                    className="admin-mini-btn admin-mini-danger"
                                    onClick={() => handleRefundOrder(ord.id)}
                                  >
                                    Refund
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {filteredOrders.length > PAGE_SIZE && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end', marginTop: 14 }}>
                  <button
                    type="button"
                    className="admin-mini-btn"
                    disabled={ordersPage <= 1}
                    onClick={() => setOrdersPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </button>
                  <span style={{ fontSize: '0.84rem', color: 'var(--muted)' }}>
                    Page {ordersPage} of {Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE))}
                  </span>
                  <button
                    type="button"
                    className="admin-mini-btn"
                    disabled={ordersPage >= Math.ceil(filteredOrders.length / PAGE_SIZE)}
                    onClick={() => setOrdersPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
            </section>

                {selectedOrder && (
                  <div
                    className="admin-order-modal-backdrop"
                    onClick={() => setSelectedOrderId(null)}
                  >
                    <div
                      className="admin-order-drawer"
                      role="dialog"
                      aria-modal="true"
                      aria-label={`Order details for ${selectedOrder.id}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="admin-drawer-head">
                        <div>
                          <h3>Order {selectedOrder.id}</h3>
                          <p>
                            {selectedOrder.scheduledDate} &bull; {selectedOrder.slotLabel}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="admin-drawer-close"
                          aria-label="Close order details"
                          onClick={() => setSelectedOrderId(null)}
                        >
                          <FiX size={18} />
                        </button>
                      </div>

                      <div className="admin-drawer-body">
                        <div className="admin-drawer-grid">
                      {/* Status & Delivery Partner */}
                      <div className="admin-drawer-section">
                        <span className="admin-drawer-section-title">Order Status &amp; Delivery Partner</span>
                        <div className="admin-status-stack">
                          <span
                            className={`admin-order-pill ${
                              selectedOrder.status === 'delivered'
                                ? 'admin-pill-green'
                                : selectedOrder.status === 'cancelled' || selectedOrder.status === 'refunded' || selectedOrder.status === 'refund_initiated'
                                ? 'admin-pill-red'
                                : selectedOrder.status === 'packed' || selectedOrder.status === 'out_for_delivery'
                                ? 'admin-pill-purple'
                                : selectedOrder.status === 'confirmed' || selectedOrder.status === 'accepted' || selectedOrder.status === 'preparing'
                                ? 'admin-pill-blue'
                                : 'admin-pill-amber'
                            }`}
                          >
                            {selectedOrder.status.replace(/_/g, ' ')}
                          </span>
                          <OrderStatusPicker
                            order={selectedOrder}
                            ariaLabel={`Panel status for ${selectedOrder.id}`}
                            onChange={handleOrderStatusChange}
                          />
                        </div>

                        <div className="admin-partner-box" style={{ marginTop: 4 }}>
                          {selectedOrder.deliveryAssignment?.deliveryBoyName ? (
                            <div className="admin-partner-card">
                              <div>
                                <span className="admin-partner-name">{selectedOrder.deliveryAssignment.deliveryBoyName}</span>
                                <span className="admin-partner-meta">
                                  {selectedOrder.deliveryAssignment.deliveryBoyPhone} &bull;{' '}
                                  {selectedOrder.deliveryStatus?.replace(/_/g, ' ') || 'assigned'}
                                </span>
                              </div>
                              <FiTruck size={15} style={{ color: '#15803d', flexShrink: 0 }} />
                            </div>
                          ) : (
                            <div className="admin-partner-card admin-partner-card-empty">
                              <span>No delivery partner assigned</span>
                              <FiTruck size={14} style={{ flexShrink: 0 }} />
                            </div>
                          )}
                          <PartnerAssignPicker
                            order={selectedOrder}
                            partners={overview?.deliveryBoys}
                            ariaLabel={`Panel assign delivery boy for ${selectedOrder.id}`}
                            onAssign={handleAssignDeliveryBoy}
                          />
                        </div>
                      </div>

                      {/* Customer Information */}
                      <div className="admin-drawer-section">
                        <span className="admin-drawer-section-title">Customer Information</span>
                        <div className="admin-drawer-kv">
                          <span>Name</span>
                          <strong>{selectedOrder.customerName}</strong>
                        </div>
                        <div className="admin-drawer-kv">
                          <span>Phone</span>
                          <strong>{selectedOrder.customerPhone}</strong>
                        </div>
                        {selectedOrder.customerEmail && (
                          <div className="admin-drawer-kv">
                            <span>Email</span>
                            <strong>{selectedOrder.customerEmail}</strong>
                          </div>
                        )}
                        <div className="admin-drawer-kv">
                          <span>Address</span>
                          <strong>
                            {[
                              selectedOrder.address?.line1,
                              selectedOrder.address?.area,
                              selectedOrder.address?.city,
                              selectedOrder.address?.pincode,
                            ]
                              .filter(Boolean)
                              .join(', ')}
                          </strong>
                        </div>
                        {selectedOrder.address?.notes && (
                          <div className="admin-drawer-kv">
                            <span>Notes</span>
                            <strong>{selectedOrder.address.notes}</strong>
                          </div>
                        )}
                      </div>

                      {/* Products */}
                      <div className="admin-drawer-section">
                        <span className="admin-drawer-section-title">
                          Products ({selectedOrder.items?.length || 0})
                        </span>
                        <div>
                          {(selectedOrder.items || []).map((it, idx) => (
                            <div key={it.productId || idx} className="admin-drawer-item">
                              <div>
                                <strong>{it.name}</strong>
                                <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                                  {it.qty} &times; {money(it.unitPrice)}
                                </div>
                              </div>
                              <strong>{money(it.lineTotal ?? it.qty * it.unitPrice)}</strong>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Payment & Total Breakdown */}
                      <div className="admin-drawer-section">
                        <span className="admin-drawer-section-title">Payment &amp; Gateway Details</span>
                        <div className="admin-drawer-kv">
                          <span>Method</span>
                          <strong>
                            {selectedOrder.originalPaymentMethod === 'COD' &&
                            (selectedOrder.currentPaymentMethod === 'Online' || selectedOrder.paymentMethod === 'razorpay') &&
                            selectedOrder.paymentStatus === 'paid'
                              ? 'COD → Online Payment (Prepaid)'
                              : (selectedPayment?.method || selectedOrder.paymentMethod).toUpperCase()}
                          </strong>
                        </div>
                        <div className="admin-drawer-kv">
                          <span>Payment Status</span>
                          <strong style={{ textTransform: 'capitalize' }}>
                            {selectedPayment?.status || selectedOrder.paymentStatus}
                          </strong>
                        </div>
                        <div className="admin-drawer-kv">
                          <span>Transaction / Ref ID</span>
                          <strong className="admin-drawer-mono">
                            {selectedPayment?.id || '—'}
                          </strong>
                        </div>
                        {(selectedPayment?.razorpayOrderId || selectedOrder.razorpayOrderId) && (
                          <div className="admin-drawer-kv">
                            <span>Razorpay Order ID</span>
                            <strong className="admin-drawer-mono">
                              {selectedPayment?.razorpayOrderId || selectedOrder.razorpayOrderId}
                            </strong>
                          </div>
                        )}
                        {(selectedPayment?.razorpayPaymentId || selectedOrder.razorpayPaymentId) && (
                          <div className="admin-drawer-kv">
                            <span>Razorpay Payment ID</span>
                            <strong className="admin-drawer-mono">
                              {selectedPayment?.razorpayPaymentId || selectedOrder.razorpayPaymentId}
                            </strong>
                          </div>
                        )}
                        <div className="admin-drawer-kv">
                          <span>Payment Date</span>
                          <strong>
                            {(() => {
                              const dt = selectedPayment?.updatedAt || selectedPayment?.createdAt || selectedOrder.createdAt;
                              return dt ? new Date(dt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
                            })()}
                          </strong>
                        </div>
                        <div className="admin-drawer-kv">
                          <span>Amount ({selectedPayment?.currency || 'INR'})</span>
                          <strong>{money(selectedPayment?.amount ?? selectedOrder.pricing?.grandTotal ?? 0)}</strong>
                        </div>

                        {(selectedPayment?.refundId || selectedOrder.status === 'refunded' || selectedOrder.status === 'refund_initiated') && (
                          <div
                            style={{
                              marginTop: 6,
                              paddingTop: 8,
                              borderTop: '1px dashed #fca5a5',
                              display: 'grid',
                              gap: 6,
                            }}
                          >
                            <span className="admin-drawer-section-title" style={{ color: '#b91c1c' }}>
                              Refund Details
                            </span>
                            {selectedPayment?.refundId && (
                              <div className="admin-drawer-kv">
                                <span>Refund ID</span>
                                <strong className="admin-drawer-mono">{selectedPayment.refundId}</strong>
                              </div>
                            )}
                            {selectedPayment?.refundReason && (
                              <div className="admin-drawer-kv">
                                <span>Reason</span>
                                <strong>{selectedPayment.refundReason}</strong>
                              </div>
                            )}
                            {selectedPayment?.refundedAt && (
                              <div className="admin-drawer-kv">
                                <span>Refunded At</span>
                                <strong>
                                  {new Date(selectedPayment.refundedAt).toLocaleString('en-IN', {
                                    dateStyle: 'medium',
                                    timeStyle: 'short',
                                  })}
                                </strong>
                              </div>
                            )}
                          </div>
                        )}

                        <div
                          style={{
                            marginTop: 6,
                            paddingTop: 8,
                            borderTop: '1px solid #e2ebe5',
                            display: 'grid',
                            gap: 6,
                          }}
                        >
                          <span className="admin-drawer-section-title">Order Total Breakdown</span>
                          <div className="admin-drawer-kv">
                            <span>Subtotal</span>
                            <strong>{money(selectedOrder.pricing?.subtotal || 0)}</strong>
                          </div>
                          {Number(selectedOrder.pricing?.couponDiscount || 0) > 0 && (
                            <div className="admin-drawer-kv">
                              <span>Coupon ({selectedOrder.pricing?.couponCode})</span>
                              <strong>-{money(selectedOrder.pricing.couponDiscount)}</strong>
                            </div>
                          )}
                          {Number(selectedOrder.pricing?.rewardPointsUsed || 0) > 0 && (
                            <div className="admin-drawer-kv">
                              <span>Reward Points Used</span>
                              <strong>-{money(selectedOrder.pricing.rewardPointsUsed)}</strong>
                            </div>
                          )}
                          <div className="admin-drawer-kv">
                            <span>Delivery Charge</span>
                            <strong>{money(selectedOrder.pricing?.deliveryCharge || 0)}</strong>
                          </div>
                          {Number(selectedOrder.pricing?.taxAmount || 0) > 0 && (
                            <div className="admin-drawer-kv">
                              <span>Tax</span>
                              <strong>{money(selectedOrder.pricing.taxAmount)}</strong>
                            </div>
                          )}
                          <div
                            className="admin-drawer-kv"
                            style={{
                              borderTop: '1px solid #d5e5da',
                              paddingTop: 8,
                              marginTop: 2,
                              fontSize: '0.96rem',
                            }}
                          >
                            <strong style={{ textAlign: 'left' }}>Final Total</strong>
                            <strong>{money(selectedOrder.pricing?.grandTotal || 0)}</strong>
                          </div>
                        </div>
                      </div>

                      </div>

                        {/* Quick Actions */}
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="admin-mini-btn"
                            onClick={() => setKitchenSlipOrder(selectedOrder)}
                          >
                            <FiPrinter size={14} /> Print Kitchen Slip
                          </button>
                          {selectedOrder.paymentStatus === 'paid' && selectedOrder.status !== 'refunded' && (
                            <button
                              type="button"
                              className="admin-mini-btn admin-mini-danger"
                              onClick={() => handleRefundOrder(selectedOrder.id)}
                            >
                              Issue Refund
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            );
          })()}

          {activeTab === 'products' && (
            <section className="admin-panel">
              <div className="admin-panel-head">
                <h2>Catalog Inventory ({filteredProducts.length} items)</h2>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <input
                    id="admin-prod-search"
                    name="prodSearch"
                    type="search"
                    className="menu-input"
                    style={{ width: 240 }}
                    value={prodSearch}
                    onChange={(e) => setProdSearch(e.target.value)}
                    placeholder="Filter products..."
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setProdForm(emptyProductForm);
                      setProductModalOpen(true);
                    }}
                  >
                    <FiPlus size={15} /> New Product
                  </Button>
                </div>
              </div>

              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Category</th>
                      <th>Price</th>
                      <th>Stock</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts
                      .slice((productsPage - 1) * PAGE_SIZE, productsPage * PAGE_SIZE)
                      .map((p) => (
                      <tr key={p.id}>
                        <td>
                          <div className="admin-prod-cell">
                            {p.image ? (
                              <img src={p.image} alt={p.name} className="admin-prod-thumb" loading="lazy" />
                            ) : (
                              <span className="admin-prod-thumb" style={{ display: 'grid', placeItems: 'center' }}>
                                {p.emoji}
                              </span>
                            )}
                            <div>
                              <strong>{p.name}</strong>
                              <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                                {p.prepMins}m prep &bull; {p.veg ? 'Veg' : 'Non-Veg'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ textTransform: 'capitalize' }}>{p.category}</td>
                        <td>
                          <strong>{money(p.discountPrice || p.price)}</strong>
                          {p.discountPrice ? (
                            <del style={{ marginLeft: 6, color: 'var(--muted)', fontSize: '0.78rem' }}>
                              {money(p.price)}
                            </del>
                          ) : null}
                        </td>
                        <td>
                          <span
                            style={{
                              color: p.stock <= 0 ? 'var(--danger)' : 'var(--primary)',
                              fontWeight: 700,
                            }}
                          >
                            {p.stock}
                          </span>
                        </td>
                        <td>
                          <div className="admin-row-actions">
                            <button
                              type="button"
                              className="admin-mini-btn"
                              onClick={() => handleQuickStock(p, 5)}
                              title="Add 5 stock"
                            >
                              +5
                            </button>
                            <button
                              type="button"
                              className="admin-mini-btn"
                              onClick={() => openEditModal(p)}
                              aria-label={`Edit ${p.name}`}
                            >
                              <FiEdit2 size={13} /> Edit
                            </button>
                            <button
                              type="button"
                              className="admin-mini-btn admin-mini-danger"
                              onClick={() => handleDeleteProduct(p)}
                              aria-label={`Delete ${p.name}`}
                            >
                              <FiTrash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredProducts.length > PAGE_SIZE && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end', marginTop: 14 }}>
                  <button
                    type="button"
                    className="admin-mini-btn"
                    disabled={productsPage <= 1}
                    onClick={() => setProductsPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </button>
                  <span style={{ fontSize: '0.84rem', color: 'var(--muted)' }}>
                    Page {productsPage} of {Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE))}
                  </span>
                  <button
                    type="button"
                    className="admin-mini-btn"
                    disabled={productsPage >= Math.ceil(filteredProducts.length / PAGE_SIZE)}
                    onClick={() => setProductsPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
            </section>
          )}

          {activeTab === 'categories' && (
            <div style={{ display: 'grid', gap: 24 }}>
              <section className="admin-panel">
                <div className="admin-panel-head">
                  <h2>Active Categories ({categories.length})</h2>
                </div>
                <div className="admin-cat-grid">
                  {categories.map((c) => (
                    <div key={c.slug} className="admin-cat-item">
                      {c.image ? <img src={c.image} alt={c.name} loading="lazy" /> : <span>{c.emoji}</span>}
                      <div>
                        <strong>{c.name}</strong>
                        <div style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>{c.slug}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="admin-panel" style={{ maxWidth: 540 }}>
                <div className="admin-panel-head">
                  <h2>Create / Update Category</h2>
                </div>
                <form className="admin-form" onSubmit={handleAddCategory}>
                  <div className="admin-form-row">
                    <div className="admin-field">
                      <label htmlFor="cat-name">Category Name</label>
                      <input
                        id="cat-name"
                        name="catName"
                        type="text"
                        required
                        value={catForm.name}
                        onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                        placeholder="e.g. Millet Bowls"
                      />
                    </div>
                    <div className="admin-field">
                      <label htmlFor="cat-img">Image URL</label>
                      <input
                        id="cat-img"
                        name="catImage"
                        type="url"
                        value={catForm.image}
                        onChange={(e) => setCatForm({ ...catForm, image: e.target.value })}
                      />
                    </div>
                  </div>
                  <Button type="submit" size="sm">
                    Save Category
                  </Button>
                </form>
              </section>
            </div>
          )}

          {/* Phase 5: Coupons Manager & Analytics */}
          {activeTab === 'coupons' && (() => {
            const todayIso = new Date().toISOString().slice(0, 10);
            const redemptions = overview?.couponRedemptions || [];
            const redeemedRows = redemptions.filter((r) => r.status === 'redeemed');
            const activeCouponsCount = coupons.filter(
              (c) => c.active !== false && (!c.validUntil || todayIso <= c.validUntil)
            ).length;
            const expiredCouponsCount = coupons.filter(
              (c) => c.validUntil && todayIso > c.validUntil
            ).length;
            const publicCount = coupons.filter((c) => c.visibility !== 'private').length;
            const privateCount = coupons.filter((c) => c.visibility === 'private').length;
            const totalDiscountGiven = redeemedRows.reduce(
              (sum, r) => sum + Number(r.discountAmount || 0),
              0
            );

            return (
            <div className="admin-coupons-stack">
              <div className="admin-kpi-grid">
                <div className="admin-kpi-card">
                  <div>
                    <span>Total Coupons</span>
                    <strong>{coupons.length}</strong>
                  </div>
                  <div className="admin-kpi-icon"><FiTag size={18} /></div>
                </div>
                <div className="admin-kpi-card">
                  <div>
                    <span>Active / Expired</span>
                    <strong>{activeCouponsCount} / {expiredCouponsCount}</strong>
                  </div>
                  <div className="admin-kpi-icon admin-kpi-icon-blue"><FiCalendar size={18} /></div>
                </div>
                <div className="admin-kpi-card">
                  <div>
                    <span>Public / Private</span>
                    <strong>{publicCount} / {privateCount}</strong>
                  </div>
                  <div className="admin-kpi-icon admin-kpi-icon-orange"><FiShield size={18} /></div>
                </div>
                <div className="admin-kpi-card">
                  <div>
                    <span>Redemptions</span>
                    <strong>{redeemedRows.length}</strong>
                  </div>
                  <div className="admin-kpi-icon"><FiShoppingBag size={18} /></div>
                </div>
                <div className="admin-kpi-card">
                  <div>
                    <span>Discounts Given</span>
                    <strong>{money(totalDiscountGiven)}</strong>
                  </div>
                  <div className="admin-kpi-icon admin-kpi-icon-orange"><FiGift size={18} /></div>
                </div>
              </div>

            <div className="admin-coupons-stack">
              <section className="admin-panel">
                <div className="admin-panel-head">
                  <h2>Coupons &amp; Offers ({coupons.length})</h2>
                </div>
                <div className="admin-table-wrap admin-orders-table-wrap">
                  <table className="admin-table admin-orders-table">
                    <thead>
                      <tr>
                        <th>Code &amp; Visibility</th>
                        <th>Discount</th>
                        <th>Eligibility &amp; Validity</th>
                        <th>Usage &amp; Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coupons.map((c) => {
                        const isScheduled = Boolean(c.validFrom && todayIso < c.validFrom);
                        const isExpired = Boolean(c.validUntil && todayIso > c.validUntil);
                        const statusLabel = c.active === false
                          ? 'Inactive'
                          : isExpired
                          ? 'Expired'
                          : isScheduled
                          ? 'Scheduled'
                          : 'Active';
                        const usedFromRedemptions = redeemedRows.filter((r) => r.couponCode === c.code);
                        const usedOrdersFallback = allOrders.filter(
                          (o) =>
                            o.pricing?.couponCode === c.code &&
                            !['cancelled', 'refunded', 'refund_initiated', 'payment_pending'].includes(o.status)
                        );
                        const usedCount = Math.max(usedFromRedemptions.length, usedOrdersFallback.length);
                        const totalDiscounted = (usedFromRedemptions.length > 0 ? usedFromRedemptions : usedOrdersFallback).reduce(
                          (sum, row) => sum + Number(row.discountAmount ?? row.pricing?.couponDiscount ?? 0),
                          0
                        );
                        const gLimit = Number(c.globalUsageLimit || 0);
                        return (
                        <tr key={c.code}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <strong>{c.code}</strong>
                              <span
                                className={`admin-order-pill ${
                                  c.visibility === 'private' ? 'admin-pill-purple' : 'admin-pill-green'
                                }`}
                                style={{ fontSize: '0.64rem', padding: '2px 7px' }}
                              >
                                {c.visibility === 'private' ? 'Private' : 'Public'}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{c.title}</div>
                          </td>
                          <td>
                            {c.type === 'fixed_total'
                              ? `Pay Fixed ₹${c.value}`
                              : c.type === 'percent'
                              ? `${c.value}% (up to ₹${c.maxDiscount})`
                              : `Flat ₹${c.value}`}
                            <div style={{ fontSize: '0.73rem', color: 'var(--muted)' }}>
                              Min: {money(c.minOrder || 0)}
                            </div>
                          </td>
                          <td style={{ fontSize: '0.76rem' }}>
                            <div>{c.firstOrderOnly ? 'First order per new customer' : 'All eligible customers'}</div>
                            <div style={{ color: 'var(--muted)' }}>
                              {c.validFrom || c.validUntil
                                ? `${c.validFrom || 'Now'} → ${c.validUntil || 'No expiry'}`
                                : 'No expiry'}
                            </div>
                            <div style={{ color: 'var(--muted)' }}>
                              {Array.isArray(c.eligibleProductIds) && c.eligibleProductIds.length > 0
                                ? `${c.eligibleProductIds.length} product(s)`
                                : Array.isArray(c.eligibleCategories) && c.eligibleCategories.length > 0
                                ? `${c.eligibleCategories.length} category(s)`
                                : 'All items'}
                              {Array.isArray(c.allowedUserEmails) && c.allowedUserEmails.length > 0
                                ? ` • ${c.allowedUserEmails.length} customer(s)`
                                : ''}
                            </div>
                          </td>
                          <td>
                            <span
                              className={`admin-order-pill ${
                                statusLabel === 'Active'
                                  ? 'admin-pill-green'
                                  : statusLabel === 'Scheduled'
                                  ? 'admin-pill-blue'
                                  : 'admin-pill-red'
                              }`}
                              style={{ fontSize: '0.64rem', padding: '2px 7px' }}
                            >
                              {statusLabel}
                            </span>
                            <div style={{ fontSize: '0.74rem', color: 'var(--muted)', marginTop: 4 }}>
                              Used: <strong>{usedCount}</strong>
                              {gLimit > 0 ? ` / ${gLimit} (${Math.max(0, gLimit - usedCount)} left)` : ' / ∞'} &bull;{' '}
                              {money(totalDiscounted)}
                            </div>
                          </td>
                          <td>
                            <div className="admin-row-actions">
                              <button
                                type="button"
                                className="admin-mini-btn"
                                onClick={() =>
                                  setCouponForm({
                                    code: c.code,
                                    title: c.title || '',
                                    type: c.type || 'percent',
                                    value: c.value || 10,
                                    minOrder: c.minOrder || 0,
                                    maxDiscount: c.maxDiscount || 100,
                                    visibility: c.visibility === 'private' ? 'private' : 'public',
                                    validFrom: c.validFrom || '',
                                    validUntil: c.validUntil || '',
                                    eligibleProductIds: Array.isArray(c.eligibleProductIds) ? c.eligibleProductIds : [],
                                    eligibleCategories: Array.isArray(c.eligibleCategories) ? c.eligibleCategories : [],
                                    allowedUserEmails: Array.isArray(c.allowedUserEmails) ? c.allowedUserEmails.join(', ') : '',
                                    perUserLimit: Number(c.perUserLimit || 0),
                                    globalUsageLimit: Number(c.globalUsageLimit || 0),
                                    restoreOnCancel: c.restoreOnCancel !== false,
                                    firstOrderOnly: Boolean(c.firstOrderOnly),
                                    active: c.active !== false,
                                  })
                                }
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="admin-mini-btn"
                                onClick={() => handleToggleCouponActive(c)}
                              >
                                {c.active === false ? 'Activate' : 'Deactivate'}
                              </button>
                              <button
                                type="button"
                                className="admin-mini-btn admin-mini-danger"
                                onClick={() => handleDeleteCoupon(c.code)}
                              >
                                <FiTrash2 size={13} /> Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <div className="admin-coupons-bottom-grid">
              <section className="admin-panel">
                <div className="admin-panel-head">
                  <h2>Create / Update Coupon</h2>
                  {couponForm.code && (
                    <button
                      type="button"
                      className="admin-mini-btn"
                      onClick={() =>
                        setCouponForm({
                          code: '',
                          title: '',
                          type: 'percent',
                          value: 15,
                          minOrder: 100,
                          maxDiscount: 60,
                          visibility: 'public',
                          validFrom: '',
                          validUntil: '',
                          eligibleProductIds: [],
                          eligibleCategories: [],
                          allowedUserEmails: '',
                          perUserLimit: 0,
                          globalUsageLimit: 0,
                          restoreOnCancel: true,
                          firstOrderOnly: false,
                          active: true,
                        })
                      }
                    >
                      Reset Form
                    </button>
                  )}
                </div>
                <form className="admin-form" onSubmit={handleSaveCoupon}>
                  <div className="admin-coupon-form-grid">
                    <div className="admin-field">
                      <label htmlFor="cp-code">Coupon Code</label>
                      <input
                        id="cp-code"
                        type="text"
                        required
                        value={couponForm.code}
                        onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })}
                        placeholder="e.g. FESTIVE25"
                      />
                    </div>
                    <div className="admin-field">
                      <label htmlFor="cp-type">Discount Type</label>
                      <select
                        id="cp-type"
                        value={couponForm.type}
                        onChange={(e) => setCouponForm({ ...couponForm, type: e.target.value })}
                      >
                        <option value="percent">Percentage (%)</option>
                        <option value="flat">Flat Amount (₹)</option>
                        <option value="fixed_total">Pay Fixed Total (₹)</option>
                      </select>
                    </div>
                    <div className="admin-field">
                      <label htmlFor="cp-vis">Visibility</label>
                      <select
                        id="cp-vis"
                        value={couponForm.visibility}
                        onChange={(e) => setCouponForm({ ...couponForm, visibility: e.target.value })}
                      >
                        <option value="public">Public (Visible to customers)</option>
                        <option value="private">Private (Hidden code only)</option>
                      </select>
                    </div>

                    <div className="admin-field admin-coupon-span-2">
                      <label htmlFor="cp-title">Offer Description</label>
                      <input
                        id="cp-title"
                        type="text"
                        required
                        value={couponForm.title}
                        onChange={(e) => setCouponForm({ ...couponForm, title: e.target.value })}
                        placeholder="e.g. 25% OFF on orders above ₹150"
                      />
                    </div>
                    <div className="admin-field">
                      <label htmlFor="cp-val">
                        {couponForm.type === 'fixed_total' ? 'Final Payable Amount (₹)' : 'Discount Value'}
                      </label>
                      <input
                        id="cp-val"
                        type="number"
                        min="1"
                        required
                        value={couponForm.value}
                        onChange={(e) => setCouponForm({ ...couponForm, value: Number(e.target.value) })}
                      />
                    </div>

                    <div className="admin-field">
                      <label htmlFor="cp-max">Max Discount (₹)</label>
                      <input
                        id="cp-max"
                        type="number"
                        min="1"
                        value={couponForm.maxDiscount}
                        onChange={(e) => setCouponForm({ ...couponForm, maxDiscount: Number(e.target.value) })}
                      />
                    </div>
                    <div className="admin-field">
                      <label htmlFor="cp-min">Min Order (₹)</label>
                      <input
                        id="cp-min"
                        type="number"
                        min="0"
                        value={couponForm.minOrder}
                        onChange={(e) => setCouponForm({ ...couponForm, minOrder: Number(e.target.value) })}
                      />
                    </div>
                    <div className="admin-field">
                      <label htmlFor="cp-per-user">Per-Customer Limit (0 = unlimited)</label>
                      <input
                        id="cp-per-user"
                        type="number"
                        min="0"
                        value={couponForm.perUserLimit}
                        onChange={(e) => setCouponForm({ ...couponForm, perUserLimit: Number(e.target.value) })}
                      />
                    </div>

                    <div className="admin-field">
                      <label htmlFor="cp-global-limit">Global Usage Limit (0 = unlimited)</label>
                      <input
                        id="cp-global-limit"
                        type="number"
                        min="0"
                        value={couponForm.globalUsageLimit}
                        onChange={(e) => setCouponForm({ ...couponForm, globalUsageLimit: Number(e.target.value) })}
                      />
                    </div>
                    <div className="admin-field">
                      <label htmlFor="cp-from">Valid From (optional)</label>
                      <input
                        id="cp-from"
                        type="date"
                        value={couponForm.validFrom}
                        onChange={(e) => setCouponForm({ ...couponForm, validFrom: e.target.value })}
                      />
                    </div>
                    <div className="admin-field">
                      <label htmlFor="cp-until">Valid Until (optional)</label>
                      <input
                        id="cp-until"
                        type="date"
                        value={couponForm.validUntil}
                        onChange={(e) => setCouponForm({ ...couponForm, validUntil: e.target.value })}
                      />
                    </div>

                    <div className="admin-field admin-coupon-span-full">
                      <label htmlFor="cp-emails">Customer-Specific Emails (comma-separated, optional)</label>
                      <input
                        id="cp-emails"
                        type="text"
                        value={couponForm.allowedUserEmails}
                        onChange={(e) => setCouponForm({ ...couponForm, allowedUserEmails: e.target.value })}
                        placeholder="e.g. vip1@gmail.com, vip2@gmail.com (leave empty for all customers)"
                      />
                    </div>

                    <div className="admin-field admin-coupon-span-full">
                      <label>Eligible Categories (optional — leave unselected for all)</label>
                      <div className="admin-chip-picker">
                        {categories.map((cat) => {
                          const selected = couponForm.eligibleCategories.includes(cat.id);
                          return (
                            <button
                              key={cat.id}
                              type="button"
                              className={`admin-chip-opt ${selected ? 'admin-chip-opt-active' : ''}`.trim()}
                              onClick={() =>
                                setCouponForm({
                                  ...couponForm,
                                  eligibleCategories: selected
                                    ? couponForm.eligibleCategories.filter((x) => x !== cat.id)
                                    : [...couponForm.eligibleCategories, cat.id],
                                })
                              }
                            >
                              {cat.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="admin-field admin-coupon-span-full">
                      <label>Eligible Products (optional — leave unselected for all)</label>
                      <div className="admin-chip-picker">
                        {products.map((p) => {
                          const selected = couponForm.eligibleProductIds.includes(p.id);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              className={`admin-chip-opt ${selected ? 'admin-chip-opt-active' : ''}`.trim()}
                              onClick={() =>
                                setCouponForm({
                                  ...couponForm,
                                  eligibleProductIds: selected
                                    ? couponForm.eligibleProductIds.filter((x) => x !== p.id)
                                    : [...couponForm.eligibleProductIds, p.id],
                                })
                              }
                            >
                              {p.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="admin-checks" style={{ paddingTop: 4 }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={couponForm.firstOrderOnly}
                        onChange={(e) => setCouponForm({ ...couponForm, firstOrderOnly: e.target.checked })}
                      />
                      First Order Only (New Customers)
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={couponForm.restoreOnCancel}
                        onChange={(e) => setCouponForm({ ...couponForm, restoreOnCancel: e.target.checked })}
                      />
                      Restore on Cancel/Refund
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={couponForm.active}
                        onChange={(e) => setCouponForm({ ...couponForm, active: e.target.checked })}
                      />
                      Active
                    </label>
                  </div>
                  <div>
                    <Button type="submit" size="sm">
                      Save Coupon
                    </Button>
                  </div>
                </form>
              </section>

              <section className="admin-panel">
                <div className="admin-panel-head">
                  <h2>Coupon Redemption History ({redemptions.length})</h2>
                </div>
                {redemptions.length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>
                    No coupon redemptions recorded yet.
                  </p>
                ) : (
                  <div className="admin-table-wrap admin-orders-table-wrap">
                    <table className="admin-table admin-orders-table">
                      <thead>
                        <tr>
                          <th>Coupon</th>
                          <th>Customer</th>
                          <th>Order ID</th>
                          <th>Discount</th>
                          <th>Status</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {redemptions.slice(0, 25).map((r) => (
                          <tr key={r.id}>
                            <td><strong>{r.couponCode}</strong></td>
                            <td>{r.customerEmail || r.customerId}</td>
                            <td><strong>{r.orderId}</strong></td>
                            <td>{money(r.discountAmount)}</td>
                            <td>
                              <span
                                className={`admin-order-pill ${
                                  r.status === 'redeemed'
                                    ? 'admin-pill-green'
                                    : r.status === 'pending'
                                    ? 'admin-pill-amber'
                                    : 'admin-pill-red'
                                }`}
                                style={{ fontSize: '0.64rem', padding: '2px 7px' }}
                              >
                                {r.status}
                              </span>
                            </td>
                            <td style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                              {r.redeemedAt ? new Date(r.redeemedAt).toLocaleString('en-IN') : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
              </div>
            </div>
            </div>
            );
          })()}

          {/* Phase 5: Reports & CSV Export */}
          {activeTab === 'reports' && (
            <div style={{ display: 'grid', gap: 24 }}>
              <section className="admin-panel">
                <div className="admin-panel-head">
                  <h2>Export Data to CSV (Excel Compatible)</h2>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  <Button type="button" size="sm" onClick={() => handleDownloadCsv('orders')}>
                    <FiDownload size={15} /> Export Orders CSV
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => handleDownloadCsv('inventory')}>
                    <FiDownload size={15} /> Export Inventory CSV
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => handleDownloadCsv('customers')}>
                    <FiDownload size={15} /> Export Customers CSV
                  </Button>
                </div>
              </section>

              <div className="account-grid">
                <section className="admin-panel">
                  <h2>Payment Method Breakdown</h2>
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Method</th>
                          <th>Orders</th>
                          <th>Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td><strong>Cash on Delivery</strong></td>
                          <td>{reports?.paymentBreakdown?.cod?.count || 0}</td>
                          <td>{money(reports?.paymentBreakdown?.cod?.amount || 0)}</td>
                        </tr>
                        <tr>
                          <td><strong>Razorpay Online</strong></td>
                          <td>{reports?.paymentBreakdown?.razorpay?.count || 0}</td>
                          <td>{money(reports?.paymentBreakdown?.razorpay?.amount || 0)}</td>
                        </tr>
                        <tr>
                          <td><strong>Subscriptions</strong></td>
                          <td>{reports?.summary?.subscriptionCount || 0}</td>
                          <td>{money(reports?.summary?.subscriptionRevenue || 0)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="admin-panel">
                  <h2>Top Selling Items</h2>
                  {reports?.topProducts?.length > 0 ? (
                    <div className="admin-table-wrap">
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>Product</th>
                            <th>Qty Sold</th>
                            <th>Revenue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reports.topProducts.map((tp) => (
                            <tr key={tp.name}>
                              <td><strong>{tp.name}</strong></td>
                              <td>{tp.qty}</td>
                              <td>{money(tp.revenue)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p style={{ color: 'var(--muted)' }}>No completed sales recorded yet.</p>
                  )}
                </section>
              </div>
            </div>
          )}

          {activeTab === 'customers' && (
            <section className="admin-panel">
              <div className="admin-panel-head">
                <h2>Registered Customers ({overview?.customers?.length || 0})</h2>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Customer Name</th>
                      <th>Email</th>
                      <th>Referral Code</th>
                      <th>Reward Points</th>
                      <th>Account Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(overview?.customers || []).map((c) => (
                      <tr key={c.id}>
                        <td>
                          <strong>{c.fullName || c.name}</strong>
                        </td>
                        <td>{c.email}</td>
                        <td>
                          <span className="account-code">{c.referralCode}</span>
                        </td>
                        <td>{c.rewardPoints || 0} pts</td>
                        <td>
                          <button
                            type="button"
                            className={`admin-mini-btn ${c.blocked ? 'admin-mini-danger' : ''}`.trim()}
                            onClick={() => handleToggleBlockUser(c)}
                          >
                            {c.blocked ? 'Blocked (Unblock)' : 'Active (Block)'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>


            </section>
          )}

          {/* Phase 5: Business Settings & Delivery Slots */}
          {activeTab === 'settings' && settingsForm && (
            <div className="admin-coupons-stack">
              <section className="admin-panel">
                <h2>Store &amp; Brand Settings</h2>
                <form className="admin-form" onSubmit={handleSaveSettings}>
                  <div className="admin-form-row">
                    <div className="admin-field">
                      <label htmlFor="st-name">Brand Name</label>
                      <input
                        id="st-name"
                        type="text"
                        value={settingsForm.name || ''}
                        onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })}
                      />
                    </div>
                    <div className="admin-field">
                      <label htmlFor="st-city">City</label>
                      <input
                        id="st-city"
                        type="text"
                        value={settingsForm.city || ''}
                        onChange={(e) => setSettingsForm({ ...settingsForm, city: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="admin-field">
                    <label htmlFor="st-hours">Kitchen Hours</label>
                    <input
                      id="st-hours"
                      type="text"
                      value={settingsForm.hours || ''}
                      onChange={(e) => setSettingsForm({ ...settingsForm, hours: e.target.value })}
                    />
                  </div>
                  <div className="admin-form-row">
                    <div className="admin-field">
                      <label htmlFor="st-del">Delivery Charge (₹)</label>
                      <input
                        id="st-del"
                        type="number"
                        min="0"
                        value={settingsForm.deliveryCharge ?? 25}
                        onChange={(e) =>
                          setSettingsForm({ ...settingsForm, deliveryCharge: Number(e.target.value) })
                        }
                      />
                    </div>
                    <div className="admin-field">
                      <label htmlFor="st-free">Free Delivery Above (₹)</label>
                      <input
                        id="st-free"
                        type="number"
                        min="0"
                        value={settingsForm.freeDeliveryAbove ?? 199}
                        onChange={(e) =>
                          setSettingsForm({ ...settingsForm, freeDeliveryAbove: Number(e.target.value) })
                        }
                      />
                    </div>
                  </div>
                  <div className="admin-form-row">
                    <div className="admin-field">
                      <label htmlFor="st-tax">GST / Tax (%)</label>
                      <input
                        id="st-tax"
                        type="number"
                        min="0"
                        value={settingsForm.taxPercent ?? 5}
                        onChange={(e) =>
                          setSettingsForm({ ...settingsForm, taxPercent: Number(e.target.value) })
                        }
                      />
                    </div>
                    <div className="admin-field">
                      <label htmlFor="st-cutoff">Next-Day Cut-off Hour (0–23)</label>
                      <input
                        id="st-cutoff"
                        type="number"
                        min="0"
                        max="23"
                        value={settingsForm.cutoffHour ?? 21}
                        onChange={(e) =>
                          setSettingsForm({ ...settingsForm, cutoffHour: Number(e.target.value) })
                        }
                      />
                    </div>
                  </div>
                  <div className="admin-form-row">
                    <div className="admin-field">
                      <label htmlFor="st-maxpre">Max Pre-Order Days Ahead</label>
                      <input
                        id="st-maxpre"
                        type="number"
                        min="1"
                        max="30"
                        value={settingsForm.maxPreOrderDays ?? 7}
                        onChange={(e) =>
                          setSettingsForm({ ...settingsForm, maxPreOrderDays: Number(e.target.value) })
                        }
                      />
                    </div>
                    <div className="admin-field">
                      <label htmlFor="st-pausecut">Subscription Pause Cut-Off Hour</label>
                      <input
                        id="st-pausecut"
                        type="number"
                        min="0"
                        max="23"
                        value={settingsForm.subscriptionPauseCutoffHour ?? 22}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            subscriptionPauseCutoffHour: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="admin-field">
                      <label htmlFor="st-refpts">Referral Reward Points</label>
                      <input
                        id="st-refpts"
                        type="number"
                        min="10"
                        max="500"
                        value={settingsForm.referralRewardPoints ?? 50}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            referralRewardPoints: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="admin-checks">
                    <label>
                      <input
                        type="checkbox"
                        checked={settingsForm.storeOpen !== false}
                        onChange={(e) =>
                          setSettingsForm({ ...settingsForm, storeOpen: e.target.checked })
                        }
                      />{' '}
                      Store Open
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={settingsForm.codEnabled !== false}
                        onChange={(e) =>
                          setSettingsForm({ ...settingsForm, codEnabled: e.target.checked })
                        }
                      />{' '}
                      Cash on Delivery Enabled
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={settingsForm.aiEnabled !== false}
                        onChange={(e) =>
                          setSettingsForm({ ...settingsForm, aiEnabled: e.target.checked })
                        }
                      />{' '}
                      Voice Assistant Enabled
                    </label>
                  </div>
                  <div className="admin-field">
                    <label htmlFor="st-ainame">Assistant Display Name</label>
                    <input
                      id="st-ainame"
                      type="text"
                      value={settingsForm.aiName || 'HRUVITA Assistant'}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, aiName: e.target.value })
                      }
                    />
                  </div>
                  <div className="admin-field">
                    <label htmlFor="st-aiinst">Custom Assistant Instructions</label>
                    <input
                      id="st-aiinst"
                      type="text"
                      value={settingsForm.aiInstructions || ''}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, aiInstructions: e.target.value })
                      }
                      placeholder="e.g. Mention morning breakfast plans politely"
                    />
                  </div>
                  <Button type="submit" size="sm">
                    Save Store Settings
                  </Button>
                </form>

                {conversations.length > 0 && (
                  <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
                    <h3 style={{ fontSize: '1.05rem', marginBottom: 10 }}>
                      Recent Voice Assistant Conversations ({conversations.length})
                    </h3>
                    <div className="admin-table-wrap">
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>User</th>
                            <th>Lang</th>
                            <th>Messages</th>
                            <th>Cart Adds</th>
                          </tr>
                        </thead>
                        <tbody>
                          {conversations.slice(0, 8).map((c) => (
                            <tr key={c.id}>
                              <td>{c.userName}</td>
                              <td>{c.language}</td>
                              <td>{c.messages?.length || 0}</td>
                              <td>{c.cartActionsCount || 0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </section>

              <section className="admin-panel">
                <h2>Delivery Slots &amp; Capacity</h2>
                <div style={{ display: 'grid', gap: 14 }}>
                  {slots.map((sl, idx) => (
                    <div key={sl.id} className="addr-card" style={{ padding: 14 }}>
                      <div className="admin-form-row">
                        <div className="admin-field">
                          <label>Slot Name</label>
                          <input
                            type="text"
                            value={sl.name}
                            onChange={(e) =>
                              setSlots((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x))
                              )
                            }
                          />
                        </div>
                        <div className="admin-field">
                          <label>Time Window</label>
                          <input
                            type="text"
                            value={sl.window}
                            onChange={(e) =>
                              setSlots((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, window: e.target.value } : x))
                              )
                            }
                          />
                        </div>
                      </div>
                      <div className="admin-form-row" style={{ alignItems: 'end' }}>
                        <div className="admin-field">
                          <label>Max Orders</label>
                          <input
                            type="number"
                            min="1"
                            value={sl.maxOrders}
                            onChange={(e) =>
                              setSlots((prev) =>
                                prev.map((x, i) =>
                                  i === idx ? { ...x, maxOrders: Number(e.target.value) } : x
                                )
                              )
                            }
                          />
                        </div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <label style={{ fontSize: '0.84rem' }}>
                            <input
                              type="checkbox"
                              checked={sl.active !== false}
                              onChange={(e) =>
                                setSlots((prev) =>
                                  prev.map((x, i) =>
                                    i === idx ? { ...x, active: e.target.checked } : x
                                  )
                                )
                              }
                            />{' '}
                            Active
                          </label>
                          <Button type="button" size="sm" onClick={() => handleUpdateSlot(sl)}>
                            Save
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activeTab === 'inventory' && (
            <div style={{ display: 'grid', gap: 20 }}>
              <div className="admin-grid-2">
                <section className="admin-panel">
                  <h2>Bowl Ingredients &amp; Stock</h2>
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Ingredient</th>
                          <th>Group</th>
                          <th>Extra</th>
                          <th>Stock</th>
                          <th>Adjust</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(inventoryData.ingredients || []).map((ing) => (
                          <tr key={ing.id}>
                            <td>
                              <strong>{ing.name}</strong>
                            </td>
                            <td>{ing.category}</td>
                            <td>{ing.price > 0 ? `+${money(ing.price)}` : 'Included'}</td>
                            <td style={{ color: ing.stock <= (ing.lowStockThreshold || 8) ? 'var(--danger)' : 'inherit', fontWeight: 700 }}>
                              {ing.stock} {ing.unit}
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  type="button"
                                  className="admin-mini-btn"
                                  onClick={() => handleAdjustIngredientStock(ing.id, 10)}
                                >
                                  +10
                                </button>
                                <button
                                  type="button"
                                  className="admin-mini-btn"
                                  onClick={() => handleAdjustIngredientStock(ing.id, -5)}
                                >
                                  -5
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="admin-panel">
                  <h2>Add / Edit Bowl Ingredient</h2>
                  <form className="admin-form" onSubmit={handleSaveIngredient}>
                    <div className="admin-field">
                      <label>Ingredient Name</label>
                      <input
                        type="text"
                        required
                        value={ingredientForm.name}
                        onChange={(e) => setIngredientForm({ ...ingredientForm, name: e.target.value })}
                        placeholder="e.g. Organic Blueberries"
                      />
                    </div>
                    <div className="admin-form-row">
                      <div className="admin-field">
                        <label>Category</label>
                        <select
                          value={ingredientForm.category}
                          onChange={(e) => setIngredientForm({ ...ingredientForm, category: e.target.value })}
                        >
                          <option value="fruits">Fruits</option>
                          <option value="toppings">Toppings (Nuts &amp; Seeds)</option>
                          <option value="extras">Extras (Honey / Yogurt)</option>
                        </select>
                      </div>
                      <div className="admin-field">
                        <label>Extra Charge (₹)</label>
                        <input
                          type="number"
                          min="0"
                          value={ingredientForm.price}
                          onChange={(e) => setIngredientForm({ ...ingredientForm, price: Number(e.target.value) })}
                        />
                      </div>
                    </div>
                    <div className="admin-form-row">
                      <div className="admin-field">
                        <label>Initial Stock</label>
                        <input
                          type="number"
                          min="0"
                          value={ingredientForm.stock}
                          onChange={(e) => setIngredientForm({ ...ingredientForm, stock: Number(e.target.value) })}
                        />
                      </div>
                      <div className="admin-field">
                        <label>Qty Per Bowl</label>
                        <input
                          type="number"
                          min="1"
                          value={ingredientForm.qtyPerBowl}
                          onChange={(e) =>
                            setIngredientForm({ ...ingredientForm, qtyPerBowl: Number(e.target.value) })
                          }
                        />
                      </div>
                    </div>
                    <Button type="submit" size="sm">
                      Save Ingredient
                    </Button>
                  </form>

                  <h3 style={{ marginTop: 22, marginBottom: 10 }}>Product Quick Restock</h3>
                  <div className="admin-table-wrap" style={{ maxHeight: 240, overflowY: 'auto' }}>
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Stock</th>
                          <th>Adjust</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(inventoryData.products || products).map((p) => (
                          <tr key={p.id}>
                            <td>{p.name}</td>
                            <td style={{ color: p.stock <= 5 ? 'var(--danger)' : 'inherit', fontWeight: 700 }}>
                              {p.stock}
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  type="button"
                                  className="admin-mini-btn"
                                  onClick={() => handleAdjustProductStock(p.id, 10, 'Restock +10')}
                                >
                                  +10
                                </button>
                                <button
                                  type="button"
                                  className="admin-mini-btn"
                                  onClick={() => handleAdjustProductStock(p.id, -1, 'Manual -1')}
                                >
                                  -1
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>

              <section className="admin-panel">
                <h2>Inventory History Log ({inventoryData.logs?.length || 0})</h2>
                <div className="admin-table-wrap admin-orders-table-wrap">
                  <table className="admin-table admin-orders-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Item</th>
                        <th>Change</th>
                        <th>After</th>
                        <th>Reason</th>
                        <th>Order / Actor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(inventoryData.logs || []).length === 0 ? (
                        <tr>
                          <td colSpan="6" style={{ color: 'var(--muted)' }}>
                            No stock movements logged yet. Adjust stock or place an order to see live logs.
                          </td>
                        </tr>
                      ) : (
                        (inventoryData.logs || []).map((l) => (
                          <tr key={l.id}>
                            <td>{l.itemType}</td>
                            <td><strong>{l.itemName}</strong></td>
                            <td style={{ color: l.change > 0 ? 'var(--primary)' : 'var(--danger)', fontWeight: 700 }}>
                              {l.change > 0 ? `+${l.change}` : l.change}
                            </td>
                            <td>{l.stockAfter}</td>
                            <td>{l.reason}</td>
                            <td style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                              {l.orderId || l.actor}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'combos' && (
            <div className="admin-grid-2">
              <section className="admin-panel">
                <h2>Dynamic Combos ({combos.length})</h2>
                <div className="admin-table-wrap admin-orders-table-wrap">
                  <table className="admin-table admin-orders-table">
                    <thead>
                      <tr>
                        <th>Combo</th>
                        <th>Price</th>
                        <th>Schedule</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {combos.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <strong>{c.name}</strong>
                            <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                              {(c.componentDetails || []).map((d) => `${d.qty}× ${d.name}`).join(' + ')}
                            </div>
                          </td>
                          <td>
                            <strong>{money(c.price)}</strong>{' '}
                            {c.originalPrice > c.price && <del>{money(c.originalPrice)}</del>}
                          </td>
                          <td>
                            {c.scheduleStart} – {c.scheduleEnd}
                          </td>
                          <td>{c.availableNow ? 'Live' : c.active ? 'Scheduled/OOS' : 'Off'}</td>
                          <td>
                            <button
                              type="button"
                              className="admin-mini-btn admin-mini-danger"
                              onClick={() => handleDeleteCombo(c.id)}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="admin-panel">
                <h2>Create / Update Combo</h2>
                <form className="admin-form" onSubmit={handleSaveCombo}>
                  <div className="admin-field">
                    <label>Combo Name</label>
                    <input
                      type="text"
                      required
                      value={comboForm.name}
                      onChange={(e) => setComboForm({ ...comboForm, name: e.target.value })}
                      placeholder="e.g. Breakfast Booster: Idli + Orange Juice"
                    />
                  </div>
                  <div className="admin-field">
                    <label>Description</label>
                    <input
                      type="text"
                      value={comboForm.description}
                      onChange={(e) => setComboForm({ ...comboForm, description: e.target.value })}
                    />
                  </div>
                  <div className="admin-form-row">
                    <div className="admin-field">
                      <label>Component Item 1</label>
                      <select
                        value={comboForm.item1Id}
                        onChange={(e) => setComboForm({ ...comboForm, item1Id: e.target.value })}
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({money(p.discountPrice || p.price)})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="admin-field">
                      <label>Component Item 2</label>
                      <select
                        value={comboForm.item2Id}
                        onChange={(e) => setComboForm({ ...comboForm, item2Id: e.target.value })}
                      >
                        <option value="">None</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({money(p.discountPrice || p.price)})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="admin-form-row">
                    <div className="admin-field">
                      <label>Combo Price (₹)</label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={comboForm.price}
                        onChange={(e) => setComboForm({ ...comboForm, price: e.target.value })}
                      />
                    </div>
                    <div className="admin-field">
                      <label>Original Price (₹)</label>
                      <input
                        type="number"
                        min="1"
                        value={comboForm.originalPrice}
                        onChange={(e) => setComboForm({ ...comboForm, originalPrice: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="admin-form-row">
                    <div className="admin-field">
                      <label>Schedule Start (HH:MM)</label>
                      <input
                        type="time"
                        value={comboForm.scheduleStart}
                        onChange={(e) => setComboForm({ ...comboForm, scheduleStart: e.target.value })}
                      />
                    </div>
                    <div className="admin-field">
                      <label>Schedule End (HH:MM)</label>
                      <input
                        type="time"
                        value={comboForm.scheduleEnd}
                        onChange={(e) => setComboForm({ ...comboForm, scheduleEnd: e.target.value })}
                      />
                    </div>
                  </div>
                  <Button type="submit" size="sm">
                    Save Combo
                  </Button>
                </form>
              </section>
            </div>
          )}

          {activeTab === 'plans' && (
            <div className="admin-grid-2">
              <section className="admin-panel">
                <h2>Subscription Plans ({adminPlans.length})</h2>
                <div className="admin-table-wrap admin-orders-table-wrap">
                  <table className="admin-table admin-orders-table">
                    <thead>
                      <tr>
                        <th>Plan</th>
                        <th>Days</th>
                        <th>Price</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminPlans.map((pl) => (
                        <tr key={pl.id}>
                          <td>
                            <strong>{pl.name}</strong>
                            {pl.badge && <div style={{ fontSize: '0.76rem', color: 'var(--primary)' }}>{pl.badge}</div>}
                          </td>
                          <td>{pl.days} days</td>
                          <td><strong>{money(pl.price)}</strong></td>
                          <td>
                            <button
                              type="button"
                              className="admin-mini-btn admin-mini-danger"
                              onClick={() => handleDeletePlan(pl.id)}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="admin-panel">
                <h2>Add / Edit Subscription Plan</h2>
                <form className="admin-form" onSubmit={handleSavePlan}>
                  <div className="admin-field">
                    <label>Plan Name</label>
                    <input
                      type="text"
                      required
                      value={planForm.name}
                      onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                      placeholder="e.g. 15-Day Wellness Morning"
                    />
                  </div>
                  <div className="admin-form-row">
                    <div className="admin-field">
                      <label>Duration (Days)</label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={planForm.days}
                        onChange={(e) => setPlanForm({ ...planForm, days: Number(e.target.value) })}
                      />
                    </div>
                    <div className="admin-field">
                      <label>Total Price (₹)</label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={planForm.price}
                        onChange={(e) => setPlanForm({ ...planForm, price: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div className="admin-field">
                    <label>Badge (Optional)</label>
                    <input
                      type="text"
                      value={planForm.badge}
                      onChange={(e) => setPlanForm({ ...planForm, badge: e.target.value })}
                      placeholder="e.g. Most Popular"
                    />
                  </div>
                  <Button type="submit" size="sm">
                    Save Subscription Plan
                  </Button>
                </form>
              </section>
            </div>
          )}

          {activeTab === 'reviews' && (
            <section className="admin-panel">
              <h2>Customer Reviews Moderation ({adminReviews.length})</h2>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Rating</th>
                      <th>Comment</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminReviews.length === 0 ? (
                      <tr>
                        <td colSpan="5" style={{ color: 'var(--muted)' }}>
                          No customer reviews submitted yet.
                        </td>
                      </tr>
                    ) : (
                      adminReviews.map((rev) => (
                        <tr key={rev.id}>
                          <td><strong>{rev.userName}</strong></td>
                          <td>{'★'.repeat(rev.rating)}</td>
                          <td>{rev.comment}</td>
                          <td>{rev.visible !== false ? 'Visible' : 'Hidden'}</td>
                          <td>
                            <button
                              type="button"
                              className="admin-mini-btn"
                              onClick={() => handleModerateReview(rev)}
                            >
                              {rev.visible !== false ? 'Hide Review' : 'Show Review'}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>


            </section>
          )}

          {activeTab === 'referrals' && (
            <section className="admin-panel">
              <h2>Referral Program &amp; Fraud Review ({adminReferrals.length})</h2>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Referrer</th>
                      <th>Referred Friend</th>
                      <th>Code</th>
                      <th>Reward</th>
                      <th>Status / Fraud Flags</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminReferrals.length === 0 ? (
                      <tr>
                        <td colSpan="6" style={{ color: 'var(--muted)' }}>
                          No referrals recorded yet. Share a customer&apos;s referral link to test!
                        </td>
                      </tr>
                    ) : (
                      adminReferrals.map((r) => (
                        <tr key={r.id}>
                          <td>{r.referrerEmail}</td>
                          <td>{r.referredEmail}</td>
                          <td><strong>{r.referralCode}</strong></td>
                          <td>{r.rewardAmount} pts</td>
                          <td>
                            <strong>{r.status}</strong>
                            {r.fraudFlags?.length > 0 && (
                              <div style={{ fontSize: '0.78rem', color: 'var(--danger)' }}>
                                ⚠ {r.fraudFlags.join(' • ')}
                              </div>
                            )}
                          </td>
                          <td>
                            {r.status !== 'credited' && r.status !== 'rejected' && (
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  type="button"
                                  className="admin-mini-btn"
                                  onClick={() => handleResolveReferral(r.id, 'approve')}
                                >
                                  Approve &amp; Credit
                                </button>
                                <button
                                  type="button"
                                  className="admin-mini-btn admin-mini-danger"
                                  onClick={() => handleResolveReferral(r.id, 'reject')}
                                >
                                  Reject
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>


            </section>
          )}

          {activeTab === 'delivery' && (() => {
            const q = deliverySearch.trim().toLowerCase();
            const filteredPartners = !q
              ? deliveryBoysList
              : deliveryBoysList.filter((b) =>
                  [
                    b.fullName,
                    b.phone,
                    b.email,
                    b.id,
                    b.availability,
                    b.active ? 'active' : 'inactive',
                  ]
                    .filter(Boolean)
                    .some((v) => String(v).toLowerCase().includes(q))
                );
            const selectedPartner = selectedPartnerId
              ? deliveryBoysList.find((b) => b.id === selectedPartnerId) || null
              : null;
            const partnerOrders = selectedPartner
              ? allOrders.filter((o) => o.deliveryAssignment?.deliveryBoyId === selectedPartner.id)
              : [];
            return (
            <section className="admin-panel">
              <div className="admin-panel-head">
                <h2>Delivery Partner Management ({filteredPartners.length})</h2>
                <input
                  type="search"
                  aria-label="Search delivery partners"
                  placeholder="Search by name, phone, email, status..."
                  className="menu-select"
                  style={{ minWidth: 260 }}
                  value={deliverySearch}
                  onChange={(e) => setDeliverySearch(e.target.value)}
                />
              </div>
              <form className="admin-form" onSubmit={handleSaveDeliveryBoy} style={{ marginBottom: 20 }}>
                <div className="admin-form-row">
                  <div className="admin-field">
                    <label htmlFor="db-name">Full Name</label>
                    <input
                      id="db-name"
                      required
                      value={deliveryBoyForm.fullName}
                      onChange={(e) => setDeliveryBoyForm({ ...deliveryBoyForm, fullName: e.target.value })}
                      placeholder="Delivery Partner Name"
                    />
                  </div>
                  <div className="admin-field">
                    <label htmlFor="db-phone">Phone Number</label>
                    <input
                      id="db-phone"
                      required
                      value={deliveryBoyForm.phone}
                      onChange={(e) => setDeliveryBoyForm({ ...deliveryBoyForm, phone: e.target.value })}
                      placeholder="9876543210"
                    />
                  </div>
                </div>
                <div className="admin-form-row">
                  <div className="admin-field">
                    <label htmlFor="db-email">Email</label>
                    <input
                      id="db-email"
                      type="email"
                      required={!deliveryBoyForm.id}
                      disabled={Boolean(deliveryBoyForm.id)}
                      value={deliveryBoyForm.email}
                      onChange={(e) => setDeliveryBoyForm({ ...deliveryBoyForm, email: e.target.value })}
                      placeholder="partner@hruvita.com"
                    />
                  </div>
                  <div className="admin-field">
                    <label htmlFor="db-pass">{deliveryBoyForm.id ? 'New Password (optional)' : 'Password (8+ chars)'}</label>
                    <input
                      id="db-pass"
                      type="password"
                      required={!deliveryBoyForm.id}
                      minLength={8}
                      value={deliveryBoyForm.password}
                      onChange={(e) => setDeliveryBoyForm({ ...deliveryBoyForm, password: e.target.value })}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    className="menu-select"
                    value={deliveryBoyForm.availability}
                    onChange={(e) => setDeliveryBoyForm({ ...deliveryBoyForm, availability: e.target.value })}
                  >
                    <option value="available">Available</option>
                    <option value="busy">Busy</option>
                    <option value="offline">Offline</option>
                  </select>
                  <Button type="submit" size="sm">
                    {deliveryBoyForm.id ? 'Update Partner' : 'Add Delivery Partner'}
                  </Button>
                  {deliveryBoyForm.id && (
                    <button
                      type="button"
                      className="admin-mini-btn"
                      onClick={() =>
                        setDeliveryBoyForm({ id: '', fullName: '', phone: '', email: '', password: '', availability: 'available' })
                      }
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>
              </form>

              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Partner</th>
                      <th>Phone</th>
                      <th>Availability</th>
                      <th>Performance</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPartners.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px 12px' }}>
                          No delivery partners match &ldquo;{deliverySearch}&rdquo;.
                        </td>
                      </tr>
                    ) : (
                    filteredPartners.map((b) => (
                      <tr
                        key={b.id}
                        className={`admin-order-row-clickable ${selectedPartnerId === b.id ? 'admin-order-row-selected' : ''}`.trim()}
                        onClick={() => setSelectedPartnerId(b.id)}
                      >
                        <td>
                          <strong>{b.fullName}</strong>
                          <div style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>{b.email}</div>
                        </td>
                        <td>{b.phone}</td>
                        <td style={{ textTransform: 'capitalize' }}>{b.availability}</td>
                        <td style={{ fontSize: '0.8rem' }}>
                          Assigned: <strong>{b.stats?.totalAssigned || 0}</strong> &bull; Active:{' '}
                          <strong>{b.stats?.active || 0}</strong> &bull; Done:{' '}
                          <strong>{b.stats?.completed || 0}</strong> &bull; Failed:{' '}
                          <strong>{b.stats?.failed || 0}</strong> ({b.stats?.completionRate ?? 100}%)
                        </td>
                        <td>{b.active ? 'Active' : 'Inactive'}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="admin-row-actions">
                            <button
                              type="button"
                              className="admin-mini-btn"
                              onClick={() =>
                                setDeliveryBoyForm({
                                  id: b.id,
                                  fullName: b.fullName,
                                  phone: b.phone,
                                  email: b.email,
                                  password: '',
                                  availability: b.availability,
                                })
                              }
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className={`admin-mini-btn ${b.active ? 'admin-mini-danger' : ''}`}
                              onClick={() => handleToggleDeliveryBoy(b)}
                            >
                              {b.active ? 'Deactivate' : 'Activate'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>

              {selectedPartner && (
                <div
                  className="admin-order-modal-backdrop"
                  onClick={() => setSelectedPartnerId(null)}
                >
                  <div
                    className="admin-order-drawer"
                    role="dialog"
                    aria-modal="true"
                    aria-label={`Delivery partner details for ${selectedPartner.fullName}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="admin-drawer-head">
                      <div>
                        <h3>{selectedPartner.fullName}</h3>
                        <p>
                          Partner ID: {selectedPartner.id} &bull;{' '}
                          {selectedPartner.active ? 'Active' : 'Inactive'} &bull;{' '}
                          <span style={{ textTransform: 'capitalize' }}>{selectedPartner.availability}</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        className="admin-drawer-close"
                        aria-label="Close partner details"
                        onClick={() => setSelectedPartnerId(null)}
                      >
                        <FiX size={18} />
                      </button>
                    </div>

                    <div className="admin-drawer-body">
                      <div className="admin-drawer-grid">
                        <div className="admin-drawer-section">
                          <span className="admin-drawer-section-title">Partner Contact &amp; Profile</span>
                          <div className="admin-drawer-kv">
                            <span>Full Name</span>
                            <strong>{selectedPartner.fullName}</strong>
                          </div>
                          <div className="admin-drawer-kv">
                            <span>Phone</span>
                            <strong>{selectedPartner.phone}</strong>
                          </div>
                          <div className="admin-drawer-kv">
                            <span>Email</span>
                            <strong>{selectedPartner.email || '—'}</strong>
                          </div>
                          <div className="admin-drawer-kv">
                            <span>Account Status</span>
                            <strong>{selectedPartner.active ? 'Active' : 'Inactive'}</strong>
                          </div>
                          <div className="admin-drawer-kv">
                            <span>Availability</span>
                            <strong style={{ textTransform: 'capitalize' }}>{selectedPartner.availability}</strong>
                          </div>
                          {selectedPartner.phone && (
                            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                              <a href={`tel:${selectedPartner.phone}`} className="admin-mini-btn">
                                <FiPhone size={13} /> Call Partner
                              </a>
                              <a
                                href={`https://wa.me/${(() => {
                                  const d = String(selectedPartner.phone).replace(/\D/g, '');
                                  return d.length === 10 ? `91${d}` : d;
                                })()}`}
                                target="_blank"
                                rel="noreferrer"
                                className="admin-mini-btn"
                              >
                                WhatsApp
                              </a>
                            </div>
                          )}
                        </div>

                        <div className="admin-drawer-section">
                          <span className="admin-drawer-section-title">Performance &amp; Collections</span>
                          <div className="admin-drawer-kv">
                            <span>Total Assigned</span>
                            <strong>{selectedPartner.stats?.totalAssigned ?? partnerOrders.length}</strong>
                          </div>
                          <div className="admin-drawer-kv">
                            <span>Active Deliveries</span>
                            <strong>{selectedPartner.stats?.active ?? 0}</strong>
                          </div>
                          <div className="admin-drawer-kv">
                            <span>Completed</span>
                            <strong>{selectedPartner.stats?.completed ?? 0}</strong>
                          </div>
                          <div className="admin-drawer-kv">
                            <span>Failed</span>
                            <strong>{selectedPartner.stats?.failed ?? 0}</strong>
                          </div>
                          <div className="admin-drawer-kv">
                            <span>Completion Rate</span>
                            <strong>{selectedPartner.stats?.completionRate ?? 100}%</strong>
                          </div>
                          <div className="admin-drawer-kv">
                            <span>COD Collected</span>
                            <strong>
                              {money(
                                partnerOrders
                                  .filter((o) => o.paymentMethod === 'cod' && o.paymentStatus === 'paid')
                                  .reduce((sum, o) => sum + Number(o.pricing?.grandTotal || 0), 0)
                              )}
                            </strong>
                          </div>
                          <div className="admin-drawer-kv">
                            <span>COD Pending</span>
                            <strong>
                              {money(
                                partnerOrders
                                  .filter(
                                    (o) =>
                                      o.paymentMethod === 'cod' &&
                                      o.paymentStatus !== 'paid' &&
                                      o.status !== 'cancelled'
                                  )
                                  .reduce((sum, o) => sum + Number(o.pricing?.grandTotal || 0), 0)
                              )}
                            </strong>
                          </div>
                        </div>
                      </div>

                      <div className="admin-drawer-section">
                        <span className="admin-drawer-section-title">
                          Assigned Orders ({partnerOrders.length})
                        </span>
                        {partnerOrders.length === 0 ? (
                          <p style={{ fontSize: '0.84rem', color: 'var(--muted)' }}>
                            No orders assigned to this partner yet.
                          </p>
                        ) : (
                          <div>
                            {partnerOrders.map((ord) => (
                              <div key={ord.id} className="admin-drawer-item">
                                <div>
                                  <strong>{ord.id}</strong> &bull;{' '}
                                  <span>{ord.customerName}</span>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                                    {ord.scheduledDate} &bull; {ord.slotLabel} &bull;{' '}
                                    {(ord.items || []).map((it) => `${it.qty}× ${it.name}`).join(', ')}
                                  </div>
                                  <div style={{ fontSize: '0.74rem', color: 'var(--muted)', marginTop: 2 }}>
                                    {[ord.address?.line1, ord.address?.area, ord.address?.city, ord.address?.pincode]
                                      .filter(Boolean)
                                      .join(', ')}
                                  </div>
                                </div>
                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                  <strong>{money(ord.pricing?.grandTotal || 0)}</strong>
                                  <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--muted)' }}>
                                    {ord.paymentMethod} ({ord.paymentStatus})
                                  </div>
                                  <span
                                    className={`admin-order-pill ${
                                      ord.deliveryStatus === 'delivered' || ord.status === 'delivered'
                                        ? 'admin-pill-green'
                                        : ord.deliveryStatus === 'delivery_failed' || ord.status === 'cancelled'
                                        ? 'admin-pill-red'
                                        : 'admin-pill-blue'
                                    }`}
                                    style={{ marginTop: 4, fontSize: '0.66rem', padding: '2px 8px' }}
                                  >
                                    {(ord.deliveryStatus || ord.status).replace(/_/g, ' ')}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="admin-mini-btn"
                          onClick={() => {
                            setDeliveryBoyForm({
                              id: selectedPartner.id,
                              fullName: selectedPartner.fullName,
                              phone: selectedPartner.phone,
                              email: selectedPartner.email,
                              password: '',
                              availability: selectedPartner.availability,
                            });
                            setSelectedPartnerId(null);
                          }}
                        >
                          Edit Partner
                        </button>
                        <button
                          type="button"
                          className={`admin-mini-btn ${selectedPartner.active ? 'admin-mini-danger' : ''}`}
                          onClick={() => handleToggleDeliveryBoy(selectedPartner)}
                        >
                          {selectedPartner.active ? 'Deactivate Partner' : 'Activate Partner'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>
            );
          })()}

          {activeTab === 'team' && user?.role === 'admin' && (
            <section className="admin-panel">
              <div className="admin-panel-head">
                <h2>Admin &amp; Analyst Team Management</h2>
              </div>
              <form className="admin-form" onSubmit={handleCreateTeamMember} style={{ marginBottom: 20 }}>
                <div className="admin-form-row">
                  <div className="admin-field">
                    <label htmlFor="tm-name">Full Name</label>
                    <input id="tm-name" required value={teamForm.fullName} onChange={(e) => setTeamForm({ ...teamForm, fullName: e.target.value })} placeholder="Analyst Name" />
                  </div>
                  <div className="admin-field">
                    <label htmlFor="tm-email">Email</label>
                    <input id="tm-email" type="email" required value={teamForm.email} onChange={(e) => setTeamForm({ ...teamForm, email: e.target.value })} placeholder="analyst@hruvita.com" />
                  </div>
                </div>
                <div className="admin-form-row">
                  <div className="admin-field">
                    <label htmlFor="tm-pass">Password (8+ chars)</label>
                    <input id="tm-pass" type="password" minLength={8} required value={teamForm.password} onChange={(e) => setTeamForm({ ...teamForm, password: e.target.value })} />
                  </div>
                  <div className="admin-field">
                    <label htmlFor="tm-role">Role</label>
                    <select id="tm-role" value={teamForm.role} onChange={(e) => setTeamForm({ ...teamForm, role: e.target.value })}>
                      <option value="admin_analyser">Admin Analyst (admin_analyser)</option>
                      <option value="staff">Staff</option>
                    </select>
                  </div>
                </div>
                <Button type="submit" size="sm">Create Team Account</Button>
              </form>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Action</th></tr></thead>
                  <tbody>
                    {team.map((m) => (
                      <tr key={m.id}>
                        <td><strong>{m.fullName}</strong></td>
                        <td>{m.email}</td>
                        <td><span className="admin-badge">{m.role}</span></td>
                        <td>{m.blocked ? 'Deactivated' : 'Active'}</td>
                        <td>
                          {m.role !== 'admin' && (
                            <button type="button" className="admin-mini-btn" onClick={() => handleToggleTeamStatus(m)}>
                              {m.blocked ? 'Activate' : 'Deactivate'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>


            </section>
          )}

          {activeTab === 'audit' && (
            <section className="admin-panel">
              <div className="admin-panel-head">
                <h2>Security &amp; Admin Audit Logs</h2>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Entity</th>
                      <th>Admin Actor</th>
                      <th>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(overview?.auditLogs || []).map((log) => (
                      <tr key={log.id}>
                        <td>
                          <strong>{log.action}</strong>
                        </td>
                        <td>
                          {log.entity} ({log.entityId})
                        </td>
                        <td>{log.actorEmail}</td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                          {log.createdAt ? new Date(log.createdAt).toLocaleString('en-IN') : 'Just now'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>


            </section>
          )}
        </div>
      </div>

      {/* Add / Edit Product Modal */}
      {productModalOpen && (
        <div className="rzp-backdrop" role="dialog" aria-modal="true" aria-label="Product Editor">
          <div className="rzp-modal" style={{ width: 'min(100%, 560px)', maxHeight: '92vh', overflowY: 'auto' }}>
            <div className="rzp-head">
              <strong>{prodForm.id ? `Edit Product: ${prodForm.name}` : 'Add New Product'}</strong>
              <button
                type="button"
                onClick={() => setProductModalOpen(false)}
                style={{ border: 0, background: 'transparent', color: 'var(--bg)', fontWeight: 700 }}
              >
                ✕
              </button>
            </div>
            <div className="rzp-body">
              <form className="admin-form" onSubmit={handleProductSave}>
                <div className="admin-field">
                  <label htmlFor="prod-name">Product Name</label>
                  <input
                    id="prod-name"
                    name="name"
                    type="text"
                    required
                    value={prodForm.name}
                    onChange={(e) => setProdForm({ ...prodForm, name: e.target.value })}
                    placeholder="e.g. Pesarattu Upma"
                  />
                </div>

                <div className="admin-form-row">
                  <div className="admin-field">
                    <label htmlFor="prod-cat">Category</label>
                    <select
                      id="prod-cat"
                      name="category"
                      value={prodForm.category}
                      onChange={(e) => setProdForm({ ...prodForm, category: e.target.value })}
                    >
                      {categories.map((c) => (
                        <option key={c.slug} value={c.slug}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="admin-field">
                    <label htmlFor="prod-img">Food Photo URL</label>
                    <input
                      id="prod-img"
                      name="image"
                      type="url"
                      value={prodForm.image}
                      onChange={(e) => setProdForm({ ...prodForm, image: e.target.value })}
                    />
                  </div>
                </div>

                <div className="admin-form-row">
                  <div className="admin-field">
                    <label htmlFor="prod-price">Price (₹)</label>
                    <input
                      id="prod-price"
                      name="price"
                      type="number"
                      min="1"
                      required
                      value={prodForm.price}
                      onChange={(e) => setProdForm({ ...prodForm, price: e.target.value })}
                    />
                  </div>
                  <div className="admin-field">
                    <label htmlFor="prod-disc">Offer Price (₹, optional)</label>
                    <input
                      id="prod-disc"
                      name="discountPrice"
                      type="number"
                      min="0"
                      value={prodForm.discountPrice}
                      onChange={(e) => setProdForm({ ...prodForm, discountPrice: e.target.value })}
                    />
                  </div>
                </div>

                <div className="admin-form-row">
                  <div className="admin-field">
                    <label htmlFor="prod-stock">Stock Count</label>
                    <input
                      id="prod-stock"
                      name="stock"
                      type="number"
                      min="0"
                      required
                      value={prodForm.stock}
                      onChange={(e) => setProdForm({ ...prodForm, stock: e.target.value })}
                    />
                  </div>
                  <div className="admin-field">
                    <label htmlFor="prod-prep">Prep Time (mins)</label>
                    <input
                      id="prod-prep"
                      name="prepMins"
                      type="number"
                      min="0"
                      value={prodForm.prepMins}
                      onChange={(e) => setProdForm({ ...prodForm, prepMins: e.target.value })}
                    />
                  </div>
                </div>

                <div className="admin-field">
                  <label htmlFor="prod-desc">Description</label>
                  <input
                    id="prod-desc"
                    name="description"
                    type="text"
                    required
                    value={prodForm.description}
                    onChange={(e) => setProdForm({ ...prodForm, description: e.target.value })}
                  />
                </div>

                <div className="admin-field">
                  <label htmlFor="prod-ing">Ingredients (comma separated)</label>
                  <input
                    id="prod-ing"
                    name="ingredients"
                    type="text"
                    value={prodForm.ingredients}
                    onChange={(e) => setProdForm({ ...prodForm, ingredients: e.target.value })}
                  />
                </div>

                <div className="admin-checks">
                  <label>
                    <input
                      id="prod-veg"
                      name="veg"
                      type="checkbox"
                      checked={prodForm.veg}
                      onChange={(e) => setProdForm({ ...prodForm, veg: e.target.checked })}
                    />{' '}
                    Vegetarian
                  </label>
                  <label>
                    <input
                      id="prod-best"
                      name="bestseller"
                      type="checkbox"
                      checked={prodForm.bestseller}
                      onChange={(e) => setProdForm({ ...prodForm, bestseller: e.target.checked })}
                    />{' '}
                    Bestseller
                  </label>
                  <label>
                    <input
                      id="prod-spec"
                      name="special"
                      type="checkbox"
                      checked={prodForm.special}
                      onChange={(e) => setProdForm({ ...prodForm, special: e.target.checked })}
                    />{' '}
                    Today&apos;s Special
                  </label>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <Button type="submit" size="sm">
                    <FiPlus size={16} /> {prodForm.id ? 'Update Product' : 'Create Product'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setProductModalOpen(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Kitchen Slip Modal */}
      {kitchenSlipOrder && (
        <div className="rzp-backdrop" role="dialog" aria-modal="true" aria-label="Kitchen Slip">
          <div className="rzp-modal">
            <div className="rzp-head">
              <strong>KITCHEN SLIP — {kitchenSlipOrder.id}</strong>
              <button
                type="button"
                onClick={() => setKitchenSlipOrder(null)}
                style={{ border: 0, background: 'transparent', color: 'var(--bg)', fontWeight: 700 }}
              >
                ✕
              </button>
            </div>
            <div className="rzp-body" style={{ fontFamily: 'monospace' }}>
              <div>
                <strong>Slot:</strong> {kitchenSlipOrder.scheduledDate} | {kitchenSlipOrder.slotLabel}
              </div>
              <div>
                <strong>Customer:</strong> {kitchenSlipOrder.customerName} ({kitchenSlipOrder.customerPhone})
              </div>
              <div>
                <strong>Address:</strong> {kitchenSlipOrder.address?.line1}, {kitchenSlipOrder.address?.pincode}
              </div>
              <hr style={{ border: 0, borderTop: '1px dashed var(--line)', width: '100%' }} />
              {(kitchenSlipOrder.items || []).map((it) => (
                <div key={it.productId} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>
                    {it.qty} &times; {it.name}
                  </span>
                  <strong>{money(it.lineTotal)}</strong>
                </div>
              ))}
              <hr style={{ border: 0, borderTop: '1px dashed var(--line)', width: '100%' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>TOTAL ({kitchenSlipOrder.paymentMethod.toUpperCase()}):</strong>
                <strong>{money(kitchenSlipOrder.pricing?.grandTotal)}</strong>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <Button size="sm" onClick={() => window.print()}>
                  <FiPrinter size={14} /> Print
                </Button>
                <Button variant="outline" size="sm" onClick={() => setKitchenSlipOrder(null)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
