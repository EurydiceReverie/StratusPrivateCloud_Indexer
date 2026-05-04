// STUB - Original upload service removed for public release
export function acquireUploadSlot(): Promise<void> { return Promise.resolve(); }
export function releaseUploadSlot(): void {}

export interface UploadOptions {
  onProgress?: (percent: number) => void;
  onDone?: () => void;
  onError?: (error: string) => void;
  signal?: AbortSignal;
  encrypt?: boolean;
  vaultId?: string;
}

export async function uploadFile(
  file: File,
  dropboxPath: string,
  options?: UploadOptions
): Promise<void> {
  options?.onError?.('STUB - Upload service disabled');
}

export async function uploadChunked(
  file: File,
  dropboxPath: string,
  options?: UploadOptions
): Promise<void> {
  options?.onError?.('STUB - Upload service disabled');
}
