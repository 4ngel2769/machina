import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { HelpCircle, Info } from 'lucide-react';

interface HelpTooltipProps {
  content: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  icon?: 'help' | 'info';
  iconClassName?: string;
}

export function HelpTooltip({
  content,
  side = 'top',
  icon = 'help',
  iconClassName = 'h-4 w-4 text-muted-foreground',
}: HelpTooltipProps) {
  const Icon = icon === 'help' ? HelpCircle : Info;

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <button type="button" className="inline-flex cursor-help">
            <Icon className={iconClassName} />
          </button>
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-xs">
          <p className="text-sm">{content}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Common tooltips for features
export const FeatureTooltips = {
  amnesicContainer: (
    <HelpTooltip
      content="An amnesic container doesn't persist changes to its filesystem. When stopped, all changes are lost. Useful for testing or temporary workloads."
      side="right"
    />
  ),
  
  storagePool: (
    <HelpTooltip
      content="A storage pool is a logical container for storing VM disk images. It can be backed by a directory, LVM, or network storage."
      side="right"
    />
  ),
  
  pxeBoot: (
    <HelpTooltip
      content="PXE (Preboot Execution Environment) allows a VM to boot from the network instead of a local disk or ISO. Useful for automated deployments."
      side="right"
    />
  ),
  
  vmMemory: (
    <HelpTooltip
      content="The amount of RAM allocated to the VM. More memory improves performance but reduces available resources for other VMs. Recommended: 2-4 GB for most workloads."
      side="right"
    />
  ),
  
  vmVcpus: (
    <HelpTooltip
      content="The number of virtual CPU cores allocated to the VM. More cores improve multi-threaded performance. Recommended: 1-2 cores for light workloads, 4+ for intensive tasks."
      side="right"
    />
  ),
  
  vmDiskSize: (
    <HelpTooltip
      content="The size of the VM's virtual disk. This is thin-provisioned, so it only uses space as needed. Recommended: 20-50 GB for most operating systems."
      side="right"
    />
  ),
  
  containerPorts: (
    <HelpTooltip
      content="Map container ports to host ports to make services accessible. Format: host_port:container_port (e.g., 8080:80 maps container port 80 to host port 8080)."
      side="right"
    />
  ),
  
  containerEnv: (
    <HelpTooltip
      content="Environment variables passed to the container. Use KEY=VALUE format, one per line. These configure the application running inside the container."
      side="right"
    />
  ),
  
  containerVolumes: (
    <HelpTooltip
      content="Mount host directories or Docker volumes into the container. This persists data beyond the container's lifecycle. Format: host_path:container_path"
      side="right"
    />
  ),
  
  vncConsole: (
    <HelpTooltip
      content="VNC (Virtual Network Computing) provides graphical access to the VM's display. Use this to interact with the VM's desktop or console."
      side="right"
    />
  ),
  
  resourceQuota: (
    <HelpTooltip
      content="Resource quotas limit the total CPU, RAM, and storage a user can consume across all their VMs and containers. Prevents resource exhaustion."
      side="right"
    />
  ),
  
  userRole: (
    <HelpTooltip
      content="Admin users can see and manage all resources and users. Regular users can only see and manage their own resources."
      side="right"
    />
  ),
};

// Inline tooltip for form fields
export function FieldTooltip({
  label,
  tooltip,
}: {
  label: string;
  tooltip: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span>{label}</span>
      <HelpTooltip content={tooltip} />
    </div>
  );
}
