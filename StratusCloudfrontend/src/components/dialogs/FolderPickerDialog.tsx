import React, { useState, useEffect } from 'react';
import { X, Folder, ChevronRight, FolderPlus, Home, AlertCircle, Copy } from 'lucide-react';
import { listFolder, createFolder, DBXFile } from '@/services/dropbox-service';
import { IPhoneSpinnerSimple } from '@/components/ui/IPhoneSpinner';
import { toast } from 'sonner';

interface FolderPickerDialogProps {
  open: boolean;
  title?: string;
  confirmLabel?: string;
  mode?: 'move' | 'copy';
  excludePaths?: string[]; // paths that cannot be picked (e.g. selected items themselves)
  /** Parent paths of the source files — used to detect same-directory operations */
  sourceParentPaths?: string[];
  rootPath?: string;
  homeLabel?: string;
  onConfirm: (destPath: string, duplicate?: boolean) => void;
  onCancel: () => void;
}

export const FolderPickerDialog: React.FC<FolderPickerDialogProps> = ({
  open, title = 'Move to...', confirmLabel = 'Move Here', mode = 'move', excludePaths = [], sourceParentPaths = [], rootPath = '', homeLabel = 'Home', onConfirm, onCancel,
}) => {
  const [currentPath, setCurrentPath] = useState(rootPath);
  const [pathStack, setPathStack] = useState<string[]>([rootPath]);
  const [folders, setFolders] = useState<DBXFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [newFolderMode, setNewFolderMode] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [sameDirectoryPrompt, setSameDirectoryPrompt] = useState(false);

  useEffect(() => {
    if (open) { setCurrentPath(rootPath); setPathStack([rootPath]); setFolders([]); setSameDirectoryPrompt(false); loadFolders(rootPath); }
  }, [open, rootPath]);

  const loadFolders = async (path: string) => {
    setLoading(true);
    try {
      const items = await listFolder(path);
      setFolders(items.filter(f => f.isFolder));
    } catch { setFolders([]); }
    finally { setLoading(false); }
  };

  const navigateTo = (path: string) => {
    setCurrentPath(path);
    setPathStack(prev => [...prev, path]);
    loadFolders(path);
  };

  const navigateBack = () => {
    if (pathStack.length <= 1) return;
    const newStack = pathStack.slice(0, -1);
    const prev = newStack[newStack.length - 1];
    setPathStack(newStack);
    setCurrentPath(prev);
    loadFolders(prev);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const newPath = currentPath === '' ? `/${newFolderName.trim()}` : `${currentPath}/${newFolderName.trim()}`;
    try {
      await createFolder(newPath);
      toast.success(`Folder "${newFolderName}" created`);
      setNewFolderName('');
      setNewFolderMode(false);
      loadFolders(currentPath);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to create folder');
    }
  };

  const isExcluded = (folder: DBXFile) => {
    return excludePaths.some(ep => folder.path === ep || folder.path.startsWith(ep + '/'));
  };

  const breadcrumb = pathStack.map(p => p === rootPath ? homeLabel : (p === '' ? 'Home' : p.split('/').filter(Boolean).pop() || homeLabel));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/70 backdrop-blur-xl" onClick={onCancel} />
      <div className="relative bg-card border border-border rounded-2xl w-full max-w-sm overflow-hidden animate-scale-in">

        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-foreground/8">
          <Folder className="w-4 h-4 text-foreground/50" />
          <span className="text-sm font-semibold text-foreground flex-1">{title}</span>
          <button onClick={onCancel} className="bg-secondary hover:bg-secondary/80 rounded-lg p-1.5">
            <X className="w-4 h-4 text-foreground/60" />
          </button>
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-foreground/5 overflow-x-auto">
          {breadcrumb.map((seg, i) => (
            <span key={i} className="flex items-center gap-1 shrink-0">
              {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
              <button
                onClick={() => {
                  const path = pathStack[i];
                  setCurrentPath(path);
                  setPathStack(pathStack.slice(0, i + 1));
                  loadFolders(path);
                }}
                className={`text-xs font-medium transition-colors ${i === breadcrumb.length - 1 ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {i === 0 ? <><Home className="w-3 h-3" /><span className="sr-only">{seg}</span></> : seg}
              </button>
            </span>
          ))}
        </div>

        {/* Folder list */}
        <div className="max-h-64 overflow-y-auto">
          {loading ? (
            <div className="py-8 flex justify-center"><IPhoneSpinnerSimple /></div>
          ) : folders.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">No folders here</p>
          ) : (
            folders.map(folder => {
              const excluded = isExcluded(folder);
              return (
                <div key={folder.id} className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${excluded ? 'opacity-30' : 'hover:bg-foreground/5 cursor-pointer'}`}
                  onClick={() => !excluded && navigateTo(folder.path)}>
                  <Folder className="w-4 h-4 text-yellow-500 shrink-0" />
                  <span className="text-sm text-foreground flex-1 truncate">{folder.name}</span>
                  {excluded && <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />}
                  {!excluded && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                </div>
              );
            })
          )}
        </div>

        {/* New folder input */}
        {newFolderMode && (
          <div className="flex items-center gap-2 px-4 py-2 border-t border-foreground/8">
            <input
              autoFocus
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setNewFolderMode(false); }}
              placeholder="Folder name"
              className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
            />
            <button onClick={handleCreateFolder} className="bg-secondary hover:bg-secondary/80 rounded-lg px-2.5 py-1 text-xs font-semibold text-foreground">Create</button>
            <button onClick={() => setNewFolderMode(false)} className="bg-secondary hover:bg-secondary/80 rounded-lg p-1.5"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {/* Same-directory prompt for copy mode */}
        {sameDirectoryPrompt && (
          <div className="px-4 py-3 border-t border-foreground/8 bg-amber-500/5 animate-fade-in">
            <p className="text-xs font-semibold text-amber-500 mb-2.5">
              Already in this folder. What would you like to do?
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setSameDirectoryPrompt(false); onConfirm(currentPath, true); }}
                className="bg-secondary hover:bg-secondary/80 rounded-xl px-3 py-2 flex items-center gap-1.5 text-xs font-semibold text-foreground"
              >
                <Copy className="w-3 h-3" /> Duplicate
              </button>
              <button
                onClick={() => setSameDirectoryPrompt(false)}
                className="bg-secondary hover:bg-secondary/80 rounded-xl px-3 py-2 text-xs font-medium text-foreground/60"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        {!sameDirectoryPrompt && (
          <div className="flex items-center gap-2 px-4 py-3 border-t border-foreground/8">
            <button
              onClick={() => setNewFolderMode(true)}
              className="bg-secondary hover:bg-secondary/80 rounded-xl px-3 py-2 flex items-center gap-1.5 text-xs font-medium text-foreground/70"
            >
              <FolderPlus className="w-3.5 h-3.5" /> New Folder
            </button>
            <div className="flex-1" />
            <button onClick={onCancel} className="bg-secondary hover:bg-secondary/80 rounded-xl px-3 py-2 text-xs font-medium text-foreground/60">Cancel</button>
            <button
              onClick={() => {
                // Normalize paths for comparison (empty = root)
                const dest = currentPath === '' ? '' : currentPath;
                // Check if destination is the same as all source parents
                const isSameDir = sourceParentPaths.length > 0 && sourceParentPaths.every(sp => {
                  const norm = sp === '' || sp === '/' ? '' : sp;
                  return norm.toLowerCase() === dest.toLowerCase();
                });
                if (isSameDir) {
                  if (mode === 'move') {
                    toast.error("You're already in this folder — nothing to move.");
                    return;
                  } else {
                    // Copy mode — show duplicate prompt
                    setSameDirectoryPrompt(true);
                    return;
                  }
                }
                onConfirm(currentPath);
              }}
              className="bg-secondary hover:bg-secondary/80 rounded-xl px-4 py-2 text-xs font-semibold text-foreground"
            >
              {confirmLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
