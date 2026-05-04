import { Search, LayoutGrid, List, Upload, FolderPlus, FilePlus, FolderOpen, FileEdit, X, Lock, Star, LogIn, User, Link2, Activity } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { ThemeSwitcher } from "@/components/ui/apple-bg-card border border-border-switcher";

const CDN = "https://cdn.jsdelivr.net/gh/Ransomliome360/mcuplfold@main";

export type ViewMode = "grid" | "list";

type SortField = 'name' | 'date' | 'size' | 'ext';
type SortOrder = 'asc' | 'desc';
type FilterMode = 'all' | 'files' | 'folders';

interface HeaderProps {
  onToggleTheme: () => void;
  isDark: boolean;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onUploadFile: (files: FileList) => void;
  onNewFolder: () => void;
  onNewFile: () => void;
  onVaultOpen: () => void;
  onFavoritesToggle: () => void;
  onStatusOpen: () => void;
  showFavorites: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  isVaultMode: boolean;
  currentVaultName?: string;
  onGoHome: () => void;
  onLinksOpen: () => void;
  activeLinksCount?: number;
  // Vault mode sort/filter
  vaultSortField?: SortField;
  vaultSortOrder?: SortOrder;
  vaultFilterMode?: FilterMode;
  onVaultSortChange?: (field: SortField, order: SortOrder) => void;
  onVaultFilterChange?: (mode: FilterMode) => void;
}

// View toggle with sliding pill + pop animation
function ViewToggle({ viewMode, onViewModeChange }: { viewMode: ViewMode; onViewModeChange: (m: ViewMode) => void }) {
  const [popGrid, setPopGrid] = useState(false);
  const [popList, setPopList] = useState(false);

  const handleGrid = useCallback(() => {
    setPopGrid(true);
    setTimeout(() => setPopGrid(false), 350);
    onViewModeChange("grid");
  }, [onViewModeChange]);

  const handleList = useCallback(() => {
    setPopList(true);
    setTimeout(() => setPopList(false), 350);
    onViewModeChange("list");
  }, [onViewModeChange]);

  return (
    <div className="bg-secondary hover:bg-secondary/80 view-toggle" data-view={viewMode}>
      <button
        onClick={handleGrid}
        className={`p-2.5 rounded-[10px] transition-colors duration-150 outline-none
          ${viewMode === "grid" ? "text-foreground" : "text-foreground/35 hover:text-foreground/70"}
          ${popGrid ? "pop" : ""}`}
      >
        <LayoutGrid className="h-4 w-4" />
      </button>
      <button
        onClick={handleList}
        className={`p-2.5 rounded-[10px] transition-colors duration-150 outline-none
          ${viewMode === "list" ? "text-foreground" : "text-foreground/35 hover:text-foreground/70"}
          ${popList ? "pop" : ""}`}
      >
        <List className="h-4 w-4" />
      </button>
    </div>
  );
}

// True iOS liquid glass icon button — glass deepens on hover, no colour
function GlassBtn({ onClick, title, active, children }: {
  onClick: () => void;
  title?: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`bg-secondary hover:bg-secondary/80 rounded-xl p-2.5 select-none outline-none
        ${active ? 'brightness-110 text-foreground' : 'text-foreground/60 hover:text-foreground'}`}
    >
      {children}
    </button>
  );
}

