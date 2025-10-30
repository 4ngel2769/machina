/**
 * Settings storage system using JSON files
 * Stores application and user preferences
 */

import fs from 'fs';
import path from 'path';
import logger from './logger';

const SETTINGS_DIR = path.join(process.cwd(), 'data', 'settings');
const GLOBAL_SETTINGS_FILE = path.join(SETTINGS_DIR, 'global.json');
const USER_SETTINGS_DIR = path.join(SETTINGS_DIR, 'users');

// Ensure settings directories exist
function ensureSettingsDirs() {
  if (!fs.existsSync(SETTINGS_DIR)) {
    fs.mkdirSync(SETTINGS_DIR, { recursive: true });
  }
  if (!fs.existsSync(USER_SETTINGS_DIR)) {
    fs.mkdirSync(USER_SETTINGS_DIR, { recursive: true });
  }
}

export interface GlobalSettings {
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
    sessionTimeout: number; // minutes
    requireStrongPassword: boolean;
    maxLoginAttempts: number;
  };
  advanced: {
    debugMode: boolean;
    apiRateLimit: number;
  };
}

export interface UserSettings {
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
}

// Default global settings
const defaultGlobalSettings: GlobalSettings = {
  app: {
    name: 'Machina',
    timezone: 'UTC',
    language: 'en',
  },
  appearance: {
    defaultTheme: 'system',
    accentColor: '#3b82f6',
    compactMode: false,
  },
  containers: {
    defaultShell: '/bin/bash',
    terminalTheme: 'default',
  },
  vms: {
    defaultMemory: 2048,
    defaultCpu: 2,
    defaultDiskSize: 20,
    vncCompression: 2,
    vncQuality: 6,
  },
  storage: {
    poolPath: '/var/lib/libvirt/images',
    backupPath: '/var/backups/machina',
  },
  network: {
    defaultNetwork: 'default',
    ipRange: '192.168.122.0/24',
  },
  security: {
    sessionTimeout: 60,
    requireStrongPassword: true,
    maxLoginAttempts: 5,
  },
  advanced: {
    debugMode: false,
    apiRateLimit: 100,
  },
};

// Get global settings
export function getGlobalSettings(): GlobalSettings {
  ensureSettingsDirs();
  
  try {
    if (fs.existsSync(GLOBAL_SETTINGS_FILE)) {
      const data = fs.readFileSync(GLOBAL_SETTINGS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    logger.error('Failed to read global settings', { error });
  }
  
  return defaultGlobalSettings;
}

// Save global settings
export function saveGlobalSettings(settings: GlobalSettings): boolean {
  ensureSettingsDirs();
  
  try {
    fs.writeFileSync(
      GLOBAL_SETTINGS_FILE,
      JSON.stringify(settings, null, 2),
      'utf-8'
    );
    logger.info('Global settings saved');
    return true;
  } catch (error) {
    logger.error('Failed to save global settings', { error });
    return false;
  }
}

// Reset global settings to defaults
export function resetGlobalSettings(): boolean {
  return saveGlobalSettings(defaultGlobalSettings);
}

// Get user settings
export function getUserSettings(userId: string): UserSettings {
  ensureSettingsDirs();
  
  const userFile = path.join(USER_SETTINGS_DIR, `${userId}.json`);
  
  try {
    if (fs.existsSync(userFile)) {
      const data = fs.readFileSync(userFile, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    logger.error('Failed to read user settings', { userId, error });
  }
  
  // Return default user settings
  return {
    userId,
    preferences: {},
    filters: {},
    sorts: {},
  };
}

// Save user settings
export function saveUserSettings(settings: UserSettings): boolean {
  ensureSettingsDirs();
  
  const userFile = path.join(USER_SETTINGS_DIR, `${settings.userId}.json`);
  
  try {
    fs.writeFileSync(
      userFile,
      JSON.stringify(settings, null, 2),
      'utf-8'
    );
    logger.info('User settings saved', { userId: settings.userId });
    return true;
  } catch (error) {
    logger.error('Failed to save user settings', { userId: settings.userId, error });
    return false;
  }
}

// Update partial user settings
export function updateUserSettings(
  userId: string,
  updates: Partial<UserSettings>
): boolean {
  const current = getUserSettings(userId);
  const updated = {
    ...current,
    ...updates,
    userId, // Ensure userId doesn't change
    preferences: { ...current.preferences, ...updates.preferences },
    filters: { ...current.filters, ...updates.filters },
    sorts: { ...current.sorts, ...updates.sorts },
  };
  
  return saveUserSettings(updated);
}

// Export all settings (for backup)
export function exportAllSettings() {
  const globalSettings = getGlobalSettings();
  const userSettingsFiles = fs.existsSync(USER_SETTINGS_DIR)
    ? fs.readdirSync(USER_SETTINGS_DIR)
    : [];
  
  const userSettings = userSettingsFiles
    .filter(file => file.endsWith('.json'))
    .map(file => {
      const userId = file.replace('.json', '');
      return getUserSettings(userId);
    });
  
  return {
    global: globalSettings,
    users: userSettings,
    exportedAt: new Date().toISOString(),
    version: '1.0',
  };
}

// Import settings (from backup)
export function importSettings(data: {
  global?: GlobalSettings;
  users?: UserSettings[];
}): { success: boolean; imported: { global: boolean; users: number } } {
  const result = {
    success: true,
    imported: { global: false, users: 0 },
  };
  
  if (data.global) {
    result.imported.global = saveGlobalSettings(data.global);
    if (!result.imported.global) result.success = false;
  }
  
  if (data.users && Array.isArray(data.users)) {
    for (const userSettings of data.users) {
      if (saveUserSettings(userSettings)) {
        result.imported.users++;
      } else {
        result.success = false;
      }
    }
  }
  
  return result;
}
