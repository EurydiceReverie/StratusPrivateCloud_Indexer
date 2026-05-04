import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { getAppHomePath } from '@/lib/app-mode';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import {
  loadStatusBundle,
  runStatusMonitorCycle,
  type ReportWindow,
  type StatusBundle,
  type StatusReport,
  type StatusSeverity,
} from '@/lib/status-reports';
import { SystemComponentRow, UptimeBar } from '@/components/UptimeBar';
import { CryptoEngineSwitch } from '@/components/CryptoEngineSwitch';

const WINDOWS: ReportWindow[] = ['daily', 'weekly', 'monthly', 'yearly'];
const WINDOW_LABELS: Record<ReportWindow, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };

function formatDateTime(ts: number | null): string {
  return ts ? new Date(ts).toLocaleString() : '—';
}

function severityCopy(severity: StatusSeverity | null) {
  switch (severity) {
    case 'degraded':
      return { title: "We're experiencing issues", dot: 'hsl(0 84% 60%)', msg: 'Critical disruption detected in stored system checks.' };
    case 'monitoring':
      return { title: 'We are monitoring elevated risk', dot: 'hsl(38 96% 58%)', msg: 'The system is up, but one or more health indicators need attention.' };
    case 'operational':
      return { title: "We're fully operational", dot: 'hsl(192 100% 52%)', msg: "All systems are operating normally. We're not aware of any issues." };
    default:
      return { title: 'No status data yet', dot: 'hsl(220 14% 50%)', msg: 'Hit Refresh to create the first stored snapshot.' };
  }
}

