import mongoose from 'mongoose';

const contactMessageSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    message: { type: String, required: true, trim: true },
    status: { type: String, enum: ['open', 'resolved'], default: 'open', index: true },
    adminNote: { type: String, default: '' },
    resolvedBy: { type: String, default: '' },
    resolvedAt: { type: String, default: '' },
  },
  { timestamps: true }
);

export const ContactMessage =
  mongoose.models.ContactMessage || mongoose.model('ContactMessage', contactMessageSchema);
