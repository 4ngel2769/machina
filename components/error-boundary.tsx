'use client';

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex items-center justify-center min-h-[400px] p-8">
          <div className="max-w-md w-full bg-destructive/10 border border-destructive/20 rounded-lg p-6 text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-4">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <Button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                this.props.onReset?.();
              }}
              variant="outline"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Try again
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Section-specific error boundary with smaller fallback
export function SectionErrorBoundary({ children, section }: { children: React.ReactNode; section: string }) {
  return (
    <ErrorBoundary
      fallback={
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Failed to load {section}
          </p>
          <Button
            onClick={() => window.location.reload()}
            variant="ghost"
            size="sm"
            className="mt-2"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Reload
          </Button>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}
