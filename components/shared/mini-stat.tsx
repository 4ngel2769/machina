import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MiniStatProps {
  icon: LucideIcon;
  value: string | number;
  label: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  threshold?: 'low' | 'medium' | 'high';
  className?: string;
}

export function MiniStat({
  icon: Icon,
  value,
  label,
  trend,
  trendValue,
  threshold = 'low',
  className,
}: MiniStatProps) {
  const thresholdColors = {
    low: 'text-green-600 dark:text-green-400',
    medium: 'text-yellow-600 dark:text-yellow-400',
    high: 'text-red-600 dark:text-red-400',
  };

  const trendColors = {
    up: 'text-red-500',
    down: 'text-green-500',
    neutral: 'text-gray-500',
  };

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className={cn('p-2 rounded-lg bg-muted', thresholdColors[threshold])}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className={cn('text-lg font-semibold', thresholdColors[threshold])}>
            {value}
          </span>
          {trend && trendValue && (
            <span className={cn('text-xs flex items-center gap-0.5', trendColors[trend])}>
              {trend === 'up' ? (
                <TrendingUp className="h-3 w-3" />
              ) : trend === 'down' ? (
                <TrendingDown className="h-3 w-3" />
              ) : null}
              {trendValue}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">{label}</p>
      </div>
    </div>
  );
}
