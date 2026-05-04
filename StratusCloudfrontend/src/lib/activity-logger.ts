// STUB - Original activity logger removed for public release
export type ActivityType = string;
export interface ActivityEntry {
  id: string;
  type: ActivityType;
  timestamp: string;
  timestampMs: number;
  path?: string;
  name?: string;
  fromPath?: string;
  toPath?: string;
  size?: number;
  success: boolean;
  error?: string;
  [key: string]: unknown;
}

export function logActivity(): void {}
export function readActivityLog(): ActivityEntry[] { return []; }
export function clearActivityLog(): void {}
export function getActivityStats(): { total: number; successful: number; failed: number } {
  return { total: 0, successful: 0, failed: 0 };
}
