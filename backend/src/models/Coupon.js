import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    title: { type: String, required: true },
    type: { type: String, enum: ['percent', 'flat', 'fixed_total'], default: 'percent' },
    value: { type: Number, required: true, min: 1 },
    minOrder: { type: Number, default: 0 },
    maxDiscount: { type: Number, default: 100 },
    firstOrderOnly: { type: Boolean, default: false },
    visibility: { type: String, enum: ['public', 'private'], default: 'public' },
    validFrom: { type: String, default: '' },
    validUntil: { type: String, default: '' },
    eligibleProductIds: { type: [String], default: [] },
    eligibleCategories: { type: [String], default: [] },
    allowedUserEmails: { type: [String], default: [] },
    perUserLimit: { type: Number, default: 0 },
    globalUsageLimit: { type: Number, default: 0 },
    restoreOnCancel: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Coupon = mongoose.models.Coupon || mongoose.model('Coupon', couponSchema);
