import mongoose from 'mongoose';

const referralSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    referrerUserId: { type: String, required: true, index: true },
    referrerEmail: { type: String, required: true },
    referredUserId: { type: String, required: true, unique: true, index: true },
    referredEmail: { type: String, required: true },
    referralCode: { type: String, required: true, uppercase: true, trim: true },
    rewardAmount: { type: Number, default: 50 },
    status: {
      type: String,
      enum: ['pending', 'credited', 'flagged', 'rejected'],
      default: 'pending',
      index: true,
    },
    fraudFlags: { type: [String], default: [] },
    orderId: { type: String, default: '' },
    creditedAt: { type: String, default: '' },
  },
  { timestamps: true }
);

export const Referral = mongoose.models.Referral || mongoose.model('Referral', referralSchema);
