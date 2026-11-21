import nodemailer from 'nodemailer';
import { createNotification } from '../store/repository.js';
import { sendPushToUser } from '../utils/webPushService.js';
import { buildOtpEmail } from '../emails/otpTemplate.js';
import { buildWelcomeEmail } from '../emails/welcomeTemplate.js';
import { buildPasswordResetEmail } from '../emails/passwordResetTemplate.js';
import { buildOrderConfirmationEmail } from '../emails/orderConfirmationTemplate.js';
import { buildOrderStatusEmail } from '../emails/orderStatusTemplate.js';
import {
  buildDeliveryPartnerWelcomeEmail,
  buildDeliveryPartnerEmail,
  buildDeliveryOtpEmail,
  buildDeliveryLifecycleEmail,
} from '../emails/deliveryTemplate.js';
import { buildAdminAlertEmail } from '../emails/adminAlertTemplate.js';

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
      connectionTimeout: 7000,
      greetingTimeout: 7000,
      socketTimeout: 10000,
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

// Pause all outgoing emails in both local and deployed environments.
const TEMP_PAUSE_ALL_EMAILS = true;
// Send emails ONLY for Signup/Login OTP, Order Confirmation, and Order Delivered.
const RESTRICTED_EMAIL_MODE = true;

export async function sendMailViaNodemailer({ to, subject, html, text }) {
  if (TEMP_PAUSE_ALL_EMAILS) {
    return { sent: false, skipped: true };
  }

  const brevoApiKey = process.env.BREVO_API_KEY?.trim();
  if (brevoApiKey) {
    try {
      const fromRaw = process.env.EMAIL_FROM || process.env.SMTP_USER || 'no-reply@hruvita.com';
      const match = fromRaw.match(/^(?:"?([^"]*)"?\s*)?<([^>]+)>$/);
      const sender = match
        ? { name: (match[1] || 'HRUVITA').trim(), email: match[2].trim() }
        : { name: 'HRUVITA', email: fromRaw.trim() };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': brevoApiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          sender,
          to: [{ email: to }],
          subject,
          htmlContent: html,
          textContent: text,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        console.log(`[Brevo API] Email sent to ${to} (${subject})`);
        return { sent: true, messageId: data.messageId || '' };
      }
      const errTxt = await res.text().catch(() => res.statusText);
      console.warn(`[Brevo API Warning] ${res.status}: ${errTxt}`);
    } catch (apiErr) {
      console.warn(`[Brevo API Warning] ${apiErr.message}`);
    }
  }

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
    // Log only recipient and subject; never log OTPs, reset tokens, or passwords
    console.log(
      previewUrl
        ? `[Nodemailer] Email sent to ${to} (${subject}) | Preview: ${previewUrl}`
        : `[Nodemailer] Email sent to ${to} (${subject})`
    );
    return { sent: true, messageId: info.messageId, previewUrl };
  } catch (err) {
    cachedTransporter = null;
    console.warn(`[Nodemailer Warning] Could not send email to ${to}: ${err.message}`);
    return { sent: false, error: err.message };
  }
}

export async function sendOtpEmail({ to, fullName, otp, mode = 'signup' }) {
  const { subject, text, html } = buildOtpEmail({ fullName, otp, mode });
  return sendMailViaNodemailer({ to, subject, text, html });
}

export async function sendAccountCreatedCongratsEmail({
  to,
  fullName,
  referralCode = '',
  rewardPoints = 25,
}) {
  if (RESTRICTED_EMAIL_MODE) return { sent: false, skipped: true };
  const { subject, text, html } = buildWelcomeEmail({ to, fullName, referralCode, rewardPoints });
  return sendMailViaNodemailer({ to, subject, text, html });
}

export async function sendPasswordResetEmail({ to, fullName, resetUrl }) {
  if (RESTRICTED_EMAIL_MODE) return { sent: false, skipped: true };
  const { subject, text, html } = buildPasswordResetEmail({ fullName, resetUrl });
  return sendMailViaNodemailer({ to, subject, text, html });
}

export async function sendOrderConfirmationEmail({ to, order }) {
  const { subject, text, html } = buildOrderConfirmationEmail({ order });
  return sendMailViaNodemailer({ to, subject, text, html });
}

