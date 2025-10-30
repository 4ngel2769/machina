'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useVMs } from '@/hooks/use-vms';
import { Plus, Trash2, Network, Play, Square } from 'lucide-react';
import { toast } from 'sonner';

interface VirtualNetworksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VirtualNetworksDialog({ open, onOpenChange }: VirtualNetworksDialogProps) {
  const { 
    networks, 
    networksLoading, 
    fetchNetworks, 
    createNetwork, 
    deleteNetwork,
    startNetwork,
    stopNetwork 
  } = useVMs();
  
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [deleteNetworkName, setDeleteNetworkName] = useState<string | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    mode: 'nat' as 'nat' | 'bridge' | 'isolated',
    ip_range: '192.168.100.0/24',
    dhcp_enabled: true,
  });

  useEffect(() => {
    if (open) {
      fetchNetworks();
    }
  }, [open, fetchNetworks]);

  const handleCreate = async () => {
    if (!formData.name) {
      toast.error('Please enter a network name');
      return;
    }

    try {
      await createNetwork(formData);
      toast.success(`Virtual network "${formData.name}" created successfully`);
      setFormData({ 
        name: '', 
        mode: 'nat', 
        ip_range: '192.168.100.0/24', 
        dhcp_enabled: true 
      });
      setShowCreateForm(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create network');
    }
  };

  const handleDelete = async () => {
    if (!deleteNetworkName) return;

    try {
      await deleteNetwork(deleteNetworkName);
      toast.success(`Network "${deleteNetworkName}" deleted`);
      setDeleteNetworkName(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete network');
    }
  };

  const handleToggleNetwork = async (name: string, isActive: boolean) => {
    try {
      if (isActive) {
        await stopNetwork(name);
        toast.success(`Network "${name}" stopped`);
      } else {
        await startNetwork(name);
        toast.success(`Network "${name}" started`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to toggle network');
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Network className="h-5 w-5" />
              Virtual Networks
            </DialogTitle>
            <DialogDescription>
              Manage libvirt virtual networks for VM connectivity
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Create Form */}
            {showCreateForm ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Create Virtual Network</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="network-name">Network Name</Label>
                    <Input
                      id="network-name"
                      placeholder="my-network"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="network-mode">Mode</Label>
                    <Select
                      value={formData.mode}
                      onValueChange={(value: 'nat' | 'bridge' | 'isolated') => 
                        setFormData({ ...formData, mode: value })
                      }
                    >
                      <SelectTrigger id="network-mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nat">NAT (Network Address Translation)</SelectItem>
                        <SelectItem value="bridge">Bridge</SelectItem>
                        <SelectItem value="isolated">Isolated</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {formData.mode === 'nat' && 'VMs can access external networks through host'}
                      {formData.mode === 'bridge' && 'VMs appear as peers on the physical network'}
                      {formData.mode === 'isolated' && 'VMs can only communicate with each other'}
                    </p>
                  </div>

                  {formData.mode !== 'bridge' && (
                    <div className="space-y-2">
                      <Label htmlFor="network-range">IP Range (CIDR)</Label>
                      <Input
                        id="network-range"
                        placeholder="192.168.100.0/24"
                        value={formData.ip_range}
                        onChange={(e) => setFormData({ ...formData, ip_range: e.target.value })}
                      />
                    </div>
                  )}

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="dhcp-enabled"
                      checked={formData.dhcp_enabled}
                      onCheckedChange={(checked) => 
                        setFormData({ ...formData, dhcp_enabled: checked })
                      }
                    />
                    <Label htmlFor="dhcp-enabled">Enable DHCP</Label>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowCreateForm(false);
                        setFormData({ 
                          name: '', 
                          mode: 'nat', 
                          ip_range: '192.168.100.0/24', 
                          dhcp_enabled: true 
                        });
                      }}
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleCreate}>Create Network</Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Button onClick={() => setShowCreateForm(true)} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Create Virtual Network
              </Button>
            )}

            {/* Networks List */}
            {networksLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading networks...
              </div>
            ) : networks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No virtual networks found
              </div>
            ) : (
              <div className="space-y-3">
                {networks.map((network) => (
                  <Card key={network.name}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Network className="h-4 w-4" />
                            {network.name}
                            <Badge variant={network.state === 'active' ? 'default' : 'secondary'}>
                              {network.state}
                            </Badge>
                            {network.autostart && (
                              <Badge variant="outline" className="text-xs">
                                autostart
                              </Badge>
                            )}
                          </CardTitle>
                          <CardDescription className="mt-1">
                            Mode: {network.mode}
                            {network.ip_range && ` • ${network.ip_range}`}
                            {network.dhcp_enabled && ' • DHCP enabled'}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleToggleNetwork(network.name, network.state === 'active')}
                          >
                            {network.state === 'active' ? (
                              <Square className="h-4 w-4" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteNetworkName(network.name)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteNetworkName} onOpenChange={() => setDeleteNetworkName(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Virtual Network</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the network <strong>{deleteNetworkName}</strong>?
              Active VMs using this network may lose connectivity.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
