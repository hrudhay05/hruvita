import mongoose from 'mongoose';

const businessSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'default', unique: true },
    name: { type: String, default: 'HRUVITA' },
    tagline: { type: String, default: 'Fresh Food. Healthy Living. Smart Ordering.' },
    city: { type: String, default: 'Hyderabad' },
    phone: { type: String, default: '+91 00000 00000' },
    email: { type: String, default: 'hello@example.com' },
    hours: { type: String, default: '6 AM - 9 PM, every day' },
    currency: { type: String, default: '₹' },
    deliveryCharge: { type: Number, default: 25 },
    freeDeliveryAbove: { type: Number, default: 199 },
    taxPercent: { type: Number, default: 5 },
    cutoffHour: { type: Number, default: 21 },
    maxPreOrderDays: { type: Number, default: 7 },
    subscriptionPauseCutoffHour: { type: Number, default: 22 },
    referralRewardPoints: { type: Number, default: 50 },
    codEnabled: { type: Boolean, default: true },
    storeOpen: { type: Boolean, default: true },
    aiEnabled: { type: Boolean, default: true },
    deliveryCommissionPerOrder: { type: Number, default: 40, min: 0 },
    deliveryIncentivePer10Orders: { type: Number, default: 100, min: 0 },
  },
  { timestamps: true }
);

export const BusinessSettings =
  mongoose.models.BusinessSettings || mongoose.model('BusinessSettings', businessSettingsSchema);
