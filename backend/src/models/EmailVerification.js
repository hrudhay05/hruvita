import mongoose from 'mongoose';

const emailVerificationSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    otp: {
      type: String,
      required: true,
      match: [/^\d{6}$/, 'OTP must be a 6-digit number'],
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
    attempts: { type: Number, default: 0 },
    resendCount: { type: Number, default: 0 },
    lastResentAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const EmailVerification =
  mongoose.models.EmailVerification || mongoose.model('EmailVerification', emailVerificationSchema);
