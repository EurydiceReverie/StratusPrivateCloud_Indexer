// STUB - Original secure storage removed for public release
export function storeVaultSession(): void {}
export function storeVaultPassword(): void {}
export function getVaultPasswordSecure(): string | null { return null; }
export function getVaultMasterKeySecure(): Uint8Array | null { return null; }
export function hasVaultAccessSecure(): boolean { return false; }
export function clearVaultPasswordSecure(): void {}
export function isVaultUnlocked(): boolean { return false; }
export function storeAccessToken(): void {}
export function getAccessToken(): string | null { return null; }
export function isAccessTokenExpired(): boolean { return true; }
export function storeRefreshToken(): void {}
export function getRefreshToken(): string | null { return null; }
export function clearAllTokens(): void {}
export function getTokenExpiresIn(): number { return 0; }
