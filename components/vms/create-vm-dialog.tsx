'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useVMs } from '@/hooks/use-vms';
import { 
  ChevronLeft, 
  ChevronRight, 
  Download, 
  FileUp, 
  Link as LinkIcon, 
  Network as NetworkIcon,
  Cpu,
  MemoryStick,
  HardDrive,
  Check,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import osImagesData from '@/config/os-images.json';

// Client-side VM name generator
function generateVMName(osVariant?: string): string {
  const prefix = osVariant ? osVariant.split(/[0-9]/)[0] : 'vm';
  const random = Math.random().toString(36).substring(2, 6);
  return `vm-${prefix}-${random}`;
}

interface CreateVMDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type InstallationType = 'download' | 'local' | 'url' | 'pxe';

export function CreateVMDialog({ open, onOpenChange }: CreateVMDialogProps) {
  const { createVM, storagePools, networks, fetchStoragePools, fetchNetworks } = useVMs();
  const [step, setStep] = useState(1);
  const [isCreating, setIsCreating] = useState(false);
  
  // Form state
  const [installationType, setInstallationType] = useState<InstallationType>('download');
  const [selectedOS, setSelectedOS] = useState('');
  const [isoSource, setIsoSource] = useState('');
  const [vmName, setVMName] = useState('');
  const [memory, setMemory] = useState('2048');
  const [vcpus, setVCpus] = useState('2');
  const [diskSize, setDiskSize] = useState('25');
  const [selectedPool, setSelectedPool] = useState('default');
  const [selectedNetwork, setSelectedNetwork] = useState('default');

  // Fetch pools and networks when dialog opens
  useEffect(() => {
    if (open) {
      fetchStoragePools();
      fetchNetworks();
    }
  }, [open, fetchStoragePools, fetchNetworks]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep(1);
        setInstallationType('download');
        setSelectedOS('');
        setIsoSource('');
        setVMName('');
        setMemory('2048');
        setVCpus('2');
        setDiskSize('25');
        setSelectedPool('default');
        setSelectedNetwork('default');
      }, 300);
    }
  }, [open]);

  const getOSImage = () => {
    return osImagesData.find(img => img.id === selectedOS);
  };

  const handleNext = () => {
    // Validation for each step
    if (step === 1) {
      if (installationType === 'download' && !selectedOS) {
        toast.error('Please select an OS to download');
        return;
      }
      if (installationType === 'local' && !isoSource) {
        toast.error('Please select an ISO file');
        return;
      }
      if (installationType === 'url' && !isoSource) {
        toast.error('Please enter an ISO URL');
        return;
      }
    }
    
    if (step === 2) {
      if (!vmName) {
        toast.error('Please enter a VM name');
        return;
      }
      if (parseInt(memory) < 512) {
        toast.error('Memory must be at least 512 MB');
        return;
      }
      if (parseInt(vcpus) < 1) {
        toast.error('vCPUs must be at least 1');
        return;
      }
      if (parseInt(diskSize) < 1) {
        toast.error('Disk size must be at least 1 GB');
        return;
      }
    }
    
    setStep(step + 1);
  };

  const handleBack = () => {
    setStep(step - 1);
  };

  const handleCreate = async () => {
    setIsCreating(true);
    
    try {
      const osImage = getOSImage();
      
      const vmData = {
        name: vmName,
        installation_medium: {
          type: installationType,
          source: installationType === 'download' ? osImage?.downloadUrl : isoSource,
          os_variant: installationType === 'download' ? osImage?.variant : undefined,
        },
        storage: {
          pool: selectedPool,
          size: parseInt(diskSize),
          format: 'qcow2' as const,
        },
        memory: parseInt(memory),
        vcpus: parseInt(vcpus),
        network: {
          type: 'network' as const,
          source: selectedNetwork,
        },
      };
      
      await createVM(vmData);
      toast.success(`VM "${vmName}" creation initiated successfully`);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create VM');
    } finally {
      setIsCreating(false);
    }
  };

  // Generate VM name when OS is selected
  useEffect(() => {
    if (selectedOS && !vmName) {
      const osImage = getOSImage();
      setVMName(generateVMName(osImage?.variant));
      
      // Set recommended specs
      if (osImage) {
        setMemory(osImage.minMemory.toString());
        setDiskSize(osImage.minDisk.toString());
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOS]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Virtual Machine</DialogTitle>
          <DialogDescription>
            Step {step} of 4 - {
              step === 1 ? 'Choose Installation Method' :
              step === 2 ? 'Configure VM Resources' :
              step === 3 ? 'Select Network & Storage' :
              'Review & Create'
            }
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: OS Selection */}
        {step === 1 && (
          <div className="space-y-4">
            <Tabs value={installationType} onValueChange={(v) => setInstallationType(v as InstallationType)}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="download">
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </TabsTrigger>
                <TabsTrigger value="local">
                  <FileUp className="h-4 w-4 mr-2" />
                  Local ISO
                </TabsTrigger>
                <TabsTrigger value="url">
                  <LinkIcon className="h-4 w-4 mr-2" />
                  URL
                </TabsTrigger>
                <TabsTrigger value="pxe">
                  <NetworkIcon className="h-4 w-4 mr-2" />
                  PXE
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {installationType === 'download' && (
              <div className="space-y-3">
                <Label>Select Operating System</Label>
                <div className="grid grid-cols-1 gap-3 max-h-[400px] overflow-y-auto">
                  {osImagesData.map((os) => (
                    <Card
                      key={os.id}
                      className={`cursor-pointer transition-colors ${
                        selectedOS === os.id ? 'border-primary bg-primary/5' : 'hover:bg-accent'
                      }`}
                      onClick={() => setSelectedOS(os.id)}
                    >
                      <CardHeader className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="text-base">{os.name}</CardTitle>
                            <CardDescription className="mt-1">
                              {os.minMemory} MB RAM • {os.minDisk} GB Disk
                              {os.category && (
                                <Badge variant="outline" className="ml-2 text-xs">
                                  {os.category.replace('_', ' ')}
                                </Badge>
                              )}
                            </CardDescription>
                          </div>
                          {selectedOS === os.id && (
                            <Check className="h-5 w-5 text-primary" />
                          )}
                        </div>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {installationType === 'local' && (
              <div className="space-y-2">
                <Label htmlFor="iso-path">ISO File Path</Label>
                <Input
                  id="iso-path"
                  placeholder="/path/to/your/image.iso"
                  value={isoSource}
                  onChange={(e) => setIsoSource(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Enter the full path to an ISO file on your system
                </p>
              </div>
            )}

            {installationType === 'url' && (
              <div className="space-y-2">
                <Label htmlFor="iso-url">ISO URL</Label>
                <Input
                  id="iso-url"
                  placeholder="https://example.com/image.iso"
                  value={isoSource}
                  onChange={(e) => setIsoSource(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Enter a URL to download the ISO from
                </p>
              </div>
            )}

            {installationType === 'pxe' && (
              <div className="flex flex-col items-center justify-center py-12 space-y-3">
                <NetworkIcon className="h-12 w-12 text-muted-foreground" />
                <h3 className="font-semibold">PXE Network Boot</h3>
                <p className="text-sm text-muted-foreground text-center max-w-md">
                  The VM will boot from the network using PXE. Ensure your network has a PXE server configured.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 2: VM Configuration */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="vm-name">VM Name</Label>
              <Input
                id="vm-name"
                placeholder="my-vm"
                value={vmName}
                onChange={(e) => setVMName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="memory" className="flex items-center gap-2">
                  <MemoryStick className="h-4 w-4" />
                  Memory (MB)
                </Label>
                <Input
                  id="memory"
                  type="number"
                  min="512"
                  max="65536"
                  value={memory}
                  onChange={(e) => setMemory(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="vcpus" className="flex items-center gap-2">
                  <Cpu className="h-4 w-4" />
                  vCPUs
                </Label>
                <Input
                  id="vcpus"
                  type="number"
                  min="1"
                  max="32"
                  value={vcpus}
                  onChange={(e) => setVCpus(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="disk" className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4" />
                  Disk (GB)
                </Label>
                <Input
                  id="disk"
                  type="number"
                  min="1"
                  max="1000"
                  value={diskSize}
                  onChange={(e) => setDiskSize(e.target.value)}
                />
              </div>
            </div>

            {getOSImage() && (
              <Card className="bg-muted/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Recommended Specifications</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <p>{getOSImage()?.name}: {getOSImage()?.minMemory} MB RAM, {getOSImage()?.minDisk} GB Disk</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Step 3: Network & Storage */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="storage-pool">Storage Pool</Label>
              <Select value={selectedPool} onValueChange={setSelectedPool}>
                <SelectTrigger id="storage-pool">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {storagePools.length === 0 ? (
                    <SelectItem value="default">default (no pools available)</SelectItem>
                  ) : (
                    storagePools.map((pool) => (
                      <SelectItem key={pool.name} value={pool.name}>
                        {pool.name} ({pool.type})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Where the VM disk image will be stored
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="network">Virtual Network</Label>
              <Select value={selectedNetwork} onValueChange={setSelectedNetwork}>
                <SelectTrigger id="network">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {networks.length === 0 ? (
                    <SelectItem value="default">default (no networks available)</SelectItem>
                  ) : (
                    networks.map((net) => (
                      <SelectItem key={net.name} value={net.name}>
                        {net.name} ({net.mode})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Network configuration for the VM
              </p>
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {step === 4 && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">VM Configuration Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-muted-foreground">Name:</span>
                  <span className="font-medium">{vmName}</span>
                  
                  <span className="text-muted-foreground">Installation:</span>
                  <span className="font-medium capitalize">{installationType}</span>
                  
                  {installationType === 'download' && getOSImage() && (
                    <>
                      <span className="text-muted-foreground">OS:</span>
                      <span className="font-medium">{getOSImage()?.name}</span>
                    </>
                  )}
                  
                  <span className="text-muted-foreground">Memory:</span>
                  <span className="font-medium">{memory} MB</span>
                  
                  <span className="text-muted-foreground">vCPUs:</span>
                  <span className="font-medium">{vcpus}</span>
                  
                  <span className="text-muted-foreground">Disk:</span>
                  <span className="font-medium">{diskSize} GB</span>
                  
                  <span className="text-muted-foreground">Storage Pool:</span>
                  <span className="font-medium">{selectedPool}</span>
                  
                  <span className="text-muted-foreground">Network:</span>
                  <span className="font-medium">{selectedNetwork}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-yellow-500/50 bg-yellow-500/5">
              <CardContent className="pt-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-2">Note:</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>VM creation may take a few moments</li>
                  <li>The VM will be created in a stopped state</li>
                  <li>You can start it from the VM list after creation</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={step === 1 || isCreating}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          
          {step < 4 ? (
            <Button onClick={handleNext}>
              Next
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={handleCreate} disabled={isCreating}>
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create VM'
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
