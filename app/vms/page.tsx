export default function VirtualMachinesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Virtual Machines</h1>
        <p className="text-muted-foreground">
          Manage your QEMU/KVM virtual machines
        </p>
      </div>
      
      <div className="flex items-center justify-center h-[400px] border-2 border-dashed rounded-lg">
        <div className="text-center space-y-3">
          <h3 className="text-xl font-semibold">VM Management</h3>
          <p className="text-muted-foreground max-w-md">
            VM management coming soon. You&apos;ll be able to view, create, start, stop, and manage QEMU/KVM virtual machines.
          </p>
        </div>
      </div>
    </div>
  );
}
