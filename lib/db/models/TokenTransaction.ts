/**
 * MongoDB Token Transaction Model
 * Tracks token balance changes and transaction history
 */

import mongoose, { Schema, Document } from 'mongoose';

export interface ITokenTransaction extends Document {
  userId: string;
  username: string;
  type: 'credit' | 'debit' | 'refund' | 'purchase' | 'admin_adjustment';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  reason: string;
  relatedResourceType?: 'vm' | 'container';
  relatedResourceId?: string;
  performedBy?: string; // Admin user ID if manually adjusted
  metadata?: Record<string, any>;
  timestamp: Date;
}

const TokenTransactionSchema = new Schema<ITokenTransaction>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    username: {
      type: String,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['credit', 'debit', 'refund', 'purchase', 'admin_adjustment'],
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    balanceBefore: {
      type: Number,
      required: true,
    },
    balanceAfter: {
      type: Number,
      required: true,
    },
    reason: {
      type: String,
      required: true,
    },
    relatedResourceType: {
      type: String,
      enum: ['vm', 'container'],
    },
    relatedResourceId: String,
    performedBy: String,
    metadata: Schema.Types.Mixed,
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
    collection: 'token_transactions',
  }
);

// Compound indexes for common queries
TokenTransactionSchema.index({ userId: 1, timestamp: -1 });
TokenTransactionSchema.index({ type: 1, timestamp: -1 });
TokenTransactionSchema.index({ timestamp: -1 });

export const TokenTransaction =
  mongoose.models.TokenTransaction ||
  mongoose.model<ITokenTransaction>('TokenTransaction', TokenTransactionSchema);
