import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/use-theme";
import { useDissolveEffect } from "@/hooks/use-dissolve-effect";
import { AppAccessFooterButton } from '@/context/AppAccessContext';
import { useAuth } from "@/context/AuthContext";
import FileGrid from "@/components/FileGrid";
import { RubberBandSelect } from "@/components/RubberBandSelect";
import { LoadingLine } from "@/components/ui/LoadingLine";
import { ThemeSwitcher } from "@/components/ui/apple-bg-card border border-border-switcher";
import { CreateFolderDialog } from "@/components/dialogs/CreateFolderDialog";
import { NewFileDialog } from "@/components/dialogs/NewFileDialog";

import { RenameDialog } from '@/components/dialogs/RenameDialog';
import { DeleteConfirmDialog } from '@/components/dialogs/DeleteConfirmDialog';
import { FileInfoDialog } from '@/components/dialogs/FileInfoDialog';
import { ShareDialog } from '@/components/dialogs/ShareDialog';
import { FilePreviewDialog } from '@/components/preview/FilePreviewDialog';

import {
  listFolder, deleteItem, renameItem,
  moveItem, copyItem, DBXFile,
  loadVaultFavoritesFromDropbox, saveVaultFavoritesToDropbox,
  getFileMetadata, loadVaultFileNameSegments,
} from '@/services/dropbox-service';
import { uploadEncryptedFile } from '@/services/uploadService';
import { downloadSingleFile, downloadDecryptedFile, downloadFolder } from '@/services/downloadService';
import {
  getActiveVaultId, getVaultPassword, getVaultMasterKey, hasVaultAccess, getActiveVault,
  setActiveVaultId, clearVaultPassword,
} from '@/lib/vault-manager';
import { decryptVaultFileNameFromSegments } from '@/lib/crypto';
import { FolderPickerDialog } from '@/components/dialogs/FolderPickerDialog';
import { toast } from 'sonner';
import { Lock, LogOut, Upload, FolderPlus, FilePlus, FileEdit, FolderOpen, ChevronLeft, ChevronRight, LayoutGrid, List, Search, X, User, Star, Activity, Trash2, Copy, Move, Download, CheckSquare } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { logActivity } from '@/lib/activity-logger';
import { getAppHomePath, getStatusRoutePath, isLiteRoutePath } from '@/lib/app-mode';

// ── Vault Breadcrumb — liquid glass border design (dark/light aware) ──────────
interface VaultBreadcrumbProps {
  labels: string[];
  onNavigate: (idx: number) => void;
  draggedItem: import('@/services/dropbox-service').DBXFile | null;
  onDropToIndex: (idx: number) => void;
}

function VaultBreadcrumb({ labels, onNavigate, draggedItem, onDropToIndex }: VaultBreadcrumbProps) {
  return (
    <div className="vault-breadcrumb" role="navigation" aria-label="Vault breadcrumb">
      {labels.map((seg, i) => {
        const isLast = i === labels.length - 1;
        return (
          <span key={i} className="flex items-center gap-1 shrink-0">
            {i > 0 && (
              <ChevronRight className="vault-breadcrumb-chevron w-3 h-3 shrink-0" />
            )}
            <button
              onClick={() => !isLast && onNavigate(i)}
              onDragOver={e => { if (draggedItem) e.preventDefault(); }}
              onDrop={e => { e.preventDefault(); onDropToIndex(i); }}
              disabled={isLast}
              className={`vault-breadcrumb-segment text-xs font-semibold px-3 py-1.5 whitespace-nowrap transition-all ${isLast ? 'vault-breadcrumb-active cursor-default' : 'cursor-pointer'}`}
            >
              <span className="inline-flex items-center gap-1.5">
                {i === 0 && <Lock className="vault-breadcrumb-root-icon w-3 h-3 shrink-0" />}
                <span>{seg}</span>
              </span>
            </button>
          </span>
        );
      })}
    </div>
  );
}

const CDN = "https://cdn.jsdelivr.net/gh/Ransomliome360/mcuplfold@main";

function joinPath(base: string, name: string): string {
  return base === '' || base === '/' ? `/${name}` : `${base}/${name}`;
}
function parentPath(path: string): string {
  const parts = path.split('/').filter(Boolean);
  parts.pop();
  return parts.length === 0 ? '' : '/' + parts.join('/');
}

