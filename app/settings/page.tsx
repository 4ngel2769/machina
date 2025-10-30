export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Configure application settings and preferences
        </p>
      </div>
      
      <div className="flex items-center justify-center h-[400px] border-2 border-dashed rounded-lg">
        <div className="text-center space-y-3">
          <h3 className="text-xl font-semibold">Application Settings</h3>
          <p className="text-muted-foreground max-w-md">
            Settings coming soon. You&apos;ll be able to configure Docker connection, libvirt settings, and application preferences.
          </p>
        </div>
      </div>
    </div>
  );
}
