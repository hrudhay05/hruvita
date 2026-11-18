import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    planId: { type: String, required: true },
    planName: { type: String, required: true },
    days: { type: Number, required: true },
    remainingDeliveries: { type: Number, required: true },
    price: { type: Number, required: true },
    preferredBreakfast: { type: String, required: true },
    slotId: { type: String, default: 'morning' },
    slotLabel: { type: String, default: 'Morning Slot (6:30 AM – 9:00 AM)' },
    startDate: { type: String, required: true },
    status: {
      type: String,
      enum: ['active', 'paused', 'completed', 'cancelled'],
      default: 'active',
    },
    pauseCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Subscription =
  mongoose.models.Subscription || mongoose.model('Subscription', subscriptionSchema);
