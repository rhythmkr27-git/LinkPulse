import mongoose from 'mongoose';

const linkSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, lowercase: true, trim: true },
    destination: { type: String, required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', default: null, index: true },
    tags: { type: [String], default: [] },

    status: { type: String, enum: ['active', 'disabled'], default: 'active', index: true },
    disabledBy: { type: String, default: null },
    disabledReason: { type: String, default: null },

    expiresAt: { type: Date, default: null },
    clickLimit: { type: Number, default: null, min: 1 },
    clickCount: { type: Number, default: 0 }, 
    hasPassword: { type: Boolean, default: false },
    passwordHash: { type: String, default: null, select: false },
  },
  { timestamps: true }
);

linkSchema.index({ tags: 1 });

export default mongoose.model('Link', linkSchema);