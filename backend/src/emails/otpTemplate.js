import { BRAND, escapeHtml, renderEmailLayout } from './emailLayout.js';

export function buildOtpEmail({ fullName = 'Customer', otp, mode = 'signup' }) {
  const isLogin = mode === 'login';
  const subject = isLogin
    ? 'HRUVITA Security Verification — Your 6-Digit Login OTP'
    : 'Verify Your HRUVITA Account — 6-Digit OTP';

  const intro = isLogin
    ? 'We noticed a sign-in attempt to your HRUVITA account. Enter the verification code below to continue safely:'
    : 'Thank you for choosing HRUVITA! Enter the One-Time Password below to verify your email and activate your account:';

  const text = `Hello ${fullName},\n\n${intro}\n\nOTP: ${otp}\n\nExpires in 10 minutes. Never share this code with anyone.`;

  const bodyHtml = `
    <p style="margin:0 0 12px;">Hello <strong>${escapeHtml(fullName)}</strong>,</p>
    <p style="margin:0 0 18px;">${escapeHtml(intro)}</p>
    <div style="margin:20px 0;padding:20px;border-radius:16px;background:${BRAND.cream};border:2px dashed ${BRAND.primary};text-align:center;">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;color:${BRAND.muted};text-transform:uppercase;margin-bottom:8px;">
        One-Time Verification Code
      </div>
      <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:${BRAND.primary};font-family:monospace;">
        ${escapeHtml(otp)}
      </div>
      <div style="display:inline-block;margin-top:12px;padding:4px 12px;border-radius:999px;background:${BRAND.goldBg};color:#9A6700;font-size:12px;font-weight:700;">
        &#9201; Valid for 10 minutes
      </div>
    </div>
    <p style="margin:0;font-size:13px;color:${BRAND.muted};">
      For your security, HRUVITA will never call or message you asking for this code.
    </p>
  `;

  const html = renderEmailLayout({
    preheader: `Your HRUVITA OTP is ${otp} (valid for 10 minutes).`,
    badge: isLogin ? 'Security Verification' : 'Email Verification',
    title: isLogin ? 'Login Verification Code' : 'Verify Your Email Address',
    subtitle: 'A healthier choice starts here.',
    bodyHtml,
  });

  return { subject, text, html };
}
