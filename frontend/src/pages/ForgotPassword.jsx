import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FiMail } from 'react-icons/fi';
import Button from '../components/Button.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import './AuthFlow.css';

export default function ForgotPassword() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid registered email address.');
      return;
    }

    setBusy(true);
    try {
      const res = await forgotPassword(email.trim().toLowerCase());
      setNotice(
        res.message ||
          'If that email address is registered, a password reset link has been sent to your inbox.'
      );
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
          <h1>Forgot Your Password?</h1>
          <p>Enter your registered email address and we will send you a secure single-use reset link.</p>
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
          <div className="auth-field">
            <label htmlFor="fp-email">Registered Email Address *</label>
            <input
              id="fp-email"
              name="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <Button type="submit" size="lg" disabled={busy}>
            <FiMail size={18} />
            {busy ? 'Sending Reset Link...' : 'Send Password Reset Link'}
          </Button>
        </form>

        <div className="auth-foot">
          Remembered your password? <Link to="/login">Back to Sign In</Link>
        </div>
      </div>
    </div>
  );
}
