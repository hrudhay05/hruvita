import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    orderId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    method: { type: String, enum: ['razorpay', 'cod', 'wallet'], required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    razorpayOrderId: { type: String, default: '', index: true },
    razorpayPaymentId: { type: String, unique: true, sparse: true },
    status: {
      type: String,
      enum: ['created', 'captured', 'failed', 'refund_initiated', 'refunded'],
      default: 'created',
    },
    refundId: { type: String, default: '' },
    refundReason: { type: String, default: '' },
    refundedAt: { type: String, default: '' },
  },
  { timestamps: true }
);

export const Payment = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);
