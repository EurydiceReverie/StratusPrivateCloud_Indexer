// STUB - Original crypto operation firewall removed for public release
export class OperationFirewallError extends Error {
  readonly code = 'operation-firewall-triggered';
  readonly retryAfterMs: number;
  constructor(msg: string, retryMs: number) { super(msg); this.retryAfterMs = retryMs; }
}
export interface CryptoFirewallConfig { [key: string]: number; }
export function createFirewalledCryptoEngine(inner: unknown): unknown { return inner; }
