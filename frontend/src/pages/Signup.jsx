import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiCheck, FiEye, FiEyeOff, FiUserPlus } from 'react-icons/fi';
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

export default function Signup() {
  const navigate = useNavigate();
  const { signup } = useAuth();

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    termsAccepted: false,
  });
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const checks = getPasswordChecks(form.password);
  const allPwdValid = checks.every((c) => c.ok);
  const passwordsMatch =
    form.password.length > 0 && form.password === form.confirmPassword;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.fullName.trim()) {
      setError('Full Name is required.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!allPwdValid) {
      setError(
        'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.'
      );
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Password and Confirm Password do not match.');
      return;
    }
    if (!form.termsAccepted) {
      setError('Please accept the Terms and Conditions to create your account.');
      return;
    }

    setBusy(true);
    try {
      const res = await signup({
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        confirmPassword: form.confirmPassword,
        termsAccepted: form.termsAccepted,
      });
      navigate(`/verify-email?email=${encodeURIComponent(res.email || form.email.trim().toLowerCase())}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container auth-page">
      <div className="auth-card">
        <div className="auth-stepper">
          <span className="auth-step-pill auth-step-active">1. Sign Up</span>
          <span>&rarr;</span>
          <span className="auth-step-pill">2. Verify OTP</span>
          <span>&rarr;</span>
          <span className="auth-step-pill">3. Profile</span>
        </div>

        <div className="auth-head">
          <h1>Create Your Account</h1>
          <p>Sign up to order fresh breakfast, fruit bowls and manage multiple delivery addresses.</p>
        </div>

        {error && (
          <div className="account-alert" role="alert">
            {error}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="auth-field">
            <label htmlFor="signup-fullname">Full Name *</label>
            <input
              id="signup-fullname"
              name="fullName"
              type="text"
              required
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              placeholder="e.g. Kiran Kumar Reddy"
            />
          </div>

          <div className="auth-field">
            <label htmlFor="signup-email">Email Address *</label>
            <input
              id="signup-email"
              name="email"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="you@example.com"
            />
          </div>

          <div className="auth-field">
            <label htmlFor="signup-password">Password *</label>
            <div className="auth-pwd-box">
              <input
                id="signup-password"
                name="password"
                type={showPwd ? 'text' : 'password'}
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Create a strong password"
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

          <div className="auth-pwd-checklist" aria-label="Password requirements">
            {checks.map((c) => (
              <span
                key={c.label}
                className={`auth-pwd-item ${c.ok ? 'auth-pwd-item-ok' : ''}`.trim()}
              >
                <FiCheck size={13} /> {c.label}
              </span>
            ))}
            <span className={`auth-pwd-item ${passwordsMatch ? 'auth-pwd-item-ok' : ''}`.trim()}>
              <FiCheck size={13} /> Passwords match
            </span>
          </div>

          <div className="auth-field">
            <label htmlFor="signup-confirm-password">Confirm Password *</label>
            <div className="auth-pwd-box">
              <input
                id="signup-confirm-password"
                name="confirmPassword"
                type={showConfirmPwd ? 'text' : 'password'}
                required
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                placeholder="Re-enter your password"
              />
              <button
                type="button"
                className="auth-pwd-toggle"
                onClick={() => setShowConfirmPwd((v) => !v)}
                aria-label={showConfirmPwd ? 'Hide confirm password' : 'Show confirm password'}
              >
                {showConfirmPwd ? <FiEyeOff size={17} /> : <FiEye size={17} />}
              </button>
            </div>
          </div>

          <label className="auth-checkbox-label">
            <input
              id="signup-terms"
              name="termsAccepted"
              type="checkbox"
              checked={form.termsAccepted}
              onChange={(e) => setForm({ ...form, termsAccepted: e.target.checked })}
            />
            <span>I agree to the HRUVITA Terms &amp; Conditions and Privacy Policy *</span>
          </label>

          <Button type="submit" size="lg" disabled={busy}>
            <FiUserPlus size={18} />
            {busy ? 'Creating Account & Sending OTP...' : 'Sign Up & Receive Email OTP'}
          </Button>
        </form>

        <div className="auth-foot">
          Already have an account? <Link to="/login">Sign In here</Link>
        </div>
      </div>
    </div>
  );
}
