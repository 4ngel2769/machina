import mongoose, { Schema, Document } from 'mongoose';

export interface ITokenRequest extends Document {
  userId: string;
  username: string;
  amount: number;
  reason: string;
  status: 'pending' | 'approved' | 'denied';
  createdAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  adminNotes?: string;
}

const TokenRequestSchema = new Schema<ITokenRequest>({
  userId: {
    type: String,
    required: true,
    index: true,
  },
  username: {
    type: String,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 1,
  },
  reason: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'denied'],
    default: 'pending',
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  reviewedAt: Date,
  reviewedBy: String,
  adminNotes: String,
});

// Indexes for filtering
TokenRequestSchema.index({ userId: 1, createdAt: -1 });
TokenRequestSchema.index({ status: 1, createdAt: -1 });

export default mongoose.models.TokenRequest || mongoose.model<ITokenRequest>('TokenRequest', TokenRequestSchema);
