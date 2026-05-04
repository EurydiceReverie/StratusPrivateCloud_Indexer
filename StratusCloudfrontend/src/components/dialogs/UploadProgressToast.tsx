import React from 'react';
import { Progress } from '@/components/ui/progress';
import { Upload, X, Zap, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface UploadProgressToastProps {
  fileName: string;
  progress: number; // 0-100
  speed?: number;   // bytes/sec
  eta?: number;     // seconds
  phase?: 'encrypting' | 'uploading';
  onCancel?: () => void;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / 1024 / 1024).toFixed(2)} MB/s`;
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  return `${Math.ceil(seconds / 60)}m`;
}

export const UploadProgressToast: React.FC<UploadProgressToastProps> = ({
  fileName, progress, speed, eta, phase, onCancel,
}) => {
  return (
    <div className="flex flex-col gap-2 w-full min-w-[260px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Upload className="w-4 h-4 text-blue-500 shrink-0" />
          <span className="text-sm font-medium truncate max-w-[160px]">{fileName}</span>
        </div>
        {onCancel && (
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onCancel}>
            <X className="w-3 h-3" />
          </Button>
        )}
      </div>
      {phase && (
        <p className="text-xs text-muted-foreground">
          {phase === 'encrypting' ? '🔐 Encrypting...' : '☁️ Uploading...'}
        </p>
      )}
      <Progress value={progress} className="h-2 overflow-hidden [&>div]:bg-gradient-to-r [&>div]:from-blue-500 [&>div]:via-violet-500 [&>div]:to-cyan-400 [&>div]:shadow-[0_0_14px_rgba(99,102,241,0.45)]" />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{progress}%</span>
        <div className="flex items-center gap-3">
          {speed !== undefined && speed > 0 && (
            <span className="flex items-center gap-1"><Zap className="w-3 h-3" />{formatSpeed(speed)}</span>
          )}
          {eta !== undefined && eta > 0 && (
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatEta(eta)}</span>
          )}
        </div>
      </div>
    </div>
  );
};
