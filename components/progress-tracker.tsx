'use client';

import { useState, useEffect } from 'react';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';

interface ProgressTrackerProps {
  title: string;
  description?: string;
  progress: number; // 0-100
  status: 'pending' | 'running' | 'success' | 'error';
  error?: string;
  estimatedTime?: number; // seconds
}

export function ProgressTracker({
  title,
  description,
  progress,
  status,
  error,
  estimatedTime,
}: ProgressTrackerProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (status === 'running') {
      const interval = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [status]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {status === 'running' && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
            {status === 'success' && <CheckCircle2 className="h-5 w-5 text-green-500" />}
            {status === 'error' && <XCircle className="h-5 w-5 text-destructive" />}
            <CardTitle className="text-lg">{title}</CardTitle>
          </div>
          {status === 'running' && (
            <span className="text-sm text-muted-foreground">
              {formatTime(elapsed)}
              {estimatedTime && ` / ~${formatTime(estimatedTime)}`}
            </span>
          )}
        </div>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={progress} className="h-2" />
        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground">
            {status === 'running' && `${Math.round(progress)}% complete`}
            {status === 'success' && 'Completed successfully'}
            {status === 'error' && 'Failed'}
            {status === 'pending' && 'Waiting to start...'}
          </span>
          {status === 'running' && estimatedTime && progress > 0 && (
            <span className="text-muted-foreground">
              ~{formatTime(Math.round(((100 - progress) / progress) * elapsed))} remaining
            </span>
          )}
        </div>
        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Simpler inline progress for buttons/small areas
export function InlineProgress({ message, progress }: { message: string; progress?: number }) {
  return (
    <div className="flex items-center gap-3">
      <Loader2 className="h-4 w-4 animate-spin text-primary" />
      <div className="flex-1 space-y-1">
        <p className="text-sm">{message}</p>
        {progress !== undefined && (
          <Progress value={progress} className="h-1" />
        )}
      </div>
      {progress !== undefined && (
        <span className="text-xs text-muted-foreground">{Math.round(progress)}%</span>
      )}
    </div>
  );
}
