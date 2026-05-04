import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export type ConflictResolution = 'replace' | 'keep-both' | 'skip';

interface FileConflictDialogProps {
  open: boolean;
  fileName: string;
  onResolve: (resolution: ConflictResolution) => void;
  onCancel: () => void;
}

export const FileConflictDialog: React.FC<FileConflictDialogProps> = ({
  open, fileName, onResolve, onCancel,
}) => {
  return (
    <Dialog open={open} onOpenChange={v => !v && onCancel()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            File Already Exists
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground py-2">
          A file named <strong>"{fileName}"</strong> already exists in this folder. What would you like to do?
        </p>
        <DialogFooter className="flex-col sm:flex-col gap-2">
          <Button className="w-full" onClick={() => onResolve('replace')}>
            Replace existing file
          </Button>
          <Button variant="outline" className="w-full" onClick={() => onResolve('keep-both')}>
            Keep both (rename new file)
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => onResolve('skip')}>
            Skip this file
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
