/**
 * MongoDB model that tracks per-user isolated virtual networks and static IP allocations
 */

import mongoose, { Document, Schema } from 'mongoose';

export interface IUserNetworkAllocation {
  vmName: string;
  ipAddress: string;
  macAddress: string;
  createdAt: Date;
}

export interface IUserNetwork extends Document {
  userId: string;
  username?: string;
  networkName: string;
  subnetCidr: string;
  gateway: string;
  dhcpRange: {
    start: string;
    end: string;
  };
  allocations: IUserNetworkAllocation[];
  createdAt: Date;
  updatedAt: Date;
}

const UserNetworkAllocationSchema = new Schema<IUserNetworkAllocation>(
  {
    vmName: {
      type: String,
      required: true,
      index: true,
    },
    ipAddress: {
      type: String,
      required: true,
      index: true,
    },
    macAddress: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const UserNetworkSchema = new Schema<IUserNetwork>(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    username: {
      type: String,
    },
    networkName: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    subnetCidr: {
      type: String,
      required: true,
      unique: true,
    },
    gateway: {
      type: String,
      required: true,
    },
    dhcpRange: {
      start: {
        type: String,
        required: true,
      },
      end: {
        type: String,
        required: true,
      },
    },
    allocations: {
      type: [UserNetworkAllocationSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    collection: 'user_networks',
  }
);

UserNetworkSchema.index({ subnetCidr: 1 }, { unique: true });
UserNetworkSchema.index({ networkName: 1 }, { unique: true });
UserNetworkSchema.index({ 'allocations.vmName': 1 });

export const UserNetwork =
  mongoose.models.UserNetwork ||
  mongoose.model<IUserNetwork>('UserNetwork', UserNetworkSchema);
