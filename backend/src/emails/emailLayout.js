/**
 * Shared HRUVITA Email Design System
 * Primary green: #174B30 | Fresh cream: #F2F7ED | Reward gold: #E5A83B | Charcoal: #334155
 */

export const BRAND = {
  primary: '#174B30',
  primaryDark: '#103622',
  cream: '#F2F7ED',
  gold: '#E5A83B',
  goldBg: '#FDF6E7',
  charcoal: '#334155',
  muted: '#64748B',
  border: '#DCE7D5',
  white: '#FFFFFF',
  siteUrl: process.env.FRONTEND_URL || 'http://localhost:5174',
};

export function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function ctaButton(label, href, bg = BRAND.primary) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 8px;">
      <tr>
        <td align="center" bgcolor="${bg}" style="border-radius:999px;">
          <a href="${escapeHtml(href)}" target="_blank" style="display:inline-block;padding:13px 28px;font-family:'Segoe UI',Arial,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.03em;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>
  `;
}

export function renderEmailLayout({
  preheader = '',
  badge = 'HRUVITA',
  title = '',
  subtitle = '',
  bodyHtml = '',
  accentColor = BRAND.primary,
}) {
  const safeUrl = escapeHtml(BRAND.siteUrl);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${escapeHtml(title || 'HRUVITA')}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.cream};font-family:'Segoe UI',Roboto,Arial,sans-serif;color:${BRAND.charcoal};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.cream};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;background:${BRAND.white};border-radius:20px;overflow:hidden;border:1px solid ${BRAND.border};box-shadow:0 8px 24px rgba(23,75,48,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,${BRAND.primary} 0%,${BRAND.primaryDark} 100%);padding:26px 28px;text-align:center;">
              <div style="font-size:24px;font-weight:800;letter-spacing:0.12em;color:#ffffff;">HRUVITA</div>
              <div style="font-size:11px;font-weight:600;letter-spacing:0.14em;color:#CBE3D2;margin-top:4px;text-transform:uppercase;">
                Fresh Food &bull; Healthy Living
              </div>
              ${badge ? `<div style="display:inline-block;margin-top:14px;padding:5px 14px;border-radius:999px;background:rgba(255,255,255,0.16);color:#ffffff;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">${escapeHtml(badge)}</div>` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 10px;">
              ${title ? `<h1 style="margin:0 0 6px;font-size:22px;line-height:1.3;color:${accentColor};">${escapeHtml(title)}</h1>` : ''}
              ${subtitle ? `<p style="margin:0 0 18px;font-size:14px;color:${BRAND.muted};">${escapeHtml(subtitle)}</p>` : ''}
              <div style="font-size:15px;line-height:1.65;color:${BRAND.charcoal};">
                ${bodyHtml}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 26px;border-top:1px solid ${BRAND.border};background:#FAFDF7;text-align:center;">
              <p style="margin:0 0 8px;font-size:12px;color:${BRAND.muted};">
                Freshness, happiness and goodness delivered to your doorstep.
              </p>
              <p style="margin:0;font-size:12px;">
                <a href="${safeUrl}/menu" style="color:${BRAND.primary};font-weight:600;text-decoration:none;">Menu</a>
                &nbsp;&middot;&nbsp;
                <a href="${safeUrl}/dashboard" style="color:${BRAND.primary};font-weight:600;text-decoration:none;">My Orders</a>
                &nbsp;&middot;&nbsp;
                <a href="${safeUrl}/contact" style="color:${BRAND.primary};font-weight:600;text-decoration:none;">Contact Us</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
