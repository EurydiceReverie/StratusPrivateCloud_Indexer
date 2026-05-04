import { useRef, useCallback, useEffect, DragEvent } from "react";
import { useLocation } from "react-router-dom";
import { isLiteRoutePath } from "@/lib/app-mode";
import { DBXFile } from "@/services/dropbox-service";
import { Check, Lock, Star, Eye, Download, Pencil, Trash2, Share2, Info, Copy, FolderInput } from "lucide-react";
// isFavorite is now passed as a prop (favoriteIds set from Dropbox) — no localStorage, no cache
import {
  ContextMenu, ContextMenuContent, ContextMenuItem,
  ContextMenuSeparator, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { LiquidGlassCard } from "@/components/ui/liquid-notification";

const CDN = "https://cdn.jsdelivr.net/gh/Ransomliome360/mcuplfold@main";

function getIconUrl(file: DBXFile): string {
  if (file.isFolder) return `${CDN}/Generic%20Folder.png`;
  return `${CDN}/Generic%20File.png`;
}

function getExt(name: string): string {
  if (name.endsWith('.vault')) return 'VAULT';
  const parts = name.split('.');
  return parts.length > 1 ? parts.pop()!.toUpperCase() : '';
}

export type ViewMode = "grid" | "list";

interface FileGridProps {
  items: DBXFile[];
  onFolderOpen: (folder: DBXFile) => void;
  onGoToFolder?: (file: DBXFile) => void;
  viewMode: ViewMode;
  selected: Set<string>;
  selectMode: boolean;
  onToggleSelect: (id: string) => void;
  dissolvingItems: Set<string>;
  onDragItem: (item: DBXFile) => void;
  onDropOnFolder: (folder: DBXFile) => void;
  dragOverFolder: string | null;
  onDragOverFolder: (id: string | null) => void;
  itemRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  onRename: (file: DBXFile) => void;
  onDelete: (file: DBXFile) => void;
  onShare: (file: DBXFile) => void;
  onInfo: (file: DBXFile) => void;
  onPreview: (file: DBXFile) => void;
  onDownload: (file: DBXFile) => void;
  onCopy: (file: DBXFile) => void;
  onMove: (file: DBXFile) => void;
  onFavoriteToggle: (file: DBXFile) => void;
  isVaultMode: boolean;
  focusedIdx?: number;
  favoriteIds?: Set<string>;
  isFavoritesMode?: boolean;
  highlightedId?: string | null;
}

export default function FileGrid({
  items, onFolderOpen, viewMode, selected, selectMode, onToggleSelect,
  dissolvingItems, onDragItem, onDropOnFolder, dragOverFolder, onDragOverFolder,
  itemRefs, onRename, onDelete, onShare, onInfo, onPreview, onDownload,
  onCopy, onMove, onFavoriteToggle, isVaultMode, focusedIdx = -1, favoriteIds = new Set(), isFavoritesMode = false, onGoToFolder, highlightedId = null,
}: FileGridProps) {
  const { pathname } = useLocation();
  const liteMode = isLiteRoutePath(pathname);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const longPressedItemId = useRef<string | null>(null); // exact item whose synthetic post-long-press click we suppress
  const suppressLongPressClickUntil = useRef(0);
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);
  // Keep refs to props so event handlers always read the latest values,
  // avoiding stale-closure issues (e.g. selectMode still false in handleClick
  // right after the long-press set it to true in the parent).
  const selectModeRef = useRef(selectMode);
  selectModeRef.current = selectMode;
  const onToggleSelectRef = useRef(onToggleSelect);
  onToggleSelectRef.current = onToggleSelect;

  const setItemRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) itemRefs.current.set(id, el);
    else itemRefs.current.delete(id);
  }, [itemRefs]);

  // Auto-scroll focused item into view
  useEffect(() => {
    if (focusedIdx < 0) return;
    const item = items[focusedIdx];
    if (!item) return;
    const el = itemRefs.current.get(item.id);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focusedIdx, items, itemRefs]);

  // Prevent browser from stealing Space/Enter/Arrow keys on focused row/card
  const suppressKeys = (e: React.KeyboardEvent) => {
    if ([' ', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
    }
  };

  const handlePointerDown = (item: DBXFile, e: React.PointerEvent) => {
    longPressed.current = false;
    pointerDownPos.current = { x: e.clientX, y: e.clientY };
    longPressTimer.current = setTimeout(() => {
      longPressed.current = true;
      longPressedItemId.current = item.id;
      suppressLongPressClickUntil.current = Date.now() + 800;
      pointerDownPos.current = null;
      longPressTimer.current = null;
      onToggleSelectRef.current(item.id);
    }, 500);
  };
  const handlePointerUp = (item: DBXFile, e: React.PointerEvent) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    pointerDownPos.current = null;
    // Prevent the browser from turning the just-finished long press into a click.
    if (longPressedItemId.current === item.id && Date.now() < suppressLongPressClickUntil.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (longPressTimer.current && !longPressed.current && pointerDownPos.current) {
      const dx = e.clientX - pointerDownPos.current.x;
      const dy = e.clientY - pointerDownPos.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > 12) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
        pointerDownPos.current = null;
      }
    }
  };

  const lastClickTime = useRef<Record<string, number>>({});
  const clickLocked = useRef<Record<string, boolean>>({});

  const handleClick = (item: DBXFile, e: React.MouseEvent) => {
    // Prevent any double/triple click
    if (e.detail > 1) { e.preventDefault(); e.stopPropagation(); return; }
    // Ignore the delayed synthetic click emitted for the item that triggered long-press selection.
    // This stays tied to that exact item for a short window, so a later pointerdown on another item
    // cannot accidentally clear the guard and deselect the original item.
    if (longPressedItemId.current === item.id && Date.now() < suppressLongPressClickUntil.current) {
      e.preventDefault();
      e.stopPropagation();
      longPressed.current = false;
      longPressedItemId.current = null;
      suppressLongPressClickUntil.current = 0;
      return;
    }
    longPressed.current = false;
    if (selectModeRef.current) { onToggleSelectRef.current(item.id); return; }
    // Extra debounce guard
    const now = Date.now();
    const last = lastClickTime.current[item.id] || 0;
    if (now - last < 600) return;
    if (clickLocked.current[item.id]) return;
    lastClickTime.current[item.id] = now;
    clickLocked.current[item.id] = true;
    setTimeout(() => { clickLocked.current[item.id] = false; }, 600);
    if (item.isFolder) { onFolderOpen(item); return; }
    onPreview(item);
  };

  const handleDragStart = (e: DragEvent, item: DBXFile) => {
    // Cancel long press timer when drag starts — prevents accidental selection
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    longPressed.current = false;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", item.id);
    onDragItem(item);
  };

  const handleDragOver = (e: DragEvent, item: DBXFile) => {
    if (item.isFolder) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; onDragOverFolder(item.id); }
  };

  const handleDrop = (e: DragEvent, item: DBXFile) => {
    e.preventDefault();
    onDragOverFolder(null);
    if (item.isFolder) onDropOnFolder(item);
  };

  const contextMenu = (item: DBXFile) => (
    <ContextMenuContent>
      <ContextMenuItem onClick={() => item.isFolder ? onFolderOpen(item) : onPreview(item)}>
        <Eye className="w-4 h-4 mr-2" />{item.isFolder ? 'Open' : 'Preview'}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => onDownload(item)}><Download className="w-4 h-4 mr-2" />Download</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => onRename(item)}><Pencil className="w-4 h-4 mr-2" />Rename</ContextMenuItem>
      {!isFavoritesMode && <>
      <ContextMenuItem onClick={() => onMove(item)}><FolderInput className="w-4 h-4 mr-2" />Move</ContextMenuItem>
      <ContextMenuItem onClick={() => onCopy(item)}><Copy className="w-4 h-4 mr-2" />Copy</ContextMenuItem>
      </>}
      <ContextMenuSeparator />
      {!isVaultMode && <ContextMenuItem onClick={() => onShare(item)}><Share2 className="w-4 h-4 mr-2" />Share</ContextMenuItem>}
      <ContextMenuItem onClick={() => onFavoriteToggle(item)}>
        <Star className={`w-4 h-4 mr-2 ${favoriteIds.has(item.id) ? 'fill-primary text-primary' : ''}`} />
        {favoriteIds.has(item.id) ? 'Unfavorite' : 'Favorite'}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => onInfo(item)}><Info className="w-4 h-4 mr-2" />Info</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => onDelete(item)} className="text-red-500 focus:bg-red-500/15 focus:text-red-500 font-semibold">
        <Trash2 className="w-4 h-4 mr-2" />Delete
      </ContextMenuItem>
    </ContextMenuContent>
  );

  if (items.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl p-16 text-center">
        <p className="text-muted-foreground text-sm font-medium">This folder is empty</p>
      </div>
    );
  }

  const displayName = (item: DBXFile) => item.isVaultFile ? item.name.replace(/\.vault$/, '') : item.name;

  if (viewMode === "list") {
    return (
      <div className={isVaultMode ? "flex flex-col gap-2" : "bg-card border border-border rounded-2xl overflow-hidden"}>
        {items.map((item, idx) => {
          const isSelected = selected.has(item.id);
          const isDissolvingItem = dissolvingItems.has(item.id);
          const isDragOver = dragOverFolder === item.id;
          const isFocused = focusedIdx === idx;
          const isHighlighted = highlightedId === item.id;
          const fav = favoriteIds.has(item.id);
          const ext = getExt(item.name);

          // Shared inner content for list row
          const listRowContent = (
            <>
              {selectMode && (
                <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-all duration-200
                  ${isSelected
                    ? isVaultMode ? "bg-purple-500 border-purple-400 scale-110" : "bg-primary border-primary scale-110"
                    : "border-muted-foreground/40"}`}>
                  {isSelected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                </div>
              )}
              <div className="w-10 h-10 flex items-center justify-center shrink-0 relative">
                {item.isFolder ? (
                  <img src={getIconUrl(item)} alt={item.name}
                    className="w-9 h-9 object-contain drop-shadow-sm group-hover:scale-110 transition-transform duration-200" />
                ) : (
                  <div className="liquid-file-icon list-size flex flex-col items-center justify-center" style={{ width: '30px', height: '38px' }}>
                    <span className="text-[8px] font-bold text-foreground/60 uppercase tracking-wider relative z-10">{ext || '—'}</span>
                  </div>
                )}
                {item.isVaultFile && (
                  <div className="absolute -bottom-1.5 -right-1.5 rounded-full p-[3px] bg-gradient-to-br from-white/80 via-violet-200/95 to-purple-500 shadow-[0_6px_16px_rgba(124,58,237,0.35)] ring-1 ring-white/60 backdrop-blur-sm dark:from-white/20 dark:via-violet-300/55 dark:to-purple-500">
                    <div className="rounded-full bg-white/30 dark:bg-black/10 p-0.5">
                      <Lock className="w-2 h-2 text-violet-800 dark:text-white" />
                    </div>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate flex items-center gap-1.5">
                  {displayName(item)}
                  {fav && <Star className={`w-3 h-3 shrink-0 ${isVaultMode ? "fill-purple-400 text-purple-400" : "fill-primary text-primary"}`} />}
                </p>
                {isFavoritesMode ? (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs text-muted-foreground/70 truncate max-w-[150px]">
                      {item.path.split('/').slice(0, -1).filter(Boolean).join(' › ') || 'Home'}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); onGoToFolder?.(item); }}
                      className="text-xs font-semibold text-primary shrink-0 hover:underline underline-offset-2 px-1.5 py-0.5 rounded-lg bg-primary/10 hover:bg-primary/20 transition-all"
                    >
                      Go →
                    </button>
                  </div>
                ) : item.modifiedAt ? (
                  <p className="text-xs text-muted-foreground font-medium">
                    {new Date(item.modifiedAt).toLocaleDateString()}
                  </p>
                ) : null}
              </div>
              {item.size !== undefined && (
                <span className="text-xs text-muted-foreground font-medium shrink-0">
                  {item.size < 1024 ? `${item.size}B`
                    : item.size < 1048576 ? `${(item.size/1024).toFixed(0)}KB`
                    : `${(item.size/1048576).toFixed(1)}MB`}
                </span>
              )}
            </>
          );

          return (
            <div key={item.id}>
              <ContextMenu>
                <ContextMenuTrigger>
                  <div className="stagger-item" style={{ animationDelay: `${Math.min(idx, 15) * 30}ms` }}>
                  {isVaultMode ? (
                    <LiquidGlassCard
                      ref={el => setItemRef(item.id, el as unknown as HTMLElement)}
                      borderRadius="14px"
                      blurIntensity={liteMode ? "sm" : "lg"}
                      glowIntensity={liteMode ? "none" : "xl"}
                      shadowIntensity={liteMode ? "xs" : "sm"}
                      draggable={!isDissolvingItem && !isFavoritesMode}
                      onDragStart={e => !isFavoritesMode && handleDragStart(e, item)}
                      onDragOver={e => !isFavoritesMode && handleDragOver(e, item)}
                      onDragLeave={() => !isFavoritesMode && onDragOverFolder(null)}
                      onDrop={e => !isFavoritesMode && handleDrop(e, item)}
                      onPointerDown={e => handlePointerDown(item, e)}
                      onPointerUp={e => handlePointerUp(item, e)}
                      onPointerCancel={e => handlePointerUp(item, e)}
                      onPointerMove={handlePointerMove}
                      onClick={e => handleClick(item, e)}
                      onKeyDown={suppressKeys}
                      data-file-item="true"
                      role="button"
                      tabIndex={0}
                      className={`${liteMode ? "file-item file-item-list" : ""} w-full flex items-center gap-3 px-4 py-2 text-left group cursor-pointer transition-all duration-150
                        ${isDissolvingItem ? `${liteMode ? "file-item-deleting" : "opacity-0"} pointer-events-none` : ""}
                        ${isSelected ? `${liteMode ? "file-item-selected" : ""} vault-item-selected bg-purple-500/10` : isFocused ? "ring-2 ring-purple-400/30 bg-purple-500/5" : ""}
                        ${isDragOver ? "ring-2 ring-purple-400/50 bg-purple-500/15" : ""}
                        ${isHighlighted ? "item-blink" : ""}
                      `}
                    >
                      {listRowContent}
                    </LiquidGlassCard>
                  ) : (
                    <div
                      ref={el => setItemRef(item.id, el)}
                      draggable={!isDissolvingItem && !isFavoritesMode}
                      onDragStart={e => !isFavoritesMode && handleDragStart(e, item)}
                      onDragOver={e => !isFavoritesMode && handleDragOver(e, item)}
                      onDragLeave={() => !isFavoritesMode && onDragOverFolder(null)}
                      onDrop={e => !isFavoritesMode && handleDrop(e, item)}
                      onPointerDown={e => handlePointerDown(item, e)}
                      onPointerUp={e => handlePointerUp(item, e)}
                      onPointerCancel={e => handlePointerUp(item, e)}
                      onPointerMove={handlePointerMove}
                      onClick={e => handleClick(item, e)}
                      onKeyDown={suppressKeys}
                      data-file-item="true"
                      role="button"
                      tabIndex={0}
                      className={`${liteMode ? "file-item file-item-list" : ""} list-row-hover w-full flex items-center gap-3 px-4 py-2 text-left group cursor-pointer transition-all duration-150
                        ${isDissolvingItem ? `${liteMode ? "file-item-deleting" : "opacity-0"} pointer-events-none` : ""}
                        ${isSelected ? `${liteMode ? "file-item-selected" : ""} list-row-selected border-l-[3px] border-primary` : isFocused ? "list-row-focused border-l-[3px] border-primary/60" : "border-l-[3px] border-transparent"}
                        ${isDragOver ? "bg-primary/15 ring-2 ring-primary/30 ring-inset" : ""}
                        ${isHighlighted ? "item-blink" : ""}
                      `}
                    >
                      {listRowContent}
                    </div>
                  )}
                  </div>{/* end stagger wrapper */}
                </ContextMenuTrigger>
                {contextMenu(item)}
              </ContextMenu>
              {!isVaultMode && idx < items.length - 1 && <div className="h-px bg-border/40 mx-5" />}
            </div>
          );
        })}
      </div>
    );
  }

  // Grid view
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
      {items.map((item, idx) => {
        const isSelected = selected.has(item.id);
        const isDissolvingItem = dissolvingItems.has(item.id);
        const isDragOver = dragOverFolder === item.id;
        const isFocused = focusedIdx === idx;
        const isHighlighted = highlightedId === item.id;
        const fav = favoriteIds.has(item.id);
        const ext = getExt(item.name);
        return (
          <ContextMenu key={item.id}>
            <ContextMenuTrigger>
              {/* Stable stagger wrapper — never changes className so animation never replays */}
              <div className="stagger-item" style={{ animationDelay: `${Math.min(idx, 15) * 40}ms` }}>
              {isVaultMode ? (
                <LiquidGlassCard
                  ref={el => setItemRef(item.id, el as unknown as HTMLElement)}
                  borderRadius="16px"
                  blurIntensity={liteMode ? "sm" : "lg"}
                  glowIntensity={liteMode ? "none" : "xl"}
                  shadowIntensity={liteMode ? "xs" : "md"}
                  className={`${liteMode ? "file-item file-item-grid" : ""} group flex flex-col items-center gap-2 p-4 transition-all duration-200 cursor-pointer
                    ${isDissolvingItem ? `${liteMode ? "file-item-deleting" : "opacity-0"} pointer-events-none` : "hover:scale-[1.04] active:scale-95"}
                    ${isSelected ? `${liteMode ? "file-item-selected" : ""} vault-item-selected bg-purple-500/10` : ""}
                    ${isDragOver ? "ring-2 ring-purple-400/50 bg-purple-500/15 scale-[1.06]" : ""}
                    ${isFocused && !isSelected ? "ring-2 ring-purple-400/40 bg-purple-500/5" : ""}
                    ${isHighlighted ? "item-blink" : ""}
                    ${selectMode && !isDissolvingItem && !liteMode ? "animate-wiggle" : ""}
                  `}
                  style={{ touchAction: 'pan-y' }}
                  draggable={!isDissolvingItem && !isFavoritesMode}
                  onDragStart={e => !isFavoritesMode && handleDragStart(e, item)}
                  onDragOver={e => !isFavoritesMode && handleDragOver(e, item)}
                  onDragLeave={() => !isFavoritesMode && onDragOverFolder(null)}
                  onDrop={e => !isFavoritesMode && handleDrop(e, item)}
                  onPointerDown={e => handlePointerDown(item, e)}
                  onPointerUp={e => handlePointerUp(item, e)}
                  onPointerCancel={e => handlePointerUp(item, e)}
                  onPointerMove={handlePointerMove}
                  onClick={e => handleClick(item, e)}
                  onKeyDown={suppressKeys}
                  data-file-item="true"
                  role="button"
                  tabIndex={0}
                >
                  {/* Selection tick — absolute to card root (content layer is position:static) */}
                  {selectMode && (
                    <div className={`absolute top-1.5 left-1.5 w-5 h-5 rounded-full border-2 flex items-center justify-center z-50 pointer-events-none transition-all duration-200
                      ${isSelected ? "bg-purple-500 border-purple-400 scale-110" : "bg-background/90 border-muted-foreground/50"}`}>
                      {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                    </div>
                  )}
                  {/* Fav star — absolute to card root */}
                  {fav && (
                    <div className="absolute top-1.5 right-1.5 z-50 pointer-events-none">
                      <Star className="w-3.5 h-3.5 fill-purple-400 text-purple-400" />
                    </div>
                  )}

                  <div className="w-16 h-16 flex items-center justify-center relative">
                    {item.isFolder ? (
                      <img src={getIconUrl(item)} alt={item.name}
                        className="w-14 h-14 object-contain drop-shadow-md group-hover:drop-shadow-lg transition-all duration-200" />
                    ) : (
                      <div className="liquid-file-icon flex items-center justify-center">
                        <span className="text-[9px] font-bold text-foreground/60 uppercase tracking-wider relative z-10">{ext || '—'}</span>
                      </div>
                    )}
                    {item.isVaultFile && (
                      <div className="absolute -bottom-1 -right-1 bg-purple-500 rounded-full p-0.5">
                        <Lock className="w-2.5 h-2.5 text-white" />
                      </div>
                    )}
                  </div>
                  <span className="text-xs font-semibold text-foreground text-center leading-tight line-clamp-2 max-w-full">
                    {displayName(item)}
                  </span>
                  {isFavoritesMode && (
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[10px] text-muted-foreground/60 text-center truncate max-w-full">
                        {item.path.split('/').slice(0, -1).filter(Boolean).join(' › ') || 'Home'}
                      </span>
                      <button
                        onClick={e => { e.stopPropagation(); onGoToFolder?.(item); }}
                        className="text-[10px] font-semibold text-primary px-2 py-0.5 rounded-lg bg-primary/10 hover:bg-primary/20 transition-all"
                      >
                        Go →
                      </button>
                    </div>
                  )}
                </LiquidGlassCard>
              ) : (
                <div
                  ref={el => setItemRef(item.id, el)}
                  draggable={!isDissolvingItem && !isFavoritesMode}
                  onDragStart={e => !isFavoritesMode && handleDragStart(e, item)}
                  onDragOver={e => !isFavoritesMode && handleDragOver(e, item)}
                  onDragLeave={() => !isFavoritesMode && onDragOverFolder(null)}
                  onDrop={e => !isFavoritesMode && handleDrop(e, item)}
                  onPointerDown={e => handlePointerDown(item, e)}
                  onPointerUp={e => handlePointerUp(item, e)}
                  onPointerCancel={e => handlePointerUp(item, e)}
                  onPointerMove={handlePointerMove}
                  onClick={e => handleClick(item, e)}
                  onKeyDown={suppressKeys}
                  data-file-item="true"
                  role="button"
                  tabIndex={0}
                  className={`${liteMode ? "file-item file-item-grid" : ""} group relative flex flex-col items-center gap-2 p-4 rounded-2xl bg-card border border-border transition-all duration-200 cursor-pointer
                    ${isDissolvingItem ? `${liteMode ? "file-item-deleting" : "opacity-0"} pointer-events-none` : "hover:scale-[1.04] active:scale-95"}
                    ${isSelected ? `${liteMode ? "file-item-selected" : ""} ring-2 ring-primary bg-primary/10` : ""}
                    ${isDragOver ? "ring-2 ring-primary/50 bg-primary/15 scale-[1.06]" : ""}
                    ${isFocused && !isSelected ? "ring-2 ring-primary/40 bg-primary/5" : ""}
                    ${isHighlighted ? "item-blink" : ""}
                    ${selectMode && !isDissolvingItem && !liteMode ? "animate-wiggle" : ""}
                  `}
                  style={{ touchAction: 'pan-y' }}
                >
                  {selectMode && (
                    <div className={`absolute -top-2 -left-2 w-6 h-6 rounded-full border-2 flex items-center justify-center z-10 transition-all duration-200
                      ${isSelected ? "bg-primary border-primary scale-110" : "bg-background border-muted-foreground/40"}`}>
                      {isSelected && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
                    </div>
                  )}
                  {fav && <Star className="absolute top-2 right-2 w-3 h-3 fill-primary text-primary" />}

                  <div className="w-16 h-16 flex items-center justify-center relative">
                    {item.isFolder ? (
                      <img src={getIconUrl(item)} alt={item.name}
                        className="w-14 h-14 object-contain drop-shadow-md group-hover:drop-shadow-lg transition-all duration-200" />
                    ) : (
                      <div className="liquid-file-icon flex items-center justify-center">
                        <span className="text-[9px] font-bold text-foreground/60 uppercase tracking-wider relative z-10">{ext || '—'}</span>
                      </div>
                    )}
                    {item.isVaultFile && (
                      <div className="absolute -bottom-1 -right-1 bg-purple-500 rounded-full p-0.5">
                        <Lock className="w-2.5 h-2.5 text-white" />
                      </div>
                    )}
                  </div>
                  <span className="text-xs font-semibold text-foreground text-center leading-tight line-clamp-2 max-w-full">
                    {displayName(item)}
                  </span>
                  {isFavoritesMode && (
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[10px] text-muted-foreground/60 text-center truncate max-w-full">
                        {item.path.split('/').slice(0, -1).filter(Boolean).join(' › ') || 'Home'}
                      </span>
                      <button
                        onClick={e => { e.stopPropagation(); onGoToFolder?.(item); }}
                        className="text-[10px] font-semibold text-primary px-2 py-0.5 rounded-lg bg-primary/10 hover:bg-primary/20 transition-all"
                      >
                        Go →
                      </button>
                    </div>
                  )}
                </div>
              )}
              </div>{/* end stagger wrapper */}
            </ContextMenuTrigger>
            {contextMenu(item)}
          </ContextMenu>
        );
      })}
    </div>
  );
}

