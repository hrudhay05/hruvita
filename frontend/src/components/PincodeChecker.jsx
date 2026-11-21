import { useEffect, useState } from 'react';
import { FiAlertTriangle, FiCheckCircle } from 'react-icons/fi';
import Button from './Button.jsx';
import { apiRequest } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function PincodeChecker({ pincode = '', area = '', onStatusChange = null }) {
  const { user } = useAuth();
  const clean = String(pincode || '').replace(/\D/g, '').slice(0, 6);

  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null);
  const [joining, setJoining] = useState(false);
  const [waitlistMsg, setWaitlistMsg] = useState('');
  const [contactInput, setContactInput] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setWaitlistMsg('');
    setError('');
    if (!/^\d{6}$/.test(clean)) {
      setResult(null);
      if (onStatusChange) onStatusChange(null);
      return;
    }

    let cancelled = false;
    setChecking(true);
    apiRequest(`/api/pincode/check?code=${encodeURIComponent(clean)}`)
      .then((data) => {
        if (cancelled) return;
        setResult(data);
        if (onStatusChange) onStatusChange(data);
      })
      .catch(() => {
        if (cancelled) return;
        setResult(null);
        if (onStatusChange) onStatusChange(null);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clean]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!/^\d{6}$/.test(clean)) return null;
  if (checking) {
    return (
      <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 6 }}>
        Checking delivery availability for {clean}...
      </div>
    );
  }
  if (!result) return null;

  if (result.serviceable) {
    return (
      <div
        style={{
          marginTop: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderRadius: 10,
          background: '#ecfdf3',
          border: '1px solid #bbf7d0',
          color: '#166534',
          fontSize: '0.84rem',
          fontWeight: 600,
        }}
      >
        <FiCheckCircle size={16} />
        <span>Delivery available in {result.pincode} </span>
        {/* ({result.city}) */}
      </div>
    );
  }

  const handleJoinWaitlist = async () => {
    const email = user?.email || (contactInput.includes('@') ? contactInput.trim() : '');
    const phone = user?.mobileNumber || user?.phone || (!contactInput.includes('@') ? contactInput.trim() : '');
    if (!email && !phone) {
      setError('Enter your email or mobile number to get notified.');
      return;
    }
    setJoining(true);
    setError('');
    try {
      const res = await apiRequest('/api/pincode/waitlist', {
        method: 'POST',
        body: JSON.stringify({
          pincode: result.pincode,
          area: String(area || '').trim(),
          name: user?.fullName || user?.name || '',
          email,
          phone,
        }),
      });
      setWaitlistMsg(res.message || `Added ${result.pincode} to expansion waitlist!`);
    } catch (err) {
      setError(err.message || 'Could not join waitlist.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div
      style={{
        marginTop: 8,
        padding: '10px 12px',
        borderRadius: 10,
        background: '#fef2f2',
        border: '1px solid #fecaca',
        color: '#991b1b',
        display: 'grid',
        gap: 8,
        fontSize: '0.84rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
        <FiAlertTriangle size={16} />
        <span>
          Orders unavailable for pincode {result.pincode} — we do not deliver to this pincode yet.
        </span>
      </div>

      {waitlistMsg ? (
        <div style={{ color: '#166534', fontWeight: 600 }}>✅ {waitlistMsg}</div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {!user?.email && !user?.mobileNumber && (
            <input
              type="text"
              placeholder="Email or mobile to notify"
              value={contactInput}
              onChange={(e) => setContactInput(e.target.value)}
              style={{
                flex: '1 1 180px',
                padding: '6px 10px',
                borderRadius: 8,
                border: '1px solid #fca5a5',
                background: '#fff',
              }}
            />
          )}
          <Button type="button" size="sm" variant="outline" disabled={joining} onClick={handleJoinWaitlist}>
            {joining ? 'Joining...' : `Notify Me When ${result.pincode} Opens`}
          </Button>
        </div>
      )}
      {error && <div style={{ color: '#b91c1c', fontWeight: 500 }}>{error}</div>}
    </div>
  );
}
