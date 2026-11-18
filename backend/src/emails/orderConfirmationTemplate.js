import { BRAND, ctaButton, escapeHtml, renderEmailLayout } from './emailLayout.js';

export function buildOrderConfirmationEmail({ order }) {
  const subject = `Order Confirmed (${order.id}) — HRUVITA`;
  const itemsText = (order.items || [])
    .map((it) => `- ${it.name} x ${it.qty}: ₹${it.lineTotal}`)
    .join('\n');
  const text = `Hello ${order.customerName},\n\nYour HRUVITA order ${order.id} is confirmed!\n\nItems:\n${itemsText}\n\nTotal: ₹${order.pricing?.grandTotal || 0}\nDelivery: ${order.scheduledDate} (${order.slotLabel})\nTrack your order: ${BRAND.siteUrl}/dashboard`;

  const rowsHtml = (order.items || [])
    .map(
      (it) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid ${BRAND.border};font-size:14px;">${escapeHtml(it.name)} &times; <strong>${Number(it.qty || 1)}</strong></td>
        <td align="right" style="padding:8px 0;border-bottom:1px solid ${BRAND.border};font-size:14px;font-weight:600;">&#8377;${Number(it.lineTotal || 0)}</td>
      </tr>`
    )
    .join('');

  const bodyHtml = `
    <p style="margin:0 0 12px;">Hello <strong>${escapeHtml(order.customerName || 'Customer')}</strong>,</p>
    <p style="margin:0 0 16px;">Thank you for ordering with HRUVITA! Our kitchen has received your order.</p>
    <div style="padding:14px 16px;border-radius:14px;background:${BRAND.cream};border:1px solid ${BRAND.border};margin-bottom:16px;">
      <div style="font-size:13px;color:${BRAND.muted};">Order Number</div>
      <div style="font-size:18px;font-weight:800;color:${BRAND.primary};">${escapeHtml(order.id)}</div>
      <div style="font-size:13px;margin-top:6px;">
        <strong>Schedule:</strong> ${escapeHtml(order.scheduledDate)} &bull; ${escapeHtml(order.slotLabel)}<br/>
        <strong>Payment:</strong> ${escapeHtml((order.paymentMethod || '').toUpperCase())} (${escapeHtml(order.paymentStatus || 'pending')})
      </div>
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;">
      ${rowsHtml}
      <tr>
        <td style="padding:10px 0 4px;font-size:15px;font-weight:800;color:${BRAND.primary};">Grand Total</td>
        <td align="right" style="padding:10px 0 4px;font-size:16px;font-weight:800;color:${BRAND.primary};">&#8377;${Number(order.pricing?.grandTotal || 0)}</td>
      </tr>
    </table>
    <div style="padding:12px 14px;border-radius:12px;background:#FAFDF7;border:1px solid ${BRAND.border};font-size:13px;">
      <strong>Delivery Address:</strong><br/>
      ${escapeHtml(order.address?.recipient || '')} &bull; ${escapeHtml(order.address?.line1 || '')}, ${escapeHtml(order.address?.pincode || '')}
    </div>
    ${ctaButton('Track Your Order', `${BRAND.siteUrl}/dashboard`)}
  `;

  const html = renderEmailLayout({
    preheader: `Order ${order.id} confirmed — ₹${order.pricing?.grandTotal || 0}.`,
    badge: 'Order Confirmed',
    title: `Order ${order.id} Confirmed`,
    subtitle: 'Freshly queued for preparation',
    bodyHtml,
  });

  return { subject, text, html };
}
