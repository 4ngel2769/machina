import mongoose, { Schema, Document } from 'mongoose';

export interface IQuota extends Document {
  userId: string;
  username: string;
  maxContainers: number;
  maxVMs: number;
  maxCPU: number;
  maxMemory: number;
  maxDisk: number;
  tokenBalance: number;
  createdAt: Date;
  updatedAt: Date;
}

const QuotaSchema = new Schema<IQuota>({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  username: {
    type: String,
    required: true,
  },
  maxContainers: {
    type: Number,
    default: 5,
  },
  maxVMs: {
    type: Number,
    default: 3,
  },
  maxCPU: {
    type: Number,
    default: 8,
  },
  maxMemory: {
    type: Number,
    default: 16384,
  },
  maxDisk: {
    type: Number,
    default: 100,
  },
  tokenBalance: {
    type: Number,
    default: 1000,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update the updatedAt timestamp on save
QuotaSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.models.Quota || mongoose.model<IQuota>('Quota', QuotaSchema);
