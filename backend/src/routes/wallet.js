import crypto from 'crypto';
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { adjustUserWallet, getUserWallet } from '../store/repository.js';
import {
  createRazorpayClient,
  getRazorpayKeyId,
  getRazorpaySecret,
  isRealRazorpayConfigured,
} from '../utils/razorpayClient.js';

const router = Router();

function signPair(orderId, paymentId) {
  return crypto
    .createHmac('sha256', getRazorpaySecret())
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
}

router.get('/', requireAuth, async (req, res) => {
  const wallet = await getUserWallet(req.user.id);
  res.json(wallet);
});

router.post('/topup', requireAuth, async (req, res) => {
  try {
    const amount = Math.round(Number(req.body?.amount || 0));
    if (!Number.isFinite(amount) || amount < 50 || amount > 10000) {
      return res.status(400).json({ error: 'Top-up amount must be between ₹50 and ₹10,000.' });
    }

    const receipt = `wlt_${req.user.id}_${Date.now().toString(36)}`;
    const isReal = isRealRazorpayConfigured();
    const rzpClient = createRazorpayClient();

    if (isReal && rzpClient) {
      const rzpOrder = await rzpClient.orders.create({
        amount: amount * 100,
        currency: 'INR',
        receipt,
      });
      return res.json({
        razorpay: {
          isRealGateway: true,
          keyId: getRazorpayKeyId(),
          orderId: rzpOrder.id,
          amount,
          amountPaise: amount * 100,
          currency: 'INR',
        },
      });
    }

    // Instant test-mode top-up when live Razorpay is not configured
    const result = await adjustUserWallet({
      userId: req.user.id,
      delta: amount,
      type: 'credit',
      description: 'HRUVITA Wallet Top-up',
    });
    if (!result) return res.status(400).json({ error: 'Could not credit wallet.' });
    return res.json({ credited: true, ...result });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Could not start wallet top-up.' });
  }
});

router.post('/verify-topup', requireAuth, async (req, res) => {
  try {
    const {
      amount,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body || {};

    const cleanAmt = Math.round(Number(amount || 0));
    if (!cleanAmt || cleanAmt < 50 || cleanAmt > 10000) {
      return res.status(400).json({ error: 'Invalid top-up amount.' });
    }
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Incomplete Razorpay payment details.' });
    }

    const expected = signPair(razorpay_order_id, razorpay_payment_id);
    if (expected !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid payment signature.' });
    }

    const result = await adjustUserWallet({
      userId: req.user.id,
      delta: cleanAmt,
      type: 'credit',
      description: `Wallet Top-up (${razorpay_payment_id})`,
    });
    if (!result) return res.status(400).json({ error: 'Could not credit wallet.' });
    return res.json({ credited: true, ...result });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Wallet verification failed.' });
  }
});

export default router;
