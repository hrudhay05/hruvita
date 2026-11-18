import { BRAND, ctaButton, escapeHtml, renderEmailLayout } from './emailLayout.js';

export function buildAdminAlertEmail({ title, description, category = 'system', entityId = '' }) {
  const text = `[HRUVITA Admin Alert - ${category.toUpperCase()}] ${title}\n\n${description}\n${entityId ? `Record: ${entityId}\n` : ''}Open Admin Console: ${BRAND.siteUrl}/admin`;

  const bodyHtml = `
    <div style="padding:16px;border-radius:14px;background:${BRAND.cream};border-left:4px solid ${BRAND.gold};">
      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:${BRAND.primary};margin-bottom:6px;">
        Category: ${escapeHtml(category)}
      </div>
      <div style="font-size:16px;font-weight:700;color:${BRAND.charcoal};margin-bottom:6px;">
        ${escapeHtml(title)}
      </div>
      <p style="margin:0;font-size:14px;color:${BRAND.muted};">${escapeHtml(description)}</p>
      ${entityId ? `<p style="margin:8px 0 0;font-size:12px;">Record ID: <strong>${escapeHtml(entityId)}</strong></p>` : ''}
    </div>
    ${ctaButton('Open Admin Console', `${BRAND.siteUrl}/admin`)}
  `;

  const html = renderEmailLayout({
    preheader: title,
    badge: 'Admin Notification',
    title: 'HRUVITA Operational Alert',
    subtitle: 'Automated platform monitoring',
    bodyHtml,
  });

  return { subject: `[HRUVITA Admin] ${title}`, text, html };
}
