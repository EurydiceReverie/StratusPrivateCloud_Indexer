import { useState, useCallback, useEffect, useRef, DragEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/use-theme";
import { useDissolveEffect } from "@/hooks/use-dissolve-effect";
import { AppAccessFooterButton } from '@/context/AppAccessContext';
import { useAuth } from "@/context/AuthContext";
import Header from "@/components/Header";
import BreadcrumbNav from "@/components/BreadcrumbNav";
import StorageIndicator from "@/components/StorageIndicator";
import FileGrid from "@/components/FileGrid";
import { LoadingLine } from "@/components/ui/LoadingLine";
import { Footer } from "@/components/Footer";
import { RubberBandSelect } from '@/components/RubberBandSelect';

import { RenameDialog } from '@/components/dialogs/RenameDialog';
import { DeleteConfirmDialog } from '@/components/dialogs/DeleteConfirmDialog';
import { CreateFolderDialog } from '@/components/dialogs/CreateFolderDialog';
import { NewFileDialog } from '@/components/dialogs/NewFileDialog';
import { FileInfoDialog } from '@/components/dialogs/FileInfoDialog';
import { ShareDialog } from '@/components/dialogs/ShareDialog';
import { VaultDialog } from '@/components/dialogs/VaultDialog';
import { DownloadProgressDialog } from '@/components/dialogs/DownloadProgressDialog';
import { FileConflictDialog } from '@/components/dialogs/FileConflictDialog';
import { FilePreviewDialog } from '@/components/preview/FilePreviewDialog';
import { FolderPickerDialog } from '@/components/dialogs/FolderPickerDialog';

import {
  listFolder, createFolder, deleteItem, renameItem,
  moveItem, copyItem, DBXFile, searchFiles, getFileMetadata,
  loadFavoritesFromDropbox, saveFavoritesToDropbox, loadVaultsFromDropbox,
} from '@/services/dropbox-service';
import { uploadFile, uploadEncryptedFile } from '@/services/uploadService';
import { downloadSingleFile, downloadFilesIndividually, downloadFolder, BulkDownloadProgress } from '@/services/downloadService';
import { getActiveVaultId, getVaultPassword, getVaultMasterKey, hasVaultAccess, listVaults, setVaultCache } from '@/lib/vault-manager';
import { toast } from 'sonner';
import { Upload, Trash2, XCircle, Loader2 } from 'lucide-react';
import {
  createTransfer, updateTransfer, completeTransfer, failTransfer,
  hasBlockingOperation,
} from '@/lib/transfer-manager';
import { loadLinks, revokeLink as revokeShareLink, deleteLink as deleteShareLink, getShareUrl, isLinkActive, isLinkExpired, formatExpiry, ShareLink } from '@/lib/links-manager';
import { logActivity } from '@/lib/activity-logger';
import { getAppHomePath, getStatusRoutePath, getVaultRoutePath, isLiteRoutePath } from '@/lib/app-mode';

// ─── path helpers ─────────────────────────────────────────────────────────────
function joinPath(base: string, name: string): string {
  return base === '' || base === '/' ? `/${name}` : `${base}/${name}`;
}

function parentPath(path: string): string {
  const parts = path.split('/').filter(Boolean);
  parts.pop();
  return parts.length === 0 ? '' : '/' + parts.join('/');
}

// ─── sort helper ─────────────────────────────────────────────────────────────
type SortField = 'name' | 'date' | 'size' | 'ext';
type SortOrder = 'asc' | 'desc';
type FilterMode = 'all' | 'files' | 'folders';

function getExt(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function sortFiles(files: DBXFile[], field: SortField, order: SortOrder): DBXFile[] {
  return [...files].sort((a, b) => {
    if (field !== 'ext' && a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
    let cmp = 0;
    if (field === 'name') cmp = a.name.localeCompare(b.name);
    else if (field === 'date') cmp = (a.modifiedAt || '').localeCompare(b.modifiedAt || '');
    else if (field === 'size') cmp = (a.size || 0) - (b.size || 0);
    else if (field === 'ext') cmp = getExt(a.name).localeCompare(getExt(b.name)) || a.name.localeCompare(b.name);
    return order === 'asc' ? cmp : -cmp;
  });
}

// ─── main component ──────────────────────────────────────────────────────────
export default function Index() {
  const { isDark, toggle } = useTheme();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const homePath = getAppHomePath(pathname);
  const statusPath = getStatusRoutePath(pathname);
  const vaultPath = getVaultRoutePath(pathname);
  const liteMode = isLiteRoutePath(pathname);
  const { isAuthenticated, error } = useAuth();
  const dissolve = useDissolveEffect();

  // Navigation — single atomic state to prevent split-render double loads
  const [navState, setNavState] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const urlPath = params.get('path');
    const path = urlPath ? decodeURIComponent(urlPath) : '';
    if (!path) return { currentPath: '', pathStack: [''] };
    const segments = path.split('/').filter(Boolean);
    const stack: string[] = [''];
    segments.forEach((_, i) => { stack.push('/' + segments.slice(0, i + 1).join('/')); });
    return { currentPath: path, pathStack: stack };
  });
  const currentPath = navState.currentPath;
  const pathStack = navState.pathStack;

  // Files
  const [files, setFiles] = useState<DBXFile[]>([]);
  const [vaultFilterReady, setVaultFilterReady] = useState(false);
  const [loading, setLoading] = useState(false);

  // Navigation animations
  const [navKey, setNavKey] = useState(0);
  const [navAnimClass, setNavAnimClass] = useState('animate-nav-in');

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [dissolvingItems, setDissolvingItems] = useState<Set<string>>(new Set());

  // Drag item between folders
  const [draggedItem, setDraggedItem] = useState<DBXFile | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);

  // View / sort / search
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [sortOpen, setSortOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DBXFile[] | null>(null);
  const [showFavorites, setShowFavorites] = useState(false);
  const [favoriteFiles, setFavoriteFiles] = useState<DBXFile[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [favSortOrder, setFavSortOrder] = useState<'name' | 'recent'>('recent');

  // Vault
  const [activeVaultId, setActiveVaultId] = useState<string | null>(null);
  const [isVaultMode, setIsVaultMode] = useState(false);

  // File drag-drop upload overlay
  const [fileDragOver, setFileDragOver] = useState(false);
  const dragCounter = useRef(0);

  // item refs for dissolve animation
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Dialog states
  const [renameDialog, setRenameDialog] = useState<{ open: boolean; file: DBXFile | null }>({ open: false, file: null });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; files: DBXFile[] }>({ open: false, files: [] });
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [infoDialog, setInfoDialog] = useState<{ open: boolean; file: DBXFile | null }>({ open: false, file: null });
  const [shareDialog, setShareDialog] = useState<{ open: boolean; file: DBXFile | null }>({ open: false, file: null });
  const [vaultDialogOpen, setVaultDialogOpen] = useState(false);
  const [previewDialog, setPreviewDialog] = useState<{ open: boolean; file: DBXFile | null }>({ open: false, file: null });
  const [conflictDialog, setConflictDialog] = useState<{
    open: boolean; fileName: string;
    resolve: ((r: string) => void) | null;
  }>({ open: false, fileName: '', resolve: null });
  const [bulkDownloadProgress, setBulkDownloadProgress] = useState<BulkDownloadProgress | null>(null);

  // Move/copy folder picker dialog
  const [folderPicker, setFolderPicker] = useState<{
    open: boolean; mode: 'move' | 'copy'; files: DBXFile[];
  }>({ open: false, mode: 'move', files: [] });

  // Shortcuts modal
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [linksOpen, setLinksOpen] = useState(false);
  const [allLinks, setAllLinks] = useState<ShareLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);

  // ── Auto-refresh links every 15s when panel is open ───────────────────────
  useEffect(() => {
    if (!linksOpen) return;
    const refresh = async () => {
      try { setAllLinks(await loadLinks()); } catch {}
    };
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, [linksOpen]);

  // ── load folder ────────────────────────────────────────────────────────────
  const abortRef = useRef<AbortController | null>(null);
  const isAuthRef = useRef(false);
  isAuthRef.current = isAuthenticated;

  const loadFolder = useCallback(async (path: string) => {
    if (!isAuthRef.current) return;
    // Abort previous in-flight load — prevents stale results flashing old folder
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setFiles([]); // always clear immediately so old folder content never flashes
    setSearchResults(null);
    setSelectedIds(new Set());
    setSelectionMode(false);
    try {
      const items = await listFolder(path, ctrl.signal);
      if (!ctrl.signal.aborted) {
        setFiles(items);
        setLoading(false);
      }
    } catch (e: unknown) {
      if (!ctrl.signal.aborted) {
        toast.error(e instanceof Error ? e.message : 'Failed to load folder');
        setLoading(false);
      }
    }
  }, []); // no deps — uses refs for fresh values, never recreated

  // Fire on auth OR path change — loadFolder never changes so no triple-fire
  useEffect(() => {
    if (isAuthenticated && vaultFilterReady) loadFolder(currentPath);
    else {
      setFiles([]);
      if (abortRef.current) abortRef.current.abort();
    }
  }, [isAuthenticated, currentPath, vaultFilterReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── search ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim() || !isAuthenticated) { setSearchResults(null); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await searchFiles(searchQuery, currentPath);
        setSearchResults(results);
        logActivity('search', { name: searchQuery, path: currentPath || '/', success: true });
      } catch { setSearchResults([]); }
      finally { setLoading(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery, currentPath, isAuthenticated]);

  // ── vault ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = getActiveVaultId();
    setActiveVaultId(id);
    setIsVaultMode(!!id && !!(id && hasVaultAccess(id)));
  }, []);

  // Load vault registry into cache so protected vault folders are hidden in normal view.
  // No artificial delay — the global dbxFetch queue (max 2 concurrent) handles rate limiting.
  useEffect(() => {
    if (!isAuthenticated) {
      setVaultFilterReady(false);
      return;
    }

    setVaultFilterReady(false);
    loadVaultsFromDropbox()
      .then((loaded) => {
        setVaultCache(loaded);
      })
      .catch(() => {})
      .finally(() => {
        setVaultFilterReady(true);
      });
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── load favourites from Dropbox (IDs + metadata) ─────────────────────────
  const loadFavorites = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch IDs from /.stratus/favorites.json on Dropbox
      const ids = await loadFavoritesFromDropbox();
      setFavoriteIds(new Set(ids));
      if (ids.length === 0) { setFavoriteFiles([]); setLoading(false); return; }
      // 2. Fetch metadata in batches of 2 — prevents 429 when user has many favorites
      const results: PromiseSettledResult<DBXFile>[] = [];
      for (let i = 0; i < ids.length; i += 2) {
        const batch = await Promise.allSettled(ids.slice(i, i + 2).map(id => getFileMetadata(id)));
        results.push(...batch);
      }
      const fetched: DBXFile[] = results
        .filter((r): r is PromiseFulfilledResult<DBXFile> => r.status === 'fulfilled' && !!r.value)
        .map(r => r.value);
      // 3. Remove stale IDs (file deleted on Dropbox)
      const validIds = new Set(fetched.map(f => f.id));
      const cleanIds = ids.filter(id => validIds.has(id));
      if (cleanIds.length !== ids.length) {
        setFavoriteIds(new Set(cleanIds));
        await saveFavoritesToDropbox(cleanIds);
      }
      setFavoriteFiles(fetched);
    } catch { setFavoriteFiles([]); }
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // On mount: load star icons — queued via global dbxFetch limiter (no artificial delay)
  useEffect(() => {
    if (!isAuthenticated) return;
    loadFavoritesFromDropbox().then(ids => setFavoriteIds(new Set(ids))).catch(() => {});
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── derived display list ───────────────────────────────────────────────────
  const displayFiles = (() => {
    if (showFavorites) {
      if (favSortOrder === 'name') return sortFiles(favoriteFiles, 'name', 'asc');
      // 'recent' — keep order as returned from Dropbox (most recently starred = last added)
      return [...favoriteFiles].reverse();
    }
    const list = searchResults ?? files;
    const filtered = filterMode === 'files' ? list.filter(f => !f.isFolder)
      : filterMode === 'folders' ? list.filter(f => f.isFolder)
      : list;
    return sortFiles(filtered, sortField, sortOrder);
  })();

  // ── navigation ─────────────────────────────────────────────────────────────
  const navigateTo = (path: string) => {
    if (path === currentPath) return;
    setNavAnimClass('animate-nav-in');
    setNavKey(k => k + 1);
    setSelectedIds(new Set());
    setSelectionMode(false);
    setFiles([]);
    setLoading(true);
    setNavState(prev => ({ currentPath: path, pathStack: [...prev.pathStack, path] }));
  };

  const navigateToIndex = (idx: number) => {
    const path = pathStack[idx] ?? '';
    if (path === currentPath) return;
    setNavAnimClass('animate-nav-in');
    setNavKey(k => k + 1);
    setSelectedIds(new Set());
    setSelectionMode(false);
    setFiles([]);
    setLoading(true);
    setNavState(prev => ({ currentPath: path, pathStack: prev.pathStack.slice(0, idx + 1) }));
  };

  // ── URL sync ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const url = currentPath ? `${homePath}?path=${encodeURIComponent(currentPath)}` : homePath;
    window.history.replaceState({}, '', url);
  }, [currentPath, homePath]);

  const breadcrumbPath = pathStack.map(p => p === '' ? 'Home' : p.split('/').filter(Boolean).pop() || 'Home');

  // ── selection ──────────────────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    if (!selectionMode) setSelectionMode(true);
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const selectAll = () => { setSelectionMode(true); setSelectedIds(new Set(displayFiles.map(f => f.id))); };
  const clearSelection = () => { setSelectedIds(new Set()); setSelectionMode(false); };

  // ── blocking op guard ──────────────────────────────────────────────────────
  const checkBlocking = (): boolean => {
    if (hasBlockingOperation()) {
      toast.warning('⏳ Please wait — another operation is in progress');
      return true;
    }
    return false;
  };

  // ── dissolve delete ────────────────────────────────────────────────────────
  const handleDissolveDelete = useCallback(async (toDelete: DBXFile[]) => {
    if (toDelete.length === 0) return;
    // Create a transfer entry for the delete operation
    const label = toDelete.length === 1 ? toDelete[0].name : `${toDelete.length} items`;
    const tid = createTransfer({ type: 'delete', name: label }).id;
    updateTransfer(tid, { status: 'active', progress: 0 });

    setDissolvingItems(new Set(toDelete.map(f => f.id)));

    if (liteMode) {
      await new Promise((resolve) => window.setTimeout(resolve, 220));
    } else {
      const elements: HTMLElement[] = toDelete.map(f => itemRefs.current.get(f.id)!).filter(Boolean);
      await dissolve(elements);
    }

    let failed = 0;
    for (let i = 0; i < toDelete.length; i++) {
      const file = toDelete[i];
      try {
        await deleteItem(file.path);
        // Remove from favourites on Dropbox if it was starred
        setFavoriteIds(prev => {
          if (!prev.has(file.id)) return prev;
          const next = new Set(prev);
          next.delete(file.id);
          saveFavoritesToDropbox(Array.from(next)).catch(() => {});
          return next;
        });
      } catch { failed++; }
      updateTransfer(tid, { progress: Math.round(((i + 1) / toDelete.length) * 100) });
    }

    setDissolvingItems(new Set());
    setFiles(prev => prev.filter(f => !toDelete.find(d => d.id === f.id)));
    clearSelection();

    if (failed === 0) {
      completeTransfer(tid);
      toast.success(`Deleted ${toDelete.length} item${toDelete.length > 1 ? 's' : ''}`);
      toDelete.forEach(f => logActivity('delete', { path: f.path, name: f.name, success: true }));
    } else {
      failTransfer(tid, `${failed} item${failed > 1 ? 's' : ''} failed to delete`);
      toast.error(`Deleted ${toDelete.length - failed}, failed ${failed}`);
      toDelete.forEach(f => logActivity('delete', { path: f.path, name: f.name, success: false, error: 'Delete failed' }));
    }
    if (showFavorites) loadFavorites(); else loadFolder(currentPath);
  }, [dissolve, showFavorites]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── keyboard focus tracking for arrow-key navigation ──────────────────────
  const [focusedIdx, setFocusedIdx] = useState<number>(-1);

  // ── keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable;
      if (isEditing) return;

      // ── Ctrl/Cmd+A — select all ──
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') { e.preventDefault(); selectAll(); return; }

      // ── Ctrl/Cmd+K — open search ──
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); window.dispatchEvent(new CustomEvent('open-search')); return; }

      // ── Ctrl+Shift+F — toggle favourites ──
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        const next = !showFavorites;
        setShowFavorites(next);
        if (next) loadFavorites();
        return;
      }

      // ── Ctrl/Cmd+V — paste from clipboard to upload ──
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault();
        navigator.clipboard.read().then(items => {
          const fileItems: File[] = [];
          const promises = items.map(async item => {
            for (const type of item.types) {
              if (type.startsWith('image/')) {
                const blob = await item.getType(type);
                const ext = type.split('/')[1] || 'png';
                fileItems.push(new File([blob], `pasted-image-${Date.now()}.${ext}`, { type }));
              }
            }
          });
          Promise.all(promises).then(() => {
            if (fileItems.length > 0) {
              const dt = new DataTransfer();
              fileItems.forEach(f => dt.items.add(f));
              handleUpload(dt.files);
            }
          });
        }).catch(() => {});
        return;
      }

      // ── Delete / Backspace — delete selected (Backspace w/o selection = navigate up) ──
      if (e.key === 'Delete' && selectionMode && selectedIds.size > 0) {
        e.preventDefault();
        const toDelete = displayFiles.filter(f => selectedIds.has(f.id));
        setDeleteDialog({ open: true, files: toDelete });
        return;
      }
      if (e.key === 'Backspace' && !selectionMode && currentPath !== '') {
        e.preventDefault();
        navigateToIndex(pathStack.length - 2);
        return;
      }
      if (e.key === 'Backspace' && selectionMode && selectedIds.size > 0) {
        e.preventDefault();
        const toDelete = displayFiles.filter(f => selectedIds.has(f.id));
        setDeleteDialog({ open: true, files: toDelete });
        return;
      }

      // ── Escape — clear selection ──
      if (e.key === 'Escape') { clearSelection(); setFocusedIdx(-1); return; }

      // ── Space — preview focused/single-selected file ──
      if (e.key === ' ') {
        e.preventDefault();
        const idx = focusedIdx >= 0 ? focusedIdx : (selectedIds.size === 1 ? displayFiles.findIndex(f => selectedIds.has(f.id)) : -1);
        if (idx >= 0 && idx < displayFiles.length) {
          const file = displayFiles[idx];
          if (!file.isFolder) setPreviewDialog({ open: true, file });
          else handleOpen(file);
        }
        return;
      }

      // ── Arrow key navigation ──
      if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        const total = displayFiles.length;
        if (total === 0) return;
        const cols = viewMode === 'grid' ? (window.innerWidth >= 1024 ? 6 : window.innerWidth >= 768 ? 5 : window.innerWidth >= 640 ? 4 : 3) : 1;
        let next = focusedIdx;
        if (next < 0) next = 0;
        else if (e.key === 'ArrowRight') next = Math.min(next + 1, total - 1);
        else if (e.key === 'ArrowLeft') next = Math.max(next - 1, 0);
        else if (e.key === 'ArrowDown') next = Math.min(next + cols, total - 1);
        else if (e.key === 'ArrowUp') next = Math.max(next - cols, 0);
        setFocusedIdx(next);
        // Shift+Arrow extends selection
        if (e.shiftKey) {
          const file = displayFiles[next];
          if (file) { if (!selectionMode) setSelectionMode(true); toggleSelect(file.id); }
        } else {
          // Single focus (no shift) — just highlight, don't select
          clearSelection();
        }
        return;
      }

      // ── Enter — open focused item ──
      if (e.key === 'Enter') {
        e.preventDefault();
        if (focusedIdx >= 0 && focusedIdx < displayFiles.length) {
          handleOpen(displayFiles[focusedIdx]);
        }
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, displayFiles, selectionMode, focusedIdx, viewMode, currentPath, pathStack]);

  // ── file drag-drop upload (from desktop) ───────────────────────────────────
  const handleFileDragOver = useCallback((e: DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setFileDragOver(true); }
  }, []);
  const handleFileDragLeave = useCallback((e: DragEvent) => {
    if (e.currentTarget === e.target || !(e.currentTarget as Node).contains(e.relatedTarget as Node))
      setFileDragOver(false);
  }, []);
  const handleFileDrop = useCallback((e: DragEvent) => {
    e.preventDefault(); setFileDragOver(false);
    const files = e.dataTransfer.files;
    if (files?.length) handleUpload(files);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isVaultMode, activeVaultId, currentPath]);

  // ── upload ───────────────────────────────────────────────────────────────────
  const handleUpload = async (fileList: FileList) => {
    if (!isAuthenticated) { toast.error('Connect Dropbox first'); return; }
    // In favourites mode, always upload to Home (root) to avoid confusion
    const uploadPath = showFavorites ? '' : currentPath;
    if (showFavorites) toast.info('Uploading to Home folder');
    const filesArr = Array.from(fileList);
    for (const file of filesArr) {
      const destPath = joinPath(uploadPath, file.name);
      const toastId = toast.loading(
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium truncate max-w-[200px]">{file.name}</span>
          <span className="text-xs text-muted-foreground">Uploading...</span>
        </div>,
        { duration: Infinity }
      );

      if (isVaultMode && activeVaultId) {
        const access = getVaultMasterKey(activeVaultId) ?? getVaultPassword(activeVaultId);
        if (access) {
          await uploadEncryptedFile(file, destPath, access, activeVaultId, {
            onProgress: (pct, phase) => {
              toast.loading(
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium truncate max-w-[200px]">{file.name}</span>
                  <span className="text-xs">{phase === 'encrypting' ? '🔐 Encrypting' : '☁️ Uploading'} {pct}%</span>
                </div>,
                { id: toastId, duration: Infinity }
              );
            },
            onDone: () => {
              toast.success(`Uploaded: ${file.name}`, { id: toastId });
              logActivity('upload', { path: destPath, name: file.name + '.vault', size: file.size, success: true });
              loadFolder(uploadPath);
            },
            onError: msg => {
              toast.error(`Failed: ${msg}`, { id: toastId });
              logActivity('upload', { path: destPath, name: file.name + '.vault', size: file.size, success: false, error: msg });
            },
          });
          continue;
        }
      }

      await uploadFile(file, destPath, {
        onProgress: (pct, speed, eta) => {
          toast.loading(
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium truncate max-w-[200px]">{file.name}</span>
              <span className="text-xs text-muted-foreground">{pct}%{speed > 0 ? ` · ${(speed / 1024).toFixed(0)} KB/s` : ''}{eta > 0 ? ` · ${Math.ceil(eta)}s` : ''}</span>
            </div>,
            { id: toastId, duration: Infinity }
          );
        },
        onDone: () => {
          toast.success(`Uploaded: ${file.name}`, { id: toastId });
          logActivity('upload', { path: destPath, name: file.name, size: file.size, success: true });
          loadFolder(uploadPath);
        },
        onError: msg => {
          toast.error(`Failed: ${msg}`, { id: toastId });
          logActivity('upload', { path: destPath, name: file.name, size: file.size, success: false, error: msg });
        },
      });
    }
  };

  // ── create folder ────────────────────────────────────────────────────────────
  const handleCreateFolder = async (name: string) => {
    setCreateFolderOpen(false);
    const path = joinPath(currentPath, name);
    try {
      await createFolder(path);
      toast.success(`Folder "${name}" created`);
      logActivity('create_folder', { path, name, success: true });
      loadFolder(currentPath);
    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : 'Failed to create folder';
      toast.error(error);
      logActivity('create_folder', { path, name, success: false, error });
    }
  };

  // ── rename ────────────────────────────────────────────────────────────────────
  const handleRename = async (newName: string) => {
    if (!renameDialog.file) return;
    setRenameDialog({ open: false, file: null });
    const file = renameDialog.file;
    const newPath = joinPath(parentPath(file.path), newName);
    try {
      await renameItem(file.path, newPath);
      toast.success(`Renamed to "${newName}"`);
      logActivity('rename', { fromPath: file.path, toPath: newPath, name: newName, success: true });
      if (showFavorites) loadFavorites(); else loadFolder(currentPath);
    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : 'Failed to rename';
      toast.error(error);
      logActivity('rename', { fromPath: file.path, toPath: newPath, name: newName, success: false, error });
    }
  };

  // ── delete ────────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (checkBlocking()) { setDeleteDialog({ open: false, files: [] }); return; }
    const toDelete = deleteDialog.files;
    setDeleteDialog({ open: false, files: [] });
    await handleDissolveDelete(toDelete);
  };

  // ── move between folders (drag in grid) ──────────────────────────────────────
  const handleFolderDrop = async (dragged: DBXFile, targetFolder: DBXFile) => {
    if (!targetFolder.isFolder || dragged.id === targetFolder.id) return;
    if (checkBlocking()) return;
    const newPath = joinPath(targetFolder.path, dragged.name);
    const tid = createTransfer({ type: 'move', name: dragged.name }).id;
    updateTransfer(tid, { status: 'active', progress: 50 });
    try {
      await moveItem(dragged.path, newPath);
      completeTransfer(tid);
      toast.success(`Moved "${dragged.name}" to "${targetFolder.name}"`);
      logActivity('move', { fromPath: dragged.path, toPath: newPath, name: dragged.name, success: true });
      if (showFavorites) loadFavorites(); else loadFolder(currentPath);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Move failed';
      failTransfer(tid, msg, () => handleFolderDrop(dragged, targetFolder));
      toast.error(msg);
      logActivity('move', { fromPath: dragged.path, toPath: newPath, name: dragged.name, success: false, error: msg });
    }
  };

  // ── move/copy selected ────────────────────────────────────────────────────────
  const promptMoveOrCopy = (mode: 'move' | 'copy', singleFile?: DBXFile) => {
    if (checkBlocking()) return;
    const targets = singleFile ? [singleFile] : displayFiles.filter(f => selectedIds.has(f.id));
    if (targets.length === 0) return;
    setFolderPicker({ open: true, mode, files: targets });
  };

  const executeMoveOrCopy = async (mode: 'move' | 'copy', targets: DBXFile[], dest: string, duplicate?: boolean) => {
    setFolderPicker(p => ({ ...p, open: false }));
    const label = targets.length === 1 ? targets[0].name : `${targets.length} items`;
    const tid = createTransfer({ type: mode, name: label }).id;
    updateTransfer(tid, { status: 'active', progress: 0 });
    let ok = 0; let fail = 0;
    for (let i = 0; i < targets.length; i++) {
      const f = targets[i];
      try {
        let destName = f.name;
        if (duplicate) {
          // Generate a "copy" name: insert " copy" before the extension (or at end for folders)
          const dotIdx = f.isFolder ? -1 : destName.lastIndexOf('.');
          if (dotIdx > 0) {
            destName = destName.slice(0, dotIdx) + ' copy' + destName.slice(dotIdx);
          } else {
            destName = destName + ' copy';
          }
        }
        const newPath = joinPath(dest, destName);
        if (mode === 'move') await moveItem(f.path, newPath);
        else await copyItem(f.path, newPath);
        ok++;
      } catch { fail++; }
      updateTransfer(tid, { progress: Math.round(((i + 1) / targets.length) * 100) });
    }
    targets.forEach(f => {
      const newPath = joinPath(dest, f.name);
      logActivity(mode, { fromPath: f.path, toPath: newPath, name: f.name, success: fail === 0 });
    });
    if (fail === 0) {
      completeTransfer(tid);
      toast.success(`${mode === 'move' ? '📁 Moved' : '📋 Copied'} ${ok} item${ok > 1 ? 's' : ''}${duplicate ? ' (duplicate)' : ''}`);
    } else {
      failTransfer(tid, `${fail} item(s) failed`, () => executeMoveOrCopy(mode, targets, dest, duplicate));
      if (ok > 0) toast.warning(`${mode === 'move' ? 'Moved' : 'Copied'} ${ok}, failed ${fail}`);
      else toast.error(`${mode === 'move' ? 'Move' : 'Copy'} failed for all ${fail} item(s)`);
    }
    clearSelection();
    if (showFavorites) loadFavorites(); else loadFolder(currentPath);
  };

  // ── download ──────────────────────────────────────────────────────────────────
  const handleDownloadFile = async (file: DBXFile) => {
    if (file.isFolder) {
      const toastId = toast.loading(`Zipping "${file.name}"...`, { duration: Infinity });
      try {
        await downloadFolder(file.path, file.name, p => {
          toast.loading(`Zipping "${file.name}"... ${p}%`, { id: toastId, duration: Infinity });
        });
        toast.success(`Downloaded "${file.name}.zip"`, { id: toastId });
        logActivity('folder_download', { path: file.path, name: file.name, success: true });
      } catch (e) {
        toast.error('Folder download failed', { id: toastId });
        logActivity('folder_download', { path: file.path, name: file.name, success: false, error: e instanceof Error ? e.message : 'Failed' });
      }
      return;
    }
    const toastId = toast.loading(`Downloading ${file.name}...`, { duration: Infinity });
    try {
      await downloadSingleFile(file.path, file.name, p => {
        toast.loading(`Downloading ${file.name}... ${p}%`, { id: toastId, duration: Infinity });
      });
      toast.success(`Downloaded: ${file.name}`, { id: toastId });
      logActivity('download', { path: file.path, name: file.name, size: file.size, success: true });
    } catch (e) {
      toast.error('Download failed', { id: toastId });
      logActivity('download', { path: file.path, name: file.name, success: false, error: e instanceof Error ? e.message : 'Failed' });
    }
  };

  const handleBulkDownload = async () => {
    const selected = displayFiles.filter(f => selectedIds.has(f.id));
    if (selected.length === 0) { toast.error('Select files to download'); return; }

    // Single folder → use Dropbox native download_zip
    if (selected.length === 1 && selected[0].isFolder) {
      const folder = selected[0];
      setBulkDownloadProgress({ currentFile: folder.name, currentIndex: 1, totalFiles: 1, percent: 10 });
      try {
        await downloadFolder(folder.path, folder.name, p =>
          setBulkDownloadProgress({ currentFile: folder.name, currentIndex: 1, totalFiles: 1, percent: p })
        );
        toast.success(`Downloaded "${folder.name}.zip"`);
      } catch { toast.error('Folder download failed'); }
      setBulkDownloadProgress(null);
      clearSelection();
      return;
    }

    // Multiple files → download individually (Dropbox has no arbitrary multi-file ZIP API)
    setBulkDownloadProgress({ currentFile: '', currentIndex: 0, totalFiles: selected.length, percent: 0 });
    await downloadFilesIndividually(
      selected.map(f => ({ path: f.path, name: f.name, isFolder: f.isFolder })),
      p => setBulkDownloadProgress(p)
    );
    setBulkDownloadProgress(null);
    clearSelection();
    toast.success(`Downloaded ${selected.length} item${selected.length > 1 ? 's' : ''}`);
  };

  // ── vault unlocked callback ────────────────────────────────────────────────
  const handleVaultUnlocked = (vaultId: string) => {
    setActiveVaultId(vaultId);
    setIsVaultMode(true);
    toast.success('Vault mode active — uploads will be encrypted');
    navigate(vaultPath, { replace: true });
  };

  // ── open file / folder ─────────────────────────────────────────────────────
  const handleOpen = (file: DBXFile) => {
    if (file.isFolder) {
      // When opening a folder from favourites, turn off favourites mode and navigate
      if (showFavorites) setShowFavorites(false);
      navigateTo(file.path);
      return;
    }
    setPreviewDialog({ open: true, file });
  };

  const selectedFileObjects = displayFiles.filter(f => selectedIds.has(f.id));

  return (
    <div
      className="min-h-screen bg-transparent transition-colors duration-500 relative flex flex-col select-none"
      onDragOver={handleFileDragOver as unknown as React.DragEventHandler<HTMLDivElement>}
      onDragLeave={handleFileDragLeave as unknown as React.DragEventHandler<HTMLDivElement>}
      onDrop={handleFileDrop as unknown as React.DragEventHandler<HTMLDivElement>}
    >
      <LoadingLine visible={loading} />

      {/* File drag-drop overlay */}
      {fileDragOver && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/60 backdrop-blur-xl animate-fade-in">
          <div className="flex flex-col items-center gap-4 p-12 rounded-3xl border-2 border-dashed border-primary/50 bg-primary/5">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <Upload className="w-10 h-10 text-primary" />
            </div>
            <p className="text-lg font-bold text-foreground">Drop files here to upload</p>
            <p className="text-sm text-muted-foreground font-medium">They'll be added to the current folder</p>
          </div>
        </div>
      )}

      {/* Auth error display */}
      {error && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-card border border-border rounded-2xl px-6 py-3 flex items-center gap-3 max-w-sm">
          <span className="text-sm text-destructive font-medium">{error}</span>
        </div>
      )}

      <Header
        onToggleTheme={toggle}
        isDark={isDark}
        viewMode={viewMode}
        onViewModeChange={(mode) => { setViewMode(mode); }}
        onUploadFile={handleUpload}
        onNewFolder={() => setCreateFolderOpen(true)}
        onNewFile={() => setNewFileOpen(true)}
        onVaultOpen={() => setVaultDialogOpen(true)}
        onFavoritesToggle={() => {
          const next = !showFavorites;
          setShowFavorites(next);
          if (next) loadFavorites();
        }}
        onStatusOpen={() => navigate(statusPath)}
        showFavorites={showFavorites}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        isVaultMode={isVaultMode}
        currentVaultName={activeVaultId ? (listVaults().find(v => v.id === activeVaultId)?.name) : undefined}
        onGoHome={() => navigateToIndex(0)}
        onLinksOpen={async () => {
          setLinksOpen(true);
          setLinksLoading(true);
          try { setAllLinks(await loadLinks()); } catch {}
          setLinksLoading(false);
        }}
        activeLinksCount={allLinks.filter(isLinkActive).length}
        vaultSortField={sortField}
        vaultSortOrder={sortOrder}
        vaultFilterMode={filterMode}
        onVaultSortChange={(f, o) => { setSortField(f); setSortOrder(o); }}
        onVaultFilterChange={setFilterMode}
      />

      <main className="relative z-10 flex-1 max-w-6xl w-full mx-auto px-4 pt-26 pb-6 space-y-4">
        <RubberBandSelect
          itemRefs={itemRefs}
          onSelect={(ids) => {
            if (ids.size > 0) {
              setSelectionMode(true);
              setSelectedIds(ids);
            }
          }}
          onClearSelection={clearSelection}
          disabled={loading}
        />
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <BreadcrumbNav
              path={breadcrumbPath}
              pathStack={pathStack}
              onNavigate={navigateToIndex}
              onDropToPath={showFavorites ? undefined : async (destPath, destLabel) => {
                if (checkBlocking()) return;
                const targets = displayFiles.filter(f => selectedIds.has(f.id));
                const toMove = targets.length > 0 ? targets : (draggedItem ? [draggedItem] : []);
                if (toMove.length === 0) return;
                const label = toMove.length === 1 ? toMove[0].name : `${toMove.length} items`;
                const tid = createTransfer({ type: 'move', name: label }).id;
                updateTransfer(tid, { status: 'active', progress: 0 });
                let ok = 0;
                for (let i = 0; i < toMove.length; i++) {
                  const f = toMove[i];
                  try { await moveItem(f.path, joinPath(destPath, f.name)); ok++; } catch {}
                  updateTransfer(tid, { progress: Math.round(((i + 1) / toMove.length) * 100) });
                }
                if (ok === toMove.length) completeTransfer(tid);
                else failTransfer(tid, `${toMove.length - ok} failed`);
                if (ok > 0) toast.success(`Moved ${ok} item${ok > 1 ? 's' : ''} to "${destLabel}"`);
                setDraggedItem(null);
                clearSelection();
                if (showFavorites) loadFavorites(); else loadFolder(currentPath);
              }}
            />
          </div>
          {/* Sort & Filter controls — right of breadcrumb (normal view only, not vault mode) */}
          {!showFavorites && !isVaultMode && (
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Filter: All / Files / Folders */}
              <div className="bg-card border border-border flex items-center rounded-xl overflow-hidden text-xs font-semibold">
                {(['all', 'files', 'folders'] as FilterMode[]).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setFilterMode(mode)}
                    className={`px-2.5 py-1.5 capitalize transition-all ${filterMode === mode ? 'bg-primary/20 text-primary' : 'text-foreground/60 hover:text-foreground'}`}
                  >
                    {mode === 'all' ? 'All' : mode === 'files' ? 'Files' : 'Folders'}
                  </button>
                ))}
              </div>
              {/* Sort dropdown — custom styled */}
              {(() => {
                const sortOptions: { value: string; label: string }[] = [
                  { value: 'name:asc',  label: 'A → Z' },
                  { value: 'name:desc', label: 'Z → A' },
                  { value: 'date:desc', label: 'Newest First' },
                  { value: 'date:asc',  label: 'Oldest First' },
                  { value: 'size:desc', label: 'Large → Small' },
                  { value: 'size:asc',  label: 'Small → Large' },
                  { value: 'ext:asc',   label: 'By Extension' },
                ];
                const currentSort = `${sortField}:${sortOrder}`;
                const currentLabel = sortOptions.find(o => o.value === currentSort)?.label ?? 'Sort';
                return (
                  <div className="relative">
                    <button
                      onClick={() => setSortOpen(v => !v)}
                      className="bg-card border border-border rounded-xl flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 text-xs font-semibold text-foreground/80 hover:text-foreground transition-all"
                    >
                      <svg className="w-3 h-3 text-primary/70 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18M7 12h10M11 18h2"/>
                      </svg>
                      <span>{currentLabel}</span>
                      <svg className={`w-3 h-3 text-foreground/40 shrink-0 transition-transform ${sortOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 9l6 6 6-6"/>
                      </svg>
                    </button>
                    {sortOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} />
                        <div className="absolute right-0 top-full mt-1.5 z-50 bg-card border border-border rounded-xl overflow-hidden shadow-xl border border-white/10 min-w-[140px] py-1">
                          {sortOptions.map(opt => (
                            <button
                              key={opt.value}
                              onClick={() => {
                                const [f, o] = opt.value.split(':') as [SortField, SortOrder];
                                setSortField(f);
                                setSortOrder(o);
                                setSortOpen(false);
                              }}
                              className={`w-full text-left px-3 py-1.5 text-xs font-semibold transition-all hover:bg-primary/15 hover:text-primary
                                ${currentSort === opt.value ? 'text-primary bg-primary/10' : 'text-foreground/70'}`}
                            >
                              {currentSort === opt.value && <span className="mr-1.5">✓</span>}{opt.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
        <StorageIndicator />

        {/* Selection toolbar */}
        {selectionMode && (
          <div className="bg-card border border-border rounded-2xl px-4 py-3 flex items-center justify-between gap-3 animate-fade-in">
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={clearSelection} className="bg-secondary hover:bg-secondary/80 rounded-xl p-2 transition-all hover:scale-105 active:scale-95">
                <XCircle className="w-4 h-4 text-foreground/70" />
              </button>
              <span className="text-sm font-bold text-foreground">{selectedIds.size} selected</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => selectedIds.size === displayFiles.length ? clearSelection() : selectAll()}
                className="bg-secondary hover:bg-secondary/80 rounded-xl px-3 py-2 text-xs font-semibold text-foreground transition-all hover:scale-105 active:scale-95">
                {selectedIds.size === displayFiles.length ? 'Deselect All' : 'Select All'}
              </button>
              <button onClick={handleBulkDownload}
                disabled={selectedIds.size === 0}
                className="bg-secondary hover:bg-secondary/80 rounded-xl px-3 py-2 text-xs font-semibold text-foreground transition-all hover:scale-105 active:scale-95 disabled:opacity-40">
                Download
              </button>
              {!showFavorites && <>
              <button onClick={() => promptMoveOrCopy('move')}
                disabled={selectedIds.size === 0}
                className="bg-secondary hover:bg-secondary/80 rounded-xl px-3 py-2 text-xs font-semibold text-foreground transition-all hover:scale-105 active:scale-95 disabled:opacity-40">
                Move
              </button>
              <button onClick={() => promptMoveOrCopy('copy')}
                disabled={selectedIds.size === 0}
                className="bg-secondary hover:bg-secondary/80 rounded-xl px-3 py-2 text-xs font-semibold text-foreground transition-all hover:scale-105 active:scale-95 disabled:opacity-40">
                Copy
              </button>
              </>}
              <button
                onClick={() => setDeleteDialog({ open: true, files: selectedFileObjects })}
                disabled={selectedIds.size === 0}
                className="bg-secondary hover:bg-secondary/80 rounded-xl px-3 py-2 flex items-center gap-1.5 text-xs font-semibold text-red-500 transition-all hover:scale-105 active:scale-95 disabled:opacity-40">
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </div>
          </div>
        )}

        {/* Favourites banner */}
        {showFavorites && (
          <div className="bg-card border border-border rounded-2xl px-4 py-3 flex items-center justify-between gap-3 animate-fade-in">
            <div className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-primary"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              <span className="text-sm font-bold text-foreground">Starred Files</span>
              <span className="text-xs text-muted-foreground font-medium">· {favoriteFiles.length} item{favoriteFiles.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex items-center gap-2">
              {/* Sort toggle */}
              <div className="flex items-center gap-1 bg-secondary hover:bg-secondary/80 rounded-xl px-2 py-1">
                <button onClick={() => setFavSortOrder('recent')}
                  className={`text-xs px-2 py-0.5 rounded-lg transition-all font-medium ${favSortOrder === 'recent' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}>
                  Recent
                </button>
                <button onClick={() => setFavSortOrder('name')}
                  className={`text-xs px-2 py-0.5 rounded-lg transition-all font-medium ${favSortOrder === 'name' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}>
                  Name
                </button>
              </div>
              {/* Unstar all */}
              {favoriteFiles.length > 0 && (
                <button
                  onClick={async () => {
                    setFavoriteIds(new Set());
                    setFavoriteFiles([]);
                    await saveFavoritesToDropbox([]);
                  }}
                  className="bg-secondary hover:bg-secondary/80 rounded-xl px-3 py-1.5 text-xs font-semibold text-red-500 hover:text-red-600 transition-all"
                >
                  Unstar All
                </button>
              )}
            </div>
          </div>
        )}

        {/* Favourites empty state */}
        {showFavorites && !loading && favoriteFiles.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary/60"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">No starred files yet</p>
              <p className="text-xs text-muted-foreground mt-1">Right-click any file and choose Favourite to star it</p>
            </div>
          </div>
        )}

        {/* File grid — iOS-style slide animation on navigation */}
        <div key={`nav-${navKey}`} className={loading ? '' : navAnimClass}>
          {loading ? null : (
          <FileGrid
            key={viewMode}
            items={displayFiles}
            onFolderOpen={handleOpen}
            viewMode={viewMode}
            selected={selectedIds}
            selectMode={selectionMode}
            onToggleSelect={toggleSelect}
            dissolvingItems={dissolvingItems}
            onDragItem={f => setDraggedItem(f)}
            onDropOnFolder={async (folder) => {
              if (!draggedItem || draggedItem.id === folder.id) return;
              const targets = selectionMode && selectedIds.has(draggedItem.id)
                ? displayFiles.filter(f => selectedIds.has(f.id))
                : [draggedItem];
              for (const f of targets) {
                try { await moveItem(f.path, joinPath(folder.path, f.name)); } catch {}
              }
              toast.success(`Moved ${targets.length} item${targets.length > 1 ? 's' : ''} to "${folder.name}"`);
              setDraggedItem(null); clearSelection();
              if (showFavorites) loadFavorites(); else loadFolder(currentPath);
            }}
            dragOverFolder={dragOverFolder}
            onDragOverFolder={setDragOverFolder}
            itemRefs={itemRefs}
            onRename={file => setRenameDialog({ open: true, file })}
            onDelete={file => setDeleteDialog({ open: true, files: [file] })}
            onShare={file => setShareDialog({ open: true, file })}
            onInfo={file => setInfoDialog({ open: true, file })}
            onPreview={file => { setPreviewDialog({ open: true, file }); logActivity('preview', { path: file.path, name: file.name, success: true }); }}
            onDownload={handleDownloadFile}
            onCopy={file => promptMoveOrCopy('copy', file)}
            onMove={file => promptMoveOrCopy('move', file)}
            onFavoriteToggle={async (file) => {
              const previous = new Set(favoriteIds);
              const next = new Set(previous);
              const wasStarred = next.has(file.id);
              if (wasStarred) next.delete(file.id);
              else next.add(file.id);
              setFavoriteIds(next);
              try {
                await saveFavoritesToDropbox(Array.from(next));
                logActivity(wasStarred ? 'favorite_remove' : 'favorite_add', { path: file.path, name: file.name, success: true });
                if (showFavorites) loadFavorites();
              } catch (error) {
                setFavoriteIds(previous);
                toast.error(wasStarred ? 'Failed to remove favorite' : 'Failed to save favorite');
                logActivity(wasStarred ? 'favorite_remove' : 'favorite_add', {
                  path: file.path,
                  name: file.name,
                  success: false,
                  error: error instanceof Error ? error.message : 'Favorite sync failed',
                });
              }
            }}
            focusedIdx={focusedIdx}
            favoriteIds={favoriteIds}
            isVaultMode={isVaultMode}
            isFavoritesMode={showFavorites}
            highlightedId={highlightedId}
            onGoToFolder={file => {
              setShowFavorites(false);
              const parts = file.path.split('/').filter(Boolean).slice(0, -1);
              const folderPath = parts.length === 0 ? '' : '/' + parts.join('/');
              // After navigation, scroll to and highlight the item
              const doHighlight = () => {
                setHighlightedId(file.id);
                setTimeout(() => {
                  const el = itemRefs.current.get(file.id);
                  if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
                }, 300);
                setTimeout(() => setHighlightedId(null), 2000);
              };
              if (folderPath === currentPath) {
                // Already in the right folder — just highlight
                doHighlight();
              } else {
                // Navigate then highlight after load
                if (folderPath === '') navigateToIndex(0);
                else navigateTo(folderPath);
                setTimeout(doHighlight, 800);
              }
            }}
          />
          )}
        </div>

      </main>

      {/* Footer — always at bottom */}
      <footer className="relative z-10 w-full max-w-6xl mx-auto px-4 pb-6 mt-auto">
        <div className="bg-card border border-border rounded-2xl px-6 py-4 flex items-center justify-between relative pr-28 sm:pr-32">
          <AppAccessFooterButton />
          {/* Left — file/folder count */}
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary/50" />
            <span className="text-xs font-semibold text-foreground/70 tracking-wide">
              Folders {displayFiles.filter(f => f.isFolder).length}
              {' · '}
              Files {displayFiles.filter(f => !f.isFolder).length}
            </span>
          </div>

          {/* Right — Stratus Cloud label + keyboard shortcuts icon */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-foreground/70 tracking-wide select-none">Stratus Cloud</span>
            <button
              onClick={() => setShortcutsOpen(true)}
              title="Keyboard Shortcuts"
              className="bg-secondary hover:bg-secondary/80 rounded-lg p-1.5 text-foreground/60 hover:text-foreground transition-all"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2"/>
                <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/>
              </svg>
            </button>
          </div>
        </div>
      </footer>

      {/* Shared Links Panel */}
      {linksOpen && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm animate-fade-in" onClick={() => setLinksOpen(false)}>
          <div className="bg-card border border-border rounded-3xl p-6 w-full max-w-lg mx-4 mb-4 sm:mb-0 animate-scale-in max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4 shrink-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-foreground">Shared Links</h2>
                {allLinks.filter(isLinkActive).length > 0 && (
                  <span className="text-xs bg-primary/15 text-primary font-semibold px-2 py-0.5 rounded-full">
                    {allLinks.filter(isLinkActive).length} active
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => { setLinksLoading(true); try { setAllLinks(await loadLinks()); } catch {} setLinksLoading(false); }}
                  className="bg-secondary hover:bg-secondary/80 rounded-lg p-1.5 text-foreground/60 hover:text-foreground"
                  title="Refresh"
                >
                  {linksLoading
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                  }
                </button>
                <button onClick={() => setLinksOpen(false)} className="bg-secondary hover:bg-secondary/80 rounded-lg p-1.5 text-foreground/60">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>
            </div>

            {/* Links list */}
            <div className="overflow-y-auto flex-1 modal-scroll space-y-2">
              {linksLoading && (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {!linksLoading && allLinks.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary/60"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                  </div>
                  <p className="text-sm font-semibold text-foreground">No shared links yet</p>
                  <p className="text-xs text-muted-foreground">Right-click a file and choose Share to create one</p>
                </div>
              )}
              {!linksLoading && allLinks.map(link => {
                const active = isLinkActive(link);
                const expired = isLinkExpired(link);
                return (
                  <div key={link.id} className={`p-3 rounded-2xl border transition-all ${active ? 'border-border bg-foreground/3' : 'border-border/40 opacity-50'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{link.fileName}</p>
                        <p className="text-[10px] font-mono text-muted-foreground/60 truncate mt-0.5">{link.id.slice(0, 20)}…</p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                            link.revoked ? 'bg-foreground/10 text-foreground/50' :
                            expired ? 'bg-red-500/15 text-red-500' :
                            'bg-primary/15 text-primary'
                          }`}>
                            {link.revoked ? 'Revoked' : expired ? 'Expired' : formatExpiry(link)}
                          </span>
                          {link.pinHash && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-purple-500/15 text-purple-500">PIN</span>
                          )}
                          <span className="text-[10px] text-muted-foreground">{link.accessCount} downloads</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {active && (
                          <button
                            onClick={() => { navigator.clipboard.writeText(getShareUrl(link.id)); toast.success('Copied!'); }}
                            className="bg-secondary hover:bg-secondary/80 rounded-lg p-1.5 text-foreground/60 hover:text-foreground"
                            title="Copy link"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                          </button>
                        )}
                        {!link.revoked && !expired && (
                          <button
                            onClick={async () => { await revokeShareLink(link.id); setAllLinks(await loadLinks()); }}
                            className="bg-secondary hover:bg-secondary/80 rounded-lg p-1.5 text-amber-500 hover:text-amber-600"
                            title="Revoke link"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18.36 6.64A9 9 0 0 1 20.77 15"/><path d="M6.16 6.16a9 9 0 1 0 12.68 12.68"/><path d="M12 2v4"/><path d="m2 2 20 20"/></svg>
                          </button>
                        )}
                        <button
                          onClick={async () => { await deleteShareLink(link.id); setAllLinks(prev => prev.filter(l => l.id !== link.id)); }}
                          className="bg-secondary hover:bg-secondary/80 rounded-lg p-1.5 text-destructive/70 hover:text-destructive"
                          title="Delete link"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bulk clean expired */}
            {allLinks.some(l => isLinkExpired(l) || l.revoked) && (
              <div className="mt-3 pt-3 border-t border-border/30 shrink-0">
                <button
                  onClick={async () => {
                    const active = allLinks.filter(l => !isLinkExpired(l) && !l.revoked);
                    for (const l of allLinks.filter(l => isLinkExpired(l) || l.revoked)) {
                      await deleteShareLink(l.id);
                    }
                    setAllLinks(active);
                  }}
                  className="text-xs text-destructive/70 hover:text-destructive font-medium transition-colors"
                >
                  Clear expired & revoked links
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts & Features Modal */}
      {shortcutsOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 backdrop-blur-sm animate-fade-in" onClick={() => setShortcutsOpen(false)}>
          <div className="bg-card border border-border rounded-3xl p-6 max-w-md w-full mx-4 animate-scale-in max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4 shrink-0">
              <h2 className="text-base font-bold text-foreground">Shortcuts & Features</h2>
              <button onClick={() => setShortcutsOpen(false)} className="bg-secondary hover:bg-secondary/80 rounded-lg p-1.5 text-foreground/60">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-5 pr-2 modal-scroll">
              {/* Keyboard Shortcuts */}
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Keyboard Shortcuts</p>
                <div className="space-y-0.5">
                  {[
                    ['⌘K / Ctrl+K', 'Open Search'],
                    ['⌘A / Ctrl+A', 'Select All'],
                    ['⌘V / Ctrl+V', 'Paste Image & Upload'],
                    ['⌘⇧F / Ctrl+Shift+F', 'Toggle Favourites'],
                    ['↑ ↓ ← →', 'Navigate Files'],
                    ['Shift + Arrow', 'Extend Selection'],
                    ['Enter', 'Open File / Enter Folder'],
                    ['Space', 'Quick Preview'],
                    ['Esc', 'Clear Selection'],
                    ['Delete', 'Delete Selected'],
                    ['Backspace', 'Go Up a Folder'],
                  ].map(([key, desc]) => (
                    <div key={key} className="flex items-center justify-between py-1.5 border-b border-border/20 last:border-0">
                      <span className="text-xs text-muted-foreground font-medium">{desc}</span>
                      <kbd className="text-[10px] bg-foreground/6 border border-border/60 rounded-md px-2 py-0.5 font-mono text-foreground/60 shrink-0 ml-3">{key}</kbd>
                    </div>
                  ))}
                </div>
              </div>

              {/* Features */}
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Features</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['Cloud Sync', 'Secure cloud storage integration'],
                    ['Chunked Upload', 'Large files via 4MB chunks'],
                    ['Bulk Download', 'ZIP or individual file export'],
                    ['Encrypted Vault', 'AES-256-GCM client-side encryption'],
                    ['Share Links', 'Expiry, PIN protection, revoke'],
                    ['Multi-select', 'Long press, rubber band, Shift+Click'],
                    ['Drag & Drop', 'Upload files, move between folders'],
                    ['File Preview', 'Image, Video, Audio, PDF, Code'],
                    ['Favourites', 'Star files, filter by starred'],
                    ['Transfers', 'Progress, history, pause & retry'],
                    ['Theme', 'Light & Dark mode'],
                    ['Search', 'Full cloud search with filters'],
                  ].map(([title, desc]) => (
                    <div key={title} className="flex flex-col gap-0.5 p-2.5 rounded-xl bg-foreground/4 border border-border/20">
                      <p className="text-xs font-semibold text-foreground leading-tight">{title}</p>
                      <p className="text-[10px] text-muted-foreground leading-tight">{desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Dialogs ── */}
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
      <CreateFolderDialog
        open={createFolderOpen}
        onConfirm={handleCreateFolder}
        onCancel={() => setCreateFolderOpen(false)}
      />
      <NewFileDialog
        open={newFileOpen}
        currentPath={currentPath}
        onClose={() => setNewFileOpen(false)}
        onSaved={() => { setNewFileOpen(false); loadFolder(currentPath); logActivity('upload', { path: currentPath, name: 'new file', success: true }); }}
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
      <VaultDialog
        open={vaultDialogOpen}
        onClose={() => setVaultDialogOpen(false)}
        onVaultUnlocked={handleVaultUnlocked}
      />
      <FilePreviewDialog
        open={previewDialog.open}
        file={previewDialog.file}
        files={displayFiles}
        vaultId={activeVaultId}
        onClose={() => setPreviewDialog({ open: false, file: null })}
      />
      <FileConflictDialog
        open={conflictDialog.open}
        fileName={conflictDialog.fileName}
        onResolve={r => { conflictDialog.resolve?.(r); setConflictDialog({ open: false, fileName: '', resolve: null }); }}
        onCancel={() => setConflictDialog({ open: false, fileName: '', resolve: null })}
      />
      {bulkDownloadProgress && (
        <DownloadProgressDialog
          open={true}
          currentFile={bulkDownloadProgress.currentFile}
          currentIndex={bulkDownloadProgress.currentIndex}
          totalFiles={bulkDownloadProgress.totalFiles}
          percent={bulkDownloadProgress.percent}
          zipName="Bulk Download"
        />
      )}

      {/* Folder Picker — Move / Copy */}
      <FolderPickerDialog
        open={folderPicker.open}
        title={folderPicker.mode === 'move' ? 'Move to...' : 'Copy to...'}
        confirmLabel={folderPicker.mode === 'move' ? 'Move Here' : 'Copy Here'}
        mode={folderPicker.mode}
        excludePaths={folderPicker.files.map(f => f.path)}
        sourceParentPaths={folderPicker.files.map(f => {
          const parts = f.path.split('/').filter(Boolean);
          parts.pop();
          return parts.length === 0 ? '' : '/' + parts.join('/');
        })}
        onConfirm={(dest, duplicate) => executeMoveOrCopy(folderPicker.mode, folderPicker.files, dest, duplicate)}
        onCancel={() => setFolderPicker(p => ({ ...p, open: false }))}
      />
    </div>
  );
}

