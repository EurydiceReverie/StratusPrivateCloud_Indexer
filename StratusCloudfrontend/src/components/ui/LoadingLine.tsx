import React from 'react';
import { cn } from '@/lib/utils';

interface LoadingLineProps {
  visible: boolean;
  className?: string;
}

export const LoadingLine: React.FC<LoadingLineProps> = ({ visible, className }) => {
  if (!visible) return null;
  return (
    <div className={cn('fixed top-0 left-0 right-0 z-50 h-0.5 overflow-hidden', className)}>
      <div className="h-full bg-gradient-to-r from-transparent via-blue-500 to-transparent animate-loading-line" />
    </div>
  );
};
