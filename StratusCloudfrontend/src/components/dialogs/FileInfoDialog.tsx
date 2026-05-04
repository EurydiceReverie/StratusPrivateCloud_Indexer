import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { DBXFile, listFolder } from '@/services/dropbox-service';
import { FileText, Folder, Lock, Calendar, HardDrive, Hash, Loader2 } from 'lucide-react';

interface FileInfoDialogProps {
  open: boolean;
  file: DBXFile | null;
  onClose: () => void;
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null) return '—';
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

/** Recursively calculate total size and latest modified date of a folder */
async function calcFolderInfo(path: string): Promise<{ size: number; latestModified: string | undefined; fileCount: number; folderCount: number }> {
  let totalSize = 0;
  let latestModified: string | undefined;
  let fileCount = 0;
  let folderCount = 0;

  const items = await listFolder(path).catch(() => [] as DBXFile[]);
  for (const item of items) {
    if (item.isFolder) {
      folderCount++;
      const sub = await calcFolderInfo(item.path);
      totalSize += sub.size;
      fileCount += sub.fileCount;
      folderCount += sub.folderCount;
      if (sub.latestModified) {
        if (!latestModified || sub.latestModified > latestModified) latestModified = sub.latestModified;
      }
    } else {
      fileCount++;
      totalSize += item.size || 0;
      if (item.modifiedAt) {
        if (!latestModified || item.modifiedAt > latestModified) latestModified = item.modifiedAt;
      }
    }
  }
  return { size: totalSize, latestModified, fileCount, folderCount };
}

export const FileInfoDialog: React.FC<FileInfoDialogProps> = ({ open, file, onClose }) => {
  const [folderInfo, setFolderInfo] = useState<{ size: number; latestModified: string | undefined; fileCount: number; folderCount: number } | null>(null);
  const [loadingFolder, setLoadingFolder] = useState(false);

  useEffect(() => {
    if (open && file?.isFolder) {
      setFolderInfo(null);
      setLoadingFolder(true);
      calcFolderInfo(file.path).then(info => {
        setFolderInfo(info);
        setLoadingFolder(false);
      }).catch(() => setLoadingFolder(false));
    } else {
      setFolderInfo(null);
      setLoadingFolder(false);
    }
  }, [open, file?.path, file?.isFolder]);

  if (!file) return null;

  const ext = !file.isFolder ? file.name.split('.').pop()?.toUpperCase() : null;

  // For folders, use calculated info; for files, use the file's own data
  const displaySize = file.isFolder ? folderInfo?.size : file.size;
  const displayModified = file.isFolder ? (folderInfo?.latestModified || file.modifiedAt) : file.modifiedAt;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-[420px] overflow-hidden">
        <DialogHeader className="overflow-hidden">
          <DialogTitle className="flex items-start gap-2 overflow-hidden w-full">
            <span className="shrink-0 mt-0.5">
              {file.isFolder
                ? <Folder className="w-5 h-5 text-yellow-500" />
                : file.isVaultFile
                  ? <Lock className="w-5 h-5 text-purple-500" />
                  : <FileText className="w-5 h-5 text-blue-500" />
              }
            </span>
            <span
              className="text-base font-semibold leading-snug break-all overflow-hidden min-w-0"
              title={file.name}
            >
              {file.name}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {ext && (
            <div className="flex items-center gap-3">
              <Hash className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground">Type</span>
              <Badge variant="secondary" className="ml-auto">{ext}</Badge>
            </div>
          )}
          {file.isVaultFile && (
            <div className="flex items-center gap-3">
              <Lock className="w-4 h-4 text-purple-500 shrink-0" />
              <span className="text-sm text-muted-foreground">Encrypted</span>
              <Badge className="ml-auto bg-purple-500/20 text-purple-400 border-purple-500/30">AES-256</Badge>
            </div>
          )}
          {file.isFolder && folderInfo && (
            <div className="flex items-center gap-3">
              <Folder className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground">Contents</span>
              <span className="ml-auto text-sm text-foreground/80">
                {folderInfo.fileCount} file{folderInfo.fileCount !== 1 ? 's' : ''}
                {folderInfo.folderCount > 0 ? `, ${folderInfo.folderCount} folder${folderInfo.folderCount !== 1 ? 's' : ''}` : ''}
              </span>
            </div>
          )}
          <div className="flex items-center gap-3">
            <HardDrive className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground">Size</span>
            <span className="ml-auto text-sm font-mono flex items-center gap-1.5">
              {file.isFolder && loadingFolder
                ? <><Loader2 className="w-3 h-3 animate-spin text-muted-foreground" /><span className="text-muted-foreground text-xs">Calculating...</span></>
                : formatBytes(displaySize)
              }
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground">Modified</span>
            <span className="ml-auto text-sm flex items-center gap-1.5">
              {file.isFolder && loadingFolder
                ? <><Loader2 className="w-3 h-3 animate-spin text-muted-foreground" /><span className="text-muted-foreground text-xs">Calculating...</span></>
                : formatDate(displayModified)
              }
            </span>
          </div>
          <div className="pt-2 border-t border-border overflow-hidden">
            <p className="text-xs text-muted-foreground font-mono break-all">{file.path}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
