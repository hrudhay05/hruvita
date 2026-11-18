import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FiBarChart2 } from 'react-icons/fi';
import AdminAnalystDashboard from '../components/AdminAnalystDashboard.jsx';
import Button from '../components/Button.jsx';
import Logo from '../components/Logo.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import './Admin.css';

export default function AdminAnalystPage() {
  const { user, login, logout } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const allowed = user && (user.role === 'admin_analyser' || user.role === 'admin');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const logged = await login(email, password, true, true);
      if (!['admin_analyser', 'admin'].includes(logged?.role)) {
        setError('This account does not have Admin Analyst permissions.');
      }
    } catch (err) {
      setError(err.message || 'Sign-in failed.');
    }
  };
  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true }); // use your actual route path
  };

  if (!allowed) {
    return (
      <div className="admin-login-screen">
        <div className="admin-login-card">
          <div style={{ marginBottom: 16 }}>
            <Logo />
          </div>
          <h1 style={{ fontSize: '1.4rem', color: 'var(--primary)', marginBottom: 6 }}>
            <FiBarChart2 size={20} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Admin Analyst Portal
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginBottom: 18 }}>
            Sign in with your HRUVITA <strong>admin_analyser</strong> or Owner credentials.
          </p>
          {user && !allowed && (
            <div className="account-notice" style={{ marginBottom: 14 }}>
              Signed in as <strong>{user.email}</strong> ({user.role}), which lacks analyst access.
            </div>
          )}
          {error && <div className="account-notice" style={{ marginBottom: 14 }}>{error}</div>}
          <form className="admin-form" onSubmit={handleLogin}>
            <div className="admin-field">
              <label htmlFor="analyst-email">Analyst Email or Username</label>
              <input
                id="analyst-email"
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="hruvita_analyst or your email"
              />
            </div>
            <div className="admin-field">
              <label htmlFor="analyst-password">Password</label>
              <input
                id="analyst-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit">Sign In to Analytics</Button>
          </form>
          <div style={{ marginTop: 18, textAlign: 'center', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between' }}>
            <Link to="/" style={{ color: 'var(--primary)', fontWeight: 600 }}>
              &larr; Storefront
            </Link>
            <Link to="/admin" style={{ color: 'var(--primary)', fontWeight: 600 }}>
              Owner Admin &rarr;
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <AdminAnalystDashboard user={user} onLogout={handleLogout} />;
}
