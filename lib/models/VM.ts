import mongoose, { Schema, Document } from 'mongoose';

export interface IVM extends Document {
  id: string;
  name: string;
  userId: string;
  username: string;
  os: string;
  vcpus: number;
  memory: number;
  disk: number;
  vncPort: number;
  vncPassword: string;
  status: 'running' | 'stopped' | 'error';
  createdAt: Date;
  lastStarted?: Date;
  imageUrl?: string;
}

const VMSchema = new Schema<IVM>({
  id: {
    type: String,
    required: true,
    unique: true,
  },
  name: {
    type: String,
    required: true,
  },
  userId: {
    type: String,
    required: true,
    index: true,
  },
  username: {
    type: String,
    required: true,
  },
  os: {
    type: String,
    required: true,
  },
  vcpus: {
    type: Number,
    required: true,
  },
  memory: {
    type: Number,
    required: true,
  },
  disk: {
    type: Number,
    required: true,
  },
  vncPort: {
    type: Number,
    required: true,
  },
  vncPassword: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['running', 'stopped', 'error'],
    default: 'stopped',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  lastStarted: Date,
  imageUrl: String,
});

// Indexes for faster queries
VMSchema.index({ userId: 1, createdAt: -1 });
VMSchema.index({ status: 1 });

export default mongoose.models.VM || mongoose.model<IVM>('VM', VMSchema);
