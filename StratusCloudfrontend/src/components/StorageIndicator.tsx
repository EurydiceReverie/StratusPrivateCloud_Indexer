import { useEffect, useState } from "react";
import { getStorageUsage } from "@/services/dropbox-service";
import { useAuth } from "@/context/AuthContext";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export default function StorageIndicator() {
  const { isAuthenticated } = useAuth();
  const [used, setUsed] = useState(0);
  const [allocated, setAllocated] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) return;
    // Queued via global dbxFetch limiter — no artificial delay needed
    getStorageUsage().then(({ used, allocated }) => {
      setUsed(used);
      setAllocated(allocated);
    }).catch(() => {});
  }, [isAuthenticated]);

  if (!isAuthenticated || !allocated) return null;

  const pct = Math.min(100, Math.round((used / allocated) * 100));

  // Break into 4 segments like the original iCloud style
  const segments = [
    { label: "Files", percentage: pct * 0.6, color: "var(--storage-1)" },
    { label: "Photos", percentage: pct * 0.25, color: "var(--storage-2)" },
    { label: "Backups", percentage: pct * 0.1, color: "var(--storage-3)" },
    { label: "Other", percentage: pct * 0.05, color: "var(--storage-4)" },
  ];

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-bold text-foreground">Dropbox Storage</span>
        <span className="text-xs font-semibold text-muted-foreground">
          {formatBytes(used)} of {formatBytes(allocated)}
        </span>
      </div>

      {/* Segmented rounded bar */}
      <div className="h-3 rounded-full overflow-hidden bg-secondary flex">
        {segments.map((seg, i) => (
          <div
            key={seg.label}
            className="h-full transition-all duration-700"
            style={{
              width: `${seg.percentage}%`,
              background: `hsl(${seg.color})`,
              borderRadius:
                i === 0
                  ? "9999px 0 0 9999px"
                  : i === segments.length - 1
                  ? "0 9999px 9999px 0"
                  : "0",
            }}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-5 mt-4">
        {segments.map((seg, i) => (
          <div key={seg.label} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: `hsl(var(--storage-${i + 1}))` }} />
            <span className="text-xs font-semibold text-muted-foreground">{seg.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
