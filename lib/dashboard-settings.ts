// Dashboard settings management with localStorage persistence

export interface DashboardSettings {
  // Section visibility
  showSystemHealth: boolean;
  showContainersSection: boolean;
  showVMsSection: boolean;
  showActivityFeed: boolean;
  showQuickActions: boolean;
  
  // Refresh interval in milliseconds
  refreshInterval: 2000 | 5000 | 10000 | 30000;
  
  // Display preferences
  compactMode: boolean;
}

const DEFAULT_SETTINGS: DashboardSettings = {
  showSystemHealth: true,
  showContainersSection: true,
  showVMsSection: true,
  showActivityFeed: true,
  showQuickActions: true,
  refreshInterval: 2000,
  compactMode: false,
};

const STORAGE_KEY = 'machina_dashboard_settings';

export function loadDashboardSettings(): DashboardSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_SETTINGS;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return DEFAULT_SETTINGS;
    }

    const parsed = JSON.parse(stored) as Partial<DashboardSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (error) {
    console.error('Failed to load dashboard settings:', error);
    return DEFAULT_SETTINGS;
  }
}

export function saveDashboardSettings(settings: DashboardSettings): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save dashboard settings:', error);
  }
}

export function resetDashboardSettings(): DashboardSettings {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
  }
  return DEFAULT_SETTINGS;
}

export function getRefreshIntervalLabel(interval: number): string {
  switch (interval) {
    case 2000:
      return '2 seconds';
    case 5000:
      return '5 seconds';
    case 10000:
      return '10 seconds';
    case 30000:
      return '30 seconds';
    default:
      return `${interval / 1000} seconds`;
  }
}
