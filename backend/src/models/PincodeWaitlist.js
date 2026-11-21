import mongoose from 'mongoose';

const pincodeWaitlistSchema = new mongoose.Schema(
  {
    pincode: { type: String, required: true, trim: true, index: true },
    area: { type: String, default: '', trim: true },
    name: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    phone: { type: String, default: '', trim: true },
    userId: { type: String, default: null },
    status: { type: String, enum: ['waiting', 'notified', 'launched'], default: 'waiting' },
  },
  { timestamps: true }
);

export const PincodeWaitlist =
  mongoose.models.PincodeWaitlist || mongoose.model('PincodeWaitlist', pincodeWaitlistSchema);
