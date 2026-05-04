// STUB - Original Dropbox service removed for public release
export interface DBXFile {
  id: string;
  name: string;
  path: string;
  isFolder: boolean;
  size?: number;
  modifiedAt?: string;
  mimeType?: string;
  contentHash?: string;
  isVaultFile?: boolean;
  _encryptedPath?: string;
}

export function getDevToken(): string | null { return null; }

export async function listFolder(): Promise<DBXFile[]> { return []; }
export async function downloadFile(): Promise<Blob> { throw new Error('STUB'); }
export async function uploadFile(): Promise<void> { throw new Error('STUB'); }
export async function deleteFile(): Promise<void> { throw new Error('STUB'); }
export async function moveFile(): Promise<void> { throw new Error('STUB'); }
export async function copyFile(): Promise<void> { throw new Error('STUB'); }
export async function createFolder(): Promise<void> { throw new Error('STUB'); }
export async function searchFiles(): Promise<DBXFile[]> { return []; }
export async function getStorageUsage(): Promise<{ used: number; allocated: number }> { return { used: 0, allocated: 0 }; }
export async function downloadFolderAsZip(): Promise<Blob> { throw new Error('STUB'); }
export async function loadVaultManifestFromDropbox(): Promise<unknown> { return null; }
export async function saveVaultManifestToDropbox(): Promise<void> {}
export async function getTemporaryLink(): Promise<string> { return ''; }
export async function getShareableLink(): Promise<string> { return ''; }
