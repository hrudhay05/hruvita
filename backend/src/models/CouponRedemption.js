import mongoose from 'mongoose';

const couponRedemptionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    couponCode: { type: String, required: true, uppercase: true, trim: true, index: true },
    customerId: { type: String, required: true, index: true },
    customerEmail: { type: String, default: '' },
    orderId: { type: String, required: true, index: true },
    discountAmount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['pending', 'redeemed', 'restored', 'failed'],
      default: 'redeemed',
      index: true,
    },
    redeemedAt: { type: String, default: () => new Date().toISOString() },
  },
  { timestamps: true }
);

couponRedemptionSchema.index({ orderId: 1, couponCode: 1 }, { unique: true });

export const CouponRedemption =
  mongoose.models.CouponRedemption || mongoose.model('CouponRedemption', couponRedemptionSchema);
