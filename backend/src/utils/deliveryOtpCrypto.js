import crypto from 'crypto';

function getOtpKey() {
  const secret = process.env.DELIVERY_OTP_SECRET || 'hruvita-delivery-otp-shared-key-2026';
  return crypto.createHash('sha256').update(`delivery-otp:${secret}`).digest();
}

function getLegacyOtpKey() {
  const secret = process.env.JWT_SECRET || 'hruvita-jwt-access-secret-2026-secure';
  return crypto.createHash('sha256').update(`delivery-otp:${secret}`).digest();
}

export function encryptDeliveryOtp(otp) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getOtpKey(), iv);
  const enc = Buffer.concat([cipher.update(String(otp), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function tryDecryptWithKey(payload, key) {
  const [ivHex, tagHex, encHex] = String(payload).split(':');
  if (!ivHex || !tagHex || !encHex) return '';
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const dec = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]);
  return dec.toString('utf8');
}

export function decryptDeliveryOtp(payload = '') {
  try {
    return tryDecryptWithKey(payload, getOtpKey());
  } catch {
    try {
      return tryDecryptWithKey(payload, getLegacyOtpKey());
    } catch {
      return '';
    }
  }
}