const LEGEND_ITEMS = [
  { bg: 'linear-gradient(175deg,hsl(192 100% 58%/0.82),hsl(199 100% 44%/0.68))', border: 'hsl(192 100% 72%/0.38)', glow: 'hsl(199 100% 50%/0.40)', label: 'Operational' },
  { bg: 'linear-gradient(175deg,hsl(38 96% 58%/0.82),hsl(38 96% 44%/0.68))',     border: 'hsl(38 96% 70%/0.35)',  glow: 'hsl(38 96% 50%/0.32)',  label: 'Degraded performance' },
  { bg: 'linear-gradient(175deg,hsl(0 84% 60%/0.82),hsl(0 84% 46%/0.68))',       border: 'hsl(0 84% 72%/0.35)',   glow: 'hsl(0 84% 52%/0.32)',   label: 'Outage' },
  { bg: 'hsl(220 20% 100%/0.07)',                                                  border: 'hsl(220 20% 100%/0.08)',glow: 'none',                  label: 'No data' },
];

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-5">
      {LEGEND_ITEMS.map(({ bg, border, glow, label }) => (
        <div key={label} className="flex items-center gap-2">
          <span
            className="inline-block h-[14px] w-7 rounded-[3px] border backdrop-blur-sm"
            style={{
              background: bg,
              borderColor: border,
              boxShadow: glow === 'none' ? 'none' : `0 1px 5px ${glow}, inset 0 1px 0 rgba(255,255,255,0.18)`,
            }}
          />
          <span style={{ fontSize: 11, color: 'hsl(220 14% 54%)', letterSpacing: '0.01em' }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

function ReportRow({ label, value, dark }: { label: string; value: string; dark: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 px-4 py-3 border-t first:border-0 ${dark ? 'border-white/8' : 'border-slate-100'}`}>
      <span className={`text-sm ${dark ? 'text-slate-300' : 'text-slate-600'}`}>{label}</span>
      <span className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-900'}`}>{value}</span>
    </div>
  );
}

function ReportPanel({ report, dark }: { report: StatusReport | null; dark: boolean }) {
  const border = dark ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-white';
  if (!report) return (
    <div className={`rounded-2xl border px-4 py-5 text-sm ${border} ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
      No stored report yet for this window.
    </div>
  );
  return (
    <div className={`overflow-hidden rounded-2xl border backdrop-blur-xl ${border}`}>
      {[
        ['Samples', String(report.sampleCount)],
        ['Uptime', `${report.uptimePercent}%`],
        ['Degraded checks', String(report.degradedCount)],
        ['Avg storage', `${report.avgStorageUsedPercent}%`],
        ['Peak storage', `${report.maxStorageUsedPercent}%`],
        ['Summed failures (24h)', String(report.failures24hTotal)],
        ['Peak accessible vaults', String(report.activeVaultsPeak)],
        ['Window', `${new Date(report.from).toLocaleDateString()} → ${new Date(report.to).toLocaleDateString()}`],
      ].map(([l, v]) => <ReportRow key={l} label={l} value={v} dark={dark} />)}
    </div>
  );
}

function vaultSeverity(accessible: number | undefined, total: number | undefined): StatusSeverity | null {
  // "accessible" in new snapshots = configured vaults (passwordPacket/keySalt present).
  // In OLD snapshots captured before this fix it = session-unlocked count (always 0 at load time).
  // Rule: if total > 0 and accessible = 0, treat as monitoring (not outage) because
  // the most likely explanation is stale snapshot data, not a real failure.
  if (accessible === undefined || total === undefined) return null;
  if (total === 0) return 'operational';        // no vaults at all — fine
  if (accessible > 0) return 'operational';    // at least some configured/accessible
  return 'monitoring';                          // vaults exist but accessible=0 — needs refresh
}

export default function StatusPage() {
  const { isDark, toggle } = useTheme();
  const { isAuthenticated } = useAuth();
  const { pathname } = useLocation();
  const homePath = getAppHomePath(pathname);
  const [bundle, setBundle] = useState<StatusBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedWindow, setSelectedWindow] = useState<ReportWindow>('daily');

  const latest = bundle?.index.snapshots[0] ?? null;
  const copy = severityCopy(latest?.severity ?? null);
  const notes = useMemo(() => latest?.notes ?? [], [latest]);

  const load = async (force = false) => {
    setRefreshing(true);
    try {
      const next = force && isAuthenticated
        ? await runStatusMonitorCycle(isAuthenticated, true)
        : await loadStatusBundle();
      if (next) setBundle(next);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { void load(false); }, []);

  // ── theme-aware style tokens ──────────────────────────────────────────────────
  const bg   = isDark ? 'bg-[radial-gradient(ellipse_at_top,rgba(0,148,255,0.14),transparent_50%),linear-gradient(180deg,#06111f,#07101e_55%,#060e1a)]' : 'bg-[radial-gradient(ellipse_at_top,rgba(0,148,255,0.08),transparent_50%),linear-gradient(180deg,#f0f6ff,#e8f0fd_55%,#deeafc)]';
  const card = isDark ? 'border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.08)]' : 'border-slate-200/80 bg-white/80 backdrop-blur-2xl shadow-[0_4px_24px_rgba(0,80,180,0.08),inset_0_1px_0_rgba(255,255,255,0.9)]';
  const label  = isDark ? 'text-sky-100/45' : 'text-slate-500';
  const text   = isDark ? 'text-white'      : 'text-slate-900';
  const sub    = isDark ? 'text-slate-300'  : 'text-slate-600';
  const rowBg  = isDark ? 'border-white/8 bg-white/5'  : 'border-slate-200/70 bg-slate-50/80';
  const btnPill = isDark
    ? 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100';
  const btnPillActive = isDark
    ? 'border-[hsl(192_100%_60%/0.35)] bg-[hsl(192_100%_50%/0.18)] text-[hsl(192_100%_80%)]'
    : 'border-[hsl(211_100%_60%/0.40)] bg-[hsl(211_100%_50%/0.12)] text-[hsl(211_100%_38%)]';

  return (
    <div className={`min-h-screen ${bg} text-[${isDark ? 'white' : '#0f172a'}]`}>
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">

        {/* ── Nav bar ── */}
        <div className="flex flex-wrap items-center gap-3">
          <Link to={homePath} className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium backdrop-blur-xl transition ${btnPill}`}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <button onClick={toggle} className={`inline-flex items-center rounded-full border px-4 py-2 text-sm font-medium backdrop-blur-xl transition ${btnPill}`}>
            {isDark ? 'Light' : 'Dark'}
          </button>
          <div className="ml-auto flex items-center gap-2">
            <span className={`text-xs ${label}`}>Checks every 5 min</span>
            <button
              onClick={() => void load(true)}
              disabled={refreshing}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium backdrop-blur-xl transition disabled:opacity-50 ${isDark ? 'border-[hsl(192_100%_60%/0.25)] bg-[hsl(192_100%_50%/0.15)] text-[hsl(192_100%_80%)] hover:bg-[hsl(192_100%_50%/0.22)]' : 'border-[hsl(211_100%_60%/0.35)] bg-[hsl(211_100%_50%/0.10)] text-[hsl(211_100%_38%)] hover:bg-[hsl(211_100%_50%/0.16)]'}`}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>

        {/* ── Hero banner ── */}
        <div className={`mt-8 flex flex-wrap items-start gap-4 rounded-3xl border px-6 py-6 ${card}`}>
          <span className="relative flex h-3 w-3 mt-1 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: copy.dot }} />
            <span className="relative inline-flex h-3 w-3 rounded-full" style={{ background: copy.dot }} />
          </span>
          <div className="flex-1 min-w-0">
            <div className={`text-[11px] font-medium uppercase tracking-[0.22em] ${label}`}>Stratus status</div>
            <h1 className={`mt-1 text-2xl font-semibold tracking-tight sm:text-3xl ${text}`}>{copy.title}</h1>
            <p className={`mt-2 max-w-2xl text-sm ${sub}`}>{copy.msg}</p>
          </div>
          <div className={`text-right text-xs ${label} shrink-0`}>
            <div>Last check</div>
            <div className={`font-medium ${text}`}>{formatDateTime(latest?.capturedAt ?? null)}</div>
          </div>
        </div>

        {/* ── System component rows ── */}
        <div className="mt-8">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div className={`text-[11px] font-medium uppercase tracking-[0.2em] ${label}`}>System status</div>
            <div className="flex items-center gap-3">
              {(bundle?.index.snapshots.length ?? 0) === 0 && (
                <span className={`text-[11px] ${label} italic`}>Hit Refresh to start collecting snapshots</span>
              )}
              <div className={`text-xs ${label}`}>{bundle?.index.snapshots.length ?? 0} stored snapshots</div>
            </div>
          </div>
          <div className="space-y-3">
            <SystemComponentRow label="Storage" componentCount={1}
              snapshots={bundle?.index.snapshots ?? []}
              severity={latest?.storage.usedPercent != null ? (latest.storage.usedPercent >= 95 ? 'degraded' : latest.storage.usedPercent >= 85 ? 'monitoring' : 'operational') : null}
            />
            <SystemComponentRow label="Vault access" componentCount={latest?.vaults.total ?? 0}
              snapshots={bundle?.index.snapshots ?? []}
              severity={vaultSeverity(latest?.vaults.accessible, latest?.vaults.total)}
            />
            <SystemComponentRow label="Activity & events" componentCount={1}
              snapshots={bundle?.index.snapshots ?? []}
              severity={latest?.activity.failures24h != null ? (latest.activity.failures24h >= 10 ? 'degraded' : latest.activity.failures24h > 0 ? 'monitoring' : 'operational') : null}
            />
            <SystemComponentRow label="Connectivity" componentCount={1}
              snapshots={bundle?.index.snapshots ?? []}
              severity={!latest || (latest.auth.online && latest.auth.authenticated) ? 'operational' : 'degraded'}
            />
          </div>

          {/* Legend + colour guide bar */}
          <div className="mt-5 space-y-2">
            <Legend />
            <UptimeBar snapshots={[]} demo window="weekly" />
            <p style={{ fontSize: 10, color: 'hsl(220 14% 38%)', letterSpacing: '0.01em' }}>
              ↑ Colour guide only — this bar is fake sample data so you can see what each status looks like. The bars above show your real stored history.
            </p>
          </div>
        </div>

        {/* ── Reports + snapshot detail ── */}
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">

          {/* Snapshot detail */}
          <div className={`rounded-3xl border px-6 py-5 ${card}`}>
            <div className={`text-[11px] font-medium uppercase tracking-[0.2em] ${label} mb-4`}>Latest snapshot</div>
            <div className="space-y-3">
              {[
                ['Last stored', formatDateTime(latest?.capturedAt ?? null)],
                ['Last event', formatDateTime(latest?.activity.lastEventAt ?? null)],
                ['Total snapshots', String(bundle?.index.snapshots.length ?? 0)],
                ['Storage', latest ? `${latest.storage.usedPercent}% used` : '—'],
                ['Vaults', latest ? `${latest.vaults.accessible}/${latest.vaults.total} accessible` : '—'],
                ['Activity', latest ? `${latest.activity.totalEvents} events · ${latest.activity.failures24h} failures` : '—'],
              ].map(([lbl, val]) => (
                <div key={lbl} className={`flex items-center justify-between gap-4 rounded-2xl border px-4 py-3 ${rowBg}`}>
                  <span className={`text-sm ${sub}`}>{lbl}</span>
                  <span className={`text-sm font-semibold ${text}`}>{val}</span>
                </div>
              ))}
            </div>
            {notes.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className={`text-[11px] font-medium uppercase tracking-[0.2em] ${label}`}>Notes</div>
                {notes.map((note) => (
                  <div key={note} className={`rounded-2xl border px-3 py-2 text-sm ${isDark ? 'border-amber-400/20 bg-amber-500/8 text-amber-100' : 'border-amber-300/40 bg-amber-50 text-amber-800'}`}>{note}</div>
                ))}
              </div>
            )}
          </div>

          {/* Reports */}
          <div className={`rounded-3xl border px-6 py-5 ${card}`}>
            <div className={`text-[11px] font-medium uppercase tracking-[0.2em] ${label} mb-4`}>Reports</div>
            <div className="grid grid-cols-2 gap-2 mb-4 sm:grid-cols-4">
              {WINDOWS.map((w) => (
                <div key={`${w}-summary`} className={`rounded-2xl border px-3 py-3 ${rowBg}`}>
                  <div className={`text-[11px] uppercase tracking-[0.16em] ${label}`}>{WINDOW_LABELS[w]}</div>
                  <div className={`mt-1 text-lg font-semibold ${text}`}>{bundle?.reports[w]?.sampleCount ?? 0}</div>
                  <div className={`text-[11px] ${sub}`}>snapshots in window</div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              {WINDOWS.map((w) => (
                <button key={w} onClick={() => setSelectedWindow(w)}
                  className={`rounded-full border px-4 py-1.5 text-xs font-medium transition ${selectedWindow === w ? btnPillActive : btnPill}`}
                >
                  {WINDOW_LABELS[w]} · {bundle?.reports[w]?.sampleCount ?? 0}
                </button>
              ))}
            </div>
            <ReportPanel report={bundle?.reports[selectedWindow] ?? null} dark={isDark} />
          </div>
        </div>

        {/* ── Crypto engine switch ── */}
        <div className="mt-8">
          <div className={`text-[11px] font-medium uppercase tracking-[0.2em] ${label} mb-3`}>Crypto engine</div>
          <CryptoEngineSwitch />
        </div>

        {loading && !bundle && (
          <div className={`mt-8 rounded-3xl border px-6 py-10 text-center text-sm ${card} ${sub}`}>
            Loading status data…
          </div>
        )}
      </div>
    </div>
  );
}
