'use client';

import { useEffect } from 'react';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Global error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="max-w-2xl w-full">
        <div className="bg-card border border-border rounded-lg p-8 text-center shadow-lg">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10 mb-6">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          
          <h1 className="text-4xl font-bold mb-2">500</h1>
          <h2 className="text-2xl font-semibold mb-4">Internal Server Error</h2>
          
          <p className="text-muted-foreground mb-2">
            Oops! Something went wrong on our end.
          </p>
          
          {error.message && (
            <div className="bg-muted rounded-md p-4 my-4 text-left">
              <p className="text-sm font-mono text-muted-foreground break-all">
                {error.message}
              </p>
            </div>
          )}
          
          {error.digest && (
            <p className="text-xs text-muted-foreground mb-6">
              Error ID: {error.digest}
            </p>
          )}
          
          <div className="flex gap-3 justify-center mt-6">
            <Button onClick={reset} variant="default">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
            <Button asChild variant="outline">
              <Link href="/">
                <Home className="h-4 w-4 mr-2" />
                Go Home
              </Link>
            </Button>
          </div>
          
          <div className="mt-8 pt-6 border-t border-border">
            <p className="text-sm text-muted-foreground">
              If this problem persists, please contact your system administrator.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
