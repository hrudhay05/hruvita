import nodemailer from 'nodemailer';
import { createNotification } from '../store/repository.js';

let cachedTransporter = null;

async function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const port = Number(process.env.SMTP_PORT) || 587;

  if (host && user && pass) {
    cachedTransporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    return cachedTransporter;
  }

  try {
    const testAccount = await nodemailer.createTestAccount();
    cachedTransporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    return cachedTransporter;
  } catch {
    cachedTransporter = nodemailer.createTransport({ jsonTransport: true });
    return cachedTransporter;
  }
}

export async function sendMailViaNodemailer({ to, subject, html, text }) {
  try {
    const transporter = await getTransporter();
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"HRUVITA" <no-reply@hruvita.com>',
      to,
      subject,
      text,
      html,
    });
    const previewUrl = nodemailer.getTestMessageUrl(info) || '';
    if (previewUrl) {
      console.log(`[Nodemailer] Email sent to ${to} (${subject}) | Preview: ${previewUrl}`);
    } else {
      console.log(`[Nodemailer] Email sent to ${to} (${subject})`);
    }
    return { sent: true, messageId: info.messageId, previewUrl };
  } catch (err) {
    console.warn(`[Nodemailer Warning] Could not send email to ${to}: ${err.message}`);
    return { sent: false, error: err.message };
  }
}

export async function sendOtpEmail({ to, fullName, otp, mode = 'signup' }) {
  const isLogin = mode === 'login';
  const subject = isLogin
    ? 'HRUVITA Login Verification — Your 6-Digit OTP'
    : 'Verify Your HRUVITA Account — 6-Digit OTP';
  const heading = isLogin ? 'HRUVITA Login OTP Verification' : 'HRUVITA Email Verification';
  const intro = isLogin
    ? 'Use the following 6-digit One-Time Password (OTP) to complete signing in to your HRUVITA account:'
    : 'Use the following 6-digit One-Time Password (OTP) to verify your email address:';

  const text = `Hello ${fullName},\n\n${intro}\n\nOTP: ${otp}\n\nThis code expires in 10 minutes. Do not share this code with anyone.`;
  const html = `
    <div style="font-family:Poppins,sans-serif;max-width:520px;margin:auto;padding:28px;border:1px solid #e5eadf;border-radius:16px;background:#ffffff;">
      <h2 style="color:#14532d;margin:0 0 8px;">${heading}</h2>
      <p style="color:#334155;">Hello <strong>${fullName}</strong>,</p>
      <p style="color:#334155;">${intro}</p>
      <div style="margin:22px 0;padding:16px;text-align:center;background:#f3faf5;border:2px dashed #1f7a3d;border-radius:12px;font-size:28px;font-weight:700;letter-spacing:8px;color:#14532d;">
        ${otp}
      </div>
      <p style="color:#64748b;font-size:13px;">This OTP expires in <strong>10 minutes</strong>.</p>
    </div>
  `;
  return sendMailViaNodemailer({ to, subject, text, html });
}

export async function sendAccountCreatedCongratsEmail({ to, fullName, referralCode = '', rewardPoints = 25 }) {
  const subject = '🎉 Congratulations! Your HRUVITA Account Has Been Successfully Created';
  const text = `Congratulations ${fullName}!\n\nYour HRUVITA account (${to}) has been verified and created successfully.\n\nWe have credited ${rewardPoints} Welcome Reward Points to your wallet, and you can use coupon code WELCOME20 for 20% OFF your first order!\n\nYour Referral Code: ${referralCode}\n\nThank you for joining HRUVITA — Fresh Food. Healthy Living. Smart Ordering.`;
  const html = `
    <div style="font-family:Poppins,sans-serif;max-width:540px;margin:auto;padding:30px;border:1px solid #e5eadf;border-radius:18px;background:#ffffff;">
      <div style="text-align:center;padding-bottom:16px;border-bottom:1px solid #e5eadf;">
        <span style="display:inline-block;padding:6px 14px;border-radius:999px;background:#e6f4ea;color:#14532d;font-size:12px;font-weight:700;">ACCOUNT VERIFIED &amp; ACTIVE</span>
        <h2 style="color:#14532d;margin:12px 0 4px;">🎉 Congratulations, ${fullName}!</h2>
        <p style="color:#5d6e63;margin:0;font-size:14px;">Welcome to the HRUVITA family</p>
      </div>
      <div style="padding:20px 0;color:#1b2a20;line-height:1.6;font-size:14px;">
        <p>Your email address (<strong>${to}</strong>) has been verified and your account is now ready.</p>
        <div style="margin:18px 0;padding:16px;border-radius:12px;background:#fdf8ee;border:1px solid #f6ecd6;">
          <strong style="color:#14532d;display:block;margin-bottom:6px;">🎁 Your Welcome Perks:</strong>
          <div>• <strong>${rewardPoints} Reward Points</strong> added to your wallet</div>
          <div>• Use code <strong>WELCOME20</strong> for 20% OFF your first order</div>
          ${referralCode ? `<div>• Your Referral Code: <strong>${referralCode}</strong></div>` : ''}
        </div>
        <p>Start exploring fresh South Indian breakfast tiffins, fruit bowls, and cold-pressed juices!</p>
      </div>
      <div style="padding-top:14px;border-top:1px solid #e5eadf;text-align:center;color:#5d6e63;font-size:12px;">
        HRUVITA &bull; Fresh Food. Healthy Living. Smart Ordering.
      </div>
    </div>
  `;
  return sendMailViaNodemailer({ to, subject, text, html });
}

export async function sendPasswordResetEmail({ to, fullName, resetUrl }) {
  const subject = 'Reset Your HRUVITA Password';
  const text = `Hello ${fullName},\n\nClick the link below to reset your HRUVITA password (valid for 15 minutes):\n${resetUrl}\n\nIf you did not request this, you can safely ignore this email.`;
  const html = `
    <div style="font-family:Poppins,sans-serif;max-width:520px;margin:auto;padding:28px;border:1px solid #e5eadf;border-radius:16px;background:#ffffff;">
      <h2 style="color:#14532d;margin:0 0 8px;">Password Reset Request</h2>
      <p style="color:#334155;">Hello <strong>${fullName}</strong>,</p>
      <p style="color:#334155;">We received a request to reset your password. Click the button below to choose a new password (expires in 15 minutes):</p>
      <div style="margin:24px 0;">
        <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#1f7a3d;color:#ffffff;text-decoration:none;border-radius:999px;font-weight:600;">Reset Password</a>
      </div>
      <p style="color:#64748b;font-size:12px;word-break:break-all;">Or copy this link: ${resetUrl}</p>
    </div>
  `;
  return sendMailViaNodemailer({ to, subject, text, html });
}

export async function sendUserNotification({
  userId,
  email,
  type = 'order',
  title,
  message,
}) {
  if (email) {
    await sendMailViaNodemailer({
      to: email,
      subject: `[HRUVITA] ${title}`,
      text: message,
      html: `<div style="font-family:sans-serif;max-width:520px;margin:auto;padding:24px;border:1px solid #e5eadf;border-radius:12px;">
        <h2 style="color:#14532d;margin-top:0;">HRUVITA</h2>
        <h3>${title}</h3>
        <p style="color:#334155;line-height:1.6;">${message}</p>
      </div>`,
    });
  }

  if (userId) {
    return createNotification({
      userId,
      type,
      title,
      message,
      emailSent: Boolean(email),
    });
  }
  return null;
}
