/**
 * MongoDB User Model
 * Replaces file-based user storage for production
 */

import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  username: string;
  passwordHash: string;
  role: 'admin' | 'user';
  tokenBalance: number;
  tokenPlan: 'free' | 'basic' | 'pro' | 'enterprise' | 'unlimited';
  email?: string;
  createdAt: Date;
  updatedAt: Date;
  lastLogin?: Date;
  isActive: boolean;
  metadata?: {
    firstName?: string;
    lastName?: string;
    company?: string;
  };
}

const UserSchema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['admin', 'user'],
      default: 'user',
      index: true,
    },
    tokenBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    tokenPlan: {
      type: String,
      enum: ['free', 'basic', 'pro', 'enterprise', 'unlimited'],
      default: 'free',
      index: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      sparse: true, // Allow multiple null values
      index: true,
    },
    lastLogin: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    metadata: {
      firstName: String,
      lastName: String,
      company: String,
    },
  },
  {
    timestamps: true,
    collection: 'users',
  }
);

// Indexes for common queries
UserSchema.index({ username: 1, isActive: 1 });
UserSchema.index({ role: 1, isActive: 1 });
UserSchema.index({ tokenPlan: 1, isActive: 1 });
UserSchema.index({ createdAt: -1 });

// Export model (handle hot reload in development)
export const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