export default function Header({
  onToggleTheme, isDark, viewMode, onViewModeChange,
  onUploadFile, onNewFolder, onNewFile, onVaultOpen, onFavoritesToggle, onStatusOpen,
  showFavorites, searchQuery, onSearchChange,
  isVaultMode, currentVaultName, onGoHome, onLinksOpen, activeLinksCount = 0,
  vaultSortField = 'name', vaultSortOrder = 'asc', vaultFilterMode = 'all',
  onVaultSortChange, onVaultFilterChange,
}: HeaderProps) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [vaultSortOpen, setVaultSortOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const { isAuthenticated, login, userInfo } = useAuth();

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setUploadOpen(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (searchOpen && searchInputRef.current) searchInputRef.current.focus();
  }, [searchOpen]);

  useEffect(() => {
    const handler = () => setSearchOpen(true);
    window.addEventListener("open-search", handler);
    return () => window.removeEventListener("open-search", handler);
  }, []);

  return (
    <header className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1.5rem)] max-w-6xl">
      <div className="bg-card border border-border rounded-[1.35rem] px-5 py-3.5 flex items-center justify-between gap-3 shadow-[0_10px_30px_rgba(0,0,0,0.10)]">

        {/* Logo — click goes home */}
        <button
          onClick={onGoHome}
          className="flex items-center gap-3 shrink-0 cursor-pointer hover:opacity-80 transition-opacity active:scale-95"
          title="Go to Home"
        >
          <img
            src={isDark ? `${CDN}/icloud%20(1).svg` : `${CDN}/icloud.svg`}
            alt="Cloud"
            className="h-10 w-10"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <div className="flex flex-col">
            <span className="text-xl font-bold tracking-tight text-foreground leading-none">Stratus</span>
            {isVaultMode && (
              <span className="text-[10px] font-semibold text-foreground/50 leading-none mt-0.5 flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" />{currentVaultName || 'Vault'}
              </span>
            )}
          </div>
        </button>

        {/* Center controls */}
        <div className="flex items-center gap-1.5 flex-1 justify-center">

          {/* Search */}
          {searchOpen ? (
            <div className="bg-secondary flex items-center gap-2 px-1.5 py-1.5 animate-scale-in">
              {/* Search icon in its own liquid glass circle */}
              <div className="search-icon-circle shrink-0">
                <Search className="h-3.5 w-3.5 text-foreground/60" />
              </div>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search files…"
                value={searchQuery}
                onChange={e => onSearchChange(e.target.value)}
                className="bg-transparent border-none outline-none text-sm font-medium text-foreground placeholder:text-muted-foreground w-36 md:w-48"
              />
              <button
                onClick={() => { setSearchOpen(false); onSearchChange(''); }}
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

          {/* View toggle — sliding pill, always visible */}
          <ViewToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />

          {/* Favorites */}
          <GlassBtn onClick={onFavoritesToggle} title="Favorites" active={showFavorites}>
            <Star className={`h-4 w-4 transition-all ${showFavorites ? 'fill-foreground text-foreground' : 'text-foreground/60'}`} />
          </GlassBtn>

          {/* Vault */}
          <GlassBtn onClick={onVaultOpen} title="Vault" active={isVaultMode}>
            <Lock className={`h-4 w-4 transition-all ${isVaultMode ? 'text-foreground' : 'text-foreground/60'}`} />
          </GlassBtn>

          {/* Vault mode — sort & filter controls in header */}
          {isVaultMode && (
            <>
              {/* Filter: All / Files / Folders — compact icon buttons */}
              <div className="bg-card border border-border flex items-center rounded-xl overflow-hidden">
                <button onClick={() => onVaultFilterChange?.('all')} title="All" className={`px-2 py-1.5 transition-all ${vaultFilterMode === 'all' ? 'bg-primary/20 text-primary' : 'text-foreground/50 hover:text-foreground'}`}>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                </button>
                <button onClick={() => onVaultFilterChange?.('files')} title="Files only" className={`px-2 py-1.5 transition-all ${vaultFilterMode === 'files' ? 'bg-primary/20 text-primary' : 'text-foreground/50 hover:text-foreground'}`}>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                </button>
                <button onClick={() => onVaultFilterChange?.('folders')} title="Folders only" className={`px-2 py-1.5 transition-all ${vaultFilterMode === 'folders' ? 'bg-primary/20 text-primary' : 'text-foreground/50 hover:text-foreground'}`}>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                </button>
              </div>
              {/* Sort dropdown */}
              <div className="relative">
                {(() => {
                  const sortOptions = [
                    { value: 'name:asc',  label: 'A → Z' },
                    { value: 'name:desc', label: 'Z → A' },
                    { value: 'date:desc', label: 'Newest First' },
                    { value: 'date:asc',  label: 'Oldest First' },
                    { value: 'size:desc', label: 'Large → Small' },
                    { value: 'size:asc',  label: 'Small → Large' },
                    { value: 'ext:asc',   label: 'By Extension' },
                  ];
                  const currentSort = `${vaultSortField}:${vaultSortOrder}`;
                  const currentLabel = sortOptions.find(o => o.value === currentSort)?.label ?? 'Sort';
                  return (
                    <>
                      <button
                        onClick={() => setVaultSortOpen(v => !v)}
                        className="bg-card border border-border rounded-xl flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 text-xs font-semibold text-foreground/80 hover:text-foreground transition-all"
                      >
                        <svg className="w-3 h-3 text-primary/70 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M7 12h10M11 18h2"/></svg>
                        <span>{currentLabel}</span>
                        <svg className={`w-3 h-3 text-foreground/40 shrink-0 transition-transform ${vaultSortOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
                      </button>
                      {vaultSortOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setVaultSortOpen(false)} />
                          <div className="absolute right-0 top-full mt-1.5 z-50 bg-card border border-border rounded-xl overflow-hidden shadow-xl border border-white/10 min-w-[140px] py-1">
                            {sortOptions.map(opt => (
                              <button
                                key={opt.value}
                                onClick={() => {
                                  const [f, o] = opt.value.split(':') as [SortField, SortOrder];
                                  onVaultSortChange?.(f, o);
                                  setVaultSortOpen(false);
                                }}
                                className={`w-full text-left px-3 py-1.5 text-xs font-semibold transition-all hover:bg-primary/15 hover:text-primary ${currentSort === opt.value ? 'text-primary bg-primary/10' : 'text-foreground/70'}`}
                              >
                                {currentSort === opt.value && <span className="mr-1.5">✓</span>}{opt.label}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  );
                })()}
              </div>
            </>
          )}

          {/* Status */}
          <GlassBtn onClick={onStatusOpen} title="Status">
            <Activity className="h-4 w-4 text-foreground/60" />
          </GlassBtn>

          {/* Shared Links */}
          <div className="relative">
            <GlassBtn onClick={onLinksOpen} title="Shared Links">
              <Link2 className="h-4 w-4 text-foreground/60" />
            </GlassBtn>
            {activeLinksCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-primary text-white text-[9px] font-bold rounded-full flex items-center justify-center pointer-events-none">
                {activeLinksCount > 9 ? '9+' : activeLinksCount}
              </span>
            )}
          </div>

          {/* Upload dropdown */}
          {isAuthenticated && (
            <div className="relative" ref={dropdownRef}>
              <GlassBtn onClick={() => setUploadOpen(!uploadOpen)} title="Upload">
                <Upload className="h-4 w-4" />
              </GlassBtn>
              {uploadOpen && (
                <div className="upload-dropdown absolute left-0 top-full mt-2 rounded-xl overflow-hidden min-w-[160px] animate-scale-in z-50 shadow-2xl border border-border/60 bg-[hsl(220_20%_97%)] dark:bg-[hsl(225_15%_13%)]">
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-foreground hover:bg-foreground/5 transition-colors"
                    onClick={() => { setUploadOpen(false); onNewFolder(); }}
                  >
                    <FolderPlus className="h-4 w-4 text-foreground/60" /> New Folder
                  </button>
                  <div className="h-px bg-foreground/8 mx-3" />
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-foreground hover:bg-foreground/5 transition-colors"
                    onClick={() => { setUploadOpen(false); onNewFile(); }}
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
          )}
        </div>

        {/* Right side: theme + auth */}
        <div className="flex items-center gap-1.5 shrink-0">
          <ThemeSwitcher
            value={isDark ? "dark" : "light"}
            onValueChange={v => { if ((v === "dark") !== isDark) onToggleTheme(); }}
          />

          {isAuthenticated ? (
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="bg-secondary hover:bg-secondary/80 rounded-xl p-1 text-foreground"
              >
                <Avatar className="h-7 w-7">
                  {userInfo?.avatarUrl && !userInfo.avatarUrl.startsWith('data:') && (
                    <AvatarImage src={userInfo.avatarUrl} />
                  )}
                  <AvatarFallback className="text-xs bg-foreground/10 text-foreground">
                    {userInfo?.name?.charAt(0) || <User className="w-3 h-3" />}
                  </AvatarFallback>
                </Avatar>
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-2 bg-card border border-border rounded-2xl overflow-hidden min-w-[260px] max-w-[min(85vw,320px)] animate-scale-in z-50 border border-foreground/10 shadow-[0_14px_32px_rgba(0,0,0,0.14)]">
                  {userInfo && (
                    <div className="px-4 py-3.5">
                      <p className="text-sm font-semibold text-foreground truncate">{userInfo.name}</p>
                      {userInfo.email && (
                        <p className="text-xs text-foreground/65 break-all mt-1 leading-relaxed">{userInfo.email}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            // Connect button — liquid glass with blue hover
            <button
              onClick={login}
              className="bg-secondary hover:bg-secondary/80 rounded-xl px-4 py-2 flex items-center gap-2 text-sm font-semibold text-foreground/70 hover:text-foreground"
            >
              <LogIn className="h-4 w-4" />
              <span className="hidden sm:inline">Connect</span>
            </button>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={e => e.target.files && onUploadFile(e.target.files)}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        // @ts-ignore
        webkitdirectory=""
        directory=""
        onChange={e => e.target.files && onUploadFile(e.target.files)}
      />
    </header>
  );
}
