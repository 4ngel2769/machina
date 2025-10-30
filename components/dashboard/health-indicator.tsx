'use client';

import { AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import type { HealthIndicator } from '@/types/stats';

interface SystemHealthIndicatorProps {
  health: HealthIndicator;
  className?: string;
}

export function SystemHealthIndicator({
  health,
  className,
}: SystemHealthIndicatorProps) {
  const statusConfig = {
    healthy: {
      icon: CheckCircle,
      label: 'Healthy',
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/20',
      badgeVariant: 'default' as const,
    },
    warning: {
      icon: AlertTriangle,
      label: 'Warning',
      color: 'text-yellow-600 dark:text-yellow-400',
      bgColor: 'bg-yellow-100 dark:bg-yellow-900/20',
      badgeVariant: 'secondary' as const,
    },
    critical: {
      icon: AlertCircle,
      label: 'Critical',
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-100 dark:bg-red-900/20',
      badgeVariant: 'destructive' as const,
    },
  };

  const config = statusConfig[health.status];
  const Icon = config.icon;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors',
            config.bgColor,
            'hover:opacity-80',
            className
          )}
        >
          <Icon className={cn('h-4 w-4', config.color)} />
          <span className={cn('text-sm font-medium', config.color)}>
            {config.label}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">System Health</h4>
            <Badge variant={config.badgeVariant}>{config.label}</Badge>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">CPU Usage</span>
              <span className={cn(
                'font-medium',
                health.metrics.cpu >= 90 ? 'text-red-600' :
                health.metrics.cpu >= 80 ? 'text-yellow-600' :
                'text-green-600'
              )}>
                {health.metrics.cpu.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Memory Usage</span>
              <span className={cn(
                'font-medium',
                health.metrics.memory >= 95 ? 'text-red-600' :
                health.metrics.memory >= 90 ? 'text-yellow-600' :
                'text-green-600'
              )}>
                {health.metrics.memory.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Disk Usage</span>
              <span className={cn(
                'font-medium',
                health.metrics.disk >= 90 ? 'text-red-600' :
                health.metrics.disk >= 85 ? 'text-yellow-600' :
                'text-green-600'
              )}>
                {health.metrics.disk.toFixed(1)}%
              </span>
            </div>
          </div>

          {health.issues.length > 0 && (
            <>
              <div className="border-t pt-3">
                <h5 className="text-sm font-medium mb-2">Issues ({health.issues.length})</h5>
                <ul className="space-y-1">
                  {health.issues.slice(0, 5).map((issue, index) => (
                    <li
                      key={index}
                      className="text-xs text-muted-foreground flex items-start gap-1"
                    >
                      <span className="text-red-500 mt-0.5">•</span>
                      <span>{issue}</span>
                    </li>
                  ))}
                  {health.issues.length > 5 && (
                    <li className="text-xs text-muted-foreground italic">
                      +{health.issues.length - 5} more issues
                    </li>
                  )}
                </ul>
              </div>
            </>
          )}

          {health.issues.length === 0 && (
            <div className="border-t pt-3 text-sm text-muted-foreground">
              All systems operating normally
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
