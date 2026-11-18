import mongoose from 'mongoose';

const deliverySlotSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    window: { type: String, required: true },
    maxOrders: { type: Number, default: 40 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const DeliverySlot =
  mongoose.models.DeliverySlot || mongoose.model('DeliverySlot', deliverySlotSchema);
