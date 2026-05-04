import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Download, FileArchive } from 'lucide-react';

interface DownloadProgressDialogProps {
  open: boolean;
  currentFile: string;
  currentIndex: number;
  totalFiles: number;
  percent: number;
  zipName?: string;
}

export const DownloadProgressDialog: React.FC<DownloadProgressDialogProps> = ({
  open, currentFile, currentIndex, totalFiles, percent, zipName,
}) => {
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[400px]" onInteractOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileArchive className="w-5 h-5 text-blue-500" />
            Preparing Download
            {zipName && <span className="text-sm font-normal text-muted-foreground">— {zipName}</span>}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-center gap-2 text-sm">
            <Download className="w-4 h-4 text-primary shrink-0 animate-bounce" />
            <span className="truncate text-muted-foreground">{currentFile}</span>
          </div>
          <Progress value={percent} className="h-2.5 overflow-hidden [&>div]:bg-gradient-to-r [&>div]:from-sky-500 [&>div]:via-indigo-500 [&>div]:to-violet-500 [&>div]:shadow-[0_0_14px_rgba(79,70,229,0.4)]" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>File {currentIndex} of {totalFiles}</span>
            <span>{percent}%</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
