'use client';

import { useEffect, useState, useRef } from 'react';
import { Container } from '@/types/container';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Download, RefreshCw, Search, FileText } from 'lucide-react';
import { toast } from 'sonner';

interface LogsViewerProps {
  container: Container | null;
  open: boolean;
  onClose: () => void;
}

export function LogsViewer({ container, open, onClose }: LogsViewerProps) {
  const [logs, setLogs] = useState<string>('');
  const [filteredLogs, setFilteredLogs] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && container) {
      fetchLogs();
    }
  }, [open, container]);

  useEffect(() => {
    // Filter logs based on search query
    if (searchQuery.trim()) {
      const lines = logs.split('\n');
      const filtered = lines.filter((line) =>
        line.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredLogs(filtered.join('\n'));
    } else {
      setFilteredLogs(logs);
    }
  }, [searchQuery, logs]);

  useEffect(() => {
    // Auto-scroll to bottom when logs change
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredLogs, autoScroll]);

  const fetchLogs = async () => {
    if (!container) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/containers/${container.id}/logs?tail=1000`);
      if (!response.ok) {
        throw new Error('Failed to fetch logs');
      }

      const data = await response.json();
      setLogs(data.data.logs || 'No logs available');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to fetch logs');
      setLogs('Error loading logs');
    } finally {
      setLoading(false);
    }
  };

  const downloadLogs = () => {
    const blob = new Blob([logs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${container?.name}-logs-${new Date().toISOString()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Logs downloaded');
  };

  const parseLine = (line: string) => {
    // Simple ANSI color code removal and timestamp parsing
    const cleanLine = line.replace(/\x1b\[[0-9;]*m/g, '');
    
    // Try to extract timestamp
    const timestampMatch = cleanLine.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)/);
    if (timestampMatch) {
      const timestamp = timestampMatch[1];
      const message = cleanLine.substring(timestamp.length).trim();
      return { timestamp, message };
    }
    
    return { timestamp: '', message: cleanLine };
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5" />
              <div>
                <DialogTitle>Container Logs</DialogTitle>
                <DialogDescription>{container?.name}</DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{logs.split('\n').length} lines</Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Controls */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={downloadLogs}>
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          </div>

          {/* Auto-scroll toggle */}
          <div className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              id="auto-scroll"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="auto-scroll" className="text-muted-foreground cursor-pointer">
              Auto-scroll to bottom
            </label>
          </div>

          {/* Logs Display */}
          <ScrollArea className="h-[500px] w-full rounded-lg border bg-black/5 dark:bg-black/20">
            <div ref={scrollRef} className="p-4 font-mono text-xs space-y-1">
              {loading ? (
                <div className="text-muted-foreground">Loading logs...</div>
              ) : filteredLogs ? (
                filteredLogs.split('\n').map((line, index) => {
                  const { timestamp, message } = parseLine(line);
                  return (
                    <div
                      key={index}
                      className="flex gap-3 hover:bg-accent/50 px-2 py-0.5 rounded"
                    >
                      {timestamp && (
                        <span className="text-muted-foreground shrink-0 w-52">
                          {timestamp}
                        </span>
                      )}
                      <span className="flex-1 break-all">
                        {message || line}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="text-muted-foreground">No logs available</div>
              )}
            </div>
          </ScrollArea>

          {searchQuery && (
            <div className="text-sm text-muted-foreground">
              Showing {filteredLogs.split('\n').filter(l => l).length} of {logs.split('\n').filter(l => l).length} lines
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
