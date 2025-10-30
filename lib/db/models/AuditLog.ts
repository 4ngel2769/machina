/**
 * MongoDB Audit Log Model
 * Replaces JSONL file-based audit logging for production
 */

import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
  timestamp: Date;
  userId: string;
  username: string;
  action: string;
  resourceType?: 'container' | 'vm' | 'user' | 'setting' | 'auth';
  resourceId?: string;
  resourceName?: string;
  details?: string;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
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
    action: {
      type: String,
      required: true,
      index: true,
    },
    resourceType: {
      type: String,
      enum: ['container', 'vm', 'user', 'setting', 'auth'],
      index: true,
    },
    resourceId: {
      type: String,
      index: true,
    },
    resourceName: String,
    details: String,
    ipAddress: String,
    userAgent: String,
    success: {
      type: Boolean,
      required: true,
      index: true,
    },
    errorMessage: String,
  },
  {
    timestamps: false,
    collection: 'audit_logs',
  }
);

// Compound indexes for common queries
AuditLogSchema.index({ userId: 1, timestamp: -1 });
AuditLogSchema.index({ action: 1, timestamp: -1 });
AuditLogSchema.index({ resourceType: 1, timestamp: -1 });
AuditLogSchema.index({ success: 1, timestamp: -1 });
AuditLogSchema.index({ timestamp: -1 }); // For cleanup and pagination

// TTL index to auto-delete old logs after 90 days
AuditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const AuditLog =
  mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
