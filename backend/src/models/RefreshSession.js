import mongoose from 'mongoose';

const refreshSessionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    hashedRefreshToken: { type: String, required: true, unique: true, index: true },
    rememberMe: { type: Boolean, default: false },
    userAgent: { type: String, default: '' },
    ipAddress: { type: String, default: '' },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const RefreshSession =
  mongoose.models.RefreshSession || mongoose.model('RefreshSession', refreshSessionSchema);
