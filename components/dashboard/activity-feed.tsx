'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Container,
  Server,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { ActivityEvent } from '@/types/stats';

// In-memory event storage (in production, this could be a database or Redis)
const events: ActivityEvent[] = [];

export function addActivityEvent(event: Omit<ActivityEvent, 'id' | 'timestamp'>) {
  events.unshift({
    ...event,
    id: Math.random().toString(36).substring(7),
    timestamp: Date.now(),
  });
  
  // Keep only last 100 events
  if (events.length > 100) {
    events.splice(100);
  }
}

interface ActivityFeedProps {
  maxItems?: number;
  showViewAll?: boolean;
}

export function ActivityFeed({ maxItems = 20, showViewAll = true }: ActivityFeedProps) {
  const [displayEvents, setDisplayEvents] = useState<ActivityEvent[]>([]);

  useEffect(() => {
    // Initial load
    setDisplayEvents(events.slice(0, maxItems));

    // Poll for updates every 2 seconds
    const interval = setInterval(() => {
      setDisplayEvents(events.slice(0, maxItems));
    }, 2000);

    return () => clearInterval(interval);
  }, [maxItems]);

  const getEventIcon = (event: ActivityEvent) => {
    if (event.type === 'container') return Container;
    if (event.type === 'vm') return Server;
    return AlertCircle;
  };

  const getActionIcon = (action: ActivityEvent['action']) => {
    switch (action) {
      case 'created':
      case 'started':
        return CheckCircle;
      case 'stopped':
      case 'removed':
        return XCircle;
      case 'error':
      case 'warning':
        return AlertCircle;
      default:
        return Clock;
    }
  };

  const getActionColor = (action: ActivityEvent['action']) => {
    switch (action) {
      case 'created':
      case 'started':
        return 'text-green-600 dark:text-green-400';
      case 'stopped':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'removed':
      case 'error':
        return 'text-red-600 dark:text-red-400';
      case 'warning':
        return 'text-orange-600 dark:text-orange-400';
      default:
        return 'text-muted-foreground';
    }
  };

  const getSeverityBadge = (severity?: ActivityEvent['severity']) => {
    if (!severity) return null;
    
    const variants = {
      info: 'default' as const,
      warning: 'secondary' as const,
      error: 'destructive' as const,
    };

    return <Badge variant={variants[severity]} className="text-xs">{severity}</Badge>;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-lg font-semibold">Activity Feed</CardTitle>
        {showViewAll && (
          <Button variant="ghost" size="sm">
            View All
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {displayEvents.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No recent activity</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {displayEvents.map((event) => {
                const TypeIcon = getEventIcon(event);
                const ActionIcon = getActionIcon(event.action);
                const actionColor = getActionColor(event.action);

                return (
                  <div
                    key={event.id}
                    className="flex items-start gap-3 pb-3 border-b last:border-0 last:pb-0"
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      <div className="p-2 rounded-lg bg-muted">
                        <TypeIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <ActionIcon className={`h-3 w-3 ${actionColor}`} />
                          <span className="text-sm font-medium">
                            {event.resource}
                          </span>
                        </div>
                        {getSeverityBadge(event.severity)}
                      </div>
                      <p className="text-sm text-muted-foreground mb-1">
                        {event.message}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(event.timestamp, { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
