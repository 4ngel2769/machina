'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Trash2, Loader2, Pause, Play } from 'lucide-react';
import { toast } from 'sonner';

interface ContainerLogsProps {
  containerId: string;
}

export function ContainerLogs({ containerId }: ContainerLogsProps) {
  const [logs, setLogs] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [following, setFollowing] = useState(true);
  const [lineCount, setLineCount] = useState(0);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const fetchLogs = async () => {
    if (!containerId) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/containers/${containerId}/logs`);
      if (!response.ok) {
        throw new Error('Failed to fetch logs');
      }
      const data = await response.text();
      setLogs(data);
      setLineCount(data.split('\n').length);
    } catch (error) {
      console.error('Error fetching logs:', error);
      toast.error('Failed to fetch container logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    
    // Auto-refresh every 5 seconds if following
    const interval = setInterval(() => {
      if (following) {
        fetchLogs();
      }
    }, 5000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId, following]);

  useEffect(() => {
    // Auto-scroll to bottom if following
    if (following && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, following]);

  const handleDownload = () => {
    const blob = new Blob([logs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `container-${containerId.slice(0, 12)}-logs.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Logs downloaded');
  };

  const handleClear = () => {
    setLogs('');
    setLineCount(0);
    toast.success('Logs cleared from view (container logs preserved)');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {lineCount.toLocaleString()} lines
          </Badge>
          <Badge variant={following ? 'default' : 'secondary'}>
            {following ? 'Following' : 'Paused'}
          </Badge>
          {loading && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setFollowing(!following)}
          >
            {following ? (
              <>
                <Pause className="h-4 w-4 mr-2" />
                Pause
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Follow
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleDownload}
            disabled={!logs}
          >
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleClear}
            disabled={!logs}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear View
          </Button>
        </div>
      </div>

      <div
        className="bg-black rounded-lg overflow-auto border border-border p-4 font-mono text-sm"
        style={{ height: '600px' }}
      >
        <pre className="text-green-400 whitespace-pre-wrap break-words">
          {logs || (
            <span className="text-muted-foreground">
              {loading ? 'Loading logs...' : 'No logs available'}
            </span>
          )}
          <div ref={logsEndRef} />
        </pre>
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <p>💡 <strong>Tip:</strong> Logs auto-refresh every 5 seconds when following</p>
        <p>📥 <strong>Download:</strong> Save logs to a text file for offline analysis</p>
        <p>⏸️ <strong>Pause:</strong> Stop auto-refresh to read logs at your own pace</p>
      </div>
    </div>
  );
}
