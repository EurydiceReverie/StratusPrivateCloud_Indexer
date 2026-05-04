import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Save, FileText } from 'lucide-react';
import { uploadFile, uploadFileOverwrite, uploadEncryptedFile } from '@/services/uploadService';
import { toast } from 'sonner';

interface NewFileDialogProps {
  open: boolean;
  currentPath: string;
  onClose: () => void;
  onSaved: () => void;
  vaultAccess?: string | Uint8Array;
  vaultId?: string;
}

export const NewFileDialog: React.FC<NewFileDialogProps> = ({ open, currentPath, onClose, onSaved, vaultAccess, vaultId }) => {
  const [fileName, setFileName] = useState('untitled.txt');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track the actual saved path so subsequent saves overwrite the same file
  const savedPathRef = useRef<string | null>(null);
  // Track whether a save is currently in-flight to prevent concurrent saves
  const savingRef = useRef(false);
  // Track the latest content/name that has already been persisted so manual Save
  // right after auto-save does not create a second identical file/version.
  const lastSavedSnapshotRef = useRef<{ name: string; content: string } | null>(null);

  useEffect(() => {
    if (open) {
      setFileName('untitled.txt');
      setContent('');
      setDirty(false);
      setSavedOnce(false);
      savedPathRef.current = null;
      savingRef.current = false;
      lastSavedSnapshotRef.current = null;
    } else {
      // Cancel any pending auto-save when dialog closes to prevent ghost uploads
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = null;
      }
    }
  }, [open]);

  const cancelAutoSave = useCallback(() => {
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = null;
    }
  }, []);

  const doSave = useCallback(async (text: string, name: string, isAuto = false) => {
    if (!name.trim()) { toast.error('Enter a file name'); return; }

    const snapshot = { name, content: text };
    const alreadySaved = lastSavedSnapshotRef.current;
    if (alreadySaved && alreadySaved.name === snapshot.name && alreadySaved.content === snapshot.content) {
      if (!isAuto) {
        setDirty(false);
        setSavedOnce(true);
        toast.success(`Saved "${name}"`);
        onSaved();
      }
      return;
    }

    // Prevent concurrent saves — if already saving, skip
    if (savingRef.current) return;
    // Cancel any pending auto-save before proceeding
    cancelAutoSave();
    savingRef.current = true;
    setSaving(true);

    const blob = new Blob([text], { type: 'text/plain' });
    const file = new File([blob], name, { type: 'text/plain' });
    // Use the already-saved path if it exists (overwrite), otherwise create new (add)
    const destPath = savedPathRef.current ?? (currentPath === '' ? `/${name}` : `${currentPath}/${name}`);
    const isFirstSave = !savedPathRef.current;

    const onDone = (actualSavedPath?: string) => {
      if (actualSavedPath) {
        savedPathRef.current = actualSavedPath;
      } else if (isFirstSave) {
        savedPathRef.current = destPath;
      }
      lastSavedSnapshotRef.current = snapshot;
      savingRef.current = false;
      setSaving(false);
      setDirty(false);
      setSavedOnce(true);
      if (!isAuto) {
        toast.success(`Saved "${name}"`);
        onSaved();
      } else {
        toast.success('Auto-saved ✓', { duration: 1200 });
      }
    };
    const onError = (msg: string) => { savingRef.current = false; setSaving(false); toast.error(msg); };

    if (vaultAccess && vaultId) {
      await uploadEncryptedFile(file, destPath, vaultAccess, vaultId, { onDone, onError });
    } else {
      if (!isFirstSave) {
        await uploadFileOverwrite(file, destPath, { onDone, onError });
      } else {
        await uploadFile(file, destPath, { onDone, onError });
      }
    }
  }, [currentPath, onSaved, vaultAccess, vaultId, cancelAutoSave]);

  const scheduleAutoSave = useCallback((text: string, name: string) => {
    cancelAutoSave();
    if (!text || !name.trim()) return;
    // Debounce: save 2.5s after typing stops
    autoSaveTimer.current = setTimeout(() => {
      if (!savingRef.current) doSave(text, name, true);
    }, 2500);
  }, [doSave, cancelAutoSave]);

  const handleContentChange = (val: string) => {
    setContent(val);
    const alreadySaved = lastSavedSnapshotRef.current;
    const isDirtyNow = !alreadySaved || alreadySaved.content !== val || alreadySaved.name !== fileName;
    setDirty(isDirtyNow);
    scheduleAutoSave(val, fileName);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/70 backdrop-blur-xl" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl w-full max-w-3xl h-[80vh] flex flex-col animate-scale-in">

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-foreground/8 shrink-0">
          <FileText className="w-4 h-4 text-foreground/40 shrink-0" />
          <input
            value={fileName}
            onChange={e => {
              const nextName = e.target.value;
              setFileName(nextName);
              const alreadySaved = lastSavedSnapshotRef.current;
              setDirty(!alreadySaved || alreadySaved.name !== nextName || alreadySaved.content !== content);
            }}
            className="flex-1 bg-transparent outline-none text-sm font-semibold text-foreground placeholder:text-muted-foreground"
            placeholder="filename.txt"
            spellCheck={false}
          />
          <div className="flex items-center gap-2 shrink-0">
            {dirty && (
              <span className="text-[10px] text-muted-foreground">
                {saving ? 'Saving...' : 'Unsaved'}
              </span>
            )}
            {!dirty && savedOnce && (
              <span className="text-[10px] text-muted-foreground">Saved ✓</span>
            )}
            <button
              onClick={() => doSave(content, fileName)}
              disabled={saving}
              className="bg-secondary hover:bg-secondary/80 rounded-xl px-3 py-1.5 flex items-center gap-1.5 text-xs font-semibold text-foreground disabled:opacity-40"
            >
              <Save className="w-3.5 h-3.5" /> Save
            </button>
            <button onClick={onClose} className="bg-secondary hover:bg-secondary/80 rounded-lg p-1.5">
              <X className="w-4 h-4 text-foreground/60" />
            </button>
          </div>
        </div>

        {/* Editor */}
        <textarea
          value={content}
          onChange={e => handleContentChange(e.target.value)}
          placeholder="Start typing..."
          className="flex-1 bg-transparent resize-none outline-none p-5 text-sm font-mono text-foreground placeholder:text-muted-foreground/30 leading-relaxed"
          autoFocus
          spellCheck={false}
        />
      </div>
    </div>
  );
};
