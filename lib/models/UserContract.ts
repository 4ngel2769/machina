import mongoose, { Schema, Document } from 'mongoose';

export interface IUserContract extends Document {
  userId: string;
  username: string;
  tokensPerMonth: number;
  durationMonths: number;
  startDate: Date;
  endDate: Date;
  nextRefillDate: Date;
  status: 'active' | 'paused' | 'cancelled' | 'expired';
  totalRefills: number;
  createdAt: Date;
  createdBy: string;
  notes?: string;
}

const UserContractSchema = new Schema<IUserContract>({
  userId: {
    type: String,
    required: true,
    index: true,
  },
  username: {
    type: String,
    required: true,
  },
  tokensPerMonth: {
    type: Number,
    required: true,
    min: 0,
  },
  durationMonths: {
    type: Number,
    required: true,
    min: 1,
  },
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
  nextRefillDate: {
    type: Date,
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['active', 'paused', 'cancelled', 'expired'],
    default: 'active',
    index: true,
  },
  totalRefills: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  createdBy: {
    type: String,
    required: true,
  },
  notes: String,
});

// Indexes for queries
UserContractSchema.index({ userId: 1, status: 1 });
UserContractSchema.index({ status: 1, nextRefillDate: 1 });

export default mongoose.models.UserContract || mongoose.model<IUserContract>('UserContract', UserContractSchema);
