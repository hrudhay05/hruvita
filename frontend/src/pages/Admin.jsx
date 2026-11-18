import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiActivity,
  FiBox,
  FiEdit2,
  FiExternalLink,
  FiGrid,
  FiLayers,
  FiLogOut,
  FiPhone,
  FiPlus,
  FiPrinter,
  FiShield,
  FiShoppingBag,
  FiTrash2,
  FiUsers,
} from 'react-icons/fi';
import Button from '../components/Button.jsx';
import Logo from '../components/Logo.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useCatalog } from '../context/CatalogContext.jsx';
import { apiRequest } from '../lib/api.js';
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
  image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=700&q=80',
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

  const [activeTab, setActiveTab] = useState('overview');
  const [email, setEmail] = useState('admin@hruvita.com');
  const [password, setPassword] = useState('Admin@123');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [overview, setOverview] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [prodSearch, setProdSearch] = useState('');
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [kitchenSlipOrder, setKitchenSlipOrder] = useState(null);
  const [prodForm, setProdForm] = useState(emptyProductForm);
  const [catForm, setCatForm] = useState({
    name: '',
    emoji: '🥗',
    image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=400&q=80',
    tint: '#e6f4ea',
  });

  const loadOverview = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const data = await apiRequest('/api/admin/overview');
      setOverview(data);
    } catch (err) {
      setError(err.message);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const logged = await login(email, password);
      if (logged.role !== 'admin' && logged.role !== 'staff') {
        setError('This account does not have admin permissions.');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  if (!user || !isAdmin) {
    return (
      <div className="admin-login-screen">
        <div className="admin-login-card">
          <div style={{ marginBottom: 16 }}>
            <Logo />
          </div>
          <h1 style={{ fontSize: '1.4rem', color: 'var(--green-900)', marginBottom: 6 }}>
            <FiShield size={20} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Admin Control Center
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginBottom: 18 }}>
            Dedicated management workspace protected by server role verification.
          </p>
          {error && <div className="account-alert" role="alert">{error}</div>}
          <form className="admin-form" onSubmit={handleAdminLogin}>
            <div className="admin-field">
              <label htmlFor="admin-email">Admin Email</label>
              <input
                id="admin-email"
                name="email"
                type="email"
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
            <Link to="/" style={{ color: 'var(--green-700)', fontWeight: 600 }}>
              &larr; Return to Customer Storefront
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const handleOrderStatusChange = async (orderId, newStatus) => {
    setError('');
    setNotice('');
    try {
      await apiRequest(`/api/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      setNotice(`Order ${orderId} updated to "${newStatus.replace(/_/g, ' ')}".`);
      await Promise.all([loadOverview(), refreshCatalog()]);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRefundOrder = async (orderId) => {
    setError('');
    setNotice('');
    try {
      await apiRequest(`/api/admin/orders/${orderId}/refund`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Admin initiated refund' }),
      });
      setNotice(`Refund processed for order ${orderId}.`);
      await loadOverview();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleProductSave = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
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
        setNotice(`Updated "${prodForm.name}".`);
      } else {
        await apiRequest('/api/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setNotice(`Added "${prodForm.name}" to the menu.`);
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
    setNotice('');
    try {
      await apiRequest(`/api/products/${p.id}`, { method: 'DELETE' });
      setNotice(`Removed "${p.name}".`);
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
    setNotice('');
    try {
      await apiRequest('/api/categories', {
        method: 'POST',
        body: JSON.stringify(catForm),
      });
      setNotice(`Category "${catForm.name}" saved.`);
      setCatForm({
        name: '',
        emoji: '🥗',
        image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=400&q=80',
        tint: '#e6f4ea',
      });
      await Promise.all([refreshCatalog(), loadOverview()]);
    } catch (err) {
      setError(err.message);
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

  const stats = overview?.stats || {
    totalRevenue: 0,
    totalOrders: 0,
    activeOrdersCount: 0,
    totalProducts: products.length,
    outOfStockCount: products.filter((p) => p.stock <= 0).length,
    totalCustomers: 1,
  };

  const allOrders = overview?.orders || [];
  const filteredOrders = statusFilter
    ? allOrders.filter((o) => o.status === statusFilter)
    : allOrders;

  const filteredProducts = products.filter(
    (p) =>
      !prodSearch.trim() ||
      p.name.toLowerCase().includes(prodSearch.toLowerCase()) ||
      p.category.toLowerCase().includes(prodSearch.toLowerCase())
  );

  const navItems = [
    { id: 'overview', label: 'Overview', icon: FiGrid },
    { id: 'orders', label: `Orders (${allOrders.length})`, icon: FiShoppingBag },
    { id: 'products', label: `Products (${products.length})`, icon: FiBox },
    { id: 'categories', label: `Categories (${categories.length})`, icon: FiLayers },
    { id: 'customers', label: `Customers (${overview?.customers?.length || 0})`, icon: FiUsers },
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
                  setNotice('');
                }}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="admin-sidebar-foot">
          <div style={{ opacity: 0.8 }}>{user.email}</div>
          <Link
            to="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: 'var(--cream)',
              fontWeight: 600,
            }}
          >
            <FiExternalLink size={14} /> View Customer Store
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
              color: '#fda4af',
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
          <h1>
            {navItems.find((n) => n.id === activeTab)?.label || 'Dashboard'}
          </h1>
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
          {notice && <div className="account-notice" role="status">{notice}</div>}

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
              <span>Menu Products</span>
              <strong>{stats.totalProducts}</strong>
            </div>
            <div className="admin-kpi-card">
              <span>Out of Stock</span>
              <strong style={{ color: stats.outOfStockCount > 0 ? 'var(--danger)' : 'var(--green-900)' }}>
                {stats.outOfStockCount}
              </strong>
            </div>
            <div className="admin-kpi-card">
              <span>Registered Customers</span>
              <strong>{stats.totalCustomers}</strong>
            </div>
          </div>

          {(activeTab === 'overview' || activeTab === 'orders') && (
            <section className="admin-panel">
              <div className="admin-panel-head">
                <h2>Orders Queue ({filteredOrders.length})</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label htmlFor="admin-status-filter" style={{ fontSize: '0.84rem', fontWeight: 600 }}>
                    Status Filter:
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
                  No orders in this status view yet.
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
                        <th>Status (11 Stages)</th>
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
                                <a href={`tel:${ord.customerPhone}`} style={{ color: 'var(--green-700)', fontWeight: 600 }}>
                                  <FiPhone size={11} /> Call
                                </a>
                                <a href={waUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--green-700)', fontWeight: 600 }}>
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
                      <th>Likes</th>
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
                        <td>❤️ {p.likes || 24}</td>
                        <td>
                          <span
                            style={{
                              color: p.stock <= 0 ? 'var(--danger)' : 'var(--green-900)',
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
                      {c.image ? (
                        <img src={c.image} alt={c.name} loading="lazy" />
                      ) : (
                        <span>{c.emoji}</span>
                      )}
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
                      <label htmlFor="cat-emoji">Fallback Emoji</label>
                      <input
                        id="cat-emoji"
                        name="catEmoji"
                        type="text"
                        value={catForm.emoji}
                        onChange={(e) => setCatForm({ ...catForm, emoji: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="admin-field">
                    <label htmlFor="cat-img">Category Image URL</label>
                    <input
                      id="cat-img"
                      name="catImage"
                      type="url"
                      value={catForm.image}
                      onChange={(e) => setCatForm({ ...catForm, image: e.target.value })}
                      placeholder="https://images.unsplash.com/..."
                    />
                  </div>
                  <Button type="submit" size="sm">
                    Save Category
                  </Button>
                </form>
              </section>
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
                          <strong>{c.name}</strong>
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
                            {c.blocked ? 'Blocked (Click to Unblock)' : 'Active (Click to Block)'}
                          </button>
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
                style={{ border: 0, background: 'transparent', color: 'var(--cream)', fontWeight: 700 }}
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
                      placeholder="https://images.unsplash.com/..."
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
                    placeholder="Short appetizing description"
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
                    placeholder="Green moong dal, Ginger, Upma"
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
                style={{ border: 0, background: 'transparent', color: 'var(--cream)', fontWeight: 700 }}
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
                    {it.qty} x {it.name}
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
