import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    fullName: { type: String, required: true, trim: true },
    name: { type: String, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email format'],
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    isEmailVerified: { type: Boolean, default: false, index: true },
    username: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    mobileNumber: {
      type: String,
      default: '',
      trim: true,
    },
    phone: { type: String, default: '', trim: true },
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Prefer not to say', ''],
      default: '',
    },
    dateOfBirth: { type: Date, default: null },
    isProfileCompleted: { type: Boolean, default: false, index: true },
    termsAccepted: { type: Boolean, default: false },
    role: {
      type: String,
      enum: ['customer', 'staff', 'admin_analyser', 'admin'],
      default: 'customer',
      index: true,
    },
    resetPasswordTokenHash: { type: String, default: null, select: false },
    resetPasswordExpiresAt: { type: Date, default: null, select: false },
    referralCode: { type: String, unique: true, sparse: true },
    referredBy: { type: String, default: '' },
    rewardPoints: { type: Number, default: 0, min: 0 },
    preferences: {
      vegOnly: { type: Boolean, default: true },
      spiceLevel: { type: String, enum: ['mild', 'medium', 'spicy'], default: 'medium' },
      allergies: { type: [String], default: [] },
      deliveryNotes: { type: String, default: '' },
    },
    wishlist: { type: [String], default: [] },
    blocked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

userSchema.pre('save', function syncNameAndPhone(next) {
  if (this.fullName && !this.name) this.name = this.fullName;
  if (this.name && !this.fullName) this.fullName = this.name;
  if (this.mobileNumber && !this.phone) this.phone = this.mobileNumber;
  next();
});

export const User = mongoose.models.User || mongoose.model('User', userSchema);
