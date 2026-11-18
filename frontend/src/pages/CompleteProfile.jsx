import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiCheckCircle, FiUserCheck } from 'react-icons/fi';
import Button from '../components/Button.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import './AuthFlow.css';

export default function CompleteProfile() {
  const navigate = useNavigate();
  const { user, loading, completeProfile } = useAuth();

  const [form, setForm] = useState({
    username: '',
    mobileNumber: '',
    gender: 'Male',
    dateOfBirth: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login');
    } else if (user) {
      setForm((prev) => ({
        username:
          prev.username ||
          user.username ||
          user.email?.split('@')[0]?.replace(/[^a-z0-9_]/gi, '').toLowerCase() ||
          '',
        mobileNumber: prev.mobileNumber || user.mobileNumber || '',
        gender: user.gender || prev.gender || 'Male',
        dateOfBirth: user.dateOfBirth
          ? new Date(user.dateOfBirth).toISOString().slice(0, 10)
          : prev.dateOfBirth,
      }));
    }
  }, [user, loading, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanUsername = form.username.trim().toLowerCase();
    const cleanMobile = form.mobileNumber.replace(/\D/g, '').trim();

    if (!/^[a-z0-9_]{3,24}$/.test(cleanUsername)) {
      setError('Username must be 3–24 characters using lowercase letters, numbers, or underscores.');
      return;
    }
    if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
      setError('Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.');
      return;
    }
    if (!['Male', 'Female', 'Prefer not to say'].includes(form.gender)) {
      setError('Please select a gender option.');
      return;
    }
    if (!form.dateOfBirth) {
      setError('Please enter your Date of Birth.');
      return;
    }

    setBusy(true);
    try {
      const updated = await completeProfile({
        username: cleanUsername,
        mobileNumber: cleanMobile,
        gender: form.gender,
        dateOfBirth: form.dateOfBirth,
      });

      if (!updated.addresses || updated.addresses.length === 0) {
        navigate('/addresses/new?onboarding=1');
      } else {
        navigate('/dashboard');
      }
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
          <span className="auth-step-pill">1. Sign Up</span>
          <span>&rarr;</span>
          <span className="auth-step-pill">2. Verify OTP</span>
          <span>&rarr;</span>
          <span className="auth-step-pill auth-step-active">3. Complete Profile</span>
        </div>

        <div className="auth-head">
          <h1>
            <FiUserCheck size={24} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            Complete Your Personal Profile
          </h1>
          <p>Tell us a few details to finish setting up your HRUVITA account.</p>
        </div>

        {error && (
          <div className="account-alert" role="alert">
            {error}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="cp-username">Unique Username *</label>
            <input
              id="cp-username"
              name="username"
              type="text"
              required
              value={form.username}
              onChange={(e) =>
                setForm({ ...form, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })
              }
              placeholder="e.g. kirankumar_98"
            />
          </div>

          <div className="auth-field">
            <label htmlFor="cp-mobile">10-Digit Indian Mobile Number *</label>
            <input
              id="cp-mobile"
              name="mobileNumber"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              required
              value={form.mobileNumber}
              onChange={(e) =>
                setForm({ ...form, mobileNumber: e.target.value.replace(/\D/g, '').slice(0, 10) })
              }
              placeholder="9876543210"
            />
          </div>

          <div className="auth-row-2">
            <div className="auth-field">
              <label htmlFor="cp-gender">Gender *</label>
              <select
                id="cp-gender"
                name="gender"
                value={form.gender}
                onChange={(e) => setForm({ ...form, gender: e.target.value })}
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </div>

            <div className="auth-field">
              <label htmlFor="cp-dob">Date of Birth *</label>
              <input
                id="cp-dob"
                name="dateOfBirth"
                type="date"
                required
                max={new Date().toISOString().slice(0, 10)}
                value={form.dateOfBirth}
                onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
              />
            </div>
          </div>

          <Button type="submit" size="lg" disabled={busy}>
            <FiCheckCircle size={18} />
            {busy ? 'Saving Profile...' : 'Save Profile & Add Delivery Address'}
          </Button>
        </form>
      </div>
    </div>
  );
}
