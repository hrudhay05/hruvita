import mongoose from 'mongoose';

const addressSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    addressLabel: {
      type: String,
      enum: ['Home', 'Office', 'Hostel', 'Other'],
      default: 'Home',
    },
    recipientName: { type: String, required: true, trim: true },
    mobileNumber: {
      type: String,
      required: true,
      trim: true,
      match: [/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'],
    },
    alternateMobileNumber: {
      type: String,
      default: '',
      trim: true,
    },
    doorNumber: { type: String, default: '', trim: true },
    apartmentName: { type: String, default: '', trim: true },
    street: { type: String, default: '', trim: true },
    locality: { type: String, default: '', trim: true },
    area: { type: String, default: '', trim: true },
    mandal: { type: String, default: '', trim: true },
    district: { type: String, default: '', trim: true },
    state: { type: String, default: '', trim: true },
    country: { type: String, default: 'India', trim: true },
    pincode: {
      type: String,
      required: true,
      trim: true,
      match: [/^\d{6}$/, 'Enter a valid 6-digit PIN code'],
    },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    deliveryInstructions: { type: String, default: '', trim: true },
    isDefault: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

addressSchema.index({ userId: 1, isDefault: -1, createdAt: -1 });

export const Address = mongoose.models.Address || mongoose.model('Address', addressSchema);
