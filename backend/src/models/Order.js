import mongoose from 'mongoose';

export const ORDER_STATUSES = [
  'pending',
  'payment_pending',
  'confirmed',
  'accepted',
  'preparing',
  'packed',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'refund_initiated',
  'refunded',
];

const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true },
    name: { type: String, required: true },
    emoji: { type: String, default: '🍲' },
    unitPrice: { type: Number, required: true },
    mrp: { type: Number, required: true },
    qty: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true },
  },
  { _id: false }
);

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, enum: ORDER_STATUSES, required: true },
    note: { type: String, default: '' },
    by: { type: String, default: 'system' },
    at: { type: String, required: true },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    idempotencyKey: { type: String, unique: true, sparse: true },
    userId: { type: String, required: true, index: true },
    customerName: { type: String, required: true },
    customerEmail: { type: String, required: true },
    customerPhone: { type: String, required: true },
    items: { type: [orderItemSchema], required: true },
    pricing: {
      subtotal: { type: Number, required: true },
      couponCode: { type: String, default: '' },
      couponDiscount: { type: Number, default: 0 },
      rewardPointsUsed: { type: Number, default: 0 },
      deliveryCharge: { type: Number, required: true },
      taxAmount: { type: Number, required: true },
      grandTotal: { type: Number, required: true },
    },
    address: {
      label: { type: String, default: 'Home' },
      recipient: { type: String, required: true },
      phone: { type: String, required: true },
      line1: { type: String, required: true },
      area: { type: String, default: '' },
      city: { type: String, default: 'Hyderabad' },
      pincode: { type: String, required: true },
      notes: { type: String, default: '' },
    },
    scheduledDate: { type: String, required: true, index: true },
    slotId: { type: String, required: true },
    slotLabel: { type: String, required: true },
    paymentMethod: { type: String, enum: ['razorpay', 'cod'], required: true },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refund_initiated', 'refunded'],
      default: 'pending',
    },
    razorpayOrderId: { type: String, default: '' },
    razorpayPaymentId: { type: String, default: '' },
    status: {
      type: String,
      enum: ORDER_STATUSES,
      default: 'pending',
      index: true,
    },
    statusHistory: { type: [statusHistorySchema], default: [] },
    stockDeducted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);
