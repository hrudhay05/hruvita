import { useCallback, useEffect, useState } from 'react';
import {
  FiActivity,
  FiAlertTriangle,
  FiAward,
  FiBarChart2,
  FiBell,
  FiBox,
  FiCalendar,
  FiDownload,
  FiFileText,
  FiGrid,
  FiLogOut,
  FiMenu,
  FiPackage,
  FiTrendingUp,
  FiUser,
  FiUsers,
} from 'react-icons/fi';
import { BarTrendChart, DonutBreakdownChart, LineTrendChart } from './AnalyticsCharts.jsx';
import RealtimeBadge from './RealtimeBadge.jsx';
import { useSocketEvents } from '../context/SocketContext.jsx';
import { API_BASE, apiRequest } from '../lib/api.js';
import { money } from '../lib/format.js';
import './AdminAnalystDashboard.css';

const SIDEBAR_ITEMS = [
  { id: 'overview', label: 'Overview', icon: FiGrid },
  { id: 'sales', label: 'Sales Analytics', icon: FiTrendingUp },
  { id: 'orders', label: 'Order Analytics', icon: FiPackage },
  { id: 'inventory', label: 'Inventory Analytics', icon: FiBox },
  { id: 'alerts', label: 'Inventory Alerts', icon: FiAlertTriangle },
  { id: 'products', label: 'Product Performance', icon: FiAward },
  { id: 'customers', label: 'Customer Analytics', icon: FiUsers },
  { id: 'subscriptions', label: 'Subscription Analytics', icon: FiCalendar },
  { id: 'reports', label: 'Reports & Exports', icon: FiFileText },
  { id: 'notifications', label: 'Notifications', icon: FiBell },
  { id: 'activity', label: 'Admin Activity', icon: FiActivity },
  { id: 'profile', label: 'My Profile', icon: FiUser },
];

