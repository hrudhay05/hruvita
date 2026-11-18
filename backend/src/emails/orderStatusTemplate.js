import { BRAND, ctaButton, escapeHtml, renderEmailLayout } from './emailLayout.js';

export function buildOrderStatusEmail({ title, message, status = 'order', orderId = '' }) {
  const lower = `${status} ${title}`.toLowerCase();
  const isCancelled = lower.includes('cancel') || lower.includes('refund') || lower.includes('fail');
  const isDelivered = lower.includes('deliver') && !lower.includes('out for');
  const isSubscription = lower.includes('subscription');

  const badge = isSubscription
    ? 'Subscription Update'
    : isCancelled
      ? 'Order Update'
      : isDelivered
        ? 'Order Delivered'
        : 'Live Order Status';

  const ctaLabel = isDelivered ? 'Rate & Review Your Meal' : 'View Order Status';
  const ctaHref = `${BRAND.siteUrl}/dashboard`;
  const text = `${title}\n\n${message}\n\nView details: ${ctaHref}`;

  const bodyHtml = `
    <div style="padding:16px;border-radius:14px;background:${isCancelled ? '#FEF2F2' : BRAND.cream};border:1px solid ${isCancelled ? '#FECACA' : BRAND.border};margin-bottom:16px;">
      <strong style="display:block;font-size:15px;color:${isCancelled ? '#B91C1C' : BRAND.primary};margin-bottom:6px;">
        ${escapeHtml(title)}
      </strong>
      <p style="margin:0;font-size:14px;color:${BRAND.charcoal};line-height:1.6;">
        ${escapeHtml(message)}
      </p>
      ${orderId ? `<div style="margin-top:8px;font-size:12px;color:${BRAND.muted};">Reference ID: <strong>${escapeHtml(orderId)}</strong></div>` : ''}
    </div>
    ${ctaButton(ctaLabel, ctaHref, isCancelled ? '#B91C1C' : BRAND.primary)}
  `;

  const html = renderEmailLayout({
    preheader: message,
    badge,
    title,
    subtitle: 'HRUVITA Order & Subscription Care',
    bodyHtml,
    accentColor: isCancelled ? '#B91C1C' : BRAND.primary,
  });

  return { subject: `[HRUVITA] ${title}`, text, html };
}
