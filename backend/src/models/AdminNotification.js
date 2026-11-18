import mongoose from 'mongoose';

const adminNotificationSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    dedupKey: { type: String, unique: true, sparse: true },
    category: {
      type: String,
      enum: ['order', 'payment', 'inventory', 'subscription', 'customer', 'cancellation'],
      default: 'order',
      index: true,
    },
    title: { type: String, required: true },
    description: { type: String, required: true },
    entityType: { type: String, default: '' },
    entityId: { type: String, default: '' },
    readBy: { type: [String], default: [] },
  },
  { timestamps: true }
);

adminNotificationSchema.index({ createdAt: -1 });

export const AdminNotification =
  mongoose.models.AdminNotification || mongoose.model('AdminNotification', adminNotificationSchema);
