'use client';

import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface AnimatedCardProps {
  children?: ReactNode;
  className?: string;
  hoverScale?: boolean;
  delay?: number;
}

export function AnimatedCard({ 
  children, 
  className, 
  hoverScale = true,
  delay = 0,
}: AnimatedCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      whileHover={hoverScale ? { scale: 1.02 } : undefined}
      className={cn('transition-shadow duration-200', className)}
    >
      <Card>
        {children}
      </Card>
    </motion.div>
  );
}
