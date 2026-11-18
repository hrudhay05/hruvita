import { useState } from 'react';

const PALETTE = ['#1b4d38', '#689f63', '#d98245', '#2c6e52', '#8db886', '#c44545', '#5f6761'];

export function BarTrendChart({ data = [], xKey = 'label', yKey = 'value', prefix = '', height = 220 }) {
  const [hoverIdx, setHoverIdx] = useState(-1);
  if (!data.length) {
    return <p className="ana-empty">No data available for this date range.</p>;
  }
  const maxVal = Math.max(1, ...data.map((d) => Number(d[yKey]) || 0));
  const w = 520;
  const pad = 28;
  const barW = Math.max(14, Math.floor((w - pad * 2) / Math.max(1, data.length) - 8));

  return (
    <div className="ana-chart-wrap">
      {hoverIdx >= 0 && data[hoverIdx] && (
        <div className="ana-tooltip">
          <strong>{data[hoverIdx][xKey]}</strong>: {prefix}
          {Number(data[hoverIdx][yKey] || 0).toLocaleString('en-IN')}
        </div>
      )}
      <svg viewBox={`0 0 ${w} ${height}`} className="ana-svg" role="img" aria-label="Bar chart">
        <line x1={pad} y1={height - 28} x2={w - pad} y2={height - 28} stroke="#e7e2d6" strokeWidth="1" />
        {data.map((d, i) => {
          const val = Number(d[yKey]) || 0;
          const bh = Math.round(((height - 52) * val) / maxVal);
          const step = (w - pad * 2) / data.length;
          const x = pad + i * step + (step - barW) / 2;
          const y = height - 28 - bh;
          return (
            <g
              key={`${d[xKey]}-${i}`}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(-1)}
              style={{ cursor: 'pointer' }}
            >
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(2, bh)}
                rx="6"
                fill={hoverIdx === i ? '#d98245' : '#1b4d38'}
              />
              <text
                x={x + barW / 2}
                y={height - 10}
                textAnchor="middle"
                fontSize="10"
                fill="#5f6761"
              >
                {String(d[xKey]).slice(0, 8)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function LineTrendChart({ data = [], xKey = 'date', yKey = 'revenue', prefix = '₹', height = 220 }) {
  const [hoverIdx, setHoverIdx] = useState(-1);
  if (!data.length) {
    return <p className="ana-empty">No trend data available for this date range.</p>;
  }
  const maxVal = Math.max(1, ...data.map((d) => Number(d[yKey]) || 0));
  const w = 520;
  const pad = 32;
  const usableW = w - pad * 2;
  const usableH = height - 54;

  const pts = data.map((d, i) => {
    const val = Number(d[yKey]) || 0;
    const x = data.length === 1 ? w / 2 : pad + (i / (data.length - 1)) * usableW;
    const y = height - 28 - (val / maxVal) * usableH;
    return { x, y, val, label: d[xKey] };
  });

  const polyline = pts.map((p) => `${p.x},${p.y}`).join(' ');
  const area = `${pad},${height - 28} ${polyline} ${pts[pts.length - 1].x},${height - 28}`;

  return (
    <div className="ana-chart-wrap">
      {hoverIdx >= 0 && pts[hoverIdx] && (
        <div className="ana-tooltip">
          <strong>{pts[hoverIdx].label}</strong>: {prefix}
          {pts[hoverIdx].val.toLocaleString('en-IN')}
        </div>
      )}
      <svg viewBox={`0 0 ${w} ${height}`} className="ana-svg" role="img" aria-label="Line chart">
        <line x1={pad} y1={height - 28} x2={w - pad} y2={height - 28} stroke="#e7e2d6" strokeWidth="1" />
        {pts.length > 1 && <polygon points={area} fill="rgba(104, 159, 99, 0.18)" />}
        {pts.length > 1 && (
          <polyline fill="none" stroke="#1b4d38" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={polyline} />
        )}
        {pts.map((p, i) => (
          <g
            key={`${p.label}-${i}`}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(-1)}
            style={{ cursor: 'pointer' }}
          >
            <circle cx={p.x} cy={p.y} r={hoverIdx === i ? 6 : 4} fill={hoverIdx === i ? '#d98245' : '#1b4d38'} />
            {(data.length <= 8 || i === 0 || i === data.length - 1 || i % Math.ceil(data.length / 6) === 0) && (
              <text x={p.x} y={height - 10} textAnchor="middle" fontSize="10" fill="#5f6761">
                {String(p.label).slice(5, 10) || String(p.label).slice(0, 8)}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

export function DonutBreakdownChart({ data = [] }) {
  const total = data.reduce((s, d) => s + (Number(d.value) || 0), 0);
  if (!data.length || total <= 0) {
    return <p className="ana-empty">No breakdown data available.</p>;
  }

  let cumulative = 0;
  const radius = 56;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="ana-donut-wrap">
      <svg viewBox="0 0 160 160" className="ana-donut-svg" role="img" aria-label="Breakdown chart">
        <circle cx="80" cy="80" r={radius} fill="none" stroke="#f3ede2" strokeWidth="22" />
        {data.map((d, i) => {
          const val = Number(d.value) || 0;
          const pct = val / total;
          const dash = pct * circumference;
          const offset = -(cumulative * circumference);
          cumulative += pct;
          return (
            <circle
              key={`${d.label}-${i}`}
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke={PALETTE[i % PALETTE.length]}
              strokeWidth="22"
              strokeDasharray={`${dash} ${circumference}`}
              strokeDashoffset={offset}
              transform="rotate(-90 80 80)"
            />
          );
        })}
        <text x="80" y="78" textAnchor="middle" fontSize="16" fontWeight="700" fill="#1b4d38">
          {total.toLocaleString('en-IN')}
        </text>
        <text x="80" y="95" textAnchor="middle" fontSize="10" fill="#5f6761">
          Total
        </text>
      </svg>
      <ul className="ana-legend">
        {data.map((d, i) => {
          const pct = Math.round(((Number(d.value) || 0) / total) * 100);
          return (
            <li key={`${d.label}-${i}`}>
              <span className="ana-dot" style={{ background: PALETTE[i % PALETTE.length] }} />
              <span className="ana-leg-lbl">{d.label}</span>
              <strong>{d.value} ({pct}%)</strong>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
