import { BRAND, ctaButton, escapeHtml, renderEmailLayout } from './emailLayout.js';

export function buildWelcomeEmail({ to, fullName = 'Friend', referralCode = '', rewardPoints = 25 }) {
  const subject = 'Welcome to HRUVITA! Your Account Is Verified';
  const text = `Welcome to HRUVITA, ${fullName}!\n\nYour account (${to}) is verified.\n\nWelcome Rewards:\n- ${rewardPoints} Points added to your wallet\n- Use coupon WELCOME20 for 20% OFF your first order\n${referralCode ? `- Your Referral Code: ${referralCode}\n` : ''}\nExplore our menu: ${BRAND.siteUrl}/menu`;

  const bodyHtml = `
    <p style="margin:0 0 12px;">Hello <strong>${escapeHtml(fullName)}</strong>,</p>
    <p style="margin:0 0 18px;">
      Your account (<strong>${escapeHtml(to)}</strong>) is verified and active. We're excited to serve you fresh South Indian breakfasts, custom fruit bowls, and cold-pressed juices!
    </p>
    <div style="margin:20px 0;padding:18px;border-radius:16px;background:${BRAND.goldBg};border:1px solid #F2D79B;">
      <div style="font-size:11px;font-weight:800;letter-spacing:0.1em;color:#9A6700;text-transform:uppercase;margin-bottom:10px;">
        Your Welcome Rewards
      </div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding:8px 10px;background:#ffffff;border-radius:10px;border:1px solid #F2E3BE;">
            <strong style="color:${BRAND.primary};font-size:16px;">${escapeHtml(rewardPoints)} Points &#127873;</strong>
            <div style="font-size:12px;color:${BRAND.muted};">Added to your rewards wallet</div>
          </td>
          <td width="10"></td>
          <td style="padding:8px 10px;background:#ffffff;border-radius:10px;border:1px solid #F2E3BE;">
            <strong style="color:${BRAND.primary};font-size:16px;">WELCOME20</strong>
            <div style="font-size:12px;color:${BRAND.muted};">20% OFF your first order</div>
          </td>
        </tr>
      </table>
      ${referralCode ? `<p style="margin:12px 0 0;font-size:13px;color:${BRAND.charcoal};">Share &amp; Earn Referral Code: <strong style="color:${BRAND.primary};">${escapeHtml(referralCode)}</strong></p>` : ''}
    </div>
    ${ctaButton('EXPLORE OUR MENU', `${BRAND.siteUrl}/menu`)}
  `;

  const html = renderEmailLayout({
    preheader: `Welcome to HRUVITA! ${rewardPoints} reward points + WELCOME20 inside.`,
    badge: 'Account Verified',
    title: 'Welcome to HRUVITA!',
    subtitle: 'Freshness, happiness and goodness delivered to your doorstep.',
    bodyHtml,
  });

  return { subject, text, html };
}
