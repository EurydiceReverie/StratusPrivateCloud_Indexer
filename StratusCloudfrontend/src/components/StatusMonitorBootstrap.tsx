import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getMonitorIntervalMs, runStatusMonitorCycle } from '@/lib/status-reports';

export function StatusMonitorBootstrap() {
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;

    let cancelled = false;
    const run = async (force = false) => {
      if (cancelled) return;
      try {
        await runStatusMonitorCycle(isAuthenticated, force);
      } catch {
        // Silent background monitor; surfaced in status page refresh instead.
      }
    };

    // Delay initial run by 8 seconds — lets listFolder, vaults, favorites
    // and StorageIndicator finish first before adding more Dropbox load.
    const initialTimer = window.setTimeout(() => { void run(false); }, 8_000);
    const interval = window.setInterval(() => { void run(false); }, getMonitorIntervalMs());

    // Only re-run on visibility/focus after a 30s cooldown to avoid hammering on tab switch
    let lastRun = Date.now();
    const visibilityHandler = () => {
      if (!document.hidden && Date.now() - lastRun > 30_000) {
        lastRun = Date.now();
        void run(false);
      }
    };
    window.addEventListener('focus', visibilityHandler);
    document.addEventListener('visibilitychange', visibilityHandler);

    return () => {
      cancelled = true;
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
      window.removeEventListener('focus', visibilityHandler);
      document.removeEventListener('visibilitychange', visibilityHandler);
    };
  }, [isAuthenticated, isLoading]);

  return null;
}
