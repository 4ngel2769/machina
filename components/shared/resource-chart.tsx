'use client';

import { Line, Area, AreaChart, LineChart, ResponsiveContainer, Tooltip, YAxis } from 'recharts';
import type { ResourceTimeSeries } from '@/types/stats';

interface ResourceChartProps {
  data: ResourceTimeSeries[];
  type?: 'line' | 'area';
  height?: number;
  color?: string;
  showTooltip?: boolean;
  maxDataPoints?: number;
}

function CustomTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ value: number }>;
}) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-popover border border-border rounded-lg px-2 py-1 text-xs shadow-lg">
        <p className="font-semibold">{payload[0].value.toFixed(1)}%</p>
      </div>
    );
  }
  return null;
}

export function ResourceChart({
  data,
  type = 'line',
  height = 60,
  color = '#3b82f6',
  showTooltip = true,
  maxDataPoints = 60,
}: ResourceChartProps) {
  // Limit data points to most recent N
  const limitedData = data.slice(-maxDataPoints);

  // Format data for recharts
  const chartData = limitedData.map((point) => ({
    time: point.timestamp,
    value: point.value,
  }));

  if (chartData.length === 0) {
    return (
      <div
        className="w-full flex items-center justify-center bg-muted/20 rounded"
        style={{ height: `${height}px` }}
      >
        <p className="text-xs text-muted-foreground">No data</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      {type === 'area' ? (
        <AreaChart data={chartData}>
          {showTooltip && <Tooltip content={<CustomTooltip />} />}
          <YAxis domain={[0, 100]} hide />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            fill={color}
            fillOpacity={0.2}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      ) : (
        <LineChart data={chartData}>
          {showTooltip && <Tooltip content={<CustomTooltip />} />}
          <YAxis domain={[0, 100]} hide />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}
