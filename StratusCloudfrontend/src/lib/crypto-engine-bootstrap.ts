// STUB - Original crypto engine bootstrap removed for public release
export type ConfiguredCryptoBackend = 'web' | 'wasm' | 'native';
export type ActiveCryptoBackend = 'web' | 'wasm' | 'native';
export interface CryptoEngineBootstrapResult { requested: ConfiguredCryptoBackend; active: ActiveCryptoBackend; fallbackUsed: boolean; }
export interface CryptoEngineBootstrapOptions { fallbackToWebCrypto?: boolean; }
export interface CryptoEngineRuntimeStatus { initialized: boolean; requested: ConfiguredCryptoBackend; active: ActiveCryptoBackend | null; fallbackUsed: boolean; fallbackToWebCrypto: boolean; error: string | null; }
export function getCryptoEngineRuntimeStatus(): CryptoEngineRuntimeStatus { return { initialized: true, requested: 'web', active: 'web', fallbackUsed: false, fallbackToWebCrypto: true, error: null }; }
export function subscribeCryptoEngineRuntimeStatus(): () => void { return () => {}; }
export function resolveConfiguredBackend(): ConfiguredCryptoBackend { return 'web'; }
export async function initializeCryptoEngine(): Promise<CryptoEngineBootstrapResult> { return { requested: 'web', active: 'web', fallbackUsed: false }; }
