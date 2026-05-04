import { useSyncExternalStore } from 'react';
import {
  getCryptoEngineRuntimeStatus,
  subscribeCryptoEngineRuntimeStatus,
  type ActiveCryptoBackend,
  type ConfiguredCryptoBackend,
} from '@/lib/crypto-engine-bootstrap';

const ENGINE_INFO: Record<ActiveCryptoBackend, { label: string; desc: string; color: string; bg: string }> = {
  web:    { label: 'WebCrypto',     desc: 'Browser SubtleCrypto fallback/runtime path.',      color: 'hsl(192 100% 60%)', bg: 'hsl(192 100% 50% / 0.12)' },
  wasm:   { label: 'Rust / WASM',   desc: 'Compiled Rust crypto engine loaded successfully.', color: 'hsl(255 90% 72%)',  bg: 'hsl(255 90% 60% / 0.12)'  },
  native: { label: 'Native helper', desc: 'Local native daemon crypto backend.',              color: 'hsl(38 96% 60%)',   bg: 'hsl(38 96% 50% / 0.12)'   },
};

function requestedLabel(requested: ConfiguredCryptoBackend): string {
  return requested === 'wasm' ? 'Requested: WASM' : requested === 'native' ? 'Requested: native' : 'Requested: WebCrypto';
}

export function CryptoEngineSwitch() {
  const status = useSyncExternalStore(subscribeCryptoEngineRuntimeStatus, getCryptoEngineRuntimeStatus, getCryptoEngineRuntimeStatus);
  const active = status.active ?? 'web';
  const { label, desc, color, bg } = ENGINE_INFO[active];
  const stateLabel = !status.initialized
    ? 'starting'
    : status.error
      ? 'failed'
      : status.fallbackUsed
        ? 'fallback'
        : 'active';

  return (
    <div
      className="pointer-events-auto flex items-center justify-between gap-4 rounded-2xl border px-4 py-3 backdrop-blur-xl"
      style={{ background: bg, borderColor: `${color}25`, boxShadow: `0 2px 12px ${color}10` }}
      title={status.error ?? undefined}
    >
      <div className="flex items-center gap-3">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-50" style={{ background: color }} />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        </span>
        <div>
          <div className="text-sm font-semibold text-white">{label}</div>
          <div className="text-xs" style={{ color: 'hsl(220 14% 52%)' }}>{desc}</div>
          <div className="text-[11px] mt-1" style={{ color: 'hsl(220 14% 62%)' }}>
            {requestedLabel(status.requested)}
            {status.requested === 'wasm' && !status.fallbackToWebCrypto ? ' · strict no-fallback' : ''}
            {status.fallbackUsed ? ' · using WebCrypto fallback' : ''}
          </div>
          {status.error ? (
            <div className="text-[11px] mt-1 text-red-300/90 max-w-[22rem] break-words">{status.error}</div>
          ) : null}
        </div>
      </div>
      <span
        className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide"
        style={{ background: `${color}18`, color }}
      >
        {stateLabel}
      </span>
    </div>
  );
}
