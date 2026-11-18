import mongoose from 'mongoose';

const comboItemSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true },
    qty: { type: Number, default: 1, min: 1 },
  },
  { _id: false }
);

const comboSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    image: { type: String, default: '' },
    emoji: { type: String, default: '🍱' },
    price: { type: Number, required: true, min: 1 },
    originalPrice: { type: Number, default: 0 },
    items: { type: [comboItemSchema], default: [] },
    scheduleStart: { type: String, default: '06:00' }, // HH:MM (24h)
    scheduleEnd: { type: String, default: '22:00' },   // HH:MM (24h)
    active: { type: Boolean, default: true },
    featured: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Combo = mongoose.models.Combo || mongoose.model('Combo', comboSchema);
