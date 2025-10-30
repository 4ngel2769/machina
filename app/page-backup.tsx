export default function ContainersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Containers</h1>
        <p className="text-muted-foreground">
          Manage your Docker containers
        </p>
      </div>
      
      <div className="flex items-center justify-center h-[400px] border-2 border-dashed rounded-lg">
        <div className="text-center space-y-3">
          <h3 className="text-xl font-semibold">Container Management</h3>
          <p className="text-muted-foreground max-w-md">
            Container management coming soon. You&apos;ll be able to view, create, start, stop, and manage Docker containers.
          </p>
        </div>
      </div>
    </div>
  );
}