export async function sendDeliveryPartnerWelcomeEmail({ to, fullName }) {
  if (RESTRICTED_EMAIL_MODE) return { sent: false, skipped: true };
  const { subject, text, html } = buildDeliveryPartnerWelcomeEmail({ fullName, email: to });
  return sendMailViaNodemailer({ to, subject, text, html });
}

export async function sendDeliveryAssignmentEmail({ to, orderId, partnerName, partnerPhone, address = '' }) {
  if (RESTRICTED_EMAIL_MODE) return { sent: false, skipped: true };
  const { subject, text, html } = buildDeliveryPartnerEmail({ orderId, partnerName, partnerPhone, isReassign: false, address });
  return sendMailViaNodemailer({ to, subject, text, html });
}

export async function sendDeliveryReassignedEmail({ to, orderId, partnerName, partnerPhone, address = '' }) {
  if (RESTRICTED_EMAIL_MODE) return { sent: false, skipped: true };
  const { subject, text, html } = buildDeliveryPartnerEmail({ orderId, partnerName, partnerPhone, isReassign: true, address });
  return sendMailViaNodemailer({ to, subject, text, html });
}

export async function sendDeliveryAcceptedEmail({ to, orderId, partnerName, partnerPhone }) {
  if (RESTRICTED_EMAIL_MODE) return { sent: false, skipped: true };
  const { subject, text, html } = buildDeliveryLifecycleEmail({ orderId, stage: 'accepted', partnerName, partnerPhone });
  return sendMailViaNodemailer({ to, subject, text, html });
}

export async function sendOutForDeliveryEmail({ to, orderId, partnerName, partnerPhone }) {
  if (RESTRICTED_EMAIL_MODE) return { sent: false, skipped: true };
  const { subject, text, html } = buildDeliveryLifecycleEmail({ orderId, stage: 'out_for_delivery', partnerName, partnerPhone });
  return sendMailViaNodemailer({ to, subject, text, html });
}

export async function sendDeliveryOtpEmail({ to, customerName, orderId, otp, partnerName = '' }) {
  if (RESTRICTED_EMAIL_MODE) return { sent: false, skipped: true };
  const { subject, text, html } = buildDeliveryOtpEmail({ customerName, orderId, otp, partnerName });
  return sendMailViaNodemailer({ to, subject, text, html });
}

export async function sendDeliveryCompletedEmail({ to, orderId, partnerName }) {
  const { subject, text, html } = buildDeliveryLifecycleEmail({ orderId, stage: 'delivered', partnerName });
  return sendMailViaNodemailer({ to, subject, text, html });
}

export async function sendDeliveryFailedEmail({ to, orderId, partnerName, reason }) {
  if (RESTRICTED_EMAIL_MODE) return { sent: false, skipped: true };
  const { subject, text, html } = buildDeliveryLifecycleEmail({ orderId, stage: 'failed', partnerName, reason });
  return sendMailViaNodemailer({ to, subject, text, html });
}

export async function sendDeliveryPartnerEmail({ to, orderId, partnerName, partnerPhone, isReassign = false }) {
  if (RESTRICTED_EMAIL_MODE) return { sent: false, skipped: true };
  const { subject, text, html } = buildDeliveryPartnerEmail({ orderId, partnerName, partnerPhone, isReassign });
  return sendMailViaNodemailer({ to, subject, text, html });
}

export async function sendAdminAlertEmail({ to, title, description, category = 'system', entityId = '' }) {
  if (RESTRICTED_EMAIL_MODE) return { sent: false, skipped: true };
  const { subject, text, html } = buildAdminAlertEmail({ title, description, category, entityId });
  return sendMailViaNodemailer({ to, subject, text, html });
}

export async function sendUserNotification({
  userId,
  email,
  type = 'order',
  title,
  message,
  orderId = '',
}) {
  const allowEmail =
    !RESTRICTED_EMAIL_MODE ||
    (type === 'order' && /order placed|order confirmed|payment received/i.test(String(title || '')));
  if (email && allowEmail) {
    const { subject, text, html } = buildOrderStatusEmail({
      title,
      message,
      status: type,
      orderId,
    });
    await sendMailViaNodemailer({ to: email, subject, text, html });
  }

  if (userId) {
    sendPushToUser(userId, {
      title: title || 'HRUVITA Update',
      body: message || 'You have a new notification.',
      url: orderId ? '/account?section=orders' : '/account',
      tag: orderId ? `order-${orderId}` : `notif-${type}`,
    }).catch(() => {});

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
