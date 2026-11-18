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
    storeOpen: { type: Boolean, default: true },
    aiEnabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const BusinessSettings =
  mongoose.models.BusinessSettings || mongoose.model('BusinessSettings', businessSettingsSchema);
