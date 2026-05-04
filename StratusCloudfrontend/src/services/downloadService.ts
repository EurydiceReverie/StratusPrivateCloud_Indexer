// STUB - Original download service removed for public release
export function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function downloadSingleFile(): Promise<void> {
  throw new Error('STUB - Download service disabled');
}

export async function downloadFolder(): Promise<void> {
  throw new Error('STUB - Download service disabled');
}

export async function downloadBulkFiles(): Promise<void> {
  throw new Error('STUB - Download service disabled');
}
