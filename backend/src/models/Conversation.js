import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    text: { type: String, required: true },
    toolsUsed: { type: [String], default: [] },
    at: { type: String, required: true },
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, default: 'guest', index: true },
    userName: { type: String, default: 'Guest' },
    language: { type: String, enum: ['en-IN', 'te-IN'], default: 'en-IN' },
    messages: { type: [messageSchema], default: [] },
    cartActionsCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Conversation =
  mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);
