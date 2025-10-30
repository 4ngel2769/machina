'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import type { DashboardSettings } from '@/lib/dashboard-settings';
import { getRefreshIntervalLabel } from '@/lib/dashboard-settings';

interface DashboardSettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: DashboardSettings;
  onSettingsChange: (settings: DashboardSettings) => void;
  onReset: () => void;
}

export function DashboardSettingsPanel({
  open,
  onOpenChange,
  settings,
  onSettingsChange,
  onReset,
}: DashboardSettingsPanelProps) {
  const [localSettings, setLocalSettings] = useState<DashboardSettings>(settings);

  const handleSave = () => {
    onSettingsChange(localSettings);
    onOpenChange(false);
  };

  const handleReset = () => {
    onReset();
    onOpenChange(false);
  };

  const updateSetting = <K extends keyof DashboardSettings>(
    key: K,
    value: DashboardSettings[K]
  ) => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dashboard Settings</DialogTitle>
          <DialogDescription>
            Customize your dashboard layout and refresh preferences
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Section Visibility */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-3">Sections Visibility</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Toggle which sections appear on your dashboard
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="showSystemHealth" className="flex-1 cursor-pointer">
                  System Health Indicator
                </Label>
                <Switch
                  id="showSystemHealth"
                  checked={localSettings.showSystemHealth}
                  onCheckedChange={(checked) => updateSetting('showSystemHealth', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="showContainersSection" className="flex-1 cursor-pointer">
                  Containers Section
                </Label>
                <Switch
                  id="showContainersSection"
                  checked={localSettings.showContainersSection}
                  onCheckedChange={(checked) => updateSetting('showContainersSection', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="showVMsSection" className="flex-1 cursor-pointer">
                  Virtual Machines Section
                </Label>
                <Switch
                  id="showVMsSection"
                  checked={localSettings.showVMsSection}
                  onCheckedChange={(checked) => updateSetting('showVMsSection', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="showQuickActions" className="flex-1 cursor-pointer">
                  Quick Actions Panel
                </Label>
                <Switch
                  id="showQuickActions"
                  checked={localSettings.showQuickActions}
                  onCheckedChange={(checked) => updateSetting('showQuickActions', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="showActivityFeed" className="flex-1 cursor-pointer">
                  Activity Feed
                </Label>
                <Switch
                  id="showActivityFeed"
                  checked={localSettings.showActivityFeed}
                  onCheckedChange={(checked) => updateSetting('showActivityFeed', checked)}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Refresh Interval */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-3">Refresh Interval</h3>
              <p className="text-sm text-muted-foreground mb-4">
                How often dashboard stats are updated
              </p>
            </div>

            <RadioGroup
              value={localSettings.refreshInterval.toString()}
              onValueChange={(value) =>
                updateSetting('refreshInterval', parseInt(value) as DashboardSettings['refreshInterval'])
              }
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="2000" id="r1" />
                <Label htmlFor="r1" className="cursor-pointer">
                  {getRefreshIntervalLabel(2000)} (Recommended)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="5000" id="r2" />
                <Label htmlFor="r2" className="cursor-pointer">
                  {getRefreshIntervalLabel(5000)}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="10000" id="r3" />
                <Label htmlFor="r3" className="cursor-pointer">
                  {getRefreshIntervalLabel(10000)}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="30000" id="r4" />
                <Label htmlFor="r4" className="cursor-pointer">
                  {getRefreshIntervalLabel(30000)} (Battery Saver)
                </Label>
              </div>
            </RadioGroup>
          </div>

          <Separator />

          {/* Display Preferences */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-3">Display</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Adjust the dashboard layout
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex-1">
                <Label htmlFor="compactMode" className="cursor-pointer">
                  Compact Mode
                </Label>
                <p className="text-sm text-muted-foreground">
                  Reduce spacing for more information density
                </p>
              </div>
              <Switch
                id="compactMode"
                checked={localSettings.compactMode}
                onCheckedChange={(checked) => updateSetting('compactMode', checked)}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={handleReset}>
            Reset to Defaults
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
