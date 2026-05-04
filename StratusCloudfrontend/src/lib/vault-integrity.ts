// STUB - Original vault integrity removed for public release
export interface VaultManifestEntry { path: string; kind: string; size?: number; modifiedAt?: string; contentHash?: string; }
export interface VaultManifestPayload { vaultId: string; version: number; generatedAt: number; previousManifestHash?: string; rootHash: string; entries: VaultManifestEntry[]; }
export interface EncryptedVaultManifest { vaultId: string; version: number; generatedAt: number; previousManifestHash?: string; entryCount: number; manifestHash: string; iv: string; ciphertext: string; }
export interface VaultTreeDiff { addedPaths: string[]; deletedPaths: string[]; modifiedPaths: string[]; }
export interface VaultIntegrityResult { ok: boolean; bootstrapped?: boolean; rollbackDetected?: boolean; deletionDetected?: boolean; modificationDetected?: boolean; unexpectedEntriesDetected?: boolean; manifestVersion?: number; manifestHash?: string; diff?: VaultTreeDiff; reason?: string; }
export function diffVaultEntries(): VaultTreeDiff { return { addedPaths: [], deletedPaths: [], modifiedPaths: [] }; }
export function clearVaultIntegrityAnchor(): void {}
export async function rebuildVaultManifest(): Promise<EncryptedVaultManifest> { throw new Error('STUB'); }
export async function verifyVaultManifest(): Promise<VaultIntegrityResult> { return { ok: true }; }
