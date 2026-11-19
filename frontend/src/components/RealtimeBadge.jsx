import { useSocket } from '../context/SocketContext.jsx';

export default function RealtimeBadge() {
  const ctx = useSocket();
  const status = ctx?.status || 'offline';

  const meta =
    status === 'connected'
      ? { color: '#16a34a', bg: '#ecfdf5', text: 'Live' }
      : status === 'reconnecting'
        ? { color: '#d97706', bg: '#fffbeb', text: 'Reconnecting...' }
        : { color: '#dc2626', bg: '#fef2f2', text: 'Offline' };

  return (
    <span
      title={`Real-time status: ${meta.text}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 999,
        background: meta.bg,
        color: meta.color,
        fontSize: '0.74rem',
        fontWeight: 700,
        border: `1px solid ${meta.color}33`,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: meta.color,
          display: 'inline-block',
        }}
      />
      {meta.text}
    </span>
  );
}
