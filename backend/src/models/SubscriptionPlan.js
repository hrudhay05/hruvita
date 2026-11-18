import mongoose from 'mongoose';

const subscriptionPlanSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    days: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    popular: { type: Boolean, default: false },
    perks: { type: [String], default: [] },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const SubscriptionPlan =
  mongoose.models.SubscriptionPlan || mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
