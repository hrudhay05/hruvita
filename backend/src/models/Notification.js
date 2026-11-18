import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: ['welcome', 'security', 'order', 'promo'],
      default: 'order',
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    emailSent: { type: Boolean, default: true },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Notification =
  mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
