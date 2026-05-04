import React, { useState, useEffect, useMemo } from 'react';
import {
  Upload, Download, FolderInput, Copy, Trash2, Edit3, FolderPlus,
  Search, Star, Lock, Share2, LogIn, LogOut, Eye, RotateCcw, X,
  Shield, Activity, Clock, Globe, Monitor, Filter, RefreshCw,
  AlertCircle, CheckCircle2, TrendingUp, HardDrive, Wifi, ChevronDown,
  Sun, Moon,
} from 'lucide-react';
import { readActivityLog, ActivityEntry, ActivityType, ActivityLog } from '@/lib/activity-logger';
import { useTheme } from '@/hooks/use-theme';

// ── PIN Gate ───────────────────────────────────────────────────────────────────
const REQUIRED_PIN = '74123';

const PinGate: React.FC<{ onUnlock: () => void }> = ({ onUnlock }) => {
  const [pin, setPin]     = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  const handleDigit = (d: string) => {
    if (pin.length >= 5) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 5) {
      if (next === REQUIRED_PIN) {
        setTimeout(onUnlock, 300);
      } else {
        setError(true);
        setShake(true);
        setTimeout(() => { setPin(''); setError(false); setShake(false); }, 700);
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className={`bg-card border border-border rounded-3xl p-8 w-80 flex flex-col items-center gap-6 ${shake ? 'animate-shake' : ''}`}>
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Shield className="w-7 h-7 text-primary" />
        </div>
        <div className="text-center">
          <h1 className="text-lg font-bold text-foreground">Activity Monitor</h1>
          <p className="text-sm text-muted-foreground mt-1">Enter PIN to access</p>
        </div>

        {/* PIN dots */}
        <div className="flex gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full border-2 transition-all duration-150 ${
                pin.length > i
                  ? error ? 'bg-red-500 border-red-500' : 'bg-primary border-primary'
                  : 'border-foreground/20 bg-transparent'
              }`}
            />
          ))}
        </div>

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3 w-full">
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d, i) => (
            <button
              key={i}
              onClick={() => {
                if (d === '⌫') setPin(p => p.slice(0, -1));
                else if (d) handleDigit(d);
              }}
              disabled={!d}
              className={`h-12 rounded-2xl font-semibold text-lg transition-all active:scale-95 ${
                d ? 'bg-card border border-border hover:brightness-110 text-foreground' : 'opacity-0 pointer-events-none'
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        {error && (
          <p className="text-sm text-red-400 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" /> Incorrect PIN
          </p>
        )}
      </div>
    </div>
  );
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatBytes(b?: number) {
  if (!b) return '';
  if (b < 1024) return `${b}B`;
  if (b < 1048576) return `${(b/1024).toFixed(1)}KB`;
  return `${(b/1048576).toFixed(2)}MB`;
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ms).toLocaleDateString();
}

function fullDateTime(ms: number): string {
  return new Date(ms).toLocaleString([], {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

const TYPE_ICON: Record<ActivityType, React.ReactNode> = {
  upload:          <Upload className="w-3.5 h-3.5" />,
  download:        <Download className="w-3.5 h-3.5" />,
  folder_download: <Download className="w-3.5 h-3.5" />,
  move:            <FolderInput className="w-3.5 h-3.5" />,
  copy:            <Copy className="w-3.5 h-3.5" />,
  delete:          <Trash2 className="w-3.5 h-3.5" />,
  rename:          <Edit3 className="w-3.5 h-3.5" />,
  create_folder:   <FolderPlus className="w-3.5 h-3.5" />,
  search:          <Search className="w-3.5 h-3.5" />,
  favorite_add:    <Star className="w-3.5 h-3.5" />,
  favorite_remove: <Star className="w-3.5 h-3.5 text-muted-foreground" />,
  vault_create:    <Lock className="w-3.5 h-3.5" />,
  vault_unlock:    <Lock className="w-3.5 h-3.5" />,
  vault_delete:    <Lock className="w-3.5 h-3.5" />,
  share_create:    <Share2 className="w-3.5 h-3.5" />,
  share_revoke:    <Share2 className="w-3.5 h-3.5" />,
  login:           <LogIn className="w-3.5 h-3.5" />,
  logout:          <LogOut className="w-3.5 h-3.5" />,
  preview:         <Eye className="w-3.5 h-3.5" />,
  transfer_retry:  <RotateCcw className="w-3.5 h-3.5" />,
  transfer_cancel: <X className="w-3.5 h-3.5" />,
};

const TYPE_COLOR: Record<ActivityType, string> = {
  upload:          'text-blue-400 bg-blue-500/10',
  download:        'text-green-400 bg-green-500/10',
  folder_download: 'text-green-400 bg-green-500/10',
  move:            'text-purple-400 bg-purple-500/10',
  copy:            'text-indigo-400 bg-indigo-500/10',
  delete:          'text-red-400 bg-red-500/10',
  rename:          'text-orange-400 bg-orange-500/10',
  create_folder:   'text-yellow-400 bg-yellow-500/10',
  search:          'text-cyan-400 bg-cyan-500/10',
  favorite_add:    'text-yellow-400 bg-yellow-500/10',
  favorite_remove: 'text-muted-foreground bg-foreground/5',
  vault_create:    'text-violet-400 bg-violet-500/10',
  vault_unlock:    'text-violet-400 bg-violet-500/10',
  vault_delete:    'text-red-400 bg-red-500/10',
  share_create:    'text-teal-400 bg-teal-500/10',
  share_revoke:    'text-red-400 bg-red-500/10',
  login:           'text-green-400 bg-green-500/10',
  logout:          'text-muted-foreground bg-foreground/5',
  preview:         'text-sky-400 bg-sky-500/10',
  transfer_retry:  'text-orange-400 bg-orange-500/10',
  transfer_cancel: 'text-muted-foreground bg-foreground/5',
};

const TYPE_LABEL: Record<ActivityType, string> = {
  upload: 'Upload', download: 'Download', folder_download: 'Folder ZIP',
  move: 'Move', copy: 'Copy', delete: 'Delete', rename: 'Rename',
  create_folder: 'New Folder', search: 'Search',
  favorite_add: 'Favorited', favorite_remove: 'Unfavorited',
  vault_create: 'Vault Created', vault_unlock: 'Vault Unlocked', vault_delete: 'Vault Deleted',
  share_create: 'Shared', share_revoke: 'Share Revoked',
  login: 'Login', logout: 'Logout',
  preview: 'Previewed', transfer_retry: 'Retried', transfer_cancel: 'Cancelled',
};

// ── Stat Card ─────────────────────────────────────────────────────────────────
const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string | number; sub?: string; color?: string }> = ({
  icon, label, value, sub, color = 'text-foreground'
}) => (
  <div className="bg-card border border-border rounded-3xl p-4 flex flex-col gap-2 shadow-[0_10px_30px_rgba(0,0,0,0.08)] transition-all duration-200 hover:translate-y-[-1px] hover:shadow-[0_14px_34px_rgba(0,0,0,0.10)]">
    <div className="flex items-center gap-2 text-muted-foreground text-xs">{icon}{label}</div>
    <p className={`text-2xl font-bold ${color}`}>{value}</p>
    {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
  </div>
);

// ── Entry Row ─────────────────────────────────────────────────────────────────
const EntryRow: React.FC<{ entry: ActivityEntry }> = ({ entry: e }) => {
  const [expanded, setExpanded] = useState(false);
  const colorClass = TYPE_COLOR[e.type];

  return (
    <div
      className="border-b border-foreground/5 last:border-0 hover:bg-foreground/[0.04] transition-all duration-200 cursor-pointer"
      onClick={() => setExpanded(x => !x)}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Type badge */}
        <span className={`shrink-0 w-7 h-7 rounded-xl flex items-center justify-center ${colorClass}`}>
          {TYPE_ICON[e.type]}
        </span>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">{TYPE_LABEL[e.type]}</span>
            <span className="text-xs text-muted-foreground truncate">{e.name || e.path?.split('/').pop()}</span>
            {e.size && <span className="text-[10px] text-muted-foreground/60">{formatBytes(e.size)}</span>}
          </div>
          {e.path && (
            <p className="text-[10px] text-muted-foreground/60 truncate mt-0.5">{e.path}</p>
          )}
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 shrink-0">
          {e.success
            ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
            : <AlertCircle className="w-3.5 h-3.5 text-red-400" />
          }
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">{relativeTime(e.timestampMs)}</span>
          <ChevronDown className={`w-3 h-3 text-muted-foreground/40 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-3 ml-10 grid grid-cols-2 gap-x-6 gap-y-1.5">
          <Detail label="Time" value={fullDateTime(e.timestampMs)} />
          <Detail label="Session" value={e.sessionId} />
          {e.ip && <Detail label="IP Address" value={e.ip} />}
          {e.country && <Detail label="Location" value={`${e.city ? e.city + ', ' : ''}${e.country}`} />}
          {e.fromPath && <Detail label="From" value={e.fromPath} />}
          {e.toPath && <Detail label="To" value={e.toPath} />}
          {e.error && <Detail label="Error" value={e.error} valueClass="text-red-400" />}
          {e.retryCount !== undefined && <Detail label="Retry #" value={String(e.retryCount)} />}
          <Detail label="Browser" value={e.userAgent.split(' ').slice(-1)[0] ?? e.userAgent} />
        </div>
      )}
    </div>
  );
};

const Detail: React.FC<{ label: string; value: string; valueClass?: string }> = ({ label, value, valueClass }) => (
  <div>
    <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</p>
    <p className={`text-[11px] font-medium truncate ${valueClass ?? 'text-foreground/80'}`}>{value}</p>
  </div>
);

// ── Main History Page ─────────────────────────────────────────────────────────
export const HistoryPage: React.FC = () => {
  const { isDark, toggle: toggleTheme } = useTheme();
  const [unlocked, setUnlocked] = useState(false);
  const [log, setLog]           = useState<ActivityLog | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [search, setSearch]     = useState('');
  const [typeFilter, setTypeFilter] = useState<ActivityType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failed'>('all');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await readActivityLog();
      setLog(data);
      if (!data) setError('No activity log found in Dropbox yet. Start using the app to generate logs.');
    } catch (e) {
      setError('Failed to load activity log from Dropbox.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (unlocked) load(); }, [unlocked]);

  // ── Derived stats ─────────────────────────────────────────────────────────
  const entries = log?.entries ?? [];

  const stats = useMemo(() => {
    const uploads    = entries.filter(e => e.type === 'upload');
    const downloads  = entries.filter(e => ['download', 'folder_download'].includes(e.type));
    const deletes    = entries.filter(e => e.type === 'delete');
    const retries    = entries.filter(e => e.type === 'transfer_retry');
    const failures   = entries.filter(e => !e.success);
    const totalBytes = entries.reduce((s, e) => s + (e.size ?? 0), 0);
    const uniqueIps  = [...new Set(entries.map(e => e.ip).filter(Boolean))];
    const sessions   = [...new Set(entries.map(e => e.sessionId))];
    return { uploads, downloads, deletes, retries, failures, totalBytes, uniqueIps, sessions };
  }, [entries]);

  // ── Filtered entries ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (typeFilter !== 'all' && e.type !== typeFilter) return false;
      if (statusFilter === 'success' && !e.success) return false;
      if (statusFilter === 'failed' && e.success) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          (e.name ?? '').toLowerCase().includes(q) ||
          (e.path ?? '').toLowerCase().includes(q) ||
          (e.ip ?? '').includes(q) ||
          e.type.includes(q)
        );
      }
      return true;
    });
  }, [entries, typeFilter, statusFilter, search]);

  if (!unlocked) return <PinGate onUnlock={() => setUnlocked(true)} />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border border-border border-b border-foreground/8 px-6 py-4 flex items-center gap-4">
        <div className="w-9 h-9 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Activity className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-foreground">Activity Monitor</h1>
          <p className="text-xs text-muted-foreground">
            {log ? `${log.totalEvents} total events · Last updated ${relativeTime(new Date(log.lastUpdated).getTime())}` : 'Stratus Drive — Activity Log'}
          </p>
        </div>
        <button
          onClick={toggleTheme}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="bg-secondary hover:bg-secondary/80 rounded-xl p-2"
        >
          {isDark
            ? <Sun className="w-4 h-4 text-yellow-400" />
            : <Moon className="w-4 h-4 text-primary" />
          }
        </button>
        <button
          onClick={load}
          disabled={loading}
          className="bg-secondary hover:bg-secondary/80 rounded-xl px-3 py-2 flex items-center gap-1.5 text-xs font-medium"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {error && (
          <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3 border border-red-500/20">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        )}

        {/* Stats Grid */}
        {log && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              icon={<TrendingUp className="w-3.5 h-3.5" />}
              label="Total Events"
              value={log.totalEvents}
              sub={`${entries.length} in log`}
              color="text-primary"
            />
            <StatCard
              icon={<Upload className="w-3.5 h-3.5" />}
              label="Uploads"
              value={stats.uploads.length}
              sub={formatBytes(stats.totalBytes) || 'No size data'}
              color="text-blue-400"
            />
            <StatCard
              icon={<Download className="w-3.5 h-3.5" />}
              label="Downloads"
              value={stats.downloads.length}
              sub={`${stats.retries.length} retries`}
              color="text-green-400"
            />
            <StatCard
              icon={<AlertCircle className="w-3.5 h-3.5" />}
              label="Failures"
              value={stats.failures.length}
              sub={`${stats.deletes.length} deletes`}
              color={stats.failures.length > 0 ? 'text-red-400' : 'text-foreground'}
            />
            <StatCard
              icon={<Wifi className="w-3.5 h-3.5" />}
              label="Unique IPs"
              value={stats.uniqueIps.length}
              sub={stats.uniqueIps[0] ?? 'None recorded'}
              color="text-cyan-400"
            />
            <StatCard
              icon={<Monitor className="w-3.5 h-3.5" />}
              label="Sessions"
              value={stats.sessions.length}
              color="text-purple-400"
            />
            <StatCard
              icon={<Clock className="w-3.5 h-3.5" />}
              label="Last Activity"
              value={entries[0] ? relativeTime(entries[0].timestampMs) : '—'}
              sub={entries[0] ? TYPE_LABEL[entries[0].type] : ''}
            />
            <StatCard
              icon={<Globe className="w-3.5 h-3.5" />}
              label="Countries"
              value={[...new Set(entries.map(e => e.country).filter(Boolean))].length || '—'}
              sub={[...new Set(entries.map(e => e.country).filter(Boolean))].join(', ').slice(0, 30) || 'No geo data'}
              color="text-teal-400"
            />
          </div>
        )}

        {/* IP / Session breakdown */}
        {log && stats.uniqueIps.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-4">
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary" /> Access Origins
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {stats.uniqueIps.map(ip => {
                const ipEntries = entries.filter(e => e.ip === ip);
                const sample = ipEntries[0];
                return (
                  <div key={ip} className="bg-foreground/4 rounded-2xl p-3 transition-all duration-200 hover:bg-foreground/[0.06]">
                    <p className="text-xs font-mono font-semibold text-foreground">{ip}</p>
                    {sample?.country && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {sample.city ? `${sample.city}, ` : ''}{sample.country}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground">{ipEntries.length} events</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Log table */}
        {log && (
          <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-[0_12px_34px_rgba(0,0,0,0.08)]">
            {/* Filters */}
            <div className="px-4 py-3 border-b border-foreground/8 flex flex-wrap items-center gap-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 flex-1">
                <Activity className="w-4 h-4 text-primary" />
                Event Log
                <span className="text-xs text-muted-foreground font-normal">({filtered.length} shown)</span>
              </h2>

              {/* Search */}
              <div className="flex items-center gap-2 bg-foreground/5 rounded-xl px-3 py-1.5 min-w-48">
                <Search className="w-3 h-3 text-muted-foreground shrink-0" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search events..."
                  className="bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none flex-1"
                />
              </div>

              {/* Type filter */}
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value as ActivityType | 'all')}
                className="bg-foreground/5 text-xs text-foreground rounded-xl px-3 py-1.5 outline-none border-0"
              >
                <option value="all">All Types</option>
                <option value="upload">Upload</option>
                <option value="download">Download</option>
                <option value="folder_download">Folder ZIP</option>
                <option value="move">Move</option>
                <option value="copy">Copy</option>
                <option value="delete">Delete</option>
                <option value="rename">Rename</option>
                <option value="create_folder">New Folder</option>
                <option value="favorite_add">Favorited</option>
                <option value="favorite_remove">Unfavorited</option>
                <option value="share_create">Shared</option>
                <option value="vault_unlock">Vault</option>
                <option value="preview">Preview</option>
                <option value="transfer_retry">Retry</option>
              </select>

              {/* Status filter */}
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as 'all' | 'success' | 'failed')}
                className="bg-foreground/5 text-xs text-foreground rounded-xl px-3 py-1.5 outline-none border-0"
              >
                <option value="all">All Status</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            {/* Entries */}
            <div className="max-h-[600px] overflow-y-auto">
              {loading && (
                <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Loading activity log...</span>
                </div>
              )}
              {!loading && filtered.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-12">No events match your filters.</p>
              )}
              {!loading && filtered.map(e => <EntryRow key={e.id} entry={e} />)}
            </div>
          </div>
        )}

        {!log && !loading && !error && (
          <div className="bg-card border border-border rounded-2xl p-12 text-center">
            <Activity className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Loading activity log...</p>
          </div>
        )}
      </div>
    </div>
  );
};
