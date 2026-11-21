import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  FiBell,
  FiCheck,
  FiMail,
  FiMenu,
  FiSearch,
  FiShoppingBag,
  FiUser,
  FiX,
} from 'react-icons/fi';
import Logo from './Logo.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useAuth, getDashboardPathForRole } from '../context/AuthContext.jsx';
import './Navbar.css';

const NAV_LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/menu', label: 'Explore Menu' },
  { to: '/groceries', label: 'Groceries' },
  { to: '/build-bowl', label: 'Build Your Bowl', authOnly: true },
  { to: '/subscriptions', label: 'Subscriptions', authOnly: true },
  { to: '/group-drops', label: 'Group Drops', authOnly: true },
  { to: '/about', label: 'About Us' },
  { to: '/contact', label: 'Contact' },
];

export default function Navbar() {
  const navigate = useNavigate();
  const { count } = useCart();
  const { user, notifications, unreadCount, markNotificationsRead, clearNotifications } = useAuth();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [bellOpen, setBellOpen] = useState(false);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const term = searchQuery.trim();
    navigate(term ? `/menu?q=${encodeURIComponent(term)}` : '/menu');
    setSearchOpen(false);
    setMobileOpen(false);
  };

  return (
    <header className="navbar">
      <div className="container navbar-bar">
        <Logo />

        <nav className="navbar-links" aria-label="Main Navigation">
          {NAV_LINKS.filter((item) => !item.authOnly || Boolean(user)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className="navbar-link"
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="navbar-actions">
          <button
            type="button"
            className="navbar-icon-btn"
            onClick={() => setSearchOpen((v) => !v)}
            aria-label="Search menu"
          >
            {searchOpen ? <FiX size={19} /> : <FiSearch size={19} />}
          </button>

          {user && (
            <div className="navbar-bell-wrap">
              <button
                type="button"
                className="navbar-icon-btn"
                onClick={() => setBellOpen((v) => !v)}
                aria-label={`Notifications, ${unreadCount} unread`}
              >
                <FiBell size={19} />
                {unreadCount > 0 && <span className="navbar-badge">{unreadCount}</span>}
              </button>

              {bellOpen && (
                <div className="navbar-notif-dropdown" role="dialog" aria-label="Notifications">
                  <div className="navbar-notif-head">
                    <strong>Notifications</strong>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          className="navbar-notif-read"
                          onClick={markNotificationsRead}
                        >
                          <FiCheck size={13} /> Mark all read
                        </button>
                      )}
                      {notifications.length > 0 && (
                        <button
                          type="button"
                          className="navbar-notif-read"
                          onClick={clearNotifications}
                          style={{ color: '#dc2626' }}
                        >
                          Clear all
                        </button>
                      )}
                    </div>
                  </div>
                  {notifications.length === 0 ? (
                    <p className="navbar-notif-empty">No notifications yet.</p>
                  ) : (
                    <ul className="navbar-notif-list">
                      {notifications.slice(0, 8).map((n) => (
                        <li
                          key={n.id}
                          className={`navbar-notif-item ${!n.read ? 'navbar-notif-unread' : ''}`.trim()}
                        >
                          <div className="navbar-notif-top">
                            <strong>{n.title}</strong>
                            {n.emailSent && (
                              <span className="navbar-email-pill">
                                <FiMail size={10} /> Email
                              </span>
                            )}
                          </div>
                          <p>{n.message}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          <Link
            to="/cart"
            className="navbar-icon-btn navbar-cart-btn"
            aria-label={`Cart, ${count} items`}
          >
            <FiShoppingBag size={19} />
            {count > 0 && (
              <span key={count} className="navbar-badge navbar-badge-pop">
                {count}
              </span>
            )}
          </Link>

          <Link
            to={user ? getDashboardPathForRole(user.role) : '/login'}
            className="navbar-profile-btn"
            aria-label={user ? `Profile (${user.fullName || user.name})` : 'Login'}
          >
            <FiUser size={16} />
            <span>{user ? (user.fullName || user.name).split(' ')[0] : 'Login'}</span>
          </Link>

          <button
            type="button"
            className="navbar-hamburger"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileOpen ? <FiX size={22} /> : <FiMenu size={22} />}
          </button>
        </div>
      </div>

      {searchOpen && (
        <div className="navbar-search-bar">
          <form className="container navbar-search-form" onSubmit={handleSearchSubmit}>
            <FiSearch size={18} />
            <input
              id="nav-search-input"
              name="q"
              type="search"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search fruit bowls, breakfast tiffins, cold-pressed juices..."
              aria-label="Search menu"
            />
            <button type="submit" className="btn btn-primary btn-sm">
              Search
            </button>
          </form>
        </div>
      )}

      {mobileOpen && (
        <div className="navbar-mobile-drawer">
          <nav className="container navbar-mobile-nav" aria-label="Mobile Navigation">
            {NAV_LINKS.filter((item) => !item.authOnly || Boolean(user)).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className="navbar-mobile-link"
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </NavLink>
            ))}
            <div className="navbar-mobile-footer">
              <Link
                to={user ? getDashboardPathForRole(user.role) : '/login'}
                className="btn btn-primary btn-sm"
                onClick={() => setMobileOpen(false)}
              >
                <FiUser size={15} /> {user ? 'My Dashboard' : 'Login / Sign Up'}
              </Link>
              <Link
                to="/cart"
                className="btn btn-outline btn-sm"
                onClick={() => setMobileOpen(false)}
              >
                <FiShoppingBag size={15} /> Cart ({count})
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
