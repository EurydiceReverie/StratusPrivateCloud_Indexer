import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Upload, Download, FolderInput, Copy, Trash2,
  Pause, Play, X, RotateCcw, ChevronDown, ChevronUp,
  Clock, Zap, CheckCircle2, AlertCircle, Loader2, History, Search,
} from 'lucide-react';
import {
  getTransfers, getHistory, getActiveCount,
  pauseTransfer, resumeTransfer, cancelTransfer,
  retryTransfer, removeTransfer, clearCompleted, clearHistory,
  Transfer, TransferType, TransferStatus,
} from '@/lib/transfer-manager';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function formatSpeed(bps?: number): string {
  if (!bps || bps <= 0) return '';
  if (bps < 1024) return `${bps.toFixed(0)}B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(0)}KB/s`;
  return `${(bps / 1024 / 1024).toFixed(1)}MB/s`;
}

function formatEta(sec?: number): string {
  if (!sec || sec <= 0) return '';
  if (sec < 60) return `${Math.ceil(sec)}s left`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${Math.ceil(sec % 60)}s left`;
  return `${Math.floor(sec / 3600)}h left`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const TYPE_ICON: Record<TransferType, React.ReactNode> = {
  upload:   <Upload className="w-3.5 h-3.5" />,
  download: <Download className="w-3.5 h-3.5" />,
  move:     <FolderInput className="w-3.5 h-3.5" />,
  copy:     <Copy className="w-3.5 h-3.5" />,
  delete:   <Trash2 className="w-3.5 h-3.5" />,
};

const TYPE_LABEL: Record<TransferType, string> = {
  upload: 'Upload', download: 'Download', move: 'Move', copy: 'Copy', delete: 'Delete',
};

const STATUS_COLOR: Record<TransferStatus, string> = {
  pending:   'text-muted-foreground',
  active:    'text-blue-400',
  paused:    'text-yellow-400',
  done:      'text-green-400',
  failed:    'text-red-400',
  cancelled: 'text-muted-foreground',
};

// ── Single Transfer Row ───────────────────────────────────────────────────────

const TransferRow: React.FC<{ t: Transfer }> = ({ t }) => {
  const isActive  = t.status === 'active';
  const isPaused  = t.status === 'paused';
  const isFailed  = t.status === 'failed';
  const isDone    = t.status === 'done';
  const isPending = t.status === 'pending';
  const isCancelled = t.status === 'cancelled';

  return (
    <div className="flex flex-col gap-2 px-3.5 py-3 border-b border-foreground/5 last:border-0 group rounded-xl transition-all duration-200 hover:bg-foreground/[0.035]">
      <div className="flex items-center gap-2">
        {/* Status icon */}
        <span className={`shrink-0 ${STATUS_COLOR[t.status]}`}>
          {(isActive || isPending) ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : isDone ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
          ) : isFailed ? (
            <AlertCircle className="w-3.5 h-3.5 text-red-400" />
          ) : (
            TYPE_ICON[t.type]
          )}
        </span>

        {/* Name + type badge */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-foreground truncate">{t.name}</span>
            <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/60 bg-foreground/5 px-1.5 py-0.5 rounded-full">
              {TYPE_LABEL[t.type]}
            </span>
          </div>

          {/* Speed + ETA row */}
          {(isActive || isPaused) && (t.speed || t.eta) && (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
              {t.speed && t.speed > 0 && (
                <span className="flex items-center gap-0.5">
                  <Zap className="w-2.5 h-2.5 text-yellow-400" />
                  {formatSpeed(t.speed)}
                </span>
              )}
              {t.eta && t.eta > 0 && (
                <span className="flex items-center gap-0.5">
                  <Clock className="w-2.5 h-2.5 text-blue-400" />
                  {formatEta(t.eta)}
                </span>
              )}
              {t.size && (
                <span className="text-foreground/40">
                  {t.bytesTransferred ? `${formatBytes(t.bytesTransferred)} / ` : ''}{formatBytes(t.size)}
                </span>
              )}
            </div>
          )}

          {/* Done size + time */}
          {(isDone || isCancelled) && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
              {t.size && <span>{formatBytes(t.size)}</span>}
              <span>· {formatTime(t.completedAt || t.createdAt)}</span>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Pause — only uploads can be paused */}
          {isActive && t.type === 'upload' && (
            <button
              onClick={() => pauseTransfer(t.id)}
              title="Pause"
              className="bg-secondary hover:bg-secondary/80 rounded-lg p-1 hover:bg-yellow-500/10 hover:text-yellow-400 transition-colors"
            >
              <Pause className="w-3 h-3" />
            </button>
          )}
          {/* Resume */}
          {isPaused && (
            <button
              onClick={() => resumeTransfer(t.id)}
              title="Resume"
              className="bg-secondary hover:bg-secondary/80 rounded-lg p-1 hover:bg-blue-500/10 hover:text-blue-400 transition-colors"
            >
              <Play className="w-3 h-3" />
            </button>
          )}
          {/* Retry */}
          {isFailed && t._retryFn && (
            <button
              onClick={() => retryTransfer(t.id)}
              title="Retry"
              className="bg-secondary hover:bg-secondary/80 rounded-lg p-1 hover:bg-orange-500/10 hover:text-orange-400 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
          {/* Cancel */}
          {(isActive || isPaused || isPending) && (
            <button
              onClick={() => cancelTransfer(t.id)}
              title="Cancel"
              className="bg-secondary hover:bg-secondary/80 rounded-lg p-1 hover:bg-red-500/10 hover:text-red-400 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          {/* Dismiss */}
          {(isDone || isFailed || isCancelled) && (
            <button
              onClick={() => removeTransfer(t.id)}
              title="Dismiss"
              className="bg-secondary hover:bg-secondary/80 rounded-lg p-1 hover:bg-foreground/10 transition-colors"
            >
              <X className="w-3 h-3 text-foreground/40" />
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {(isActive || isPaused || isPending) && t.type !== 'delete' && (
        <div className="h-1.5 bg-foreground/8 rounded-full overflow-hidden ml-5 shadow-inner">
          <div
            className={`h-full rounded-full transition-all duration-500 shadow-[0_0_12px_rgba(59,130,246,0.35)] ${
              isPaused
                ? 'bg-yellow-400'
                : isActive
                ? 'bg-gradient-to-r from-blue-500 to-blue-400'
                : 'bg-foreground/20'
            }`}
            style={{ width: `${t.progress}%` }}
          />
        </div>
      )}

      {/* Failed retry info */}
      {isFailed && (
        <div className="ml-5 flex items-center gap-2">
          {t.error && <p className="text-[10px] text-red-400 truncate flex-1">{t.error}</p>}
          {t._retryFn && (
            <button
              onClick={() => retryTransfer(t.id)}
              className="text-[10px] text-orange-400 hover:text-orange-300 font-semibold flex items-center gap-0.5 shrink-0 transition-colors"
            >
              <RotateCcw className="w-2.5 h-2.5" /> Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ── Main Transfer Panel ───────────────────────────────────────────────────────

export const TransferPanel: React.FC = () => {
  const [transfers, setTransfers]   = useState<Transfer[]>([]);
  const [history, setHistory]       = useState<Transfer[]>([]);
  const [open, setOpen]             = useState(false);
  const [minimized, setMinimized]   = useState(false);
  const [tab, setTab]               = useState<'active' | 'history'>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch]   = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const prevActiveCount = useRef(0);

  const refresh = useCallback(() => {
    setTransfers(getTransfers());
    setHistory(getHistory());
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener('transfers-updated', refresh);
    return () => window.removeEventListener('transfers-updated', refresh);
  }, [refresh]);

  // ── Auto-expand when a new transfer starts ─────────────────────────────────
  useEffect(() => {
    const active = transfers.filter(t => ['active', 'pending'].includes(t.status)).length;
    if (active > prevActiveCount.current) {
      // New transfer started → open and un-minimize
      setOpen(true);
      setMinimized(false);
      setTab('active');
    }
    prevActiveCount.current = active;
  }, [transfers]);

  // ── Focus search input when shown ──────────────────────────────────────────
  useEffect(() => {
    if (showSearch) setTimeout(() => searchRef.current?.focus(), 50);
  }, [showSearch]);

  const activeCount    = transfers.filter(t => ['active', 'pending', 'paused'].includes(t.status)).length;
  const failedCount    = transfers.filter(t => t.status === 'failed').length;
  const activeTransfers    = transfers.filter(t => !['done', 'cancelled'].includes(t.status));
  const completedTransfers = transfers.filter(t => ['done', 'cancelled'].includes(t.status));

  // ── Filtered lists based on search ────────────────────────────────────────
  const q = searchQuery.toLowerCase().trim();
  const filteredActive    = q ? activeTransfers.filter(t => t.name.toLowerCase().includes(q) || t.type.includes(q)) : activeTransfers;
  const filteredCompleted = q ? completedTransfers.filter(t => t.name.toLowerCase().includes(q) || t.type.includes(q)) : completedTransfers;
  const filteredHistory   = q ? history.filter(t => t.name.toLowerCase().includes(q) || t.type.includes(q)) : history;

  if (transfers.length === 0 && history.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-6 z-50 w-[22rem] max-w-[calc(100vw-2rem)]">
      {/* Collapsed toggle button */}
      {!open && (
        <button
          onClick={() => { setOpen(true); setMinimized(false); }}
          className="bg-card border border-border rounded-2xl px-4 py-3 flex items-center gap-3 w-full hover:brightness-105 transition-all active:scale-[0.98]"
        >
          <div className="relative">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${activeCount > 0 ? 'bg-blue-500/20' : 'bg-foreground/5'}`}>
              {activeCount > 0
                ? <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                : <CheckCircle2 className="w-4 h-4 text-green-400" />
              }
            </div>
            {failedCount > 0 && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                <span className="text-[9px] text-white font-bold">{failedCount}</span>
              </div>
            )}
          </div>
          <div className="flex-1 text-left">
            <p className="text-xs font-semibold text-foreground">
              {activeCount > 0 ? `${activeCount} transfer${activeCount > 1 ? 's' : ''}` : 'Transfers'}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {activeCount > 0 ? 'In progress...' : `${history.length} completed`}
            </p>
          </div>
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        </button>
      )}

      {/* Expanded panel */}
      {open && (
        <div
          className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col animate-scale-in"
          style={{ maxHeight: minimized ? '52px' : '460px' }}
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-foreground/8 shrink-0">
            <span className="text-sm font-semibold text-foreground flex-1">Transfers</span>

            {/* Badges */}
            {activeCount > 0 && (
              <span className="text-[10px] font-medium bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">
                {activeCount} active
              </span>
            )}
            {failedCount > 0 && (
              <span className="text-[10px] font-medium bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">
                {failedCount} failed
              </span>
            )}

            {/* Search toggle */}
            <button
              onClick={() => { setShowSearch(s => !s); if (showSearch) setSearchQuery(''); }}
              title="Search transfers"
              className={`bg-secondary hover:bg-secondary/80 rounded-lg p-1.5 transition-colors ${showSearch ? 'text-primary bg-primary/10' : ''}`}
            >
              <Search className="w-3.5 h-3.5" />
            </button>

            {/* Minimize / restore */}
            <button onClick={() => setMinimized(m => !m)} className="bg-secondary hover:bg-secondary/80 rounded-lg p-1.5">
              {minimized ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {/* Close to pill */}
            <button onClick={() => setOpen(false)} className="bg-secondary hover:bg-secondary/80 rounded-lg p-1.5">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {!minimized && (
            <>
              {/* Search bar */}
              {showSearch && (
                <div className="px-3 py-2 border-b border-foreground/8 shrink-0">
                  <div className="flex items-center gap-2 bg-foreground/5 rounded-xl px-3 py-1.5">
                    <Search className="w-3 h-3 text-muted-foreground shrink-0" />
                    <input
                      ref={searchRef}
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search transfers..."
                      className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
                    />
                    {searchQuery && (
                      <button onClick={() => setSearchQuery('')} className="shrink-0 text-muted-foreground hover:text-foreground">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Tabs */}
              <div className="flex border-b border-foreground/8 shrink-0">
                <button
                  onClick={() => setTab('active')}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    tab === 'active'
                      ? 'text-foreground border-b-2 border-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Active {(filteredActive.length + filteredCompleted.length) > 0
                    ? `(${filteredActive.length + filteredCompleted.length})`
                    : ''}
                </button>
                <button
                  onClick={() => setTab('history')}
                  className={`flex-1 py-2 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                    tab === 'history'
                      ? 'text-foreground border-b-2 border-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <History className="w-3 h-3" />
                  History {filteredHistory.length > 0 ? `(${filteredHistory.length})` : ''}
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin">
                {tab === 'active' && (
                  <>
                    {filteredActive.length === 0 && filteredCompleted.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-8">
                        {q ? 'No matches' : 'No transfers'}
                      </p>
                    )}

                    {/* Active / in-progress */}
                    {filteredActive.length > 0 && (
                      <>
                        <div className="px-3 pt-2 pb-1">
                          <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">In Progress</span>
                        </div>
                        {filteredActive.map(t => <TransferRow key={t.id} t={t} />)}
                      </>
                    )}

                    {/* Completed / cancelled */}
                    {filteredCompleted.length > 0 && (
                      <>
                        <div className="px-3 pt-2 pb-1 flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Completed</span>
                          <button
                            onClick={clearCompleted}
                            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Clear all
                          </button>
                        </div>
                        {filteredCompleted.map(t => <TransferRow key={t.id} t={t} />)}
                      </>
                    )}
                  </>
                )}

                {tab === 'history' && (
                  <>
                    {filteredHistory.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-8">
                        {q ? 'No matches' : 'No history'}
                      </p>
                    )}
                    {filteredHistory.map(t => (
                      <div key={t.id} className="flex items-center gap-2 px-3 py-2.5 border-b border-foreground/5 last:border-0 group">
                        <span className={STATUS_COLOR[t.status]}>{TYPE_ICON[t.type]}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{t.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {formatTime(t.completedAt || t.createdAt)}
                            {' · '}{t.status}
                            {t.size ? ` · ${formatBytes(t.size)}` : ''}
                          </p>
                        </div>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.status === 'done' ? 'bg-green-400' : 'bg-red-400'}`} />
                      </div>
                    ))}
                    {history.length > 0 && (
                      <button
                        onClick={clearHistory}
                        className="w-full py-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors border-t border-foreground/8"
                      >
                        Clear History
                      </button>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
