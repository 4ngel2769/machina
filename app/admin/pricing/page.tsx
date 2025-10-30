'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import {
  Plus,
  Edit,
  Trash2,
  Server,
  Box,
  Clock,
  Calendar,
  DollarSign,
  Star,
} from 'lucide-react';
import { PricingTemplate, TemplateType, BillingType } from '@/lib/pricing-templates';
import { PageLoading } from '@/components/loading-skeletons';

export default function PricingTemplatesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();

  const [templates, setTemplates] = useState<PricingTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<PricingTemplate | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    type: 'vm' as TemplateType,
    name: '',
    description: '',
    billingType: 'hourly' as BillingType,
    tokenCost: 0,
    vcpus: 1,
    memoryMB: 1024,
    diskGB: 10,
    dockerImage: '',
    imageUrl: '',
    active: true,
    featured: false,
  });

  // Redirect if not admin
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated' && session?.user?.role !== 'admin') {
      router.push('/');
      toast({
        title: 'Access Denied',
        description: 'Only administrators can access this page.',
        variant: 'destructive',
      });
    }
  }, [session, status, router, toast]);

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/admin/pricing-templates');
      if (!response.ok) throw new Error('Failed to fetch templates');
      const data = await response.json();
      setTemplates(data);
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast({
        title: 'Error',
        description: 'Failed to load pricing templates',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.user?.role === 'admin') {
      fetchTemplates();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const handleCreate = () => {
    setEditing(null);
    setFormData({
      type: 'vm',
      name: '',
      description: '',
      billingType: 'hourly',
      tokenCost: 0,
      vcpus: 1,
      memoryMB: 1024,
      diskGB: 10,
      dockerImage: '',
      imageUrl: '',
      active: true,
      featured: false,
    });
    setShowDialog(true);
  };

  const handleEdit = (template: PricingTemplate) => {
    setEditing(template);
    setFormData({
      type: template.type,
      name: template.name,
      description: template.description,
      billingType: template.billingType,
      tokenCost: template.tokenCost,
      vcpus: template.specs.vcpus || 1,
      memoryMB: template.specs.memoryMB || 1024,
      diskGB: template.specs.diskGB || 10,
      dockerImage: template.specs.dockerImage || '',
      imageUrl: template.specs.imageUrl || '',
      active: template.active,
      featured: template.featured || false,
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!formData.name || formData.tokenCost < 0) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);

    try {
      interface TemplateSpecs {
        vcpus: number;
        memoryMB: number;
        diskGB?: number;
        imageUrl?: string;
        dockerImage?: string;
      }

      const specs: TemplateSpecs = {
        vcpus: formData.vcpus,
        memoryMB: formData.memoryMB,
      };

      if (formData.type === 'vm') {
        specs.diskGB = formData.diskGB;
        if (formData.imageUrl) specs.imageUrl = formData.imageUrl;
      } else {
        if (formData.dockerImage) specs.dockerImage = formData.dockerImage;
      }

      const body = {
        type: formData.type,
        name: formData.name,
        description: formData.description,
        billingType: formData.billingType,
        tokenCost: formData.tokenCost,
        specs,
        active: formData.active,
        featured: formData.featured,
      };

      const url = '/api/admin/pricing-templates';
      const method = editing ? 'PATCH' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? { id: editing.id, ...body } : body),
      });

      if (!response.ok) throw new Error('Failed to save template');

      toast({
        title: 'Success',
        description: `Template ${editing ? 'updated' : 'created'} successfully`,
      });

      setShowDialog(false);
      fetchTemplates();
    } catch (error) {
      console.error('Error saving template:', error);
      toast({
        title: 'Error',
        description: 'Failed to save template',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;

    try {
      const response = await fetch(`/api/admin/pricing-templates?id=${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete template');

      toast({
        title: 'Success',
        description: 'Template deleted successfully',
      });

      fetchTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete template',
        variant: 'destructive',
      });
    }
  };

  if (status === 'loading' || loading) {
    return <PageLoading />;
  }

  if (session?.user?.role !== 'admin') {
    return null;
  }

  const vmTemplates = templates.filter(t => t.type === 'vm');
  const containerTemplates = templates.filter(t => t.type === 'container');

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Pricing Templates</h1>
          <p className="text-muted-foreground mt-1">
            Configure VM and Container pricing templates
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          New Template
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* VM Templates */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              VM Templates ({vmTemplates.length})
            </CardTitle>
            <CardDescription>Virtual machine pricing configurations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {vmTemplates.map((template) => (
                <div
                  key={template.id}
                  className="border rounded-lg p-4 space-y-2"
                >
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{template.name}</h3>
                        {template.featured && (
                          <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                        )}
                        {!template.active && <Badge variant="secondary">Inactive</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {template.description}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(template)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(template.id, template.name)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">vCPUs:</span> {template.specs.vcpus}
                    </div>
                    <div>
                      <span className="text-muted-foreground">RAM:</span> {template.specs.memoryMB}MB
                    </div>
                    <div>
                      <span className="text-muted-foreground">Disk:</span> {template.specs.diskGB}GB
                    </div>
                    <div className="flex items-center gap-1">
                      {template.billingType === 'hourly' ? (
                        <Clock className="h-3 w-3" />
                      ) : template.billingType === 'monthly' ? (
                        <Calendar className="h-3 w-3" />
                      ) : (
                        <DollarSign className="h-3 w-3" />
                      )}
                      <span className="font-semibold">{template.tokenCost} tokens</span>
                      <span className="text-muted-foreground">/{template.billingType}</span>
                    </div>
                  </div>
                </div>
              ))}
              {vmTemplates.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  No VM templates configured
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Container Templates */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Box className="h-5 w-5" />
              Container Templates ({containerTemplates.length})
            </CardTitle>
            <CardDescription>Container pricing configurations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {containerTemplates.map((template) => (
                <div
                  key={template.id}
                  className="border rounded-lg p-4 space-y-2"
                >
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{template.name}</h3>
                        {template.featured && (
                          <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                        )}
                        {!template.active && <Badge variant="secondary">Inactive</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {template.description}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(template)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(template.id, template.name)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">vCPUs:</span> {template.specs.vcpus}
                    </div>
                    <div>
                      <span className="text-muted-foreground">RAM:</span> {template.specs.memoryMB}MB
                    </div>
                    <div className="col-span-2 flex items-center gap-1">
                      {template.billingType === 'hourly' ? (
                        <Clock className="h-3 w-3" />
                      ) : template.billingType === 'monthly' ? (
                        <Calendar className="h-3 w-3" />
                      ) : (
                        <DollarSign className="h-3 w-3" />
                      )}
                      <span className="font-semibold">{template.tokenCost} tokens</span>
                      <span className="text-muted-foreground">/{template.billingType}</span>
                    </div>
                  </div>
                </div>
              ))}
              {containerTemplates.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  No container templates configured
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Edit Template' : 'Create Pricing Template'}
            </DialogTitle>
            <DialogDescription>
              Configure pricing and specifications for {formData.type === 'vm' ? 'virtual machines' : 'containers'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value: TemplateType) =>
                    setFormData({ ...formData, type: value })
                  }
                  disabled={!!editing}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vm">Virtual Machine</SelectItem>
                    <SelectItem value="container">Container</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Billing Type</Label>
                <Select
                  value={formData.billingType}
                  onValueChange={(value: BillingType) =>
                    setFormData({ ...formData, billingType: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="one-time">One-time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., VM - Small"
              />
            </div>

            <div>
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description..."
                rows={2}
              />
            </div>

            <div>
              <Label>Token Cost *</Label>
              <Input
                type="number"
                value={formData.tokenCost}
                onChange={(e) => setFormData({ ...formData, tokenCost: parseInt(e.target.value) || 0 })}
                min="0"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Cost per {formData.billingType === 'one-time' ? 'deployment' : formData.billingType === 'hourly' ? 'hour' : 'month'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>vCPUs</Label>
                <Input
                  type="number"
                  value={formData.vcpus}
                  onChange={(e) => setFormData({ ...formData, vcpus: parseInt(e.target.value) || 1 })}
                  min="1"
                />
              </div>

              <div>
                <Label>Memory (MB)</Label>
                <Input
                  type="number"
                  value={formData.memoryMB}
                  onChange={(e) => setFormData({ ...formData, memoryMB: parseInt(e.target.value) || 512 })}
                  min="512"
                  step="512"
                />
              </div>
            </div>

            {formData.type === 'vm' && (
              <>
                <div>
                  <Label>Disk (GB)</Label>
                  <Input
                    type="number"
                    value={formData.diskGB}
                    onChange={(e) => setFormData({ ...formData, diskGB: parseInt(e.target.value) || 10 })}
                    min="10"
                  />
                </div>

                <div>
                  <Label>Image URL (optional)</Label>
                  <Input
                    value={formData.imageUrl}
                    onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
              </>
            )}

            {formData.type === 'container' && (
              <div>
                <Label>Docker Image (optional)</Label>
                <Input
                  value={formData.dockerImage}
                  onChange={(e) => setFormData({ ...formData, dockerImage: e.target.value })}
                  placeholder="e.g., nginx:latest"
                />
              </div>
            )}

            <div className="flex items-center justify-between border rounded-lg p-3">
              <div>
                <Label>Active</Label>
                <p className="text-xs text-muted-foreground">
                  Users can select this template
                </p>
              </div>
              <Switch
                checked={formData.active}
                onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
              />
            </div>

            <div className="flex items-center justify-between border rounded-lg p-3">
              <div>
                <Label>Featured</Label>
                <p className="text-xs text-muted-foreground">
                  Mark as recommended template
                </p>
              </div>
              <Switch
                checked={formData.featured}
                onCheckedChange={(checked) => setFormData({ ...formData, featured: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={submitting}>
              {submitting ? 'Saving...' : editing ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
