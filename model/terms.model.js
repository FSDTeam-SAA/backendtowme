import mongoose from 'mongoose';

// Each publication is immutable so old booking versions remain auditable.
const schema = new mongoose.Schema({
  title: { type: String, required: true, maxlength: 200 },
  content: { type: String, required: true },
  version: { type: String, required: true, unique: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });
schema.index({ createdAt: -1, _id: -1 });
export default mongoose.model('Terms', schema);
