import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FiCheckCircle, FiLock, FiMail, FiRefreshCw } from 'react-icons/fi';
import Button from '../components/Button.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import './AuthFlow.css';

export default function VerifyEmail() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { verifyEmailOtp, resendOtp } = useAuth();

  const lockedEmail = (params.get('email') || '').trim().toLowerCase();
  const mode = params.get('mode') || 'signup';
  const rememberMe = params.get('remember') === '1';
  const isLoginMode = mode === 'login';

  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(
    lockedEmail
      ? `We sent a 6-digit ${isLoginMode ? 'login' : 'verification'} OTP to ${lockedEmail}. Valid for 10 minutes.`
      : ''
  );
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!lockedEmail) {
      navigate(isLoginMode ? '/login' : '/signup', { replace: true });
    }
  }, [lockedEmail, isLoginMode, navigate]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setInterval(() => {
      setCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');

    const cleanOtp = otp.replace(/\D/g, '').trim();
    if (!/^\d{6}$/.test(cleanOtp)) {
      setError('Please enter the 6-digit numeric OTP.');
      return;
    }

    setBusy(true);
    try {
      const res = await verifyEmailOtp({ email: lockedEmail, otp: cleanOtp, rememberMe });
      if (res.user?.role === 'admin' || res.user?.role === 'staff') {
        navigate('/admin');
      } else if (res.user?.isProfileCompleted) {
        navigate('/dashboard');
      } else {
        navigate('/complete-profile');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    if (!lockedEmail) return;
    setError('');
    setNotice('');
    setResending(true);
    try {
      const res = await resendOtp(lockedEmail);
      setNotice(res.message || 'A new 6-digit OTP has been sent to your email.');
      setCooldown(30);
    } catch (err) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="container auth-page">
      <div className="auth-card">
        <div className="auth-stepper">
          <span className="auth-step-pill">{isLoginMode ? '1. Credentials' : '1. Sign Up'}</span>
          <span>&rarr;</span>
          <span className="auth-step-pill auth-step-active">2. Verify OTP</span>
          <span>&rarr;</span>
          <span className="auth-step-pill">{isLoginMode ? '3. Dashboard' : '3. Profile'}</span>
        </div>

        <div className="auth-head">
          <h1>
            <FiMail size={24} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            {isLoginMode ? 'Verify Login OTP' : 'Verify Your Email'}
          </h1>
          <p>
            {isLoginMode
              ? 'Enter the 6-digit OTP sent to your registered email to complete signing in.'
              : 'Enter the 6-digit OTP sent to your registered email address below.'}
          </p>
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

        <form className="auth-form" onSubmit={handleVerify}>
          <div className="auth-field">
            <label htmlFor="verify-email-readonly">Registered Email Address (Locked)</label>
            <div className="auth-pwd-box">
              <input
                id="verify-email-readonly"
                name="email"
                type="email"
                value={lockedEmail}
                readOnly
                disabled
                style={{
                  background: 'var(--green-50)',
                  color: 'var(--green-900)',
                  fontWeight: 600,
                  cursor: 'not-allowed',
                }}
              />
              <span className="auth-pwd-toggle" title="Email cannot be edited during OTP verification">
                <FiLock size={16} />
              </span>
            </div>
          </div>

          <div className="auth-field">
            <label htmlFor="verify-otp-input">Enter 6-Digit OTP *</label>
            <input
              id="verify-otp-input"
              name="otp"
              type="text"
              inputMode="numeric"
              maxLength={6}
              required
              autoFocus
              className="auth-otp-input"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
            />
          </div>

          <Button type="submit" size="lg" disabled={busy}>
            <FiCheckCircle size={18} />
            {busy
              ? 'Verifying OTP...'
              : isLoginMode
              ? 'Verify OTP & Login'
              : 'Verify OTP & Continue'}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResend}
            disabled={resending || cooldown > 0}
          >
            <FiRefreshCw size={15} />
            {resending
              ? 'Sending new OTP...'
              : cooldown > 0
              ? `Resend OTP in ${cooldown}s`
              : 'Resend OTP'}
          </Button>
        </form>

        <div className="auth-foot">
          {isLoginMode ? (
            <>
              Want to use a different account? <Link to="/login">Back to Sign In</Link>
            </>
          ) : (
            <>
              Want to use a different email? <Link to="/signup">Go back to Sign Up</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
