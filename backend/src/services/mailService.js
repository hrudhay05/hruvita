import nodemailer from 'nodemailer';
import { createNotification } from '../store/repository.js';
import { buildOtpEmail } from '../emails/otpTemplate.js';
import { buildWelcomeEmail } from '../emails/welcomeTemplate.js';
import { buildPasswordResetEmail } from '../emails/passwordResetTemplate.js';
import { buildOrderConfirmationEmail } from '../emails/orderConfirmationTemplate.js';
import { buildOrderStatusEmail } from '../emails/orderStatusTemplate.js';
import { buildDeliveryPartnerEmail } from '../emails/deliveryTemplate.js';
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
    // Log only recipient and subject; never log OTPs, reset tokens, or passwords
    console.log(
      previewUrl
        ? `[Nodemailer] Email sent to ${to} (${subject}) | Preview: ${previewUrl}`
        : `[Nodemailer] Email sent to ${to} (${subject})`
    );
    return { sent: true, messageId: info.messageId, previewUrl };
  } catch (err) {
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
  const { subject, text, html } = buildWelcomeEmail({ to, fullName, referralCode, rewardPoints });
  return sendMailViaNodemailer({ to, subject, text, html });
}

export async function sendPasswordResetEmail({ to, fullName, resetUrl }) {
  const { subject, text, html } = buildPasswordResetEmail({ fullName, resetUrl });
  return sendMailViaNodemailer({ to, subject, text, html });
}

export async function sendOrderConfirmationEmail({ to, order }) {
  const { subject, text, html } = buildOrderConfirmationEmail({ order });
  return sendMailViaNodemailer({ to, subject, text, html });
}

export async function sendDeliveryPartnerEmail({ to, orderId, partnerName, partnerPhone, isReassign = false }) {
  const { subject, text, html } = buildDeliveryPartnerEmail({ orderId, partnerName, partnerPhone, isReassign });
  return sendMailViaNodemailer({ to, subject, text, html });
}

export async function sendAdminAlertEmail({ to, title, description, category = 'system', entityId = '' }) {
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
  if (email) {
    const { subject, text, html } = buildOrderStatusEmail({
      title,
      message,
      status: type,
      orderId,
    });
    await sendMailViaNodemailer({ to: email, subject, text, html });
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
