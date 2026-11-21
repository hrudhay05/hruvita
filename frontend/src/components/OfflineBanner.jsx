import { useEffect, useState } from 'react';

export default function OfflineBanner() {
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine !== false : true
  );
  const [justRestored, setJustRestored] = useState(false);

  useEffect(() => {
    let timer = null;
    const handleOffline = () => {
      if (timer) clearTimeout(timer);
      setJustRestored(false);
      setOnline(false);
    };
    const handleOnline = () => {
      setOnline(true);
      setJustRestored(true);
      timer = setTimeout(() => setJustRestored(false), 3000);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (online && !justRestored) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 9999,
        padding: '8px 16px',
        textAlign: 'center',
        fontSize: '0.84rem',
        fontWeight: 600,
        color: '#fff',
        background: online ? '#15803d' : '#991b1b',
        boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
      }}
    >
      {online
        ? '✅ Back online! Live menu & order updates reconnected.'
        : '📡 You are offline — browsing cached menu. We will reconnect automatically when internet returns.'}
    </div>
  );
}
