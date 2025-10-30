'use client';

import { FileQuestion, Home, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function NotFound() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="max-w-2xl w-full">
        <div className="bg-card border border-border rounded-lg p-8 text-center shadow-lg">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-6">
            <FileQuestion className="h-8 w-8 text-primary" />
          </div>
          
          <h1 className="text-4xl font-bold mb-2">404</h1>
          <h2 className="text-2xl font-semibold mb-4">Page Not Found</h2>
          
          <p className="text-muted-foreground mb-2">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
          
          <div className="bg-muted rounded-md p-4 my-6">
            <p className="text-sm text-muted-foreground">
              Common reasons:
            </p>
            <ul className="text-sm text-muted-foreground mt-2 space-y-1">
              <li>• The URL was typed incorrectly</li>
              <li>• The resource has been deleted</li>
              <li>• The link you followed is outdated</li>
            </ul>
          </div>
          
          <div className="flex gap-3 justify-center mt-6">
            <Button onClick={() => router.back()} variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Go Back
            </Button>
            <Button asChild variant="default">
              <Link href="/">
                <Home className="h-4 w-4 mr-2" />
                Go Home
              </Link>
            </Button>
          </div>
          
          <div className="mt-8 pt-6 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Need help? Check out the{' '}
              <Link href="/help" className="text-primary hover:underline">
                documentation
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
