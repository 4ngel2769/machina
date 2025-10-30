'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useContainers } from '@/hooks/use-containers';
import { toast } from 'sonner';
import { Plus, Trash2, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const formSchema = z.object({
  name: z.string().optional(),
  image: z.string().min(1, 'Image is required'),
  type: z.enum(['normal', 'amnesic']),
  shell: z.string().min(1, 'Shell is required'),
  ports: z
    .array(
      z.object({
        container: z.number().min(1).max(65535),
        host: z.number().min(1).max(65535),
        protocol: z.enum(['tcp', 'udp']),
      })
    )
    .optional(),
  env: z.record(z.string()).optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface CreateContainerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateContainerDialog({ open, onOpenChange }: CreateContainerDialogProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [portMappings, setPortMappings] = useState<Array<{ container: string; host: string; protocol: 'tcp' | 'udp' }>>([]);
  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }>>([]);
  const { createContainer } = useContainers();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      image: 'parrotsec/security:latest',
      type: 'normal',
      shell: 'bash',
    },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      // Convert port mappings
      const ports = portMappings
        .filter((p) => p.container && p.host)
        .map((p) => ({
          container: parseInt(p.container),
          host: parseInt(p.host),
          protocol: p.protocol,
        }));

      // Convert env vars
      const env = envVars
        .filter((e) => e.key && e.value)
        .reduce((acc, e) => ({ ...acc, [e.key]: e.value }), {});

      await createContainer({
        ...values,
        ports: ports.length > 0 ? ports : undefined,
        env: Object.keys(env).length > 0 ? env : undefined,
      });

      toast.success('Container created successfully');
      onOpenChange(false);
      form.reset();
      setPortMappings([]);
      setEnvVars([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create container');
    }
  };

  const addPortMapping = () => {
    setPortMappings([...portMappings, { container: '', host: '', protocol: 'tcp' }]);
  };

  const removePortMapping = (index: number) => {
    setPortMappings(portMappings.filter((_, i) => i !== index));
  };

  const addEnvVar = () => {
    setEnvVars([...envVars, { key: '', value: '' }]);
  };

  const removeEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Container</DialogTitle>
          <DialogDescription>
            Create a new Docker container with ParrotSec or custom image
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Container Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Container Name (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Auto-generated if empty" {...field} />
                  </FormControl>
                  <FormDescription>Leave empty for auto-generated name</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Image Selection */}
            <FormField
              control={form.control}
              name="image"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Image</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an image" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="parrotsec/security:latest">
                        ParrotSec Security (latest)
                      </SelectItem>
                      <SelectItem value="parrotsec/core:latest">
                        ParrotSec Core (latest)
                      </SelectItem>
                      <SelectItem value="kalilinux/kali-rolling">
                        Kali Linux (rolling)
                      </SelectItem>
                      <SelectItem value="ubuntu:latest">Ubuntu (latest)</SelectItem>
                      <SelectItem value="debian:latest">Debian (latest)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    ParrotSec includes penetration testing and security tools
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Container Type */}
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <div className="flex items-center gap-2">
                    <FormLabel>Container Type</FormLabel>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-4 w-4 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-xs">
                            <strong>Normal:</strong> Persistent container that remains after
                            stopping.
                            <br />
                            <strong>Amnesic:</strong> Temporary container that is automatically
                            deleted when stopped.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="flex gap-4"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="normal" id="normal" />
                        <Label htmlFor="normal" className="font-normal">
                          Normal
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="amnesic" id="amnesic" />
                        <Label htmlFor="amnesic" className="font-normal">
                          Amnesic
                        </Label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Shell Selection */}
            <FormField
              control={form.control}
              name="shell"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Shell</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select shell" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="bash">Bash</SelectItem>
                      <SelectItem value="sh">sh</SelectItem>
                      <SelectItem value="zsh" disabled>
                        zsh (Coming Soon)
                      </SelectItem>
                      <SelectItem value="fish" disabled>
                        fish (Coming Soon)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Advanced Section */}
            <div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full"
              >
                {showAdvanced ? 'Hide' : 'Show'} Advanced Options
              </Button>
            </div>

            {showAdvanced && (
              <div className="space-y-4 p-4 border rounded-lg">
                {/* Port Mappings */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Port Mappings</Label>
                    <Button type="button" size="sm" variant="outline" onClick={addPortMapping}>
                      <Plus className="h-3 w-3 mr-1" />
                      Add Port
                    </Button>
                  </div>
                  {portMappings.map((port, index) => (
                    <div key={index} className="flex gap-2 items-start">
                      <Input
                        placeholder="Host"
                        type="number"
                        value={port.host}
                        onChange={(e) => {
                          const newPorts = [...portMappings];
                          newPorts[index].host = e.target.value;
                          setPortMappings(newPorts);
                        }}
                        className="w-24"
                      />
                      <span className="text-muted-foreground py-2">:</span>
                      <Input
                        placeholder="Container"
                        type="number"
                        value={port.container}
                        onChange={(e) => {
                          const newPorts = [...portMappings];
                          newPorts[index].container = e.target.value;
                          setPortMappings(newPorts);
                        }}
                        className="w-24"
                      />
                      <Select
                        value={port.protocol}
                        onValueChange={(value) => {
                          const newPorts = [...portMappings];
                          newPorts[index].protocol = value as 'tcp' | 'udp';
                          setPortMappings(newPorts);
                        }}
                      >
                        <SelectTrigger className="w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tcp">TCP</SelectItem>
                          <SelectItem value="udp">UDP</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => removePortMapping(index)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>

                <Separator />

                {/* Environment Variables */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Environment Variables</Label>
                    <Button type="button" size="sm" variant="outline" onClick={addEnvVar}>
                      <Plus className="h-3 w-3 mr-1" />
                      Add Variable
                    </Button>
                  </div>
                  {envVars.map((env, index) => (
                    <div key={index} className="flex gap-2 items-start">
                      <Input
                        placeholder="KEY"
                        value={env.key}
                        onChange={(e) => {
                          const newEnv = [...envVars];
                          newEnv[index].key = e.target.value;
                          setEnvVars(newEnv);
                        }}
                        className="flex-1"
                      />
                      <span className="text-muted-foreground py-2">=</span>
                      <Input
                        placeholder="value"
                        value={env.value}
                        onChange={(e) => {
                          const newEnv = [...envVars];
                          newEnv[index].value = e.target.value;
                          setEnvVars(newEnv);
                        }}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => removeEnvVar(index)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Creating...' : 'Create Container'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
