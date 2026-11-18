import { BRAND, ctaButton, escapeHtml, renderEmailLayout } from './emailLayout.js';

export function buildPasswordResetEmail({ fullName = 'Customer', resetUrl }) {
  const subject = 'Reset Your HRUVITA Password';
  const text = `Hello ${fullName},\n\nClick the link below to reset your HRUVITA password (valid for 15 minutes):\n${resetUrl}\n\nIf you did not request this, you can safely ignore this email.`;

  const bodyHtml = `
    <p style="margin:0 0 12px;">Hello <strong>${escapeHtml(fullName)}</strong>,</p>
    <p style="margin:0 0 16px;">
      We received a request to reset the password for your HRUVITA account. Click the secure button below to choose a new password:
    </p>
    ${ctaButton('Reset Password', resetUrl)}
    <div style="margin:18px 0;padding:14px;border-radius:12px;background:${BRAND.cream};border:1px solid ${BRAND.border};font-size:13px;color:${BRAND.charcoal};">
      <strong>Security Notice:</strong> This link expires in <strong>15 minutes</strong>. If you didn't request a password reset, please ignore this email—your account remains safe.
    </div>
    <p style="margin:0;font-size:12px;color:${BRAND.muted};word-break:break-all;">
      Button not working? Copy this link: ${escapeHtml(resetUrl)}
    </p>
  `;

  const html = renderEmailLayout({
    preheader: 'Reset your HRUVITA password (link valid for 15 minutes).',
    badge: 'Account Security',
    title: 'Password Reset Request',
    subtitle: 'Secure link valid for 15 minutes',
    bodyHtml,
  });

  return { subject, text, html };
}
