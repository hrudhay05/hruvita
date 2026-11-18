import { BRAND, ctaButton, escapeHtml, renderEmailLayout } from './emailLayout.js';

export function buildDeliveryPartnerEmail({ orderId, partnerName, partnerPhone, isReassign = false }) {
  const title = isReassign
    ? `Delivery Partner Updated (${orderId})`
    : `Delivery Partner Assigned (${orderId})`;
  const text = `${title}\n\nPartner: ${partnerName}\nPhone: ${partnerPhone}\n\nTrack your delivery: ${BRAND.siteUrl}/dashboard`;

  const bodyHtml = `
    <p style="margin:0 0 14px;">Great news! Your HRUVITA delivery partner ${isReassign ? 'has been updated' : 'has been assigned'} for order <strong>${escapeHtml(orderId)}</strong>.</p>
    <div style="padding:16px;border-radius:14px;background:${BRAND.cream};border:1px solid ${BRAND.border};margin-bottom:16px;">
      <div style="font-size:12px;color:${BRAND.muted};text-transform:uppercase;font-weight:700;">Delivery Partner</div>
      <div style="font-size:18px;font-weight:800;color:${BRAND.primary};margin:4px 0;">${escapeHtml(partnerName)}</div>
      <div style="font-size:14px;color:${BRAND.charcoal};">Phone: <strong>${escapeHtml(partnerPhone)}</strong></div>
    </div>
    ${partnerPhone ? ctaButton('Call Delivery Partner', `tel:${partnerPhone}`) : ''}
  `;

  const html = renderEmailLayout({
    preheader: `${partnerName} (${partnerPhone}) is delivering your order ${orderId}.`,
    badge: 'Delivery Update',
    title,
    subtitle: 'Fresh food on the way to your doorstep',
    bodyHtml,
  });

  return { subject: `[HRUVITA] ${title}`, text, html };
}
