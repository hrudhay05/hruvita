import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FiCheck, FiEye, FiEyeOff, FiLock } from 'react-icons/fi';
import Button from '../components/Button.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import './AuthFlow.css';

function getPasswordChecks(pwd = '') {
  return [
    { label: 'At least 8 characters', ok: pwd.length >= 8 },
    { label: 'Uppercase letter (A-Z)', ok: /[A-Z]/.test(pwd) },
    { label: 'Lowercase letter (a-z)', ok: /[a-z]/.test(pwd) },
    { label: 'Number (0-9)', ok: /[0-9]/.test(pwd) },
    { label: 'Special character (@#$!)', ok: /[^A-Za-z0-9]/.test(pwd) },
  ];
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { resetPassword } = useAuth();

  const [token, setToken] = useState(params.get('token') || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const checks = getPasswordChecks(newPassword);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');

    if (!token.trim()) {
      setError('Reset token is missing. Please open the link from your password reset email.');
      return;
    }
    if (!checks.every((c) => c.ok)) {
      setError('New password must meet all complexity requirements.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and Confirm password do not match.');
      return;
    }

    setBusy(true);
    try {
      const res = await resetPassword({
        token: token.trim(),
        newPassword,
        confirmPassword,
      });
      setNotice(res.message || 'Password reset successful! Redirecting to login...');
      setTimeout(() => navigate('/login'), 1800);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container auth-page">
      <div className="auth-card">
        <div className="auth-head">
          <h1>Reset Your Password</h1>
          <p>Choose a strong new password. All existing sessions will be signed out for security.</p>
        </div>

        {error && (
          <div className="account-alert" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="account-notice" role="status">
            {notice}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          {!params.get('token') && (
            <div className="auth-field">
              <label htmlFor="rp-token">Reset Token *</label>
              <input
                id="rp-token"
                name="token"
                type="text"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste reset token from email"
              />
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="rp-new-pwd">New Strong Password *</label>
            <div className="auth-pwd-box">
              <input
                id="rp-new-pwd"
                name="newPassword"
                type={showPwd ? 'text' : 'password'}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Create new password"
              />
              <button
                type="button"
                className="auth-pwd-toggle"
                onClick={() => setShowPwd((v) => !v)}
                aria-label={showPwd ? 'Hide password' : 'Show password'}
              >
                {showPwd ? <FiEyeOff size={17} /> : <FiEye size={17} />}
              </button>
            </div>
          </div>

          <div className="auth-pwd-checklist">
            {checks.map((c) => (
              <span
                key={c.label}
                className={`auth-pwd-item ${c.ok ? 'auth-pwd-item-ok' : ''}`.trim()}
              >
                <FiCheck size={13} /> {c.label}
              </span>
            ))}
          </div>

          <div className="auth-field">
            <label htmlFor="rp-confirm-pwd">Confirm New Password *</label>
            <input
              id="rp-confirm-pwd"
              name="confirmPassword"
              type={showPwd ? 'text' : 'password'}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
            />
          </div>

          <Button type="submit" size="lg" disabled={busy}>
            <FiLock size={18} />
            {busy ? 'Resetting Password...' : 'Save New Password'}
          </Button>
        </form>

        <div className="auth-foot">
          <Link to="/login">Return to Sign In</Link>
        </div>
      </div>
    </div>
  );
}
