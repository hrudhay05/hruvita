import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    businessType: { type: String, enum: ['fruits', 'grocery'], default: 'fruits', index: true },
    emoji: { type: String, default: '🍽️' },
    image: { type: String, default: '' },
    tint: { type: String, default: '#e6f4ea' },
    sortOrder: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Category = mongoose.models.Category || mongoose.model('Category', categorySchema);
