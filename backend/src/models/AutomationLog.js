import mongoose from 'mongoose';

const automationLogSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    jobName: { type: String, required: true, index: true },
    status: { type: String, enum: ['success', 'skipped', 'error'], default: 'success' },
    summary: { type: String, required: true },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const AutomationLog =
  mongoose.models.AutomationLog || mongoose.model('AutomationLog', automationLogSchema);
