/**
 * MongoDB Settings Model
 * Stores global and user-specific settings
 */

import mongoose, { Schema, Document } from 'mongoose';

export interface IGlobalSettings extends Document {
  key: 'global'; // Singleton document
  app: {
    name: string;
    timezone: string;
    language: string;
  };
  appearance: {
    defaultTheme: 'light' | 'dark' | 'system';
    accentColor: string;
    compactMode: boolean;
  };
  containers: {
    defaultShell: string;
    terminalTheme: string;
  };
  vms: {
    defaultMemory: number;
    defaultCpu: number;
    defaultDiskSize: number;
    vncCompression: number;
    vncQuality: number;
  };
  storage: {
    poolPath: string;
    backupPath: string;
  };
  network: {
    defaultNetwork: string;
    ipRange: string;
  };
  security: {
    sessionTimeout: number;
    requireStrongPassword: boolean;
    maxLoginAttempts: number;
  };
  advanced: {
    debugMode: boolean;
    apiRateLimit: number;
  };
  updatedAt: Date;
}

export interface IUserSettings extends Document {
  userId: string;
  preferences: {
    theme?: 'light' | 'dark' | 'system';
    sidebarCollapsed?: boolean;
    dashboardLayout?: string;
  };
  filters: {
    vmStatus?: string[];
    containerStatus?: string[];
  };
  sorts: {
    vms?: string;
    containers?: string;
  };
  updatedAt: Date;
}

const GlobalSettingsSchema = new Schema<IGlobalSettings>(
  {
    key: {
      type: String,
      default: 'global',
      unique: true,
    },
    app: {
      name: { type: String, default: 'Machina' },
      timezone: { type: String, default: 'UTC' },
      language: { type: String, default: 'en' },
    },
    appearance: {
      defaultTheme: {
        type: String,
        enum: ['light', 'dark', 'system'],
        default: 'system',
      },
      accentColor: { type: String, default: '#3b82f6' },
      compactMode: { type: Boolean, default: false },
    },
    containers: {
      defaultShell: { type: String, default: '/bin/bash' },
      terminalTheme: { type: String, default: 'default' },
    },
    vms: {
      defaultMemory: { type: Number, default: 2048 },
      defaultCpu: { type: Number, default: 2 },
      defaultDiskSize: { type: Number, default: 20 },
      vncCompression: { type: Number, default: 2 },
      vncQuality: { type: Number, default: 6 },
    },
    storage: {
      poolPath: { type: String, default: '/var/lib/libvirt/images' },
      backupPath: { type: String, default: '/var/backups/machina' },
    },
    network: {
      defaultNetwork: { type: String, default: 'default' },
      ipRange: { type: String, default: '192.168.122.0/24' },
    },
    security: {
      sessionTimeout: { type: Number, default: 60 },
      requireStrongPassword: { type: Boolean, default: true },
      maxLoginAttempts: { type: Number, default: 5 },
    },
    advanced: {
      debugMode: { type: Boolean, default: false },
      apiRateLimit: { type: Number, default: 100 },
    },
  },
  {
    timestamps: true,
    collection: 'global_settings',
  }
);

const UserSettingsSchema = new Schema<IUserSettings>(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    preferences: {
      theme: {
        type: String,
        enum: ['light', 'dark', 'system'],
      },
      sidebarCollapsed: Boolean,
      dashboardLayout: String,
    },
    filters: {
      vmStatus: [String],
      containerStatus: [String],
    },
    sorts: {
      vms: String,
      containers: String,
    },
  },
  {
    timestamps: true,
    collection: 'user_settings',
  }
);

UserSettingsSchema.index({ userId: 1 });

export const GlobalSettings =
  mongoose.models.GlobalSettings ||
  mongoose.model<IGlobalSettings>('GlobalSettings', GlobalSettingsSchema);

export const UserSettings =
  mongoose.models.UserSettings ||
  mongoose.model<IUserSettings>('UserSettings', UserSettingsSchema);
