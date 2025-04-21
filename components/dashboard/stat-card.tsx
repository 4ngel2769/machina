'use client';

import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ResourceTimeSeries } from '@/types/stats';

// Lazy load chart component to reduce initial bundle
const ResourceChart = dynamic(
  () => import('@/components/shared/resource-chart').then(mod => ({ default: mod.ResourceChart })),
  { ssr: false }
);

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  subtitle?: string;
  chartData?: ResourceTimeSeries[];
  chartType?: 'line' | 'area';
  chartColor?: string;
  colorTheme?: 'default' | 'success' | 'warning' | 'danger';
  isLoading?: boolean;
  className?: string;
}

export function StatCard({
  title,
  value,
  icon: Icon,
  subtitle,
  chartData,
  chartType = 'area',
  chartColor,
  colorTheme = 'default',
  isLoading = false,
  className,
}: StatCardProps) {
  const themeColors = {
    default: {
      icon: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-100 dark:bg-blue-900/20',
      value: 'text-foreground',
    },
    success: {
      icon: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-100 dark:bg-green-900/20',
      value: 'text-green-600 dark:text-green-400',
    },
    warning: {
      icon: 'text-yellow-600 dark:text-yellow-400',
      bg: 'bg-yellow-100 dark:bg-yellow-900/20',
      value: 'text-yellow-600 dark:text-yellow-400',
    },
    danger: {
      icon: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-100 dark:bg-red-900/20',
      value: 'text-red-600 dark:text-red-400',
    },
  };

  const theme = themeColors[colorTheme];

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            <Skeleton className="h-4 w-24" />
          </CardTitle>
          <Skeleton className="h-8 w-8 rounded-lg" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-4 w-20 mb-4" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className={cn('p-2 rounded-lg', theme.bg)}>
          <Icon className={cn('h-4 w-4', theme.icon)} />
        </div>
      </CardHeader>
      <CardContent>
        <div className={cn('text-2xl font-bold mb-1', theme.value)}>
          {value}
        </div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mb-4">{subtitle}</p>
        )}
        {chartData && chartData.length > 0 && (
          <div className="mt-4">
            <ResourceChart
              data={chartData}
              type={chartType}
              height={60}
              color={chartColor}
              showTooltip={true}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
