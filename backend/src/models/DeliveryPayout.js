import mongoose from 'mongoose';

const deliveryPayoutSchema = new mongoose.Schema(
  {
    partnerId: { type: String, required: true, index: true },
    partnerName: { type: String, default: '' },
    periodLabel: { type: String, required: true },
    deliveriesCount: { type: Number, default: 0, min: 0 },
    commissionEarned: { type: Number, default: 0, min: 0 },
    incentiveBonus: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['pending', 'processing', 'paid'],
      default: 'pending',
      index: true,
    },
    utrNumber: { type: String, default: '' },
    paidAt: { type: Date, default: null },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

export const DeliveryPayout =
  mongoose.models.DeliveryPayout || mongoose.model('DeliveryPayout', deliveryPayoutSchema);
