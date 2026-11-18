import mongoose from 'mongoose';

const inventoryLogSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    itemType: { type: String, enum: ['product', 'ingredient'], required: true, index: true },
    itemId: { type: String, required: true, index: true },
    itemName: { type: String, required: true },
    change: { type: Number, required: true },
    stockAfter: { type: Number, required: true },
    reason: {
      type: String,
      enum: [
        'order_reserved',
        'order_deducted',
        'order_released',
        'order_cancelled',
        'combo_deducted',
        'bowl_deducted',
        'admin_adjustment',
        'restock',
      ],
      required: true,
    },
    orderId: { type: String, default: '' },
    actor: { type: String, default: 'system' },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

export const InventoryLog =
  mongoose.models.InventoryLog || mongoose.model('InventoryLog', inventoryLogSchema);
