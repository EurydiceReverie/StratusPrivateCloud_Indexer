import React, { useMemo, useState } from "react";
import type { StatusSeverity, StatusSnapshot } from "@/lib/status-reports";

export type BarWindow = "daily" | "weekly" | "monthly" | "yearly";

const BAR_WINDOW_MS: Record<BarWindow, number> = {
  daily:   24 * 60 * 60 * 1000,
  weekly:  7  * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
  yearly:  365 * 24 * 60 * 60 * 1000,
};
const BAR_WINDOW_BUCKETS: Record<BarWindow, number> = {
  daily: 48, weekly: 56, monthly: 60, yearly: 73,
};
const BAR_WINDOW_LABELS: Record<BarWindow, string> = {
  daily: "24h", weekly: "7d", monthly: "30d", yearly: "1y",
};

interface Bucket {
  severity: StatusSeverity | null;
  count: number;
  fromTs: number;
  toTs: number;
}

function buildBuckets(snapshots: StatusSnapshot[], windowMs: number, buckets: number): Bucket[] {
  const now = Date.now();
  const from = now - windowMs;
  const step = windowMs / buckets;
  const inWindow = snapshots.filter((s) => s.capturedAt >= from);

  return Array.from({ length: buckets }, (_, i) => {
    const bFrom = from + i * step;
    // Last bucket always closes at now+1 so synthetic "now" snapshots are always included
    const bTo = i === buckets - 1 ? now + 1 : from + (i + 1) * step;
    const hits = inWindow.filter((s) => s.capturedAt >= bFrom && s.capturedAt <= bTo);
    if (!hits.length) return { severity: null, count: 0, fromTs: bFrom, toTs: bTo };
    const worst: StatusSeverity = hits.some((h) => h.severity === "degraded")
      ? "degraded"
      : hits.some((h) => h.severity === "monitoring")
        ? "monitoring"
        : "operational";
    return { severity: worst, count: hits.length, fromTs: bFrom, toTs: bTo };
  });
}

// Injects a synthetic snapshot at "now" so the rightmost bucket reflects the current badge severity
function injectCurrentSeverity(snapshots: StatusSnapshot[], severity: StatusSeverity | null): StatusSnapshot[] {
  if (!severity || severity === "operational") return snapshots;
  const now = Date.now();
  const base: StatusSnapshot = snapshots[0] ?? {
    id: "syn", capturedAt: now, severity,
    auth: { authenticated: true, online: true },
    storage: { used: 0, allocated: 0, usedPercent: 0 },
    vaults: { total: 0, accessible: 0, activeVaultId: null },
    activity: { totalEvents: 0, failures24h: 0, lastEventAt: null },
    notes: [],
  };
  return [{ ...base, id: `syn-now-${now}`, capturedAt: now, severity }, ...snapshots];
}

function buildDemoSegments(buckets: number): Bucket[] {
  const now = Date.now();
  const step = (7 * 24 * 60 * 60 * 1000) / buckets;
  return Array.from({ length: buckets }, (_, i) => {
    const severity: StatusSeverity =
      i === Math.floor(buckets * 0.25) || i === Math.floor(buckets * 0.6)
        ? "degraded"
        : i === Math.floor(buckets * 0.4) || i === Math.floor(buckets * 0.75)
          ? "monitoring"
          : "operational";
    return { severity, count: 0, fromTs: now - (buckets - i) * step, toTs: now - (buckets - i - 1) * step };
  });
}

function severityLabel(s: StatusSeverity | null) {
  if (!s) return "No data";
  if (s === "operational") return "Operational";
  if (s === "monitoring") return "Degraded performance";
  return "Outage";
}

