import mongoose from 'mongoose';

const ingredientSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['fruits', 'toppings', 'extras'],
      required: true,
      index: true,
    },
    price: { type: Number, default: 0, min: 0 },
    included: { type: Boolean, default: false },
    stock: { type: Number, default: 50, min: 0 },
    unit: { type: String, default: 'portions' },
    qtyPerBowl: { type: Number, default: 1, min: 1 },
    lowStockThreshold: { type: Number, default: 8 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Ingredient =
  mongoose.models.Ingredient || mongoose.model('Ingredient', ingredientSchema);
