export default function CreateVMPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create Virtual Machine</h1>
        <p className="text-muted-foreground">
          Create a new QEMU/KVM virtual machine
        </p>
      </div>
      
      <div className="flex items-center justify-center h-[400px] border-2 border-dashed rounded-lg">
        <div className="text-center space-y-3">
          <h3 className="text-xl font-semibold">VM Creation Wizard</h3>
          <p className="text-muted-foreground max-w-md">
            VM creation wizard coming soon. You&apos;ll be able to create new virtual machines with custom configurations.
          </p>
        </div>
      </div>
    </div>
  );
}
