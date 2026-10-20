import mongoose from 'mongoose';

const blocklistSchema = new mongoose.Schema(
  {
    domain: { type: String, required: true, unique: true, lowercase: true, trim: true },
    reason: { type: String, trim: true, maxlength: 200, default: '' },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export default mongoose.model('Blocklist', blocklistSchema);