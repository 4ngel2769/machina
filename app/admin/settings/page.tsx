'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Save, RotateCcw, Download, Upload, Loader2, Info, Code, Calendar, GitCommit } from 'lucide-react';

interface VersionInfo {
  version: string;
  name: string;
  description: string;
  buildDate: string;
  commitHash: string;
  nodeVersion: string;
  environment: string;
}

interface GlobalSettings {
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
}

export default function AdminSettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [settings, setSettings] = useState<GlobalSettings | null>(null);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Check admin access
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated' && session?.user?.role !== 'admin') {
      router.push('/');
      toast.error('Access denied. Admin privileges required.');
    }
  }, [status, session, router]);

  useEffect(() => {
    fetchSettings();
    fetchVersionInfo();
  }, []);

  // Don't render if not admin
  if (status === 'loading') {
    return <div>Loading...</div>;
  }

  if (status === 'authenticated' && session?.user?.role !== 'admin') {
    return null;
  }

  const fetchVersionInfo = async () => {
    try {
      const response = await fetch('/api/version');
      if (response.ok) {
        const data = await response.json();
        setVersionInfo(data);
      }
    } catch (error) {
      console.error('Failed to fetch version info:', error);
    }
  };

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/settings/global');
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      } else {
        toast.error('Failed to load settings');
      }
    } catch {
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    if (!settings) return;

    setSaving(true);
    try {
      const response = await fetch('/api/settings/global', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        toast.success('Settings saved successfully');
      } else {
        toast.error('Failed to save settings');
      }
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const resetSettings = async () => {
    if (!confirm('Are you sure you want to reset all settings to defaults?')) return;

    setSaving(true);
    try {
      const response = await fetch('/api/settings/global/reset', {
        method: 'POST',
      });

      if (response.ok) {
        toast.success('Settings reset to defaults');
        fetchSettings();
      } else {
        toast.error('Failed to reset settings');
      }
    } catch {
      toast.error('Failed to reset settings');
    } finally {
      setSaving(false);
    }
  };

  const exportSettings = async () => {
    try {
      const response = await fetch('/api/settings/global/export', {
        method: 'PATCH',
      });

      if (response.ok) {
        const data = await response.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `machina-settings-${new Date().toISOString()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Settings exported');
      } else {
        toast.error('Failed to export settings');
      }
    } catch {
      toast.error('Failed to export settings');
    }
  };

  const importSettings = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      const response = await fetch('/api/settings/global/import', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(`Imported ${result.imported.users} user settings`);
        fetchSettings();
      } else {
        toast.error('Failed to import settings');
      }
    } catch {
      toast.error('Failed to import settings');
    }
  };

  const updateSetting = (path: string[], value: string | number | boolean) => {
    if (!settings) return;

    const newSettings = { ...settings };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let current: any = newSettings;

    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]];
    }

    current[path[path.length - 1]] = value;
    setSettings(newSettings);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-8">
          <p className="text-muted-foreground">Failed to load settings</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Manage application configuration</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportSettings} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.json';
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) importSettings(file);
              };
              input.click();
            }}
            variant="outline"
            size="sm"
          >
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>
          <Button onClick={resetSettings} variant="outline" size="sm" disabled={saving}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <Button onClick={saveSettings} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="containers">Containers</TabsTrigger>
          <TabsTrigger value="vms">Virtual Machines</TabsTrigger>
          <TabsTrigger value="storage">Storage</TabsTrigger>
          <TabsTrigger value="network">Network</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
          <TabsTrigger value="about">About</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>Basic application configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="appName">Application Name</Label>
                <Input
                  id="appName"
                  value={settings.app.name}
                  onChange={(e) => updateSetting(['app', 'name'], e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Select
                  value={settings.app.timezone}
                  onValueChange={(value) => updateSetting(['app', 'timezone'], value)}
                >
                  <SelectTrigger id="timezone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UTC">UTC</SelectItem>
                    <SelectItem value="America/New_York">America/New York</SelectItem>
                    <SelectItem value="America/Los_Angeles">America/Los Angeles</SelectItem>
                    <SelectItem value="Europe/London">Europe/London</SelectItem>
                    <SelectItem value="Asia/Tokyo">Asia/Tokyo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="language">Language</Label>
                <Select
                  value={settings.app.language}
                  onValueChange={(value) => updateSetting(['app', 'language'], value)}
                >
                  <SelectTrigger id="language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Español</SelectItem>
                    <SelectItem value="fr">Français</SelectItem>
                    <SelectItem value="de">Deutsch</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>Customize the look and feel</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="theme">Default Theme</Label>
                <Select
                  value={settings.appearance.defaultTheme}
                  onValueChange={(value) => updateSetting(['appearance', 'defaultTheme'], value)}
                >
                  <SelectTrigger id="theme">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="accentColor">Accent Color</Label>
                <Input
                  id="accentColor"
                  type="color"
                  value={settings.appearance.accentColor}
                  onChange={(e) => updateSetting(['appearance', 'accentColor'], e.target.value)}
                  className="h-10 w-20"
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Compact Mode</Label>
                  <p className="text-sm text-muted-foreground">Reduce spacing and padding</p>
                </div>
                <Switch
                  checked={settings.appearance.compactMode}
                  onCheckedChange={(checked) => updateSetting(['appearance', 'compactMode'], checked)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="containers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Container Settings</CardTitle>
              <CardDescription>Default container configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="defaultShell">Default Shell</Label>
                <Input
                  id="defaultShell"
                  value={settings.containers.defaultShell}
                  onChange={(e) => updateSetting(['containers', 'defaultShell'], e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="terminalTheme">Terminal Theme</Label>
                <Select
                  value={settings.containers.terminalTheme}
                  onValueChange={(value) => updateSetting(['containers', 'terminalTheme'], value)}
                >
                  <SelectTrigger id="terminalTheme">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default</SelectItem>
                    <SelectItem value="monokai">Monokai</SelectItem>
                    <SelectItem value="solarized">Solarized</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vms" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Virtual Machine Settings</CardTitle>
              <CardDescription>Default VM resource allocation</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="defaultMemory">Default Memory (MB)</Label>
                <Input
                  id="defaultMemory"
                  type="number"
                  value={settings.vms.defaultMemory}
                  onChange={(e) => updateSetting(['vms', 'defaultMemory'], parseInt(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="defaultCpu">Default CPU Cores</Label>
                <Input
                  id="defaultCpu"
                  type="number"
                  value={settings.vms.defaultCpu}
                  onChange={(e) => updateSetting(['vms', 'defaultCpu'], parseInt(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="defaultDiskSize">Default Disk Size (GB)</Label>
                <Input
                  id="defaultDiskSize"
                  type="number"
                  value={settings.vms.defaultDiskSize}
                  onChange={(e) => updateSetting(['vms', 'defaultDiskSize'], parseInt(e.target.value))}
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="vncCompression">VNC Compression Level (0-9)</Label>
                <Input
                  id="vncCompression"
                  type="number"
                  min="0"
                  max="9"
                  value={settings.vms.vncCompression}
                  onChange={(e) => updateSetting(['vms', 'vncCompression'], parseInt(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vncQuality">VNC Quality (0-9)</Label>
                <Input
                  id="vncQuality"
                  type="number"
                  min="0"
                  max="9"
                  value={settings.vms.vncQuality}
                  onChange={(e) => updateSetting(['vms', 'vncQuality'], parseInt(e.target.value))}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="storage" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Storage Settings</CardTitle>
              <CardDescription>Configure storage locations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="poolPath">Storage Pool Path</Label>
                <Input
                  id="poolPath"
                  value={settings.storage.poolPath}
                  onChange={(e) => updateSetting(['storage', 'poolPath'], e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="backupPath">Backup Path</Label>
                <Input
                  id="backupPath"
                  value={settings.storage.backupPath}
                  onChange={(e) => updateSetting(['storage', 'backupPath'], e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="network" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Network Settings</CardTitle>
              <CardDescription>Configure network defaults</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="defaultNetwork">Default Network</Label>
                <Input
                  id="defaultNetwork"
                  value={settings.network.defaultNetwork}
                  onChange={(e) => updateSetting(['network', 'defaultNetwork'], e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ipRange">IP Range</Label>
                <Input
                  id="ipRange"
                  value={settings.network.ipRange}
                  onChange={(e) => updateSetting(['network', 'ipRange'], e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
              <CardDescription>Configure security and authentication</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sessionTimeout">Session Timeout (minutes)</Label>
                <Input
                  id="sessionTimeout"
                  type="number"
                  value={settings.security.sessionTimeout}
                  onChange={(e) => updateSetting(['security', 'sessionTimeout'], parseInt(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxLoginAttempts">Max Login Attempts</Label>
                <Input
                  id="maxLoginAttempts"
                  type="number"
                  value={settings.security.maxLoginAttempts}
                  onChange={(e) => updateSetting(['security', 'maxLoginAttempts'], parseInt(e.target.value))}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Require Strong Passwords</Label>
                  <p className="text-sm text-muted-foreground">Enforce password complexity rules</p>
                </div>
                <Switch
                  checked={settings.security.requireStrongPassword}
                  onCheckedChange={(checked) => updateSetting(['security', 'requireStrongPassword'], checked)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="advanced" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Advanced Settings</CardTitle>
              <CardDescription>Developer and advanced options</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="apiRateLimit">API Rate Limit (requests/minute)</Label>
                <Input
                  id="apiRateLimit"
                  type="number"
                  value={settings.advanced.apiRateLimit}
                  onChange={(e) => updateSetting(['advanced', 'apiRateLimit'], parseInt(e.target.value))}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Debug Mode</Label>
                  <p className="text-sm text-muted-foreground">Enable verbose logging</p>
                </div>
                <Switch
                  checked={settings.advanced.debugMode}
                  onCheckedChange={(checked) => updateSetting(['advanced', 'debugMode'], checked)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="about" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>About Machina</CardTitle>
              <CardDescription>Version and system information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {versionInfo ? (
                <>
                  {/* Version Info */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Info className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{versionInfo.name}</p>
                        <p className="text-sm text-muted-foreground">{versionInfo.description}</p>
                      </div>
                    </div>
                    <Separator />
                    <div className="grid gap-3">
                      <div className="flex items-center gap-2">
                        <Code className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Version:</span>
                        <span className="text-sm text-muted-foreground font-mono">v{versionInfo.version}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Build Date:</span>
                        <span className="text-sm text-muted-foreground">
                          {new Date(versionInfo.buildDate).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <GitCommit className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Commit:</span>
                        <span className="text-sm text-muted-foreground font-mono">{versionInfo.commitHash}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Code className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Node.js:</span>
                        <span className="text-sm text-muted-foreground font-mono">{versionInfo.nodeVersion}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Info className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Environment:</span>
                        <span className="text-sm text-muted-foreground capitalize">{versionInfo.environment}</span>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Technology Stack */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">Technology Stack</h3>
                    <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                      <div>• Next.js 16</div>
                      <div>• React 19</div>
                      <div>• TypeScript</div>
                      <div>• Tailwind CSS</div>
                      <div>• Docker API</div>
                      <div>• Libvirt</div>
                      <div>• MongoDB</div>
                      <div>• NextAuth.js</div>
                    </div>
                  </div>

                  <Separator />

                  {/* Links */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">Resources</h3>
                    <div className="flex flex-col gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <a href="/help" target="_blank" rel="noopener noreferrer">
                          Documentation
                        </a>
                      </Button>
                      <Button variant="outline" size="sm" asChild>
                        <a href="https://github.com/4ngel2769/machina" target="_blank" rel="noopener noreferrer">
                          GitHub Repository
                        </a>
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center text-muted-foreground py-4">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                  <p>Loading version information...</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
