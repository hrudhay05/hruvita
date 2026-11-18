import mongoose from 'mongoose';

const sizeOptionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    priceDelta: { type: Number, default: 0 },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, index: true },
    emoji: { type: String, default: '🍲' },
    image: { type: String, default: '' },
    images: { type: [String], default: [] },
    price: { type: Number, required: true, min: 0 },
    discountPrice: { type: Number, default: null },
    veg: { type: Boolean, default: true, index: true },
    rating: { type: Number, default: 4.5, min: 0, max: 5 },
    likes: { type: Number, default: 24, min: 0 },
    bestseller: { type: Boolean, default: false, index: true },
    special: { type: Boolean, default: false },
    stock: { type: Number, default: 0, min: 0 },
    prepMins: { type: Number, default: 10, min: 0 },
    description: { type: String, default: '' },
    ingredients: { type: [String], default: [] },
    dietTags: { type: [String], default: [] },
    allergenTags: { type: [String], default: [] },
    sizes: { type: [sizeOptionSchema], default: [] },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

productSchema.index({
  name: 'text',
  description: 'text',
  ingredients: 'text',
  dietTags: 'text',
});

export const Product = mongoose.models.Product || mongoose.model('Product', productSchema);
