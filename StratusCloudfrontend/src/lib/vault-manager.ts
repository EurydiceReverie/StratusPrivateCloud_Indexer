// STUB - Original vault manager removed for public release
export interface Vault {
  id: string;
  name: string;
  createdAt: number;
  recoveryKeyHash: string;
  dropboxFolder: string;
  cryptoVersion?: number;
  keySalt?: string;
  passwordPacket?: string;
  recoveryPacket?: string;
  passwordHint?: string;
}
let _vaultCache: Vault[] | null = null;
let _activeVaultId: string | null = null;
export function listVaults(): Vault[] { return _vaultCache || []; }
export function getActiveVaultId(): string | null { return _activeVaultId; }
export function setActiveVaultId(id: string | null): void { _activeVaultId = id; }
export function getActiveVault(): Vault | undefined { return listVaults().find(v => v.id === _activeVaultId); }
export function addVault(v: Vault): void { if (!_vaultCache) _vaultCache = []; _vaultCache.push(v); }
export function removeVault(id: string): void { if (_vaultCache) _vaultCache = _vaultCache.filter(v => v.id !== id); }
export function clearVaultCache(): void { _vaultCache = null; _activeVaultId = null; }
export function storeVaultPassword(): void {}
export function getVaultPasswordSecure(): string | null { return null; }
export function clearVaultPasswordSecure(): void {}
export function storeVaultSession(): void {}
export function getVaultMasterKeySecure(): string | null { return null; }
export function hasVaultAccessSecure(): boolean { return false; }
