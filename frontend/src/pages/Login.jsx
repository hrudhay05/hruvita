import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiEye, FiEyeOff, FiLogIn } from 'react-icons/fi';
import Button from '../components/Button.jsx';
import { useAuth, getDashboardPathForRole } from '../context/AuthContext.jsx';
import './AuthFlow.css';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleUserRedirect = (loggedUser) => {
    if (!loggedUser) return;
    if (loggedUser.role === 'customer' && !loggedUser.isProfileCompleted) {
      navigate('/complete-profile', { replace: true });
      return;
    }
    navigate(getDashboardPathForRole(loggedUser.role), { replace: true });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!emailOrUsername.trim() || !password) {
      setError('Please enter your Email or Username and Password.');
      return;
    }

    setBusy(true);
    try {
      const result = await login(emailOrUsername.trim(), password, rememberMe, false);
      if (result?.requiresOtpVerification && result?.email) {
        navigate(
          `/verify-email?email=${encodeURIComponent(result.email)}&mode=${
            result.mode || 'login'
          }&remember=${rememberMe ? '1' : '0'}`
        );
        return;
      }
      handleUserRedirect(result);
    } catch (err) {
      if ((err.data?.requiresEmailVerification || err.data?.requiresOtpVerification) && err.data?.email) {
        navigate(
          `/verify-email?email=${encodeURIComponent(err.data.email)}&mode=${
            err.data.mode || 'signup'
          }&remember=${rememberMe ? '1' : '0'}`
        );
        return;
      }
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container auth-page">
      <div className="auth-card">
        <div className="auth-head">
          <h1>Welcome Back</h1>
          <p>Sign in with your email or username to receive your 6-digit login code.</p>
        </div>

        {error && (
          <div className="account-alert" role="alert">
            {error}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="login-identifier">Email or Username</label>
            <input
              id="login-identifier"
              name="emailOrUsername"
              type="text"
              required
              value={emailOrUsername}
              onChange={(e) => setEmailOrUsername(e.target.value)}
              placeholder="you@example.com or username"
            />
          </div>

          <div className="auth-field">
            <label htmlFor="login-password">Password</label>
            <div className="auth-pwd-box">
              <input
                id="login-password"
                name="password"
                type={showPwd ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
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

          <div className="auth-inline-row">
            <label className="auth-checkbox-label">
              <input
                id="login-remember"
                name="rememberMe"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span>Remember me</span>
            </label>
            <Link to="/forgot-password" style={{ color: 'var(--primary)', fontWeight: 600 }}>
              Forgot Password?
            </Link>
          </div>

          <Button type="submit" size="lg" disabled={busy}>
            <FiLogIn size={18} />
            {busy ? 'Sending Verification Code...' : 'Login'}
          </Button>
        </form>

        <div className="auth-foot">
          New to HRUVITA? <Link to="/signup">Create an account</Link>
        </div>
      </div>
    </div>
  );
}