export default function AdminAnalystDashboard({ user, onLogout }) {
  const [section, setSection] = useState('overview');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [category, setCategory] = useState('');
  const [analytics, setAnalytics] = useState(null);
  const [inventoryData, setInventoryData] = useState({ items: [], movements: [] });
  const [invStatusFilter, setInvStatusFilter] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const [notifCategory, setNotifCategory] = useState('');
  const [activityLogs, setActivityLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Reports & Exports state
  const [reportType, setReportType] = useState('orders');
  const [reportStatus, setReportStatus] = useState('');
  const [reportSearch, setReportSearch] = useState('');
  const [reportSort, setReportSort] = useState('');
  const [reportPage, setReportPage] = useState(1);
  const [reportResult, setReportResult] = useState({ headers: [], rows: [], total: 0, totalPages: 1 });

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
        ...(category ? { category } : {}),
      }).toString();
      const [anaRes, invRes, notRes, actRes] = await Promise.allSettled([
        apiRequest(`/api/analyst/analytics${qs ? `?${qs}` : ''}`),
        apiRequest(`/api/analyst/inventory${qs ? `?${qs}` : ''}`),
        apiRequest('/api/analyst/notifications'),
        apiRequest('/api/analyst/activity'),
      ]);
      if (anaRes.status === 'fulfilled') setAnalytics(anaRes.value);
      else setError(anaRes.reason?.message || 'Could not load analytics.');
      if (invRes.status === 'fulfilled') setInventoryData(invRes.value);
      if (notRes.status === 'fulfilled') {
        setNotifications(notRes.value.notifications || []);
        setUnreadCount(notRes.value.unreadCount || 0);
      }
      if (actRes.status === 'fulfilled') setActivityLogs(actRes.value.logs || []);
    } catch (err) {
      setError(err.message || 'Could not load analytics.');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, category]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  useSocketEvents(
    {
      'analytics:updated': () => loadAnalytics(),
      'analytics:sales-updated': () => loadAnalytics(),
      'analytics:inventory-updated': () => loadAnalytics(),
      'analytics:delivery-updated': () => loadAnalytics(),
      'inventory:low-stock': () => loadAnalytics(),
      'inventory:out-of-stock': () => loadAnalytics(),
      'notification:new': (p) => {
        if (p?.notification) {
          setNotifications((prev) => [p.notification, ...prev.filter((n) => n.id !== p.notification.id)]);
          setUnreadCount((c) => c + 1);
        }
      },
    },
    [loadAnalytics]
  );

  const loadReport = useCallback(async () => {
    try {
      const qs = new URLSearchParams({
        type: reportType,
        page: String(reportPage),
        limit: '15',
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
        ...(category ? { category } : {}),
        ...(reportStatus ? { status: reportStatus } : {}),
        ...(reportSearch ? { q: reportSearch } : {}),
        ...(reportSort ? { sortBy: reportSort } : {}),
      }).toString();
      const res = await apiRequest(`/api/analyst/reports?${qs}`);
      setReportResult(res);
    } catch {
      /* ignore */
    }
  }, [reportType, reportPage, startDate, endDate, category, reportStatus, reportSearch, reportSort]);

  useEffect(() => {
    if (section === 'reports') loadReport();
  }, [section, loadReport]);

  const downloadExport = async (format) => {
    const qs = new URLSearchParams({
      type: reportType,
      format,
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
      ...(category ? { category } : {}),
      ...(reportStatus ? { status: reportStatus } : {}),
      ...(reportSearch ? { q: reportSearch } : {}),
    }).toString();
    const token = localStorage.getItem('hruvita_token') || '';
    const res = await fetch(`${API_BASE}/api/analyst/reports?${qs}`, {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hruvita-${reportType}-report.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printReportPdf = () => {
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    const ths = (reportResult.headers || []).map((h) => `<th>${h}</th>`).join('');
    const trs = (reportResult.rows || [])
      .map((r) => `<tr>${reportResult.headers.map((h) => `<td>${r[h] ?? ''}</td>`).join('')}</tr>`)
      .join('');
    win.document.write(`<!doctype html><html><head><title>HRUVITA ${reportType} Report</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;}h2{color:#1b4d38;}table{width:100%;border-collapse:collapse;font-size:12px;}th,td{border:1px solid #ddd;padding:6px;text-align:left;}th{background:#f3f8f3;}</style>
      </head><body><h2>HRUVITA - ${reportType.toUpperCase()} REPORT</h2>
      <p>Date Range: ${reportResult.dateRange || 'All Time'} | Generated: ${new Date().toLocaleString('en-IN')}</p>
      <table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>
      <script>window.onload=()=>window.print();</script></body></html>`);
    win.document.close();
  };

  const handleNotificationClick = async (n) => {
    await apiRequest(`/api/analyst/notifications/${n.id}/read`, { method: 'POST' }).catch(() => {});
    setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    setUnreadCount((c) => Math.max(0, c - (n.read ? 0 : 1)));
    setBellOpen(false);
    if (n.category === 'inventory') setSection('alerts');
    else if (n.category === 'subscription') setSection('subscriptions');
    else if (n.category === 'customer') setSection('customers');
    else setSection('orders');
  };

  const handleMarkAllRead = async () => {
    await apiRequest('/api/analyst/notifications/read-all', { method: 'POST' }).catch(() => {});
    setNotifications((prev) => prev.map((x) => ({ ...x, read: true })));
    setUnreadCount(0);
  };

  const handleClearNotifications = async () => {
    await apiRequest('/api/analyst/notifications', { method: 'DELETE' }).catch(() => {});
    setNotifications([]);
    setUnreadCount(0);
  };

  const ov = analytics?.overview || {};
  const rev = analytics?.revenueAnalytics || {};
  const ord = analytics?.orderAnalytics || {};
  const inv = analytics?.inventoryAnalytics || {};
  const cust = analytics?.customerAnalytics || {};
  const sub = analytics?.subscriptionAnalytics || {};
  const prod = analytics?.productPerformance || {};

  return (
    <div className="ana-shell">
      <aside className={`ana-sidebar ${mobileMenu ? 'ana-sidebar-open' : ''}`}>
        <div className="ana-brand">
          <strong>HRUVITA Analytics</strong>
          <span>Admin Analyst (Read-Only)</span>
        </div>
        <nav className="ana-nav" aria-label="Analyst navigation">
          {SIDEBAR_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={`ana-nav-btn ${section === item.id ? 'ana-nav-active' : ''}`}
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

      <main className="ana-main">
        <header className="ana-topbar">
          <div className="ana-topbar-left">
            <button
              type="button"
              className="ana-mobile-toggle"
              onClick={() => setMobileMenu((m) => !m)}
              aria-label="Toggle sidebar"
            >
              <FiMenu size={18} />
            </button>
            <div>
              <h1 style={{ fontSize: '1.2rem' }}>
                {SIDEBAR_ITEMS.find((s) => s.id === section)?.label || 'Overview'}
              </h1>
              <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                Signed in as {user?.fullName || user?.email} (admin_analyser)
              </span>
            </div>
          </div>

          <div className="ana-topbar-actions">
            <RealtimeBadge />
            <div className="ana-bell-wrap">
              <button
                type="button"
                className="ana-bell-btn"
                onClick={() => setBellOpen((o) => !o)}
                aria-label="Admin notifications"
              >
                <FiBell size={18} />
                {unreadCount > 0 && <span className="ana-bell-badge">{unreadCount}</span>}
              </button>
              {bellOpen && (
                <div className="ana-bell-pop">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <strong>Notifications ({unreadCount} unread)</strong>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" className="ana-btn" onClick={handleMarkAllRead}>
                        Mark all read
                      </button>
                      {notifications.length > 0 && (
                        <button type="button" className="ana-btn" onClick={handleClearNotifications} style={{ color: '#dc2626' }}>
                          Clear all
                        </button>
                      )}
                    </div>
                  </div>
                  {notifications.length === 0 ? (
                    <p className="ana-empty">No notifications yet.</p>
                  ) : (
                    notifications.slice(0, 6).map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        className={`ana-notif-item ${!n.read ? 'ana-notif-unread' : ''}`}
                        onClick={() => handleNotificationClick(n)}
                      >
                        <strong style={{ fontSize: '0.82rem' }}>{n.title}</strong>
                        <span style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>{n.description}</span>
                      </button>
                    ))
                  )}
                  <button type="button" className="ana-btn" onClick={() => { setBellOpen(false); setSection('notifications'); }}>
                    View all notifications
                  </button>
                </div>
              )}
            </div>
            <button type="button" className="ana-btn" onClick={onLogout}>
              <FiLogOut size={14} /> Sign Out
            </button>
          </div>
        </header>

        <div className="ana-filters-bar">
          <div className="ana-filter-field">
            <label htmlFor="ana-start">Start Date</label>
            <input id="ana-start" className="ana-input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="ana-filter-field">
            <label htmlFor="ana-end">End Date</label>
            <input id="ana-end" className="ana-input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="ana-filter-field">
            <label htmlFor="ana-cat">Category</label>
            <select id="ana-cat" className="ana-select" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All Categories</option>
              {(analytics?.categories || []).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <button type="button" className="ana-btn" onClick={() => { setStartDate(''); setEndDate(''); setCategory(''); }}>
            Reset Filters
          </button>
        </div>

        {error && <div className="account-notice">{error}</div>}
        {loading && <p style={{ color: 'var(--muted)' }}>Loading live MongoDB analytics...</p>}

        {!loading && section === 'overview' && (
          <>
            <div className="ana-kpi-grid">
              <div className="ana-kpi">
                <span>Total Revenue</span>
                <strong>{money(ov.totalRevenue || 0)}</strong>
                {ov.comparisons?.revenueChangePct !== null && ov.comparisons?.revenueChangePct !== undefined && (
                  <small className={`ana-delta ${ov.comparisons.revenueChangePct >= 0 ? 'ana-delta-up' : 'ana-delta-down'}`}>
                    {ov.comparisons.revenueChangePct >= 0 ? '+' : ''}{ov.comparisons.revenueChangePct}% vs prev period
                  </small>
                )}
              </div>
              <div className="ana-kpi">
                <span>Total Orders</span>
                <strong>{ov.totalOrders || 0}</strong>
                {ov.comparisons?.ordersChangePct !== null && ov.comparisons?.ordersChangePct !== undefined && (
                  <small className={`ana-delta ${ov.comparisons.ordersChangePct >= 0 ? 'ana-delta-up' : 'ana-delta-down'}`}>
                    {ov.comparisons.ordersChangePct >= 0 ? '+' : ''}{ov.comparisons.ordersChangePct}% vs prev period
                  </small>
                )}
              </div>
              <div className="ana-kpi"><span>Today&apos;s Revenue</span><strong>{money(ov.todayRevenue || 0)}</strong></div>
              <div className="ana-kpi"><span>Today&apos;s Orders</span><strong>{ov.todayOrders || 0}</strong></div>
              <div className="ana-kpi"><span>Avg Order Value</span><strong>{money(ov.avgOrderValue || 0)}</strong></div>
              <div className="ana-kpi"><span>Total Customers</span><strong>{ov.totalCustomers || 0}</strong></div>
              <div className="ana-kpi"><span>Active Subscriptions</span><strong>{ov.activeSubscriptions || 0}</strong></div>
              <div className="ana-kpi"><span>Low Stock Products</span><strong>{ov.lowStockCount || 0}</strong></div>
              <div className="ana-kpi"><span>Out-of-Stock</span><strong>{ov.outOfStockCount || 0}</strong></div>
              <div className="ana-kpi"><span>Cancelled Orders</span><strong>{ov.cancelledOrders || 0}</strong></div>
            </div>
            <div className="ana-charts-grid">
              <div className="ana-panel">
                <h3>Daily Revenue Trend</h3>
                <LineTrendChart data={rev.daily || []} xKey="date" yKey="revenue" prefix="₹" />
              </div>
              <div className="ana-panel">
                <h3>Order Status Distribution</h3>
                <DonutBreakdownChart data={ord.statusDistribution || []} />
              </div>
            </div>
          </>
        )}

        {!loading && section === 'sales' && (
          <div className="ana-charts-grid">
            <div className="ana-panel"><h3>Daily Revenue</h3><LineTrendChart data={rev.daily || []} xKey="date" yKey="revenue" prefix="₹" /></div>
            <div className="ana-panel"><h3>Monthly Revenue</h3><BarTrendChart data={rev.monthly || []} xKey="label" yKey="value" prefix="₹" /></div>
            <div className="ana-panel"><h3>Revenue by Category</h3><DonutBreakdownChart data={rev.byCategory || []} /></div>
            <div className="ana-panel"><h3>Revenue by Payment Method</h3><DonutBreakdownChart data={rev.byPaymentMethod || []} /></div>
          </div>
        )}

        {!loading && section === 'orders' && (
          <div className="ana-charts-grid">
            <div className="ana-panel"><h3>Daily Orders</h3><BarTrendChart data={ord.daily || []} xKey="date" yKey="orders" /></div>
            <div className="ana-panel"><h3>Order Status Distribution</h3><DonutBreakdownChart data={ord.statusDistribution || []} /></div>
            <div className="ana-panel"><h3>Same-Day vs Advance Booking</h3><DonutBreakdownChart data={ord.sameDayVsAdvance || []} /></div>
            <div className="ana-panel"><h3>COD vs Online Payment</h3><DonutBreakdownChart data={ord.codVsOnline || []} /></div>
            <div className="ana-panel"><h3>Orders by Weekday</h3><BarTrendChart data={ord.byWeekday || []} xKey="label" yKey="value" /></div>
            <div className="ana-panel"><h3>Delivered vs Cancelled</h3><DonutBreakdownChart data={ord.deliveredVsCancelled || []} /></div>
          </div>
        )}

        {!loading && section === 'inventory' && (
          <div className="ana-charts-grid">
            <div className="ana-panel"><h3>Current Stock Levels</h3><BarTrendChart data={inv.stockLevels || []} xKey="label" yKey="value" /></div>
            <div className="ana-panel">
              <h3>Inventory Summary</h3>
              <p>Out of Stock: <strong>{inv.outOfStockCount || 0}</strong> | Low Stock: <strong>{(inv.lowStockProducts || []).length}</strong></p>
              <p style={{ fontSize: '0.84rem', color: 'var(--muted)' }}>
                {inv.valuationAvailable
                  ? `Total Inventory Valuation: ${money(inv.inventoryValuation)}`
                  : 'Inventory valuation unavailable (product costPrice is not configured in catalog).'}
              </p>
            </div>
          </div>
        )}

        {!loading && section === 'alerts' && (
          <section className="ana-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <h3>Inventory Alerts &amp; Stock Thresholds ({(inventoryData.items || []).length})</h3>
              <select value={invStatusFilter} onChange={(e) => setInvStatusFilter(e.target.value)} className="ana-select">
                <option value="">All Stock Statuses</option>
                <option value="Out of Stock">Out of Stock</option>
                <option value="Low Stock">Low Stock</option>
                <option value="In Stock">In Stock</option>
              </select>
            </div>
            <div className="ana-table-wrap">
              <table className="ana-table">
                <thead><tr><th>Product</th><th>Category</th><th>Stock</th><th>Min Threshold</th><th>Status</th><th>Updated</th></tr></thead>
                <tbody>
                  {(inventoryData.items || [])
                    .filter((it) => !invStatusFilter || it.stockStatus === invStatusFilter)
                    .map((it) => (
                      <tr key={it.id}>
                        <td><strong>{it.name}</strong></td>
                        <td>{it.category}</td>
                        <td>{it.stock}</td>
                        <td>{it.lowStockThreshold}</td>
                        <td>
                          <span className={`ana-badge ${it.stockStatus === 'Out of Stock' ? 'ana-badge-oos' : it.stockStatus === 'Low Stock' ? 'ana-badge-low' : 'ana-badge-ok'}`}>
                            {it.stockStatus}
                          </span>
                        </td>
                        <td>{String(it.updatedAt || '').slice(0, 10) || '—'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <h3>Recent Stock Movements</h3>
            {inventoryData.movements?.length ? (
              <div className="ana-table-wrap">
                <table className="ana-table">
                  <thead><tr><th>Item</th><th>Change</th><th>After</th><th>Reason</th><th>Date</th></tr></thead>
                  <tbody>
                    {inventoryData.movements.slice(0, 20).map((m) => (
                      <tr key={m.id}>
                        <td>{m.itemName}</td><td>{m.change}</td><td>{m.stockAfter}</td><td>{m.reason}</td><td>{String(m.createdAt || '').slice(0, 10)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="ana-empty">No stock movement history recorded for this filter yet.</p>
            )}
          </section>
        )}

        {!loading && section === 'products' && (
          <div className="ana-charts-grid">
            <div className="ana-panel"><h3>Top 10 Best-Selling Products</h3><BarTrendChart data={(prod.topProducts || []).map((p) => ({ label: p.name, value: p.qty }))} xKey="label" yKey="value" /></div>
            <div className="ana-panel">
              <h3>Revenue by Product</h3>
              <div className="ana-table-wrap">
                <table className="ana-table">
                  <thead><tr><th>Product</th><th>Qty Sold</th><th>Revenue</th></tr></thead>
                  <tbody>
                    {(prod.topProducts || []).map((p) => (
                      <tr key={p.name}><td>{p.name}</td><td>{p.qty}</td><td>{money(p.revenue)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {!loading && section === 'customers' && (
          <div className="ana-charts-grid">
            <div className="ana-panel">
              <h3>New vs Returning Customers</h3>
              <DonutBreakdownChart data={cust.newVsReturning || []} />
              <p style={{ fontSize: '0.86rem' }}>Repeat Order Rate: <strong>{cust.repeatOrderRate || 0}%</strong></p>
            </div>
            <div className="ana-panel">
              <h3>Most Active Customers</h3>
              <div className="ana-table-wrap">
                <table className="ana-table">
                  <thead><tr><th>Customer</th><th>Orders</th></tr></thead>
                  <tbody>
                    {(cust.mostActiveCustomers || []).map((c) => (
                      <tr key={c.id}><td>{c.name}</td><td>{c.ordersCount}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {!loading && section === 'subscriptions' && (
          <div className="ana-charts-grid">
            <div className="ana-panel"><h3>Subscription Plans (7 / 15 / 30 Day)</h3><DonutBreakdownChart data={sub.planBreakdown || []} /></div>
            <div className="ana-panel">
              <h3>Subscription Health</h3>
              <p>Active: <strong>{sub.activeCount || 0}</strong></p>
              <p>Expiring within 3 days: <strong>{sub.expiringCount || 0}</strong></p>
              <p>Cancelled: <strong>{sub.cancelledCount || 0}</strong></p>
            </div>
          </div>
        )}

        {section === 'reports' && (
          <section className="ana-panel">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Reports &amp; Exports ({reportResult.total || 0} records)</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="ana-btn ana-btn-primary" onClick={() => downloadExport('csv')}><FiDownload size={13} /> CSV</button>
                <button type="button" className="ana-btn" onClick={() => downloadExport('xls')}><FiDownload size={13} /> Excel</button>
                <button type="button" className="ana-btn" onClick={printReportPdf}><FiDownload size={13} /> PDF</button>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <select value={reportType} onChange={(e) => { setReportType(e.target.value); setReportPage(1); }} className="ana-select">
                <option value="sales">Sales Reports</option>
                <option value="orders">Orders Reports</option>
                <option value="inventory">Inventory Reports</option>
                <option value="products">Product Performance Reports</option>
                <option value="customers">Customer Reports</option>
                <option value="subscriptions">Subscription Reports</option>
                <option value="payments">Payment Reports</option>
                <option value="activity">Admin Activity Reports</option>
              </select>
              <input type="search" placeholder="Search..." value={reportSearch} onChange={(e) => { setReportSearch(e.target.value); setReportPage(1); }} className="ana-input" />
              <input type="text" placeholder="Status filter..." value={reportStatus} onChange={(e) => { setReportStatus(e.target.value); setReportPage(1); }} className="ana-input" />
            </div>
            <div className="ana-table-wrap">
              <table className="ana-table">
                <thead>
                  <tr>
                    {(reportResult.headers || []).map((h) => (
                      <th key={h} style={{ cursor: 'pointer' }} onClick={() => setReportSort(h)}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(reportResult.rows || []).map((r, idx) => (
                    <tr key={idx}>{(reportResult.headers || []).map((h) => <td key={h}>{r[h]}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button type="button" className="ana-btn" disabled={reportPage <= 1} onClick={() => setReportPage((p) => p - 1)}>Prev</button>
              <span style={{ fontSize: '0.82rem' }}>Page {reportResult.page || 1} of {reportResult.totalPages || 1}</span>
              <button type="button" className="ana-btn" disabled={reportPage >= (reportResult.totalPages || 1)} onClick={() => setReportPage((p) => p + 1)}>Next</button>
            </div>
          </section>
        )}

        {section === 'notifications' && (
          <section className="ana-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <h3>Admin Notifications</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={notifCategory} onChange={(e) => setNotifCategory(e.target.value)} className="ana-select">
                  <option value="">All Categories</option>
                  <option value="order">Orders</option>
                  <option value="payment">Payments</option>
                  <option value="inventory">Inventory</option>
                  <option value="subscription">Subscriptions</option>
                  <option value="cancellation">Cancellations</option>
                </select>
                <button type="button" className="ana-btn" onClick={handleMarkAllRead}>Mark all read</button>
                {notifications.length > 0 && (
                  <button type="button" className="ana-btn" onClick={handleClearNotifications} style={{ color: '#dc2626' }}>
                    Clear notifications
                  </button>
                )}
              </div>
            </div>
            {notifications
              .filter((n) => !notifCategory || n.category === notifCategory)
              .map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`ana-notif-item ${!n.read ? 'ana-notif-unread' : ''}`}
                  onClick={() => handleNotificationClick(n)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong>{n.title}</strong>
                    <small style={{ color: 'var(--muted)' }}>{String(n.createdAt || '').slice(0, 10)}</small>
                  </div>
                  <span style={{ fontSize: '0.84rem', color: 'var(--muted)' }}>{n.description}</span>
                </button>
              ))}
          </section>
        )}

        {section === 'activity' && (
          <section className="ana-panel">
            <h3>Admin Activity Logs (Read-Only)</h3>
            <div className="ana-table-wrap">
              <table className="ana-table">
                <thead><tr><th>Admin</th><th>Action</th><th>Entity</th><th>Record ID</th><th>Timestamp</th></tr></thead>
                <tbody>
                  {activityLogs.map((l) => (
                    <tr key={l.id}>
                      <td>{l.actorEmail}</td>
                      <td>{l.action}</td>
                      <td>{l.entity}</td>
                      <td>{l.entityId || '—'}</td>
                      <td>{String(l.createdAt || '').slice(0, 19).replace('T', ' ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {section === 'profile' && (
          <section className="ana-panel">
            <h3>My Analyst Profile</h3>
            <div className="ana-profile-grid">
              <div className="ana-profile-item"><span>Full Name</span><strong>{user?.fullName || user?.name}</strong></div>
              <div className="ana-profile-item"><span>Username</span><strong>@{user?.username || 'hruvita_analyst'}</strong></div>
              <div className="ana-profile-item"><span>Email</span><strong>{user?.email}</strong></div>
              <div className="ana-profile-item"><span>Role &amp; Access</span><strong>{user?.role} (Read-only analytics &amp; exports)</strong></div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
