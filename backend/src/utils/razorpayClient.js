import Razorpay from 'razorpay';

export function getRazorpayKeyId() {
  return (process.env.RAZORPAY_KEY_ID || 'rzp_test_hruvita_demo').trim();
}

export function getRazorpaySecret() {
  return (process.env.RAZORPAY_KEY_SECRET || 'rzp_test_secret_hruvita_dev').trim();
}

export function getWebhookSecret() {
  return (process.env.RAZORPAY_WEBHOOK_SECRET || 'rzp_webhook_secret_hruvita_dev').trim();
}

export function isRealRazorpayConfigured() {
  const keyId = getRazorpayKeyId();
  const keySecret = getRazorpaySecret();
  return (
    Boolean(keyId) &&
    Boolean(keySecret) &&
    keyId !== 'rzp_test_hruvita_demo' &&
    keySecret !== 'rzp_test_secret_hruvita_dev' &&
    (keyId.startsWith('rzp_test_') || keyId.startsWith('rzp_live_'))
  );
}

export function createRazorpayClient() {
  if (!isRealRazorpayConfigured()) return null;
  return new Razorpay({
    key_id: getRazorpayKeyId(),
    key_secret: getRazorpaySecret(),
  });
}
