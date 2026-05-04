import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { QRCodeSVG } from 'qrcode.react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import {
  createShareLink, loadLinks, revokeLink, deleteLink,
  getShareUrl, isLinkActive, isLinkExpired, formatExpiry, ShareLink,
} from '@/lib/links-manager';
import { useAuth } from '@/context/AuthContext';
import { DBXFile } from '@/services/dropbox-service';
import {
  Copy, Link2, Trash2, ShieldCheck, Clock, Eye, Loader2, RefreshCw,
  Flame, Check, ChevronDown, QrCode, BarChart2, Hash, MessageSquare,
  User, Infinity as InfinityIcon, Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { logActivity } from '@/lib/activity-logger';

interface ShareDialogProps {
  open: boolean;
  file: DBXFile | null;
  onClose: () => void;
}

type ExpiryOption = 'permanent' | '1h' | '6h' | '24h' | '48h' | '7d' | '30d';
const EXPIRY_HOURS: Record<ExpiryOption, number | null> = {
  permanent: null, '1h': 1, '6h': 6, '24h': 24, '48h': 48, '7d': 168, '30d': 720,
};
const EXPIRY_LABELS: Record<ExpiryOption, string> = {
  permanent: 'Never expires', '1h': '1 Hour', '6h': '6 Hours',
  '24h': '24 Hours', '48h': '48 Hours', '7d': '7 Days', '30d': '30 Days',
};
const EXPIRY_OPTIONS: ExpiryOption[] = ['permanent', '1h', '6h', '24h', '48h', '7d', '30d'];

// ── Expiry picker ─────────────────────────────────────────────────────────────
const ExpiryPicker: React.FC<{ value: ExpiryOption; onChange: (v: ExpiryOption) => void }> = ({ value, onChange }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} className="share-picker-btn">
        <Clock className="w-4 h-4 text-primary shrink-0" />
        <span className="flex-1 text-left text-[15px]">{EXPIRY_LABELS[value]}</span>
        <ChevronDown className={`w-4 h-4 text-foreground/40 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="share-picker-dropdown">
          {EXPIRY_OPTIONS.map(opt => (
            <button key={opt} onClick={() => { onChange(opt); setOpen(false); }}
              className={`share-picker-option ${value === opt ? 'share-picker-option--active' : ''}`}>
              <span>{EXPIRY_LABELS[opt]}</span>
              {value === opt && <Check className="w-4 h-4 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Toggle row ────────────────────────────────────────────────────────────────
const ToggleRow: React.FC<{
  icon: React.ReactNode; label: string; sub?: string;
  checked: boolean; onChange: (v: boolean) => void;
  color?: 'blue' | 'orange' | 'purple' | 'green';
}> = ({ icon, label, sub, checked, onChange, color = 'blue' }) => (
  <div className="share-toggle-row" data-color={color}
    onClick={() => onChange(!checked)}>
    <div className="share-toggle-icon">{icon}</div>
    <div className="flex-1 min-w-0">
      <p className="text-[15px] font-medium leading-tight">{label}</p>
      {sub && <p className="text-xs text-foreground/45 mt-0.5 leading-tight">{sub}</p>}
    </div>
    <Switch checked={checked} onCheckedChange={onChange} onClick={e => e.stopPropagation()} />
  </div>
);

// ── Analytics chart for a link ────────────────────────────────────────────────
const LinkAnalyticsChart: React.FC<{ link: ShareLink }> = ({ link }) => {
  const log = link.accessLog ?? [];
  if (log.length === 0) return (
    <p className="text-xs text-foreground/40 text-center py-3">No access data yet</p>
  );
  // Group by day
  const byDay: Record<string, number> = {};
  log.forEach(entry => {
    const d = new Date(entry.time).toLocaleDateString('en', { month: 'short', day: 'numeric' });
    byDay[d] = (byDay[d] ?? 0) + 1;
  });
  const data = Object.entries(byDay).slice(-7).map(([date, count]) => ({ date, count }));
  return (
    <div className="pt-1">
      <ResponsiveContainer width="100%" height={80}>
        <BarChart data={data} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
          <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'currentColor', opacity: 0.4 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 9, fill: 'currentColor', opacity: 0.4 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: 'rgba(0,0,0,0.8)', border: 'none', borderRadius: 8, fontSize: 11 }}
            labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
            itemStyle={{ color: 'white' }}
          />
          <Bar dataKey="count" fill="hsl(211 100% 50%)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// ── Tab bar ───────────────────────────────────────────────────────────────────
const TabBar: React.FC<{
  tab: 'create' | 'manage'; setTab: (t: 'create' | 'manage') => void;
  badgeCount: number; loading: boolean; onRefresh: () => void;
}> = ({ tab, setTab, badgeCount, loading, onRefresh }) => (
  <div className="share-tab-bar">
    <div className={`share-tab-pill ${tab === 'manage' ? 'share-tab-pill--manage' : ''}`} />
    {(['create', 'manage'] as const).map(t => (
      <button key={t} onClick={() => setTab(t)}
        className={`share-tab-btn ${tab === t ? 'share-tab-btn--active' : ''}`}>
        {t === 'create' ? 'Create Link' : 'Manage'}
        {t === 'manage' && badgeCount > 0 && (
          <span className={`share-tab-badge ${tab === 'manage' ? 'share-tab-badge--active' : ''}`}>{badgeCount}</span>
        )}
      </button>
    ))}
    <button onClick={onRefresh} className="share-tab-refresh" title="Refresh">
      <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
    </button>
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────
export const ShareDialog: React.FC<ShareDialogProps> = ({ open, file, onClose }) => {
  const { userInfo } = useAuth();

  // Create form state
  const [expiry, setExpiry] = useState<ExpiryOption>('24h');
  const [pinEnabled, setPinEnabled] = useState(false);
  const [pin, setPin] = useState('');
  const [oneTime, setOneTime] = useState(false);
  const [maxViewsEnabled, setMaxViewsEnabled] = useState(false);
  const [maxViews, setMaxViews] = useState('10');
  const [aliasEnabled, setAliasEnabled] = useState(false);
  const [alias, setAlias] = useState('');
  const [aliasError, setAliasError] = useState('');
  const [messageEnabled, setMessageEnabled] = useState(false);
  const [message, setMessage] = useState('');
  const [showQr, setShowQr] = useState(false);

  // Shared state
  const [createdLink, setCreatedLink] = useState<ShareLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<'create' | 'manage'>('create');
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [expandedChart, setExpandedChart] = useState<string | null>(null);

  const fileLinks = file ? links.filter(l => l.filePath === file.path) : [];
  const activeLinks = fileLinks.filter(isLinkActive);

  useEffect(() => {
    if (open) {
      setCreatedLink(null); setTab('create'); setPin(''); setPinEnabled(false);
      setOneTime(false); setMaxViewsEnabled(false); setMaxViews('10');
      setAliasEnabled(false); setAlias(''); setAliasError('');
      setMessageEnabled(false); setMessage(''); setShowQr(false); setCopied(false);
      fetchLinks();
    }
  }, [open]); // eslint-disable-line

  const fetchLinks = async () => {
    setLoadingLinks(true);
    try { setLinks(await loadLinks()); } catch {}
    setLoadingLinks(false);
  };

  const handleTabChange = (t: 'create' | 'manage') => {
    if (t === tab) return;
    setTab(t);
    if (t === 'manage') fetchLinks();
  };

  const handleCreate = async () => {
    if (!file) return;
    if (pinEnabled && pin.length < 4) { toast.error('PIN must be at least 4 digits'); return; }
    if (aliasEnabled && alias.length < 2) { toast.error('Alias must be at least 2 characters'); return; }
    const mv = maxViewsEnabled ? parseInt(maxViews) : null;
    if (maxViewsEnabled && (!mv || mv < 1)) { toast.error('Max views must be at least 1'); return; }
    setCreating(true);
    setAliasError('');
    try {
      const link = await createShareLink({
        fileName: file.name,
        filePath: file.path,
        fileSize: file.size,
        isFolder: file.isFolder,
        isVaultFile: file.isVaultFile,
        expiryHours: EXPIRY_HOURS[expiry],
        pin: pinEnabled ? pin : undefined,
        oneTime: oneTime || (maxViewsEnabled && mv === 1),
        maxViews: mv,
        alias: aliasEnabled ? alias : undefined,
        sharedBy: userInfo?.name || 'Stratus User',
        message: messageEnabled ? message : undefined,
      });
      setCreatedLink(link);
      setLinks(prev => [...prev, link]);
      toast.success('Share link created');
      logActivity('share_create', { path: file.path, name: file.name, size: file.size, success: true });
    } catch (e: any) {
      if (e?.message === 'ALIAS_TAKEN') {
        setAliasError('This alias is already in use. Try another.');
        toast.error('Alias already taken');
      } else {
        toast.error('Failed to create link');
      }
      logActivity('share_create', { path: file?.path, name: file?.name, success: false, error: e?.message ?? 'Failed' });
    }
    setCreating(false);
  };

  const copyUrl = async (link: ShareLink) => {
    const url = getShareUrl(link.alias || link.id);
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success('Copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRevoke = async (id: string) => {
    setRevoking(id);
    const link = links.find(l => l.id === id);
    try {
      await revokeLink(id);
      setLinks(prev => prev.map(l => l.id === id ? { ...l, revoked: true } : l));
      toast.success('Link revoked');
      logActivity('share_revoke', { path: link?.filePath, name: link?.fileName, success: true });
    } catch {
      toast.error('Failed to revoke');
      logActivity('share_revoke', { path: link?.filePath, name: link?.fileName, success: false, error: 'Revoke failed' });
    }
    setRevoking(null);
  };

  const handleDelete = async (id: string) => {
    setRevoking(id);
    const link = links.find(l => l.id === id);
    try {
      await deleteLink(id);
      setLinks(prev => prev.filter(l => l.id !== id));
      toast.success('Link deleted');
      logActivity('share_revoke', { path: link?.filePath, name: link?.fileName, success: true });
    } catch {
      toast.error('Failed to delete');
      logActivity('share_revoke', { path: link?.filePath, name: link?.fileName, success: false, error: 'Delete failed' });
    }
    setRevoking(null);
  };

  const shareUrl = createdLink ? getShareUrl(createdLink.alias || createdLink.id) : '';

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="share-dialog-content">
        {/* Header */}
        <div className="share-header">
          <div className="share-header-icon"><Link2 className="w-5 h-5 text-white" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-semibold leading-tight truncate">Share File</p>
            <p className="text-xs text-foreground/45 mt-0.5 truncate">{file?.name}</p>
          </div>
        </div>

        {/* Tab bar */}
        <TabBar tab={tab} setTab={handleTabChange} badgeCount={activeLinks.length} loading={loadingLinks} onRefresh={fetchLinks} />

        {/* Sliding viewport */}
        <div className="share-tabs-viewport">
          <div className={`share-tabs-track ${tab === 'manage' ? 'share-tabs-track--manage' : ''}`}>

            {/* ── CREATE PANEL ── */}
            <div className="share-tab-panel pr-3">
              {!createdLink ? (
                <>
                  {/* Scrollable fields */}
                  <div className="share-panel-scroll space-y-3 modal-scroll">
                    {/* Expiry */}
                    <ExpiryPicker value={expiry} onChange={setExpiry} />

                    {/* Primary toggles card */}
                    <div className="share-card">
                      <ToggleRow icon={<ShieldCheck className="w-4 h-4" />} label="PIN Protection" sub="Require a code to access"
                        checked={pinEnabled} onChange={setPinEnabled} color="blue" />
                      {pinEnabled && (
                        <div className="px-3 pb-3">
                          <Input type="password" inputMode="numeric" maxLength={8} placeholder="Enter PIN (4–8 digits)"
                            value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} autoFocus className="share-input" />
                        </div>
                      )}
                      <div className="share-card-divider" />
                      {/* One-Time — dimmed when Max Views is on */}
                      <div className={`transition-all duration-200 ${maxViewsEnabled ? 'opacity-35 pointer-events-none select-none' : ''}`}>
                        <ToggleRow icon={<Flame className="w-4 h-4" />}
                          label="One-Time Link"
                          sub={maxViewsEnabled ? 'Disabled — Max Views is on' : 'Auto-deletes after first use'}
                          checked={oneTime}
                          onChange={v => { setOneTime(v); if (v) { setMaxViewsEnabled(false); setMaxViews('10'); } }}
                          color="orange" />
                      </div>
                      <div className="share-card-divider" />
                      {/* Max Views — dimmed when One-Time is on */}
                      <div className={`transition-all duration-200 ${oneTime ? 'opacity-35 pointer-events-none select-none' : ''}`}>
                        <ToggleRow icon={<Eye className="w-4 h-4" />}
                          label="Max Views"
                          sub={oneTime ? 'Disabled — One-Time is on' : 'Auto-revoke after N downloads'}
                          checked={maxViewsEnabled}
                          onChange={v => { setMaxViewsEnabled(v); if (v) setOneTime(false); }}
                          color="green" />
                        {maxViewsEnabled && !oneTime && (
                          <div className="px-3 pb-3">
                            <Input type="number" min={1} max={9999} placeholder="e.g. 5"
                              value={maxViews} onChange={e => setMaxViews(e.target.value)} className="share-input" />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Optional fields card */}
                    <div className="share-card">
                      <ToggleRow icon={<Hash className="w-4 h-4" />} label="Custom Alias" sub="Set a custom URL slug"
                        checked={aliasEnabled} onChange={setAliasEnabled} color="purple" />
                      {aliasEnabled && (
                        <div className="px-3 pb-3 space-y-1">
                          <div className="flex items-center gap-2 share-input rounded-xl px-3 py-2 h-auto">
                            <span className="text-xs text-foreground/40 shrink-0">/share/</span>
                            <input className="flex-1 bg-transparent text-[15px] outline-none min-w-0"
                              placeholder="my-cool-file" value={alias}
                              onChange={e => { setAlias(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, '-')); setAliasError(''); }} />
                          </div>
                          {aliasError && <p className="text-xs text-red-400">{aliasError}</p>}
                        </div>
                      )}
                      <div className="share-card-divider" />
                      <ToggleRow icon={<MessageSquare className="w-4 h-4" />} label="Add Message" sub="Note shown to recipient"
                        checked={messageEnabled} onChange={setMessageEnabled} color="blue" />
                      {messageEnabled && (
                        <div className="px-3 pb-3">
                          <textarea
                            placeholder="Add a personal message for the recipient…"
                            value={message} onChange={e => setMessage(e.target.value)} maxLength={280} rows={3}
                            className="share-input w-full rounded-xl px-3 py-2.5 text-[14px] resize-none h-auto"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Sticky Generate button */}
                  <div className="share-panel-footer">
                    <button onClick={handleCreate} disabled={creating} className="share-btn-primary w-full justify-center">
                      {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                      <span>{creating ? 'Generating…' : 'Generate Link'}</span>
                    </button>
                  </div>
                </>
              ) : (
                /* ── Success state ── */
                <div className="share-panel-scroll modal-scroll space-y-3 pb-5">
                  {/* QR toggle */}
                  <div className="flex items-center justify-between px-1">
                    <p className="text-[11px] text-foreground/45 font-medium uppercase tracking-wide">Share Link</p>
                    <button onClick={() => setShowQr(q => !q)}
                      className={`share-badge cursor-pointer transition-colors ${showQr ? 'share-badge--blue' : 'share-badge--neutral'}`}>
                      <QrCode className="w-3 h-3" /> {showQr ? 'Hide QR' : 'QR Code'}
                    </button>
                  </div>

                  {/* QR code */}
                  {showQr && (
                    <div className="flex justify-center p-4 rounded-2xl bg-white">
                      <QRCodeSVG value={shareUrl} size={160} includeMargin level="M"
                        imageSettings={{ src: '/favicon.ico', width: 24, height: 24, excavate: true }} />
                    </div>
                  )}

                  {/* URL box */}
                  <div className="share-url-box">
                    <p className="font-mono text-xs text-foreground/80 break-all leading-relaxed">{shareUrl}</p>
                  </div>

                  {/* Badges */}
                  <div className="flex items-center gap-2 flex-wrap px-1">
                    <span className="share-badge share-badge--neutral"><Clock className="w-3 h-3" />{formatExpiry(createdLink)}</span>
                    {createdLink.pinHash && <span className="share-badge share-badge--blue"><ShieldCheck className="w-3 h-3" />PIN</span>}
                    {createdLink.alias && <span className="share-badge share-badge--blue"><Hash className="w-3 h-3" />{createdLink.alias}</span>}
                    {createdLink.oneTime && <span className="share-badge share-badge--orange"><Flame className="w-3 h-3" />One-time</span>}
                    {createdLink.maxViews && !createdLink.oneTime && (
                      <span className="share-badge share-badge--orange"><Eye className="w-3 h-3" />Max {createdLink.maxViews}</span>
                    )}
                    {createdLink.message && <span className="share-badge share-badge--neutral"><MessageSquare className="w-3 h-3" />Message</span>}
                  </div>

                  {createdLink.pinHash && (
                    <p className="share-hint share-hint--amber">Share the PIN separately — it's not included in the link.</p>
                  )}

                  <div className="flex gap-2.5">
                    <button onClick={() => copyUrl(createdLink)} className="share-btn-primary flex-1 justify-center">
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      <span>{copied ? 'Copied!' : 'Copy Link'}</span>
                    </button>
                    <button onClick={() => { setCreatedLink(null); setPin(''); setPinEnabled(false); setOneTime(false); setShowQr(false); setCopied(false); setAliasEnabled(false); setAlias(''); setMessageEnabled(false); setMessage(''); setMaxViewsEnabled(false); }}
                      className="share-btn-secondary px-4">New Link</button>
                  </div>
                </div>
              )}
            </div>

            {/* ── MANAGE PANEL ── */}
            <div className="share-tab-panel pl-3">
              <div className="space-y-2 max-h-[340px] overflow-y-auto modal-scroll -mx-1 px-1 pb-1">
                {loadingLinks && <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary/60" /></div>}
                {!loadingLinks && fileLinks.length === 0 && (
                  <div className="text-center py-10 space-y-1">
                    <Link2 className="w-8 h-8 mx-auto text-foreground/20" />
                    <p className="text-sm text-foreground/40">No links for this file</p>
                  </div>
                )}
                {!loadingLinks && fileLinks.map(link => {
                  const expired = isLinkExpired(link);
                  const active = isLinkActive(link);
                  const logs = link.accessLog ?? [];
                  const isLogExpanded = expandedLog === link.id;
                  const isChartExpanded = expandedChart === link.id;
                  const linkUrl = getShareUrl(link.alias || link.id);
                  const viewsLeft = link.maxViews ? Math.max(0, link.maxViews - (link.downloadCount ?? 0)) : null;

                  return (
                    <div key={link.id} className={`share-link-row flex-col items-stretch gap-2 ${!active ? 'opacity-40' : ''}`}>
                      {/* Top row */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <p className="text-xs font-mono text-foreground/40 truncate">
                            {link.alias ? `/${link.alias}` : link.id.slice(0, 20) + '…'}
                          </p>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`share-badge ${link.revoked ? 'share-badge--red' : expired ? 'share-badge--red' : 'share-badge--blue'}`}>
                              {link.revoked ? 'Revoked' : expired ? 'Expired' : formatExpiry(link)}
                            </span>
                            {link.pinHash && <span className="share-badge share-badge--blue"><ShieldCheck className="w-2.5 h-2.5" />PIN</span>}
                            {link.oneTime && <span className="share-badge share-badge--orange"><Flame className="w-2.5 h-2.5" />1×</span>}
                            {link.maxViews && !link.oneTime && (
                              <span className={`share-badge ${viewsLeft === 0 ? 'share-badge--red' : 'share-badge--orange'}`}>
                                <Eye className="w-2.5 h-2.5" />{viewsLeft} left
                              </span>
                            )}
                            {/* Views badge — clickable for log */}
                            <button
                              onClick={() => setExpandedLog(isLogExpanded ? null : link.id)}
                              className="share-badge share-badge--neutral hover:bg-primary/10 transition-colors cursor-pointer"
                              title="Page views"
                            >
                              <Eye className="w-2.5 h-2.5" />{link.accessCount} view{link.accessCount !== 1 ? 's' : ''}
                              {logs.length > 0 && <ChevronDown className={`w-2.5 h-2.5 ml-0.5 transition-transform duration-200 ${isLogExpanded ? 'rotate-180' : ''}`} />}
                            </button>
                            {/* Downloads badge */}
                            <span className="share-badge share-badge--neutral" title="Downloads">
                              <Download className="w-2.5 h-2.5" />{link.downloadCount ?? 0} dl
                              {link.maxViews && <span className="opacity-50 ml-0.5">/{link.maxViews}</span>}
                            </span>
                            {/* Chart toggle */}
                            {logs.length > 0 && (
                              <button
                                onClick={() => setExpandedChart(isChartExpanded ? null : link.id)}
                                className="share-badge share-badge--neutral hover:bg-primary/10 transition-colors cursor-pointer"
                              >
                                <BarChart2 className="w-2.5 h-2.5" />
                                <ChevronDown className={`w-2.5 h-2.5 transition-transform duration-200 ${isChartExpanded ? 'rotate-180' : ''}`} />
                              </button>
                            )}
                          </div>
                        </div>
                        {/* Action buttons */}
                        <div className="flex items-center gap-0.5 shrink-0">
                          {active && (
                            <button onClick={() => { navigator.clipboard.writeText(linkUrl); toast.success('Copied!'); }}
                              className="share-icon-btn" title="Copy"><Copy className="w-3.5 h-3.5" /></button>
                          )}
                          {!link.revoked && !expired && (
                            <button onClick={() => handleRevoke(link.id)} disabled={revoking === link.id}
                              className="share-icon-btn share-icon-btn--amber" title="Revoke">
                              {revoking === link.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          <button onClick={() => handleDelete(link.id)} disabled={revoking === link.id}
                            className="share-icon-btn share-icon-btn--red" title="Delete">
                            {revoking === link.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      {/* Analytics chart */}
                      {isChartExpanded && <LinkAnalyticsChart link={link} />}

                      {/* Access log */}
                      {isLogExpanded && logs.length > 0 && (
                        <div className="share-access-log">
                          {logs.slice(-10).reverse().map((entry, i) => (
                            <div key={i} className="share-access-log-row">
                              <span className="text-[10px] font-mono text-foreground/50 shrink-0">
                                {new Date(entry.time).toLocaleString()}
                              </span>
                              <span className="text-[10px] text-foreground/60 font-medium truncate">{entry.ip}</span>
                              <span className="text-[10px] text-foreground/40 truncate">{entry.device}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

          </div>{/* end share-tabs-track */}
        </div>{/* end share-tabs-viewport */}
      </DialogContent>
    </Dialog>
  );
};
