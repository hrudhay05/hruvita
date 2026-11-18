import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiActivity,
  FiBarChart2,
  FiBox,
  FiCoffee,
  FiDownload,
  FiEdit2,
  FiExternalLink,
  FiGrid,
  FiLayers,
  FiLogOut,
  FiPhone,
  FiPlus,
  FiPrinter,
  FiSettings,
  FiShield,
  FiShoppingBag,
  FiStar,
  FiTag,
  FiTrash2,
  FiUsers,
  FiGift,
  FiPackage,
  FiCalendar,
  FiSliders,
} from 'react-icons/fi';
import Button from '../components/Button.jsx';
import AdminAnalystDashboard from '../components/AdminAnalystDashboard.jsx';
import Logo from '../components/Logo.jsx';
import { useAuth } from '../context/AuthContext.jsx';
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

export default function Admin() {
  const { user, isAdmin, login, logout } = useAuth();
  const { categories, products, refreshCatalog } = useCatalog();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState('overview');
  const [email, setEmail] = useState('admin@hruvita.com');
  const [password, setPassword] = useState('Admin@123');
  const [error, setError] = useState('');
  const [overview, setOverview] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [orderDateFilter, setOrderDateFilter] = useState('');
  const [orderProductFilter, setOrderProductFilter] = useState('');
  const [prodSearch, setProdSearch] = useState('');
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [kitchenSlipOrder, setKitchenSlipOrder] = useState(null);
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

  const [team, setTeam] = useState([]);
  const [teamForm, setTeamForm] = useState({ fullName: '', email: '', password: '', role: 'admin_analyser' });

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
    return <AdminAnalystDashboard user={user} onLogout={logout} />;
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
      const hasMatch = (o.items || []).some((it) => String(it.name || '').toLowerCase().includes(q));
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

  const navItems = [
    { id: 'overview', label: 'Overview', icon: FiGrid },
    { id: 'kitchen', label: 'Kitchen Prep View', icon: FiCoffee },
    { id: 'orders', label: `Orders (${allOrders.length})`, icon: FiShoppingBag },
    { id: 'products', label: `Products (${products.length})`, icon: FiBox },
    { id: 'inventory', label: `Inventory & Bowl (${inventoryData.ingredients?.length || 0})`, icon: FiSliders },
    { id: 'combos', label: `Combos (${combos.length})`, icon: FiPackage },
    { id: 'plans', label: `Plans (${adminPlans.length})`, icon: FiCalendar },
    { id: 'categories', label: `Categories (${categories.length})`, icon: FiLayers },
    { id: 'coupons', label: `Coupons (${coupons.length})`, icon: FiTag },
    { id: 'reviews', label: `Reviews (${adminReviews.length})`, icon: FiStar },
    { id: 'referrals', label: `Referrals (${adminReferrals.length})`, icon: FiGift },
    { id: 'reports', label: 'Reports & CSV', icon: FiBarChart2 },
    { id: 'customers', label: `Customers (${overview?.customers?.length || 0})`, icon: FiUsers },
    { id: 'settings', label: 'Settings & Slots', icon: FiSettings },
    ...(user?.role === 'admin' ? [{ id: 'team', label: 'Admin Team', icon: FiShield }] : []),
    { id: 'audit', label: 'Audit Logs', icon: FiActivity },
  ];

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand-row">
          <Logo light />
          <span className="admin-brand-badge">Admin</span>
        </div>

        <nav className="admin-nav" aria-label="Admin sections">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={`admin-nav-btn ${activeTab === item.id ? 'admin-nav-btn-active' : ''}`.trim()}
                onClick={() => {
                  setActiveTab(item.id);
                  setError('');
                }}
              >
                <Icon size={17} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="admin-sidebar-foot">
          <div style={{ opacity: 0.8 }}>{user.email}</div>
          <Link
            to="/admin-analyst"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: 'var(--bg)',
              fontWeight: 600,
            }}
          >
            <FiBarChart2 size={14} /> Analyst Portal
          </Link>
          <Link
            to="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: 'var(--bg)',
              fontWeight: 600,
            }}
          >
            <FiExternalLink size={14} /> View Storefront
          </Link>
          <button
            type="button"
            onClick={logout}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              border: 0,
              padding: 0,
              background: 'transparent',
              color: '#f4b59a',
              fontWeight: 600,
              marginTop: 4,
            }}
          >
            <FiLogOut size={14} /> Sign Out
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <h1>{navItems.find((n) => n.id === activeTab)?.label || 'Dashboard'}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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

          <div className="admin-kpi-grid">
            <div className="admin-kpi-card">
              <span>Total Revenue</span>
              <strong>{money(stats.totalRevenue || 0)}</strong>
            </div>
            <div className="admin-kpi-card">
              <span>Active / Total Orders</span>
              <strong>
                {stats.activeOrdersCount || 0} / {stats.totalOrders || 0}
              </strong>
            </div>
            <div className="admin-kpi-card">
              <span>Active Subscriptions</span>
              <strong>{stats.activeSubscriptionsCount || 0}</strong>
            </div>
            <div className="admin-kpi-card">
              <span>Out of Stock</span>
              <strong style={{ color: stats.outOfStockCount > 0 ? 'var(--danger)' : 'var(--primary)' }}>
                {stats.outOfStockCount}
              </strong>
            </div>
            <div className="admin-kpi-card">
              <span>Today&apos;s Orders</span>
              <strong>{stats.todayOrdersCount || 0}</strong>
            </div>
            <div className="admin-kpi-card">
              <span>Pending / Done / Cancelled</span>
              <strong style={{ fontSize: '1.05rem' }}>
                {stats.pendingOrdersCount || 0} / {stats.completedOrdersCount || 0} / {stats.cancelledOrdersCount || 0}
              </strong>
            </div>
            <div className="admin-kpi-card">
              <span>Customers</span>
              <strong>{stats.totalCustomers}</strong>
            </div>
          </div>

          {Array.isArray(overview?.popularProducts) && overview.popularProducts.length > 0 && activeTab === 'overview' && (
            <section className="admin-panel" style={{ padding: '14px 18px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <strong style={{ fontSize: '0.92rem' }}>Top Ordered Products:</strong>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {overview.popularProducts.map((p) => (
                    <span
                      key={p.name}
                      style={{
                        background: 'var(--bg-soft, #f3f7f4)',
                        border: '1px solid var(--border, #e2e8f0)',
                        borderRadius: 999,
                        padding: '4px 10px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                      }}
                    >
                      {p.name} ({p.qty})
                    </span>
                  ))}
                </div>
              </div>
            </section>
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

          {(activeTab === 'overview' || activeTab === 'orders') && (
            <section className="admin-panel">
              <div className="admin-panel-head">
                <h2>Orders Queue ({filteredOrders.length})</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <input
                    type="date"
                    aria-label="Filter orders by date"
                    className="menu-select"
                    value={orderDateFilter}
                    onChange={(e) => setOrderDateFilter(e.target.value)}
                  />
                  <input
                    type="search"
                    aria-label="Filter orders by product"
                    placeholder="Filter by product..."
                    className="menu-select"
                    value={orderProductFilter}
                    onChange={(e) => setOrderProductFilter(e.target.value)}
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
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Order &amp; Slot</th>
                        <th>Customer &amp; Address</th>
                        <th>Items</th>
                        <th>Amount &amp; Payment</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.map((ord) => {
                        const cleanDigits = String(ord.customerPhone || '').replace(/[^0-9]/g, '');
                        const waUrl = `https://wa.me/${cleanDigits}?text=${encodeURIComponent(
                          `Hello ${ord.customerName}, update on your HRUVITA order ${ord.id}: status is now ${ord.status.replace(/_/g, ' ')}.`
                        )}`;
                        return (
                          <tr key={ord.id}>
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
                              <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: '0.78rem' }}>
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
                              <div style={{ fontSize: '0.76rem', textTransform: 'uppercase', color: 'var(--muted)' }}>
                                {ord.paymentMethod} ({ord.paymentStatus})
                              </div>
                            </td>
                            <td>
                              <select
                                aria-label={`Status for ${ord.id}`}
                                className="menu-select"
                                style={{ padding: '6px 10px', fontSize: '0.82rem' }}
                                value={ord.status}
                                onChange={(e) => handleOrderStatusChange(ord.id, e.target.value)}
                              >
                                {ALL_STATUSES.map((st) => (
                                  <option key={st} value={st}>
                                    {st.replace(/_/g, ' ')}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
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
            </section>
          )}

          {(activeTab === 'overview' || activeTab === 'products') && (
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
                    {filteredProducts.map((p) => (
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

          {/* Phase 5: Coupons Manager */}
          {activeTab === 'coupons' && (
            <div className="account-grid">
              <section className="admin-panel">
                <div className="admin-panel-head">
                  <h2>Active Coupons ({coupons.length})</h2>
                </div>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Discount</th>
                        <th>Min Order</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coupons.map((c) => (
                        <tr key={c.code}>
                          <td>
                            <strong>{c.code}</strong>
                            <div style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>{c.title}</div>
                          </td>
                          <td>
                            {c.type === 'percent' ? `${c.value}% (up to ₹${c.maxDiscount})` : `Flat ₹${c.value}`}
                          </td>
                          <td>{money(c.minOrder)}</td>
                          <td>
                            <button
                              type="button"
                              className="admin-mini-btn admin-mini-danger"
                              onClick={() => handleDeleteCoupon(c.code)}
                            >
                              <FiTrash2 size={13} /> Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="admin-panel">
                <div className="admin-panel-head">
                  <h2>Create / Update Coupon</h2>
                </div>
                <form className="admin-form" onSubmit={handleSaveCoupon}>
                  <div className="admin-form-row">
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
                      <label htmlFor="cp-type">Type</label>
                      <select
                        id="cp-type"
                        value={couponForm.type}
                        onChange={(e) => setCouponForm({ ...couponForm, type: e.target.value })}
                      >
                        <option value="percent">Percentage (%)</option>
                        <option value="flat">Flat Amount (₹)</option>
                      </select>
                    </div>
                  </div>
                  <div className="admin-field">
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
                  <div className="admin-form-row">
                    <div className="admin-field">
                      <label htmlFor="cp-val">Discount Value</label>
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
                      <label htmlFor="cp-min">Min Order (₹)</label>
                      <input
                        id="cp-min"
                        type="number"
                        min="0"
                        value={couponForm.minOrder}
                        onChange={(e) => setCouponForm({ ...couponForm, minOrder: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                  <Button type="submit" size="sm">
                    Save Coupon
                  </Button>
                </form>
              </section>
            </div>
          )}

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
            <div className="account-grid">
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
                <div className="admin-table-wrap">
                  <table className="admin-table">
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
                <div className="admin-table-wrap">
                  <table className="admin-table">
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
                <div className="admin-table-wrap">
                  <table className="admin-table">
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
