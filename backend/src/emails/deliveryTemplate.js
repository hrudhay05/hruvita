import { BRAND, ctaButton, escapeHtml, renderEmailLayout } from './emailLayout.js';

export function buildDeliveryPartnerWelcomeEmail({ fullName, email }) {
  const subject = 'Welcome to the HRUVITA Delivery Team!';
  const text = `Hello ${fullName},\n\nYour HRUVITA Delivery Partner account (${email}) is now active. Sign in at ${BRAND.siteUrl}/delivery using the password configured by your administrator.`;
  const bodyHtml = `
    <p style="margin:0 0 12px;">Hello <strong>${escapeHtml(fullName)}</strong>,</p>
    <p style="margin:0 0 16px;">Welcome aboard! Your HRUVITA Delivery Partner account (<strong>${escapeHtml(email)}</strong>) is active and ready for deliveries.</p>
    <div style="padding:14px 16px;border-radius:14px;background:${BRAND.cream};border:1px solid ${BRAND.border};font-size:13px;">
      Use your registered email or mobile number and your administrator-assigned password on the Delivery Portal to sign in and toggle your online availability.
    </div>
    ${ctaButton('Open Delivery Portal', `${BRAND.siteUrl}/delivery`)}
  `;
  const html = renderEmailLayout({
    preheader: 'Your HRUVITA Delivery Partner account is active.',
    badge: 'Delivery Partner Onboarding',
    title: 'Welcome to HRUVITA Delivery',
    subtitle: 'Fresh food delivered with care',
    bodyHtml,
  });
  return { subject, text, html };
}

export function buildDeliveryPartnerEmail({ orderId, partnerName, partnerPhone, isReassign = false, address = '' }) {
  const title = isReassign
    ? `Delivery Partner Updated (${orderId})`
    : `Delivery Partner Assigned (${orderId})`;
  const text = `${title}\n\nPartner: ${partnerName}\nPhone: ${partnerPhone}\n${address ? `Address: ${address}\n` : ''}Track your delivery: ${BRAND.siteUrl}/dashboard`;
  const bodyHtml = `
    <p style="margin:0 0 14px;">Your HRUVITA delivery partner ${isReassign ? 'has been updated' : 'has been assigned'} for order <strong>${escapeHtml(orderId)}</strong>.</p>
    <div style="padding:16px;border-radius:14px;background:${BRAND.cream};border:1px solid ${BRAND.border};margin-bottom:16px;">
      <div style="font-size:12px;color:${BRAND.muted};text-transform:uppercase;font-weight:700;">Delivery Partner</div>
      <div style="font-size:18px;font-weight:800;color:${BRAND.primary};margin:4px 0;">${escapeHtml(partnerName)}</div>
      <div style="font-size:14px;color:${BRAND.charcoal};">Phone: <strong>${escapeHtml(partnerPhone)}</strong></div>
      ${address ? `<div style="font-size:13px;color:${BRAND.muted};margin-top:6px;">Address: ${escapeHtml(address)}</div>` : ''}
    </div>
    ${partnerPhone ? ctaButton('Call Delivery Partner', `tel:${partnerPhone}`) : ''}
  `;
  const html = renderEmailLayout({
    preheader: `${partnerName} (${partnerPhone}) is assigned to order ${orderId}.`,
    badge: isReassign ? 'Partner Reassigned' : 'Delivery Update',
    title,
    subtitle: 'Fresh food on the way to your doorstep',
    bodyHtml,
  });
  return { subject: `[HRUVITA] ${title}`, text, html };
}

export function buildDeliveryOtpEmail({ customerName = 'Customer', orderId, otp, partnerName = '' }) {
  const subject = `Delivery Verification OTP for Order ${orderId} — HRUVITA`;
  const text = `Hello ${customerName},\n\nShare this 6-digit Delivery OTP with ${partnerName || 'your delivery partner'} ONLY when you receive order ${orderId}:\n\nDelivery OTP: ${otp}\n\nValid for 10 minutes.`;
  const bodyHtml = `
    <p style="margin:0 0 12px;">Hello <strong>${escapeHtml(customerName)}</strong>,</p>
    <p style="margin:0 0 16px;">Your order <strong>${escapeHtml(orderId)}</strong> is out for delivery${partnerName ? ` with <strong>${escapeHtml(partnerName)}</strong>` : ''}. Please share the OTP below at your doorstep to confirm delivery:</p>
    <div style="margin:18px 0;padding:18px;border-radius:16px;background:${BRAND.cream};border:2px dashed ${BRAND.primary};text-align:center;">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;color:${BRAND.muted};text-transform:uppercase;">Delivery Completion OTP</div>
      <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:${BRAND.primary};font-family:monospace;margin:8px 0;">${escapeHtml(otp)}</div>
      <div style="font-size:12px;color:#9A6700;font-weight:700;">Expires in 10 minutes</div>
    </div>
  `;
  const html = renderEmailLayout({
    preheader: `Delivery OTP ${otp} for order ${orderId}`,
    badge: 'Doorstep Verification',
    title: `Delivery OTP for ${orderId}`,
    subtitle: 'Share only upon receiving your order',
    bodyHtml,
  });
  return { subject, text, html };
}

export function buildDeliveryLifecycleEmail({ orderId, stage, partnerName = '', partnerPhone = '', reason = '' }) {
  const titles = {
    accepted: `Delivery Partner Accepted Order (${orderId})`,
    out_for_delivery: `Out for Delivery (${orderId})`,
    delivered: `Order Delivered Successfully (${orderId})`,
    failed: `Delivery Attempt Update (${orderId})`,
  };
  const title = titles[stage] || `Delivery Update (${orderId})`;
  const isFailed = stage === 'failed';
  const text = `${title}\n${partnerName ? `Partner: ${partnerName} (${partnerPhone})\n` : ''}${reason ? `Note: ${reason}\n` : ''}View order: ${BRAND.siteUrl}/dashboard`;

  const bodyHtml = `
    <div style="padding:16px;border-radius:14px;background:${isFailed ? '#FEF2F2' : BRAND.cream};border:1px solid ${isFailed ? '#FECACA' : BRAND.border};margin-bottom:16px;">
      <strong style="display:block;font-size:16px;color:${isFailed ? '#B91C1C' : BRAND.primary};margin-bottom:6px;">${escapeHtml(title)}</strong>
      ${partnerName ? `<p style="margin:0 0 6px;font-size:14px;">Delivery Partner: <strong>${escapeHtml(partnerName)}</strong> ${partnerPhone ? `(${escapeHtml(partnerPhone)})` : ''}</p>` : ''}
      ${reason ? `<p style="margin:0;font-size:14px;color:${BRAND.charcoal};">Details: ${escapeHtml(reason)}</p>` : ''}
    </div>
    ${ctaButton(stage === 'delivered' ? 'Rate Your Delivery' : 'Track Order', `${BRAND.siteUrl}/dashboard`, isFailed ? '#B91C1C' : BRAND.primary)}
  `;
  const html = renderEmailLayout({
    preheader: title,
    badge: isFailed ? 'Delivery Exception' : 'Delivery Status',
    title,
    subtitle: 'HRUVITA Delivery Care',
    bodyHtml,
    accentColor: isFailed ? '#B91C1C' : BRAND.primary,
  });
  return { subject: `[HRUVITA] ${title}`, text, html };
}
