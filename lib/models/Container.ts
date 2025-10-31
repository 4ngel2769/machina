import mongoose, { Schema, Document } from 'mongoose';

export interface IContainer extends Document {
  id: string;
  name: string;
  userId: string;
  username: string;
  dockerImage: string;
  port: number;
  vnc: {
    enabled: boolean;
    port?: number;
    password?: string;
  };
  status: 'running' | 'stopped' | 'error';
  createdAt: Date;
  lastStarted?: Date;
  specs?: {
    cpu?: number;
    memory?: number;
    disk?: number;
  };
}

const ContainerSchema = new Schema<IContainer>({
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
  dockerImage: {
    type: String,
    required: true,
  },
  port: {
    type: Number,
    required: true,
  },
  vnc: {
    enabled: {
      type: Boolean,
      default: false,
    },
    port: Number,
    password: String,
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
  specs: {
    cpu: Number,
    memory: Number,
    disk: Number,
  },
});

// Indexes for faster queries
ContainerSchema.index({ userId: 1, createdAt: -1 });
ContainerSchema.index({ status: 1 });

export default mongoose.models.Container || mongoose.model<IContainer>('Container', ContainerSchema);