function fmt(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const STRIP_STYLE: Record<StatusSeverity | "empty", React.CSSProperties> = {
  operational: {
    background: "linear-gradient(175deg, hsl(192 100% 58% / 0.82), hsl(199 100% 44% / 0.68))",
    borderColor: "hsl(192 100% 72% / 0.38)",
    boxShadow:   "0 1px 5px hsl(199 100% 50% / 0.38), inset 0 1px 0 hsl(192 100% 88% / 0.32)",
  },
  monitoring: {
    background: "linear-gradient(175deg, hsl(38 96% 58% / 0.82), hsl(38 96% 44% / 0.68))",
    borderColor: "hsl(38 96% 70% / 0.35)",
    boxShadow:   "0 1px 5px hsl(38 96% 50% / 0.30), inset 0 1px 0 hsl(38 96% 86% / 0.26)",
  },
  degraded: {
    background: "linear-gradient(175deg, hsl(0 84% 60% / 0.82), hsl(0 84% 46% / 0.68))",
    borderColor: "hsl(0 84% 72% / 0.35)",
    boxShadow:   "0 1px 5px hsl(0 84% 52% / 0.30), inset 0 1px 0 hsl(0 84% 86% / 0.22)",
  },
  empty: {
    background:  "hsl(220 20% 100% / 0.07)",
    borderColor: "hsl(220 20% 100% / 0.08)",
    boxShadow:   "none",
  },
};

const HOVER_STYLE: Record<StatusSeverity | "empty", React.CSSProperties> = {
  operational: { boxShadow: "0 0 0 2px hsl(192 100% 58% / 0.70), 0 3px 14px hsl(199 100% 50% / 0.45)", borderColor: "hsl(192 100% 72% / 0.70)" },
  monitoring:  { boxShadow: "0 0 0 2px hsl(38 96% 60% / 0.70), 0 3px 14px hsl(38 96% 50% / 0.40)",   borderColor: "hsl(38 96% 70% / 0.65)" },
  degraded:    { boxShadow: "0 0 0 2px hsl(0 84% 62% / 0.70), 0 3px 14px hsl(0 84% 52% / 0.40)",     borderColor: "hsl(0 84% 72% / 0.65)" },
  empty:       { background: "hsl(220 20% 100% / 0.13)", borderColor: "hsl(220 20% 100% / 0.14)" },
};

const TOOLTIP_COLOR: Record<StatusSeverity | "empty", string> = {
  operational: "hsl(192 100% 72%)",
  monitoring:  "hsl(38 96% 68%)",
  degraded:    "hsl(0 84% 68%)",
  empty:       "hsl(220 14% 52%)",
};

interface TooltipState { bucket: Bucket; segIdx: number; totalSegs: number; }

export interface UptimeBarProps {
  snapshots: StatusSnapshot[];
  window?: BarWindow;
  className?: string;
  demo?: boolean;
}

export function UptimeBar({ snapshots, window: barWindow = "weekly", className = "", demo = false }: UptimeBarProps) {
  const windowMs = BAR_WINDOW_MS[barWindow];
  const buckets  = BAR_WINDOW_BUCKETS[barWindow];
  const realSegments = useMemo(() => buildBuckets(snapshots, windowMs, buckets), [snapshots, windowMs, buckets]);
  const segments = demo ? buildDemoSegments(buckets) : realSegments;
  const [hovered, setHovered] = useState<TooltipState | null>(null);

  const uptimePct = useMemo(() => {
    if (demo) return null;
    const withData = segments.filter((s) => s.severity !== null);
    if (!withData.length) return null;
    const ok = withData.filter((s) => s.severity === "operational").length;
    return ((ok / withData.length) * 100).toFixed(2);
  }, [segments, demo]);

  return (
    <div className={`relative w-full select-none ${className}`}>
      <div className="flex h-[14px] items-stretch gap-[2px]">
        {segments.map((seg, i) => {
          const key: StatusSeverity | "empty" = seg.severity ?? "empty";
          const isHov = hovered?.segIdx === i;
          return (
            <div
              key={i}
              onMouseEnter={() => setHovered({ bucket: seg, segIdx: i, totalSegs: segments.length })}
              onMouseLeave={() => setHovered(null)}
              style={{
                ...STRIP_STYLE[key],
                ...(isHov ? HOVER_STYLE[key] : {}),
                transform: isHov ? "translateY(-2px) scaleY(1.18)" : undefined,
                zIndex: isHov ? 20 : undefined,
              }}
              className="relative flex-1 min-w-0 rounded-[3px] border backdrop-blur-sm cursor-default transition-all duration-100 ease-out"
            />
          );
        })}
      </div>

      {/* Tooltip — rendered outside the bar row to avoid clipping */}
      {hovered && (() => {
        const { bucket, segIdx, totalSegs } = hovered;
        const key: StatusSeverity | "empty" = bucket.severity ?? "empty";
        const pct = ((segIdx + 0.5) / totalSegs) * 100;
        return (
          <div
            className="pointer-events-none absolute z-50 -translate-x-1/2"
            style={{ left: `${pct}%`, bottom: "calc(100% + 10px)" }}
          >
            <div
              style={{ background: "hsl(220 30% 6% / 0.92)", borderColor: "hsl(220 14% 100% / 0.12)" }}
              className="rounded-2xl border px-3.5 py-2.5 text-xs backdrop-blur-2xl shadow-[0_16px_48px_hsl(220_20%_0%/0.55),inset_0_1px_0_hsl(220_14%_100%/0.07)] min-w-[168px] max-w-[230px]"
            >
              <div className="font-semibold" style={{ color: TOOLTIP_COLOR[key] }}>
                {severityLabel(bucket.severity)}
              </div>
              {demo ? (
                <div className="mt-1.5" style={{ color: "hsl(220 14% 44%)", fontStyle: "italic" }}>
                  Sample data — colour guide only
                </div>
              ) : (
                <>
                  <div className="mt-1.5 leading-snug" style={{ color: "hsl(220 14% 68%)" }}>
                    <div>{fmt(bucket.fromTs)}</div>
                    <div style={{ color: "hsl(220 14% 45%)" }}>→ {fmt(bucket.toTs)}</div>
                  </div>
                  {bucket.count > 0 && (
                    <div className="mt-1.5" style={{ color: "hsl(220 14% 48%)" }}>
                      {bucket.count} check{bucket.count !== 1 ? "s" : ""}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })()}

      <div className="mt-1.5 flex items-center justify-between" style={{ fontSize: 11, color: "hsl(220 14% 46%)" }}>
        <span>–{BAR_WINDOW_LABELS[barWindow]}</span>
        {demo ? (
          <span style={{ opacity: 0.4, fontStyle: "italic" }}>colour guide</span>
        ) : uptimePct !== null ? (
          <span style={{ fontWeight: 600, color: "hsl(192 100% 62%)" }}>{uptimePct}% uptime</span>
        ) : (
          <span style={{ opacity: 0.4 }}>no data yet</span>
        )}
        <span>now</span>
      </div>
    </div>
  );
}

// ── SystemComponentRow ─────────────────────────────────────────────────────────
export interface SystemComponentRowProps {
  label: string;
  componentCount?: number;
  snapshots: StatusSnapshot[];
  severity?: StatusSeverity | null;
}

const BAR_WINDOWS: BarWindow[] = ["daily", "weekly", "monthly", "yearly"];

const SEV_COLOR: Record<StatusSeverity | "empty", string> = {
  operational: "hsl(192 100% 60%)",
  monitoring:  "hsl(38 96% 60%)",
  degraded:    "hsl(0 84% 62%)",
  empty:       "hsl(220 14% 46%)",
};

const SEV_LABEL: Record<StatusSeverity | "empty", string> = {
  operational: "Operational",
  monitoring:  "Degraded",
  degraded:    "Outage",
  empty:       "No data",
};

export function SystemComponentRow({
  label,
  componentCount,
  snapshots,
  severity = "operational",
}: SystemComponentRowProps) {
  const [barWindow, setBarWindow] = useState<BarWindow>("weekly");
  const key: StatusSeverity | "empty" = severity ?? "empty";

  // Inject a synthetic "now" snapshot so the rightmost bucket matches the badge colour
  const effectiveSnapshots = useMemo(
    () => injectCurrentSeverity(snapshots, severity ?? null),
    [snapshots, severity]
  );

  return (
    <div
      style={{
        background: "hsl(220 20% 100% / 0.045)",
        borderColor: "hsl(220 14% 100% / 0.09)",
        boxShadow: "0 4px 24px hsl(220 20% 0% / 0.14), inset 0 1px 0 hsl(220 14% 100% / 0.07)",
      }}
      className="overflow-visible rounded-2xl border backdrop-blur-2xl px-5 py-4 transition-all duration-200 hover:bg-white/[0.065]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden style={{ color: SEV_COLOR[key] }}>
            <path fillRule="evenodd" d="M16.704 5.293a1 1 0 010 1.414l-7.5 7.5a1 1 0 01-1.414 0l-3.5-3.5a1 1 0 011.414-1.414L8.5 12.086l6.793-6.793a1 1 0 011.411 0z" clipRule="evenodd" />
          </svg>
          <span className="text-sm font-semibold text-white">{label}</span>
          {componentCount != null && (
            <span
              style={{ background: "hsl(220 14% 100% / 0.07)", borderColor: "hsl(220 14% 100% / 0.10)", color: "hsl(220 14% 56%)" }}
              className="rounded-full border px-2 py-0.5 text-[11px] font-medium"
            >
              {componentCount} component{componentCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div
            style={{ background: "hsl(220 14% 100% / 0.06)", borderColor: "hsl(220 14% 100% / 0.09)" }}
            className="flex items-center gap-0.5 rounded-full border p-0.5"
          >
            {BAR_WINDOWS.map((w) => (
              <button
                key={w}
                onClick={() => setBarWindow(w)}
                style={barWindow === w ? {
                  background: "hsl(199 100% 50% / 0.22)",
                  color: "hsl(192 100% 76%)",
                  borderColor: "hsl(192 100% 60% / 0.32)",
                } : { color: "hsl(220 14% 48%)" }}
                className="rounded-full px-2.5 py-[3px] text-[10px] font-semibold uppercase tracking-wide transition border border-transparent hover:text-white"
              >
                {BAR_WINDOW_LABELS[w]}
              </button>
            ))}
          </div>
          <span className="text-xs font-medium" style={{ color: SEV_COLOR[key] }}>
            {SEV_LABEL[key]}
          </span>
        </div>
      </div>

      <div className="overflow-visible">
        <UptimeBar snapshots={effectiveSnapshots} window={barWindow} />
      </div>
    </div>
  );
}
