import mongoose, { Schema, Document } from 'mongoose';

export interface IPricingTemplate extends Document {
  type: 'vm' | 'container';
  name: string;
  description: string;
  billingType: 'hourly' | 'monthly' | 'one-time';
  tokenCost: number;
  specs: {
    vcpus?: number;
    memoryMB?: number;
    diskGB?: number;
    dockerImage?: string;
    imageUrl?: string;
  };
  active: boolean;
  featured: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PricingTemplateSchema = new Schema<IPricingTemplate>({
  type: {
    type: String,
    enum: ['vm', 'container'],
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  billingType: {
    type: String,
    enum: ['hourly', 'monthly', 'one-time'],
    required: true,
  },
  tokenCost: {
    type: Number,
    required: true,
    min: 0,
  },
  specs: {
    vcpus: Number,
    memoryMB: Number,
    diskGB: Number,
    dockerImage: String,
    imageUrl: String,
  },
  active: {
    type: Boolean,
    default: true,
  },
  featured: {
    type: Boolean,
    default: false,
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

// Indexes
PricingTemplateSchema.index({ type: 1, active: 1 });
PricingTemplateSchema.index({ featured: -1, createdAt: -1 });

// Update timestamp
PricingTemplateSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.models.PricingTemplate || mongoose.model<IPricingTemplate>('PricingTemplate', PricingTemplateSchema);
