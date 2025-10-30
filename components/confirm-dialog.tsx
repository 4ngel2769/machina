'use client';

import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => void | Promise<void>;
  showDontAskAgain?: boolean;
  dontAskAgainKey?: string;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
  onConfirm,
  showDontAskAgain = false,
  dontAskAgainKey,
}: ConfirmDialogProps) {
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      await onConfirm();
      if (dontAskAgain && dontAskAgainKey) {
        localStorage.setItem(`confirm-skip-${dontAskAgainKey}`, 'true');
      }
      onOpenChange(false);
    } catch (error) {
      console.error('Confirmation action failed:', error);
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {showDontAskAgain && dontAskAgainKey && (
          <div className="flex items-center space-x-2">
            <Checkbox
              id="dont-ask-again"
              checked={dontAskAgain}
              onCheckedChange={(checked) => setDontAskAgain(checked === true)}
            />
            <Label
              htmlFor="dont-ask-again"
              className="text-sm text-muted-foreground cursor-pointer"
            >
              Don&apos;t ask me again
            </Label>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isConfirming}>{cancelText}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={isConfirming}
            className={
              variant === 'destructive'
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : ''
            }
          >
            {isConfirming ? 'Processing...' : confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Helper hook to check if confirmation should be skipped
export function useShouldConfirm(key: string): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(`confirm-skip-${key}`) !== 'true';
}

// Helper to reset confirmation preferences
export function resetConfirmationPreference(key: string) {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(`confirm-skip-${key}`);
  }
}

// Pre-configured destructive action confirmation
export function DeleteConfirmDialog({
  open,
  onOpenChange,
  resourceType,
  resourceName,
  onConfirm,
  impact,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceType: string;
  resourceName: string;
  onConfirm: () => void | Promise<void>;
  impact?: string;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Delete ${resourceType}`}
      description={`Are you sure you want to delete "${resourceName}"? ${
        impact || 'This action cannot be undone.'
      }`}
      confirmText="Delete"
      cancelText="Cancel"
      variant="destructive"
      onConfirm={onConfirm}
      showDontAskAgain={true}
      dontAskAgainKey={`delete-${resourceType.toLowerCase()}`}
    />
  );
}

// Pre-configured force stop confirmation
export function ForceStopConfirmDialog({
  open,
  onOpenChange,
  resourceName,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceName: string;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Force Stop"
      description={`Force stopping "${resourceName}" may cause data loss or corruption. Are you sure you want to continue?`}
      confirmText="Force Stop"
      cancelText="Cancel"
      variant="destructive"
      onConfirm={onConfirm}
    />
  );
}
