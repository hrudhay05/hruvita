import mongoose from 'mongoose';

const groupDropSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    dropType: { type: String, enum: ['office', 'family'], default: 'office' },
    hostUserId: { type: String, required: true, index: true },
    hostName: { type: String, default: '' },
    hostPhone: { type: String, default: '' },
    hostEmail: { type: String, default: '' },
    address: {
      label: { type: String, default: '' },
      line1: { type: String, default: '' },
      area: { type: String, default: '' },
      city: { type: String, default: 'Hyderabad' },
      pincode: { type: String, default: '' },
    },
    scheduledDate: { type: String, required: true },
    slotId: { type: String, default: 'morning' },
    slotLabel: { type: String, default: 'Morning Slot (6:30 AM – 9:00 AM)' },
    cutoffNote: { type: String, default: 'Add your items before 10:00 PM tonight' },
    status: { type: String, enum: ['open', 'placed', 'cancelled'], default: 'open' },
    participants: { type: Array, default: [] },
    totalAmount: { type: Number, default: 0 },
    createdOrderId: { type: String, default: '' },
  },
  { timestamps: true }
);

export const GroupDrop = mongoose.models.GroupDrop || mongoose.model('GroupDrop', groupDropSchema);