export default function VaultPage() {
  const { isDark, toggle } = useTheme();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const homePath = getAppHomePath(pathname);
  const statusPath = getStatusRoutePath(pathname);
  const liteMode = isLiteRoutePath(pathname);
  const { isAuthenticated, userInfo } = useAuth();
  const dissolve = useDissolveEffect();

  const vault = getActiveVault();
  const vaultId = getActiveVaultId();
  const [vaultSessionAccess, setVaultSessionAccess] = useState(() => {
    const password = vaultId ? getVaultPassword(vaultId) : null;
    const masterKey = vaultId ? getVaultMasterKey(vaultId) : null;
    return { password, masterKey };
  });
  const vaultPassword = vaultSessionAccess.password;
  const vaultMasterKey = vaultSessionAccess.masterKey;
  const vaultAccess = vaultMasterKey ?? vaultPassword;

  useEffect(() => {
    const password = vaultId ? getVaultPassword(vaultId) : null;
    const masterKey = vaultId ? getVaultMasterKey(vaultId) : null;
    setVaultSessionAccess({ password, masterKey });
  }, [vaultId]);

  // If no active vault access, redirect home
  useEffect(() => {
    if (!vaultId || !hasVaultAccess(vaultId)) {
      navigate(homePath, { replace: true });
    }
  }, [vaultId, vaultPassword, vaultMasterKey, navigate, homePath]);

  // Load per-vault favorites from Dropbox on mount
  useEffect(() => {
    if (!vaultId || !isAuthenticated) return;
    loadVaultFavoritesFromDropbox(vaultId).then(ids => {
      setFavoriteIds(new Set(ids));
    }).catch(() => {});
  }, [vaultId, isAuthenticated]);

  const vaultRoot = vault?.dropboxFolder || '/Vault';

  const [navState, setNavState] = useState({ currentPath: vaultRoot, pathStack: [vaultRoot] });
  const currentPath = navState.currentPath;
  const pathStack = navState.pathStack;

  useEffect(() => {
    setNavState({ currentPath: vaultRoot, pathStack: [vaultRoot] });
    setFiles([]);
    setSelectedIds(new Set());
    setSelectionMode(false);
    setLoading(false);
  }, [vaultRoot]);

  const [files, setFiles] = useState<DBXFile[]>([]);
  const filesRef = useRef<DBXFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [dissolvingItems, setDissolvingItems] = useState<Set<string>>(new Set());
  const [draggedItem, setDraggedItem] = useState<DBXFile | null>(null);
  const [folderPicker, setFolderPicker] = useState<{
    open: boolean; mode: 'move' | 'copy'; files: DBXFile[];
  }>({ open: false, mode: 'move', files: [] });
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [favoriteFiles, setFavoriteFiles] = useState<DBXFile[]>([]);
  const [showFavorites, setShowFavorites] = useState(false);
  const [favSortOrder, setFavSortOrder] = useState<'name' | 'recent'>('recent');
  const [navKey, setNavKey] = useState(0);
  const [fileDragOver, setFileDragOver] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const dragCounter = useRef(0);
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Upload dropdown
  const [uploadOpen, setUploadOpen] = useState(false);
  const uploadDropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // New folder / new file dialogs
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFileOpen, setNewFileOpen] = useState(false);

  /* Disabled on request: integrity/rollback UI hooks preserved for future restore.
  const [integrityIssue, setIntegrityIssue] = useState<string | null>(null);
  const [integrityBusy, setIntegrityBusy] = useState(false);
  const integrityVerifiedRef = useRef<string | null>(null);

  const refreshIntegrityManifest = useCallback(async (reason: string, silent = true) => {
    if (!vaultId || !vaultAccess) return;
    await rebuildVaultManifest(vaultId, vaultRoot, vaultAccess, vault?.keySalt);
  }, [vaultId, vaultAccess, vaultRoot, vault?.keySalt]);

  const verifyIntegrityManifest = useCallback(async (silent = false) => {
    if (!vaultId || !vaultAccess) return;
    await verifyVaultManifest(vaultId, vaultRoot, vaultAccess, vault?.keySalt);
  }, [vaultId, vaultAccess, vaultRoot, vault?.keySalt]);

  const syncIntegrityManifest = useCallback((reason: string, silent = true) => {
    void refreshIntegrityManifest(reason, silent);
  }, [refreshIntegrityManifest]);
  */

  const [renameDialog, setRenameDialog] = useState<{ open: boolean; file: DBXFile | null }>({ open: false, file: null });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; files: DBXFile[] }>({ open: false, files: [] });
  const [infoDialog, setInfoDialog] = useState<{ open: boolean; file: DBXFile | null }>({ open: false, file: null });
  const [shareDialog, setShareDialog] = useState<{ open: boolean; file: DBXFile | null }>({ open: false, file: null });
  const [previewDialog, setPreviewDialog] = useState<{ open: boolean; file: DBXFile | null }>({ open: false, file: null });

  const abortRef = useRef<AbortController | null>(null);

  // Keep a ref to the latest vaultAccess so decryptFileNames closures always see the current value
  const vaultAccessRef = useRef<typeof vaultAccess>(vaultAccess);
  useEffect(() => { vaultAccessRef.current = vaultAccess; }, [vaultAccess]);

  const vaultIdRef = useRef<typeof vaultId>(vaultId);
  useEffect(() => { vaultIdRef.current = vaultId; }, [vaultId]);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  // Decrypt filenames for vault files using small head/tail range reads only.
  // This avoids downloading entire encrypted blobs just to render original names.
  // Uses refs for vaultAccess/vaultId so the closure always sees the latest values —
  // even if the password was set after the callback was created.
  const decryptFileNames = useCallback(async (items: DBXFile[], signal: AbortSignal) => {
    const access = vaultAccessRef.current;
    const vid = vaultIdRef.current;
    if (!vid || !access) return;
    const vaultFiles = items.filter(f => f.isVaultFile && !f.isFolder && !f._encryptedPath);
    const BATCH = 2;
    for (let i = 0; i < vaultFiles.length; i += BATCH) {
      if (signal.aborted) return;
      const batch = vaultFiles.slice(i, i + BATCH);
      await Promise.all(batch.map(async (file) => {
        try {
          const { headText, tailText } = await loadVaultFileNameSegments(file.path, file.size, signal);
          if (signal.aborted) return;
          const originalName = await decryptVaultFileNameFromSegments(headText, tailText, access, vid);
          if (originalName && !signal.aborted) {
            setFiles(prev => prev.map(f =>
              f.id === file.id
                ? { ...f, name: originalName, _encryptedPath: f.path }
                : f
            ));
          }
        } catch {
          // Keep Dropbox-obfuscated filename if listing-only decryption fails
        }
      }));
    }
  }, []); // no deps — reads everything from refs

  const loadFolder = useCallback(async (path: string, preserveDecrypted = false) => {
    if (!isAuthenticated) return;
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    if (!preserveDecrypted) {
      setFiles([]);
      setSelectedIds(new Set());
      setSelectionMode(false);
    }
    try {
      const items = await listFolder(path, ctrl.signal, true); // skipVaultFilter=true: show folders inside vault
      if (!ctrl.signal.aborted) {
        const mergedItems = preserveDecrypted
          ? (() => {
              const decryptedMap = new Map(filesRef.current.map(f => [f.id, f]));
              return items.map(item => {
                const existing = decryptedMap.get(item.id);
                if (existing && existing._encryptedPath) {
                  return { ...item, name: existing.name, _encryptedPath: existing._encryptedPath };
                }
                return item;
              });
            })()
          : items;

        setFiles(mergedItems);
        setLoading(false);
        if (path === vaultRoot && vaultId && vaultAccess) {
          // Disabled on request:
          // void verifyIntegrityManifest(true);
        }
        // Always attempt — decryptFileNames reads vaultAccess from ref (latest value)
        void decryptFileNames(mergedItems, ctrl.signal);
      }
    } catch (e: unknown) {
      if (ctrl.signal.aborted) return;
      const msg = e instanceof Error ? e.message : '';
      // Vault folder doesn't exist yet on Dropbox — auto-create it
      if (msg.includes('not_found') || msg.includes('path/not_found')) {
        try {
          const { createFolder } = await import('@/services/dropbox-service');
          await createFolder(path);
          // Disabled on request:
          // await refreshIntegrityManifest('folder creation', true);
          // integrityVerifiedRef.current = `${vaultId}:${vaultRoot}`;
          setFiles([]);
          setLoading(false);
        } catch {
          setFiles([]);
          setLoading(false);
        }
      } else {
        toast.error(msg || 'Failed to load vault');
        setLoading(false);
      }
    }
  }, [isAuthenticated, vaultRoot, vaultId, vaultAccess, decryptFileNames]);

  useEffect(() => {
    if (isAuthenticated) loadFolder(currentPath);
  }, [isAuthenticated, currentPath, loadFolder]);

  // Re-run filename decryption whenever vaultAccess becomes available (e.g. after
  // the user unlocks the vault on the same page load that already listed files).
  const prevVaultAccessRef = useRef<typeof vaultAccess>(null);
  useEffect(() => {
    const prev = prevVaultAccessRef.current;
    prevVaultAccessRef.current = vaultAccess;
    // Only fire when vaultAccess transitions from null → non-null
    if (!prev && vaultAccess && filesRef.current.length > 0) {
      const ctrl = new AbortController();
      void decryptFileNames(filesRef.current, ctrl.signal);
      return () => ctrl.abort();
    }
  }, [vaultAccess, decryptFileNames]);

  useEffect(() => {
    // Disabled on request:
    // setIntegrityIssue(null);
  }, [vaultId, vaultRoot]);

  // (favorites are loaded via the useEffect above that uses loadVaultFavoritesFromDropbox)

  const navigateTo = (path: string) => {
    if (path === currentPath) return;
    setNavKey(k => k + 1);
    setSelectedIds(new Set());
    setSelectionMode(false);
    setFiles([]);
    setLoading(true);
    setNavState(prev => ({ currentPath: path, pathStack: [...prev.pathStack, path] }));
  };

  const navigateUp = () => {
    if (pathStack.length <= 1) return;
    const newStack = pathStack.slice(0, -1);
    const newPath = newStack[newStack.length - 1];
    setNavKey(k => k + 1);
    setSelectedIds(new Set());
    setSelectionMode(false);
    setFiles([]);
    setLoading(true);
    setNavState({ currentPath: newPath, pathStack: newStack });
  };

  const navigateToIndex = (idx: number) => {
    const path = pathStack[idx] ?? vaultRoot;
    if (path === currentPath) return;
    setNavKey(k => k + 1);
    setSelectedIds(new Set());
    setSelectionMode(false);
    setFiles([]);
    setLoading(true);
    setNavState(prev => ({ currentPath: path, pathStack: prev.pathStack.slice(0, idx + 1) }));
  };

  const handleExitVault = async () => {
    // Zero-wipe the Argon2 derived key cache for this vault on exit
    try {
      const { clearArgon2BatchCache } = await import('@/lib/vault-crypto-advanced');
      clearArgon2BatchCache(vaultId ?? undefined);
    } catch { /* non-fatal */ }
    if (vaultId) clearVaultPassword(vaultId);
    setActiveVaultId(null);
    toast.success('Vault locked');
    navigate(homePath, { replace: true });
  };

  const handleUpload = async (fileList: FileList) => {
    if (!isAuthenticated || !vaultId || !vaultAccess) {
      toast.error('Vault not unlocked');
      return;
    }
    const filesArr = Array.from(fileList);
    for (const file of filesArr) {
      const destPath = joinPath(currentPath, file.name);
      const toastId = toast.loading(
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium truncate max-w-[200px]">{file.name}</span>
          <span className="text-xs text-muted-foreground">Encrypting & uploading...</span>
        </div>,
        { duration: Infinity }
      );
      await uploadEncryptedFile(file, destPath, vaultAccess, vaultId, {
        onProgress: (pct, phase) => {
          toast.loading(
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium truncate max-w-[200px]">{file.name}</span>
              <span className="text-xs">{phase === 'encrypting' ? '🔐 Encrypting' : '☁️ Uploading'} {pct}%</span>
            </div>,
            { id: toastId, duration: Infinity }
          );
        },
        onDone: async () => {
          toast.success(`Encrypted & uploaded: ${file.name}`, { id: toastId });
          logActivity('upload', { path: destPath, name: file.name + '.vault', size: file.size, success: true });
          // Disabled on request:
          // await refreshIntegrityManifest('upload');
          // preserveDecrypted=true: keep existing decrypted names, only add the new file
          loadFolder(currentPath, true);
        },
        onError: msg => {
          toast.error(`Failed: ${msg}`, { id: toastId });
          logActivity('upload', { path: destPath, name: file.name + '.vault', size: file.size, success: false, error: msg });
        },
      });
    }
  };

  const handleDelete = async () => {
    const toDelete = deleteDialog.files;
    setDeleteDialog({ open: false, files: [] });
    if (toDelete.length === 0) return;
    setDissolvingItems(new Set(toDelete.map(f => f.id)));
    if (liteMode) {
      await new Promise((resolve) => window.setTimeout(resolve, 220));
    } else {
      const elements: HTMLElement[] = toDelete.map(f => itemRefs.current.get(f.id)!).filter(Boolean);
      await dissolve(elements);
    }
    let failed = 0;
    const deletedIds = new Set<string>();
    for (const file of toDelete) {
      try {
        await deleteItem(file.isVaultFile && file._encryptedPath ? file._encryptedPath : file.path);
        deletedIds.add(file.id);
      } catch { failed++; }
    }
    setDissolvingItems(new Set());
    setFiles(prev => prev.filter(f => !toDelete.find(d => d.id === f.id)));
    setSelectedIds(new Set()); setSelectionMode(false);
    if (deletedIds.size > 0) {
      const nextFavoriteIds = new Set(Array.from(favoriteIds).filter(id => !deletedIds.has(id)));
      if (nextFavoriteIds.size !== favoriteIds.size) {
        setFavoriteIds(nextFavoriteIds);
        setFavoriteFiles(prev => prev.filter(f => !deletedIds.has(f.id)));
        if (vaultId) await saveVaultFavoritesToDropbox(vaultId, Array.from(nextFavoriteIds));
      }
    }
    // Disabled on request:
    // if (deletedIds.size > 0) await refreshIntegrityManifest('delete');
    if (failed === 0) toast.success(`Deleted ${toDelete.length} item${toDelete.length > 1 ? 's' : ''}`);
    else toast.error(`Deleted ${toDelete.length - failed}, failed ${failed}`);
    if (showFavorites) loadFavorites(); else loadFolder(currentPath);
  };

  const handleRename = async (newName: string) => {
    if (!renameDialog.file) return;
    setRenameDialog({ open: false, file: null });
    const file = renameDialog.file;
    const isVault = file.isVaultFile && file._encryptedPath;
    const fromPath = isVault ? file._encryptedPath! : file.path;
    if (isVault) {
      toast.info('Vault file names are stored encrypted inside the file. The display name will update on next load.');
      if (showFavorites) loadFavorites(); else loadFolder(currentPath);
      return;
    }
    const newPath = joinPath(parentPath(fromPath), newName);
    try {
      await renameItem(fromPath, newPath);
      // Disabled on request:
      // await refreshIntegrityManifest('rename');
      toast.success(`Renamed to "${newName}"`);
      if (showFavorites) loadFavorites(); else loadFolder(currentPath);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to rename');
    }
  };

  const handleDownload = async (file: DBXFile) => {
    if (file.isFolder) {
      const tid = toast.loading(`Zipping "${file.name}"...`, { duration: Infinity });
      try {
        await downloadFolder(file.path, file.name, () => {});
        toast.success(`Downloaded "${file.name}.zip"`, { id: tid });
      } catch { toast.error('Folder download failed', { id: tid }); }
      return;
    }
    if (!vaultAccess || !vaultId) { toast.error('Vault not unlocked'); return; }

    // Vault files — decrypt on download, restore original filename
    if (file.isVaultFile) {
      // Use _encryptedPath (UUID Dropbox path) if name was already decrypted for display
      const dropboxPath = file._encryptedPath || file.path;
      const displayName = file.name; // already decrypted original name
      const toastId = toast.loading(
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium truncate max-w-[200px]">{displayName}</span>
          <span className="text-xs text-muted-foreground">🔓 Decrypting & downloading...</span>
        </div>,
        { duration: Infinity }
      );
      try {
        await downloadDecryptedFile(dropboxPath, file.name, vaultAccess, vaultId);
        toast.success(`Downloaded: ${displayName}`, { id: toastId });
        logActivity('download', { path: dropboxPath, name: displayName, success: true });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Decrypt & download failed', { id: toastId });
        logActivity('download', { path: dropboxPath, name: displayName, success: false });
      }
      return;
    }

    // Non-vault files (folders in vault, plain files) — normal download
    const toastId = toast.loading(`Downloading ${file.name}...`, { duration: Infinity });
    try {
      await downloadSingleFile(file.path, file.name, file.size);
      toast.success(`Downloaded: ${file.name}`, { id: toastId });
    } catch { toast.error('Download failed', { id: toastId }); }
  };

  const toggleSelect = (id: string) => {
    if (!selectionMode) setSelectionMode(true);
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => { setSelectionMode(true); setSelectedIds(new Set(filteredFiles.map(f => f.id))); };
  const clearSelection = () => { setSelectedIds(new Set()); setSelectionMode(false); };

  // Load vault favorites from Dropbox and resolve metadata
  const loadFavorites = useCallback(async () => {
    if (!vaultId || !isAuthenticated) return;
    setLoading(true);
    try {
      const ids = await loadVaultFavoritesFromDropbox(vaultId);
      setFavoriteIds(new Set(ids));
      if (ids.length === 0) { setFavoriteFiles([]); setLoading(false); return; }
      // Batch in groups of 2 — prevents 429 when user has many vault favorites
      const results: PromiseSettledResult<DBXFile>[] = [];
      for (let i = 0; i < ids.length; i += 2) {
        const batch = await Promise.allSettled(ids.slice(i, i + 2).map(id => getFileMetadata(id)));
        results.push(...batch);
      }
      const fetched: DBXFile[] = results
        .filter((r): r is PromiseFulfilledResult<DBXFile> => r.status === 'fulfilled' && !!r.value)
        .map(r => r.value);
      const validIds = new Set(fetched.map(f => f.id));
      const cleanIds = ids.filter(id => validIds.has(id));
      if (cleanIds.length !== ids.length) {
        setFavoriteIds(new Set(cleanIds));
        await saveVaultFavoritesToDropbox(vaultId, cleanIds);
      }

      setFavoriteFiles(fetched);
    } catch { setFavoriteFiles([]); }
    setLoading(false);
  }, [vaultId, isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close upload dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (uploadDropdownRef.current && !uploadDropdownRef.current.contains(e.target as Node)) setUploadOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Focus search input when opened
  useEffect(() => {
    if (searchOpen && searchInputRef.current) searchInputRef.current.focus();
  }, [searchOpen]);

  // Filtered files based on search
  const filteredFiles = searchQuery.trim()
    ? files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : files;

  // Display files — favorites mode or normal
  const displayFiles = showFavorites
    ? (favSortOrder === 'name' ? [...favoriteFiles].sort((a, b) => a.name.localeCompare(b.name)) : [...favoriteFiles].reverse())
    : filteredFiles;

  const vaultCipherLabel = (() => {
    if (!vault) return 'Vault';
    if (vault.cryptoVersion === 9) return 'Deoxys-II-256';
    if (vault.cryptoVersion === 8) {
      if (vault.v8CipherAlg === 'xchacha20-poly1305') return 'XChaCha20-Poly1305';
      return 'AES-256-GCM-SIV';
    }
    if (vault.cryptoVersion === 7) return 'XChaCha20-Poly1305';
    if (vault.cryptoVersion === 5 || vault.cryptoVersion === 4 || vault.cryptoVersion === 3) return 'AES-256-GCM';
    return 'Vault';
  })();

  // Breadcrumb: full path stack labels relative to vault root
  const breadcrumbLabels = pathStack.map((p, i) =>
    i === 0 ? (vault?.name || 'Vault') : p.split('/').filter(Boolean).pop() || p
  );

  // Legacy: relative path segments (for old breadcrumb — kept for fallback)
  const relativePath = currentPath === vaultRoot
    ? []
    : currentPath.replace(vaultRoot, '').split('/').filter(Boolean);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable;
      if (isEditing) return;

      // Ctrl+A — select all / deselect all toggle
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        if (selectedIds.size === displayFiles.length && displayFiles.length > 0) clearSelection();
        else selectAll();
        return;
      }

      // Ctrl+Shift+F — toggle favorites
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        const next = !showFavorites;
        setShowFavorites(next);
        if (next) loadFavorites();
        return;
      }

      // Delete / Backspace
      if (e.key === 'Delete' && selectionMode && selectedIds.size > 0) {
        e.preventDefault();
        const toDelete = displayFiles.filter(f => selectedIds.has(f.id));
        setDeleteDialog({ open: true, files: toDelete });
        return;
      }
      if (e.key === 'Backspace' && !selectionMode && currentPath !== vaultRoot) {
        e.preventDefault(); navigateUp(); return;
      }
      if (e.key === 'Backspace' && selectionMode && selectedIds.size > 0) {
        e.preventDefault();
        const toDelete = displayFiles.filter(f => selectedIds.has(f.id));
        setDeleteDialog({ open: true, files: toDelete });
        return;
      }

      // Escape
      if (e.key === 'Escape') { clearSelection(); setFocusedIdx(-1); return; }

      // Space — preview
      if (e.key === ' ') {
        e.preventDefault();
        const idx = focusedIdx >= 0 ? focusedIdx : (selectedIds.size === 1 ? displayFiles.findIndex(f => selectedIds.has(f.id)) : -1);
        if (idx >= 0 && idx < displayFiles.length) {
          const file = displayFiles[idx];
          if (!file.isFolder) {
            const previewFile = file.isVaultFile && file._encryptedPath ? { ...file, path: file._encryptedPath } : file;
            setPreviewDialog({ open: true, file: previewFile });
          } else navigateTo(file.path);
        }
        return;
      }

      // Arrow key navigation
      if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        const total = displayFiles.length;
        if (total === 0) return;
        const cols = viewMode === 'grid' ? (window.innerWidth >= 1024 ? 6 : window.innerWidth >= 768 ? 5 : window.innerWidth >= 640 ? 4 : 3) : 1;
        let next = focusedIdx < 0 ? 0 : focusedIdx;
        if (e.key === 'ArrowRight') next = Math.min(next + 1, total - 1);
        else if (e.key === 'ArrowLeft') next = Math.max(next - 1, 0);
        else if (e.key === 'ArrowDown') next = Math.min(next + cols, total - 1);
        else if (e.key === 'ArrowUp') next = Math.max(next - cols, 0);
        setFocusedIdx(next);
        if (e.shiftKey) {
          const file = displayFiles[next];
          if (file) { if (!selectionMode) setSelectionMode(true); toggleSelect(file.id); }
        } else clearSelection();
        return;
      }

      // Enter — open
      if (e.key === 'Enter' && focusedIdx >= 0 && focusedIdx < displayFiles.length) {
        e.preventDefault();
        const file = displayFiles[focusedIdx];
        if (file.isFolder) navigateTo(file.path);
        else {
          const previewFile = file.isVaultFile && file._encryptedPath ? { ...file, path: file._encryptedPath } : file;
          setPreviewDialog({ open: true, file: previewFile });
        }
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, displayFiles, selectionMode, focusedIdx, viewMode, currentPath, showFavorites]);

  const handleFileDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); dragCounter.current++; setFileDragOver(true); }
  };
  const handleFileDragLeave = (e: React.DragEvent) => {
    dragCounter.current--;
    if (dragCounter.current === 0) setFileDragOver(false);
  };
  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault(); dragCounter.current = 0; setFileDragOver(false);
    if (e.dataTransfer.files?.length) handleUpload(e.dataTransfer.files);
  };

  if (!vault || !vaultAccess) return null;

  return (
    <div
      className="vault-page min-h-screen bg-transparent transition-colors duration-500 relative flex flex-col select-none"
      onDragOver={handleFileDragOver}
      onDragLeave={handleFileDragLeave}
      onDrop={handleFileDrop}
    >
      <LoadingLine visible={loading} />

      {/* Drag-drop overlay */}
      {fileDragOver && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/60 backdrop-blur-xl animate-fade-in">
          <div className="flex flex-col items-center gap-4 p-12 rounded-3xl border-2 border-dashed border-purple-500/50 bg-purple-500/5">
            <div className="w-20 h-20 rounded-full bg-purple-500/10 flex items-center justify-center">
              <Lock className="w-10 h-10 text-purple-400" />
            </div>
            <p className="text-lg font-bold text-foreground">Drop to encrypt & upload</p>
            <p className="text-sm text-muted-foreground font-medium">Files will be AES-256 encrypted before upload</p>
          </div>
        </div>
      )}

      {/* ── Vault Header ── */}
      <header className="fixed top-3 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1.25rem)] max-w-6xl">
        <div className="bg-card border border-border rounded-[1.25rem] px-5 py-3.5 flex items-center justify-between gap-3 border border-foreground/8 shadow-[0_11px_28px_rgba(0,0,0,0.11)]">

          {/* Left: Logo + vault name */}
          <div className="flex items-center gap-3 shrink-0">
            <img
              src={isDark ? `${CDN}/icloud%20(1).svg` : `${CDN}/icloud.svg`}
              alt="Cloud"
              className="h-10 w-10"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <div className="flex flex-col">
              <span className="text-xl font-bold tracking-tight text-foreground leading-none">Stratus</span>
              <span className="text-[10px] font-semibold text-purple-400 leading-none mt-0.5 flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" />{vault.name}
              </span>
            </div>
          </div>

          {/* Center: search + breadcrumb + view toggle */}
          <div className="flex items-center gap-1.5 flex-1 justify-center min-w-0">

            {/* Search */}
            {searchOpen ? (
              <div className="bg-secondary flex items-center gap-2 px-1.5 py-1.5 animate-scale-in">
                <div className="search-icon-circle shrink-0">
                  <Search className="h-3.5 w-3.5 text-foreground/60" />
                </div>
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search vault…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="bg-transparent border-none outline-none text-sm font-medium text-foreground placeholder:text-muted-foreground w-36 md:w-48"
                />
                <button
                  onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
                  className="search-close-circle shrink-0"
                >
                  <X className="h-2.5 w-2.5 text-red-400" strokeWidth={2.5} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setSearchOpen(true)}
                title="Search"
                className="search-icon-circle-lg bg-secondary hover:bg-secondary/80"
              >
                <Search className="h-4 w-4 text-foreground/60" />
              </button>
            )}


            {/* View toggle */}
            <div className="bg-secondary hover:bg-secondary/80 view-toggle" data-view={viewMode}>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2.5 rounded-[10px] transition-colors outline-none ${viewMode === 'grid' ? 'text-foreground' : 'text-foreground/35'}`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2.5 rounded-[10px] transition-colors outline-none ${viewMode === 'list' ? 'text-foreground' : 'text-foreground/35'}`}
              >
                <List className="h-4 w-4" />
              </button>
            </div>

            {/* Back */}
            {pathStack.length > 1 && (
              <button
                onClick={navigateUp}
                className="bg-secondary hover:bg-secondary/80 rounded-xl p-2.5 text-foreground/60 hover:text-foreground transition-all"
                title="Go up"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}

            {/* Upload dropdown */}
            <div className="relative" ref={uploadDropdownRef}>
              <button
                onClick={() => setUploadOpen(o => !o)}
                className="bg-secondary hover:bg-secondary/80 rounded-xl p-2.5 text-foreground/60 hover:text-foreground transition-all"
                title="Upload & Encrypt"
              >
                <Upload className="h-4 w-4" />
              </button>
              {uploadOpen && (
                <div className="upload-dropdown absolute left-0 top-full mt-2 rounded-xl overflow-hidden min-w-[180px] animate-scale-in z-50 shadow-2xl border border-border/60 bg-[hsl(220_20%_97%)] dark:bg-[hsl(225_15%_13%)]">
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-foreground hover:bg-foreground/5 transition-colors"
                    onClick={() => { setUploadOpen(false); setCreateFolderOpen(true); }}
                  >
                    <FolderPlus className="h-4 w-4 text-foreground/60" /> New Folder
                  </button>
                  <div className="h-px bg-foreground/8 mx-3" />
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-foreground hover:bg-foreground/5 transition-colors"
                    onClick={() => { setUploadOpen(false); setNewFileOpen(true); }}
                  >
                    <FileEdit className="h-4 w-4 text-foreground/60" /> New File
                  </button>
                  <div className="h-px bg-foreground/8 mx-3" />
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-foreground hover:bg-foreground/5 transition-colors"
                    onClick={() => { setUploadOpen(false); fileInputRef.current?.click(); }}
                  >
                    <FilePlus className="h-4 w-4 text-foreground/60" /> Upload Files
                  </button>
                  <div className="h-px bg-foreground/8 mx-3" />
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-foreground hover:bg-foreground/5 transition-colors"
                    onClick={() => { setUploadOpen(false); folderInputRef.current?.click(); }}
                  >
                    <FolderOpen className="h-4 w-4 text-foreground/60" /> Upload Folder
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right: theme + favorites + profile + exit vault */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Favorites toggle — purple in vault mode */}
            <button
              onClick={() => { const next = !showFavorites; setShowFavorites(next); if (next) loadFavorites(); }}
              className={`bg-secondary hover:bg-secondary/80 rounded-xl p-2.5 transition-all ${showFavorites ? 'text-purple-400' : 'text-foreground/50 hover:text-foreground'}`}
              title="Starred files (Ctrl+Shift+F)"
            >
              <Star className={`w-4 h-4 ${showFavorites ? 'fill-purple-400 text-purple-400' : ''}`} />
            </button>
            <button
              onClick={() => navigate(statusPath)}
              className="bg-secondary hover:bg-secondary/80 rounded-xl p-2.5 text-foreground/50 hover:text-foreground transition-all"
              title="Status"
            >
              <Activity className="w-4 h-4" />
            </button>
            <ThemeSwitcher
              value={isDark ? "dark" : "light"}
              onValueChange={v => { if ((v === "dark") !== isDark) toggle(); }}
            />

            {/* Profile avatar with name tooltip */}
            {userInfo && (
              <div className="relative group">
                <div className="bg-secondary hover:bg-secondary/80 rounded-xl p-1 cursor-pointer">
                  <Avatar className="h-7 w-7">
                    {userInfo.avatarUrl && !userInfo.avatarUrl.startsWith('data:') && (
                      <AvatarImage src={userInfo.avatarUrl} />
                    )}
                    <AvatarFallback className="text-xs bg-foreground/10 text-foreground">
                      {userInfo.name?.charAt(0) || <User className="w-3 h-3" />}
                    </AvatarFallback>
                  </Avatar>
                </div>
                {/* Name popup on hover */}
                <div className="absolute right-0 top-full mt-2 bg-card border border-border rounded-xl px-3 py-2 min-w-max opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-200 z-50">
                  <p className="text-xs font-semibold text-foreground">{userInfo.name}</p>
                  {userInfo.email && <p className="text-[10px] text-muted-foreground mt-0.5">{userInfo.email}</p>}
                </div>
              </div>
            )}

            {/* Exit Vault */}
            <button
              onClick={handleExitVault}
              className="bg-secondary hover:bg-secondary/80 rounded-xl px-3.5 py-2.5 flex items-center gap-2 text-sm font-semibold bg-red-500/12 text-red-500 ring-1 ring-red-500/25 shadow-sm hover:bg-red-500/18 hover:text-red-600 dark:text-red-300 dark:hover:text-red-200 transition-all hover:scale-[1.03] active:scale-[0.98]"
              title="Lock & Exit Vault"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Exit Vault</span>
            </button>
          </div>
        </div>
      </header>

      <input ref={fileInputRef} type="file" multiple className="hidden"
        onChange={e => e.target.files && handleUpload(e.target.files)} />
      <input ref={folderInputRef} type="file" multiple className="hidden"
        // @ts-ignore
        webkitdirectory="" directory=""
        onChange={e => e.target.files && handleUpload(e.target.files)} />

      {/* Rubber-band selection overlay — purple in vault mode */}
      <RubberBandSelect
        itemRefs={itemRefs}
        onSelect={ids => { setSelectionMode(true); setSelectedIds(ids); }}
        onClearSelection={clearSelection}
        disabled={showFavorites}
        color="purple"
      />

      <main className="relative z-10 flex-1 max-w-6xl w-full mx-auto px-4 pt-28 pb-6 space-y-4">

        {/* Vault-specific breadcrumb — liquid glass border design */}
        <div className="flex items-center gap-2 -mt-1">
          <VaultBreadcrumb
            labels={breadcrumbLabels}
            onNavigate={navigateToIndex}
            draggedItem={draggedItem}
            onDropToIndex={(i) => {
              if (!draggedItem) return;
              const srcPath = draggedItem.isVaultFile && draggedItem._encryptedPath ? draggedItem._encryptedPath : draggedItem.path;
              const destName = draggedItem.isVaultFile && draggedItem._encryptedPath ? draggedItem._encryptedPath.split('/').pop()! : draggedItem.name;
              moveItem(srcPath, joinPath(pathStack[i], destName))
                .then(async () => {
                  // Disabled on request:
                  // await refreshIntegrityManifest('move');
                  toast.success(`Moved "${draggedItem.name}"`); setDraggedItem(null); loadFolder(currentPath);
                })
                .catch(() => toast.error('Move failed'));
            }}
          />
          {/* Favorites sort toggles */}
          {showFavorites && (
            <div className="flex items-center gap-1 ml-auto shrink-0">
              <button onClick={() => setFavSortOrder('recent')} className={`text-xs px-2 py-1 rounded-lg transition-colors ${favSortOrder === 'recent' ? 'bg-purple-500/15 text-purple-400 font-semibold' : 'text-muted-foreground hover:text-foreground'}`}>Recent</button>
              <button onClick={() => setFavSortOrder('name')} className={`text-xs px-2 py-1 rounded-lg transition-colors ${favSortOrder === 'name' ? 'bg-purple-500/15 text-purple-400 font-semibold' : 'text-muted-foreground hover:text-foreground'}`}>Name</button>
            </div>
          )}
        </div>

        {/* Vault banner */}
        <div className="bg-card border border-border rounded-2xl px-4 py-3 flex items-center gap-3 border border-purple-500/20">
          {/* Disabled on request:
          <span className="text-[10px] font-semibold bg-purple-500/15 text-purple-400 px-2.5 py-1 rounded-full shrink-0">
            {integrityBusy ? '🛡️ Verifying' : integrityIssue ? '⚠️ Integrity alert' : '🛡️ Verified'}
          </span>
          */}
          <div className="w-8 h-8 rounded-xl bg-purple-500/15 flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4 text-purple-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground">{vault.name}</p>
            <p className="text-xs font-medium text-foreground/70 truncate">{vault.name} · {vaultCipherLabel}</p>
          </div>
        </div>

        {/* Disabled on request:
        {integrityIssue && (
          <div className="bg-card border border-border rounded-2xl px-4 py-3 border border-red-500/25 text-sm text-red-300">
            <p className="font-semibold">Vault integrity warning</p>
            <p className="text-xs text-red-200/80 mt-1">{integrityIssue}</p>
          </div>
        )}
        */}

        {/* Multi-select action bar */}
        {selectionMode && selectedIds.size > 0 && (
          <div className="bg-card border border-border rounded-2xl px-4 py-2.5 flex items-center gap-2 border border-purple-500/15 animate-scale-in">
            <span className="text-xs font-semibold text-foreground/70 shrink-0">
              {selectedIds.size} selected
            </span>
            <div className="flex-1" />
            <button
              onClick={() => selectedIds.size === displayFiles.length ? clearSelection() : selectAll()}
              className="bg-secondary hover:bg-secondary/80 rounded-xl px-2.5 py-1.5 flex items-center gap-1.5 text-xs font-medium text-foreground/70 hover:text-foreground"
              title={selectedIds.size === displayFiles.length ? "Deselect all" : "Select all"}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{selectedIds.size === displayFiles.length ? 'Deselect' : 'All'}</span>
            </button>
            <button
              onClick={() => { const sel = displayFiles.filter(f => selectedIds.has(f.id)); sel.forEach(f => handleDownload(f)); }}
              className="bg-secondary hover:bg-secondary/80 rounded-xl px-2.5 py-1.5 flex items-center gap-1.5 text-xs font-medium text-foreground/70 hover:text-foreground"
              title="Download selected"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download</span>
            </button>
            <button
              onClick={() => setFolderPicker({ open: true, mode: 'copy', files: displayFiles.filter(f => selectedIds.has(f.id)) })}
              className="bg-secondary hover:bg-secondary/80 rounded-xl px-2.5 py-1.5 flex items-center gap-1.5 text-xs font-medium text-foreground/70 hover:text-foreground"
              title="Copy selected"
            >
              <Copy className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Copy</span>
            </button>
            <button
              onClick={() => setFolderPicker({ open: true, mode: 'move', files: displayFiles.filter(f => selectedIds.has(f.id)) })}
              className="bg-secondary hover:bg-secondary/80 rounded-xl px-2.5 py-1.5 flex items-center gap-1.5 text-xs font-medium text-foreground/70 hover:text-foreground"
              title="Move selected"
            >
              <Move className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Move</span>
            </button>
            <button
              onClick={() => setDeleteDialog({ open: true, files: displayFiles.filter(f => selectedIds.has(f.id)) })}
              className="bg-secondary hover:bg-secondary/80 rounded-xl px-2.5 py-1.5 flex items-center gap-1.5 text-xs font-medium text-red-400 hover:text-red-500"
              title="Delete selected"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Delete</span>
            </button>
            <button
              onClick={clearSelection}
              className="bg-secondary hover:bg-secondary/80 rounded-lg p-1.5 text-foreground/40 hover:text-foreground"
              title="Clear selection"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* File grid */}
        <div key={`vault-nav-${navKey}`} className="animate-nav-in">
          {loading ? null : (
            <FileGrid
              key={viewMode}
              items={displayFiles}
              onFolderOpen={file => {
                if (file.isFolder) navigateTo(file.path);
                else {
                  const previewFile = file.isVaultFile && file._encryptedPath
                    ? { ...file, path: file._encryptedPath }
                    : file;
                  setPreviewDialog({ open: true, file: previewFile });
                }
              }}
              viewMode={viewMode}
              selected={selectedIds}
              selectMode={selectionMode || selectedIds.size > 0}
              onToggleSelect={toggleSelect}
              dissolvingItems={dissolvingItems}
              onDragItem={f => setDraggedItem(f)}
              onDropOnFolder={async (folder) => {
                if (!draggedItem || draggedItem.id === folder.id) return;
                try {
                  const srcPath = draggedItem.isVaultFile && draggedItem._encryptedPath ? draggedItem._encryptedPath : draggedItem.path;
                  const destName = draggedItem.isVaultFile && draggedItem._encryptedPath ? draggedItem._encryptedPath.split('/').pop()! : draggedItem.name;
                  await moveItem(srcPath, joinPath(folder.path, destName));
                  // Disabled on request:
                  // await refreshIntegrityManifest('move');
                  toast.success(`Moved "${draggedItem.name}" to "${folder.name}"`);
                  setDraggedItem(null);
                  loadFolder(currentPath);
                } catch { toast.error('Move failed'); }
              }}
              dragOverFolder={dragOverFolder}
              onDragOverFolder={setDragOverFolder}
              itemRefs={itemRefs}
              onRename={file => setRenameDialog({ open: true, file })}
              onDelete={file => setDeleteDialog({ open: true, files: [file] })}
              onShare={file => setShareDialog({ open: true, file })}
              onInfo={file => {
                const infoFile = file.isVaultFile && file._encryptedPath
                  ? { ...file, path: file.path, _encryptedPath: file._encryptedPath }
                  : file;
                setInfoDialog({ open: true, file: infoFile });
              }}
              onPreview={file => {
                const previewFile = file.isVaultFile && file._encryptedPath
                  ? { ...file, path: file._encryptedPath }
                  : file;
                setPreviewDialog({ open: true, file: previewFile });
              }}
              onDownload={handleDownload}
              onCopy={(file) => setFolderPicker({ open: true, mode: 'copy', files: [file] })}
              onMove={(file) => setFolderPicker({ open: true, mode: 'move', files: [file] })}
              onFavoriteToggle={async (file) => {
                const next = new Set(favoriteIds);
                const wasStarred = next.has(file.id);
                if (wasStarred) next.delete(file.id); else next.add(file.id);
                setFavoriteIds(next);
                if (showFavorites && wasStarred) {
                  setFavoriteFiles(prev => prev.filter(f => f.id !== file.id));
                }
                if (vaultId) await saveVaultFavoritesToDropbox(vaultId, Array.from(next));
                if (showFavorites) loadFavorites();
                toast.success(wasStarred ? 'Removed from favorites' : 'Added to favorites');
              }}
              focusedIdx={focusedIdx}
              favoriteIds={favoriteIds}
              isVaultMode={true}
              isFavoritesMode={showFavorites}
              onGoToFolder={file => {
                setShowFavorites(false);
                const encryptedPath = file._encryptedPath || file.path;
                const parts = encryptedPath.split('/').filter(Boolean).slice(0, -1);
                const folderPath = parts.length === 0 ? vaultRoot : '/' + parts.join('/');
                const doHighlight = () => {
                  setHighlightedId(file.id);
                  setTimeout(() => {
                    const el = itemRefs.current.get(file.id);
                    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
                  }, 300);
                  setTimeout(() => setHighlightedId(null), 2000);
                };
                if (folderPath === currentPath) {
                  doHighlight();
                } else if (folderPath === vaultRoot) {
                  navigateToIndex(0);
                  setTimeout(doHighlight, 800);
                } else {
                  navigateTo(folderPath);
                  setTimeout(doHighlight, 800);
                }
              }}
              highlightedId={highlightedId}
            />
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-6xl mx-auto px-4 pb-7 mt-auto">
        <div className="bg-card border border-border rounded-[1.25rem] px-5 py-5 flex items-center gap-3 flex-wrap relative pr-28 sm:pr-32 border border-foreground/8 shadow-[0_12px_30px_rgba(0,0,0,0.11)]">
          <AppAccessFooterButton />
          <Lock className="w-3 h-3 text-purple-500 shrink-0" />
          <span className="text-xs font-semibold text-foreground/80 tracking-wide">
            {showFavorites
              ? `Starred ${favoriteFiles.length} · Vault ${vaultCipherLabel}`
              : `Folders ${files.filter(f => f.isFolder).length} · Files ${files.filter(f => !f.isFolder).length} · Vault ${vaultCipherLabel}`
            }
          </span>
          <div className="w-px h-3 bg-foreground/15 shrink-0" />
          {/* Keyboard shortcuts reference */}
          <div className="flex items-center gap-2 flex-wrap text-[10px] text-foreground/80 font-medium">
            <span><kbd className="bg-foreground/12 text-foreground/85 px-1.5 py-0.5 rounded">Ctrl+A</kbd> select all</span>
            <span><kbd className="bg-foreground/12 text-foreground/85 px-1.5 py-0.5 rounded">Esc</kbd> deselect</span>
            <span><kbd className="bg-foreground/12 text-foreground/85 px-1.5 py-0.5 rounded">Del</kbd> delete</span>
            <span><kbd className="bg-foreground/12 text-foreground/85 px-1.5 py-0.5 rounded">⌫</kbd> go up</span>
            <span><kbd className="bg-foreground/12 text-foreground/85 px-1.5 py-0.5 rounded">Space</kbd> preview</span>
            <span><kbd className="bg-foreground/12 text-foreground/85 px-1.5 py-0.5 rounded">Ctrl+⇧+F</kbd> starred</span>
          </div>
          {selectionMode && selectedIds.size > 0 && (
            <span className="ml-auto text-xs font-semibold text-purple-400 shrink-0">{selectedIds.size} selected</span>
          )}
        </div>
      </footer>

      {/* Create Folder Dialog */}
      <CreateFolderDialog
        open={createFolderOpen}
        onConfirm={async (name) => {
          setCreateFolderOpen(false);
          try {
            const { createFolder } = await import('@/services/dropbox-service');
            await createFolder(joinPath(currentPath, name));
            // Disabled on request:
            // syncIntegrityManifest('folder creation');
            toast.success(`Folder "${name}" created`);
            loadFolder(currentPath);
          } catch { toast.error('Failed to create folder'); }
        }}
        onCancel={() => setCreateFolderOpen(false)}
      />

      {/* New File Dialog */}
      <NewFileDialog
        open={newFileOpen}
        currentPath={currentPath}
        vaultAccess={vaultAccess || undefined}
        vaultId={vaultId || undefined}
        onClose={() => setNewFileOpen(false)}
        onSaved={() => {
          setNewFileOpen(false);
          // Disabled on request:
          // syncIntegrityManifest('file save');
          // Use preserveDecrypted=true so existing decrypted names aren't reset to UUIDs
          loadFolder(currentPath, true);
        }}
      />

      {/* Dialogs */}
      <RenameDialog
        open={renameDialog.open}
        currentName={renameDialog.file?.name || ''}
        onConfirm={handleRename}
        onCancel={() => setRenameDialog({ open: false, file: null })}
      />
      <DeleteConfirmDialog
        open={deleteDialog.open}
        itemNames={deleteDialog.files.map(f => f.name)}
        onConfirm={handleDelete}
        onCancel={() => setDeleteDialog({ open: false, files: [] })}
      />
      <FileInfoDialog
        open={infoDialog.open}
        file={infoDialog.file}
        onClose={() => setInfoDialog({ open: false, file: null })}
      />
      <ShareDialog
        open={shareDialog.open}
        file={shareDialog.file}
        onClose={() => setShareDialog({ open: false, file: null })}
      />
      <FilePreviewDialog
        open={previewDialog.open}
        file={previewDialog.file}
        files={files}
        vaultId={vaultId}
        onClose={() => setPreviewDialog({ open: false, file: null })}
      />

      {/* Folder Picker — Move / Copy for vault files */}
      <FolderPickerDialog
        open={folderPicker.open}
        title={folderPicker.mode === 'move' ? 'Move to...' : 'Copy to...'}
        confirmLabel={folderPicker.mode === 'move' ? 'Move Here' : 'Copy Here'}
        mode={folderPicker.mode}
        rootPath={vaultRoot}
        homeLabel={vault?.name || 'Vault'}
        excludePaths={folderPicker.files.map(f => f._encryptedPath || f.path)}
        sourceParentPaths={folderPicker.files.map(f => {
          const srcPath = f._encryptedPath || f.path;
          const parts = srcPath.split('/').filter(Boolean);
          parts.pop();
          return parts.length === 0 ? vaultRoot : '/' + parts.join('/');
        })}
        onConfirm={async (dest, duplicate) => {
          setFolderPicker(p => ({ ...p, open: false }));
          const { mode, files: pickerFiles } = folderPicker;
          for (const file of pickerFiles) {
            const srcPath = file.isVaultFile && file._encryptedPath ? file._encryptedPath : file.path;
            const baseName = file.isVaultFile && file._encryptedPath ? file._encryptedPath.split('/').pop()! : file.name;
            let destName = baseName;
            if (duplicate) {
              const dotIdx = file.isFolder ? -1 : baseName.lastIndexOf('.');
              if (dotIdx > 0) {
                destName = baseName.slice(0, dotIdx) + ' copy' + baseName.slice(dotIdx);
              } else {
                destName = baseName + ' copy';
              }
            }
            try {
              if (mode === 'move') await moveItem(srcPath, joinPath(dest, destName));
              else await copyItem(srcPath, joinPath(dest, destName));
              // Disabled on request:
              // await refreshIntegrityManifest(mode);
              toast.success(`${mode === 'move' ? 'Moved' : 'Copied'} "${file.name}"${duplicate ? ' (duplicate)' : ''}`);
            } catch { toast.error(`${mode === 'move' ? 'Move' : 'Copy'} failed`); }
          }
          if (showFavorites) loadFavorites(); else loadFolder(currentPath);
        }}
        onCancel={() => setFolderPicker(p => ({ ...p, open: false }))}
      />
    </div>
  );
}
