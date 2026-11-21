import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiCreditCard,
  FiEdit2,
  FiFolder,
  FiLogOut,
  FiPackage,
  FiPlus,
  FiShield,
  FiShoppingBag,
  FiTrash2,
} from 'react-icons/fi';
import Button from '../components/Button.jsx';
import Logo from '../components/Logo.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useCatalog } from '../context/CatalogContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { apiRequest } from '../lib/api.js';
import { money } from '../lib/format.js';
import './Admin.css';
import './GroceryAdmin.css';

const EMPTY_PROD = {
  id: '',
  name: '',
  category: 'fresh-fruits',
  emoji: '🍎',
  image: 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?auto=format&fit=crop&w=700&q=80',
  price: 99,
  discountPrice: '',
  stock: 25,
  prepMins: 5,
  description: '',
  veg: true,
};

export default function GroceryAdmin() {
  const navigate = useNavigate();
  const { user, isGroceryAdmin, login, logout } = useAuth();
  const { refreshCatalog } = useCatalog();
  const { showToast } = useToast();

  const [tab, setTab] = useState('products');
  const [email, setEmail] = useState('groceryadmin@hruvita.com');
  const [password, setPassword] = useState('Grocery@123');
  const [error, setError] = useState('');
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [orders, setOrders] = useState([]);
  const [payments, setPayments] = useState([]);
  const [stats, setStats] = useState({});
  const [search, setSearch] = useState('');
  const [payFilter, setPayFilter] = useState('all'); // 'all' | 'COD' | 'Online'
  const [prodForm, setProdForm] = useState(EMPTY_PROD);
  const [catForm, setCatForm] = useState({
    name: '',
    emoji: '🛒',
    image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=400&q=80',
    tint: '#e6f4ea',
  });

  const loadGroceryOverview = useCallback(async () => {
    if (!isGroceryAdmin) return;
    try {
      const ov = await apiRequest('/api/grocery-admin/overview');
      setProducts(ov.products || []);
      setCategories(ov.categories || []);
      setOrders(ov.orders || []);
      setPayments(ov.payments || []);
      setStats(ov.stats || {});
    } catch (err) {
      setError(err.message || 'Could not load grocery data.');
    }
  }, [isGroceryAdmin]);

  useEffect(() => {
    loadGroceryOverview();
  }, [loadGroceryOverview]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const logged = await login(email, password, true, true);
      if (logged?.role !== 'grocery_admin') {
        setError('This account does not have Grocery Admin permissions.');
      }
    } catch (err) {
      setError(err.message || 'Login failed.');
    }
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        ...prodForm,
        price: Number(prodForm.price),
        discountPrice: prodForm.discountPrice !== '' ? Number(prodForm.discountPrice) : null,
        stock: Number(prodForm.stock),
        prepMins: Number(prodForm.prepMins || 5),
      };
      if (prodForm.id) {
        await apiRequest(`/api/grocery-admin/products/${prodForm.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showToast(`Updated "${prodForm.name}".`);
      } else {
        await apiRequest('/api/grocery-admin/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast(`Added "${prodForm.name}" to groceries.`);
      }
      setProdForm(EMPTY_PROD);
      await Promise.all([loadGroceryOverview(), refreshCatalog()]);
    } catch (err) {
      setError(err.message || 'Could not save grocery product.');
    }
  };

  const handleDeleteProduct = async (p) => {
    if (!window.confirm(`Delete "${p.name}"?`)) return;
    setError('');
    try {
      await apiRequest(`/api/grocery-admin/products/${p.id}`, { method: 'DELETE' });
      showToast(`Deleted "${p.name}".`);
      await Promise.all([loadGroceryOverview(), refreshCatalog()]);
    } catch (err) {
      setError(err.message || 'Could not delete product.');
    }
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await apiRequest('/api/grocery-admin/categories', {
        method: 'POST',
        body: JSON.stringify(catForm),
      });
      showToast(`Saved grocery category "${catForm.name}".`);
      setCatForm({
        name: '',
        emoji: '🛒',
        image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=400&q=80',
        tint: '#e6f4ea',
      });
      await Promise.all([loadGroceryOverview(), refreshCatalog()]);
    } catch (err) {
      setError(err.message || 'Could not save category.');
    }
  };

  if (!user || !isGroceryAdmin) {
    return (
      <div className="admin-login-screen">
        <div className="admin-login-card">
          <div style={{ marginBottom: 16 }}>
            <Logo />
          </div>
          <h1 style={{ fontSize: '1.45rem', color: 'var(--primary)', marginBottom: 6 }}>
            <FiShield size={20} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Grocery Admin Portal
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginBottom: 18 }}>
            Sign in with your Grocery Admin credentials to manage grocery catalog, orders &amp; payment history.
          </p>
          {error && <div className="account-alert" role="alert">{error}</div>}
          <form className="admin-form" onSubmit={handleLogin}>
            <div className="admin-field">
              <label htmlFor="ga-email">Grocery Admin Email</label>
              <input
                id="ga-email"
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="admin-field">
              <label htmlFor="ga-pass">Password</label>
              <input
                id="ga-pass"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit">Sign In to Grocery Admin</Button>
          </form>
        </div>
      </div>
    );
  }

  const filteredProducts = products.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || String(p.category || '').toLowerCase().includes(q);
  });

  const filteredPayments = payments.filter((p) =>
    payFilter === 'all' ? true : p.methodType === payFilter
  );

  return (
    <div className="ga-shell">
      <aside className="ga-sidebar">
        <div>
          <div className="ga-brand">
            <Logo />
            <span className="ga-role-pill">GROCERY ADMIN</span>
          </div>
          <nav className="ga-nav" style={{ marginTop: 18 }}>
            <button
              type="button"
              className={`ga-nav-btn ${tab === 'products' ? 'ga-nav-active' : ''}`}
              onClick={() => setTab('products')}
            >
              <FiShoppingBag size={16} /> Grocery Products ({stats.totalProducts || products.length})
            </button>
            <button
              type="button"
              className={`ga-nav-btn ${tab === 'categories' ? 'ga-nav-active' : ''}`}
              onClick={() => setTab('categories')}
            >
              <FiFolder size={16} /> Grocery Categories ({stats.totalCategories || categories.length})
            </button>
            <button
              type="button"
              className={`ga-nav-btn ${tab === 'orders' ? 'ga-nav-active' : ''}`}
              onClick={() => setTab('orders')}
            >
              <FiPackage size={16} /> Grocery Orders ({orders.length})
            </button>
            <button
              type="button"
              className={`ga-nav-btn ${tab === 'payments' ? 'ga-nav-active' : ''}`}
              onClick={() => setTab('payments')}
            >
              <FiCreditCard size={16} /> Payment History ({payments.length})
            </button>
          </nav>
        </div>

        <div className="ga-sidebar-foot">
          <div className="ga-user-mini">
            <strong>{user.fullName || 'Grocery Admin'}</strong>
            <span>{user.email}</span>
          </div>
          <button
            type="button"
            className="ga-signout-btn"
            onClick={async () => {
              await logout();
              navigate('/', { replace: true });
            }}
          >
            <FiLogOut size={15} /> Sign Out
          </button>
        </div>
      </aside>

      <main className="ga-main">
        <header className="ga-topbar">
          <div>
            <h1>
              {tab === 'products' && 'Grocery Products Catalog'}
              {tab === 'categories' && 'Grocery Categories'}
              {tab === 'orders' && 'Grocery Order History'}
              {tab === 'payments' && 'Grocery Payment History (COD & Online)'}
            </h1>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.82rem' }}>
              Shows grocery items &amp; grocery-only amounts (excludes tiffins/fruit items even on combined orders).
            </p>
          </div>
        </header>

        <div className="ga-kpi-grid">
          <div className="ga-kpi"><span>Grocery Products</span><strong>{stats.totalProducts || 0}</strong></div>
          <div className="ga-kpi"><span>Grocery Orders</span><strong>{stats.totalGroceryOrders || 0}</strong></div>
          <div className="ga-kpi"><span>Grocery Revenue</span><strong>{money(stats.totalGroceryRevenue || 0)}</strong></div>
          <div className="ga-kpi"><span>COD Grocery Total</span><strong>{money(stats.codTotal || 0)}</strong></div>
          <div className="ga-kpi"><span>Online Grocery Total</span><strong>{money(stats.onlineTotal || 0)}</strong></div>
        </div>

        {error && <div className="account-alert" role="alert">{error}</div>}

        {tab === 'products' && (
          <>
            <section className="ga-panel">
              <h2>{prodForm.id ? `Edit Grocery Item: ${prodForm.name}` : 'Add Grocery Product'}</h2>
              <form className="admin-form" onSubmit={handleSaveProduct}>
                <div className="admin-form-row">
                  <div className="admin-field">
                    <label>Product Name *</label>
                    <input
                      type="text"
                      required
                      value={prodForm.name}
                      onChange={(e) => setProdForm({ ...prodForm, name: e.target.value })}
                      placeholder="e.g. Organic Alphonso Mangoes (1kg)"
                    />
                  </div>
                  <div className="admin-field">
                    <label>Grocery Category *</label>
                    <select
                      value={prodForm.category}
                      onChange={(e) => setProdForm({ ...prodForm, category: e.target.value })}
                    >
                      {categories.map((c) => (
                        <option key={c.slug} value={c.slug}>
                          {c.emoji} {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="admin-form-row">
                  <div className="admin-field">
                    <label>MRP (₹) *</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={prodForm.price}
                      onChange={(e) => setProdForm({ ...prodForm, price: e.target.value })}
                    />
                  </div>
                  <div className="admin-field">
                    <label>Discount Price (₹)</label>
                    <input
                      type="number"
                      min="0"
                      value={prodForm.discountPrice}
                      onChange={(e) => setProdForm({ ...prodForm, discountPrice: e.target.value })}
                    />
                  </div>
                  <div className="admin-field">
                    <label>Stock</label>
                    <input
                      type="number"
                      min="0"
                      value={prodForm.stock}
                      onChange={(e) => setProdForm({ ...prodForm, stock: e.target.value })}
                    />
                  </div>
                </div>
                <div className="admin-form-row">
                  <div className="admin-field">
                    <label>Image URL</label>
                    <input
                      type="url"
                      value={prodForm.image}
                      onChange={(e) => setProdForm({ ...prodForm, image: e.target.value })}
                    />
                  </div>
                  <div className="admin-field">
                    <label>Description</label>
                    <input
                      type="text"
                      value={prodForm.description}
                      onChange={(e) => setProdForm({ ...prodForm, description: e.target.value })}
                      placeholder="Freshness & pack details"
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Button type="submit" size="sm">
                    <FiPlus size={14} /> {prodForm.id ? 'Update Product' : 'Add Grocery Product'}
                  </Button>
                  {prodForm.id && (
                    <Button type="button" variant="outline" size="sm" onClick={() => setProdForm(EMPTY_PROD)}>
                      Cancel Edit
                    </Button>
                  )}
                </div>
              </form>
            </section>

            <section className="ga-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <h2>Grocery Catalog ({filteredProducts.length})</h2>
                <input
                  type="search"
                  placeholder="Search grocery products..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #cddad0', minWidth: 220 }}
                />
              </div>
              <div className="ga-table-wrap">
                <table className="ga-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Category</th>
                      <th>Price</th>
                      <th>Stock</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((p) => (
                      <tr key={p.id}>
                        <td><strong>{p.emoji} {p.name}</strong></td>
                        <td>{p.category}</td>
                        <td>{money(p.discountPrice ?? p.price)}</td>
                        <td>{p.stock}</td>
                        <td style={{ display: 'flex', gap: 8 }}>
                          <button
                            type="button"
                            className="admin-mini-btn"
                            onClick={() =>
                              setProdForm({
                                id: p.id,
                                name: p.name,
                                category: p.category,
                                emoji: p.emoji || '🛒',
                                image: p.image || '',
                                price: p.price,
                                discountPrice: p.discountPrice ?? '',
                                stock: p.stock ?? 0,
                                prepMins: p.prepMins ?? 5,
                                description: p.description || '',
                                veg: p.veg ?? true,
                              })
                            }
                          >
                            <FiEdit2 size={13} /> Edit
                          </button>
                          <button
                            type="button"
                            className="admin-mini-btn admin-mini-danger"
                            onClick={() => handleDeleteProduct(p)}
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
          </>
        )}

        {tab === 'categories' && (
          <>
            <section className="ga-panel">
              <h2>Add Grocery Category</h2>
              <form className="admin-form" onSubmit={handleAddCategory}>
                <div className="admin-form-row">
                  <div className="admin-field">
                    <label>Category Name *</label>
                    <input
                      type="text"
                      required
                      value={catForm.name}
                      onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                      placeholder="e.g. Organic Pulses"
                    />
                  </div>
                  <div className="admin-field">
                    <label>Emoji</label>
                    <input
                      type="text"
                      value={catForm.emoji}
                      onChange={(e) => setCatForm({ ...catForm, emoji: e.target.value })}
                    />
                  </div>
                </div>
                <Button type="submit" size="sm">
                  <FiPlus size={14} /> Save Grocery Category
                </Button>
              </form>
            </section>

            <section className="ga-panel">
              <h2>Grocery Categories ({categories.length})</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {categories.map((c) => (
                  <div
                    key={c.slug}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 12,
                      background: c.tint || '#ecfdf3',
                      border: '1px solid #d5e5da',
                      fontWeight: 700,
                      fontSize: '0.88rem',
                    }}
                  >
                    {c.emoji} {c.name} <small style={{ color: 'var(--muted)' }}>({c.slug})</small>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {tab === 'orders' && (
          <section className="ga-panel">
            <h2>Grocery Order History ({orders.length})</h2>
            {orders.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>No grocery orders placed yet.</p>
            ) : (
              <div className="ga-table-wrap">
                <table className="ga-table">
                  <thead>
                    <tr>
                      <th>Order ID</th>
                      <th>Customer</th>
                      <th>Grocery Items Only</th>
                      <th>Grocery Amount</th>
                      <th>Method</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((ord) => (
                      <tr key={ord.id}>
                        <td>
                          <strong>{ord.id}</strong>
                          {ord.isMixedOrder && <span className="ga-badge ga-badge-mixed">Split Grocery</span>}
                          <div style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>{ord.scheduledDate}</div>
                        </td>
                        <td>{ord.customerName}</td>
                        <td>
                          {ord.items.map((it, idx) => (
                            <div key={idx}>
                              {it.qty}&times; {it.name} ({money(it.lineTotal)})
                            </div>
                          ))}
                        </td>
                        <td><strong>{money(ord.groceryTotal)}</strong></td>
                        <td>
                          <span className={`ga-badge ${ord.methodType === 'COD' ? 'ga-badge-cod' : 'ga-badge-online'}`}>
                            {ord.methodType}
                          </span>
                        </td>
                        <td>{String(ord.status || '').replace(/_/g, ' ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {tab === 'payments' && (
          <section className="ga-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <h2>Grocery Payment History (COD &amp; Online)</h2>
              <div className="ga-filter-pills">
                {[
                  { id: 'all', label: `All (${payments.length})` },
                  { id: 'COD', label: `COD (${stats.codCount || 0})` },
                  { id: 'Online', label: `Online (${stats.onlineCount || 0})` },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`ga-pill ${payFilter === f.id ? 'ga-pill-active' : ''}`}
                    onClick={() => setPayFilter(f.id)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredPayments.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>No matching grocery payments found.</p>
            ) : (
              <div className="ga-table-wrap">
                <table className="ga-table">
                  <thead>
                    <tr>
                      <th>Order ID</th>
                      <th>Customer</th>
                      <th>Method</th>
                      <th>Grocery Items</th>
                      <th>Grocery Amount</th>
                      <th>Payment Status</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPayments.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.orderId}</strong>
                          {p.isMixedOrder && <span className="ga-badge ga-badge-mixed">Grocery Share</span>}
                        </td>
                        <td>{p.customerName}</td>
                        <td>
                          <span className={`ga-badge ${p.methodType === 'COD' ? 'ga-badge-cod' : 'ga-badge-online'}`}>
                            {p.methodType}
                          </span>
                        </td>
                        <td>{p.itemCount} item(s)</td>
                        <td><strong>{money(p.groceryAmount)}</strong></td>
                        <td>{String(p.paymentStatus || '').replace(/_/g, ' ')}</td>
                        <td style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                          {p.createdAt ? new Date(p.createdAt).toLocaleString('en-IN') : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
