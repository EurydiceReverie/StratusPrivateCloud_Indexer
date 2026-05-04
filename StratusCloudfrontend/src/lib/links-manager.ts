// STUB - Original links manager removed for public release
import { csrfHeaders } from '@/lib/csrf';

const API_BASE = import.meta.env.VITE_API_BASE || '';

export interface AccessLogEntry { time: number; ip: string; device: string; }
export interface ShareLink {
  id: string;
  alias?: string;
  fileName: string;
  filePath: string;
  fileSize?: number;
  isFolder?: boolean;
  isVaultFile?: boolean;
  createdAt: number;
  expiresAt: number | null;
  pinHash: string | null;
  revoked: boolean;
  accessCount: number;
  downloadCount: number;
  maxViews?: number | null;
  oneTime?: boolean;
  accessLog?: AccessLogEntry[];
  sharedBy?: string;
  message?: string;
}

export async function hashPin(): Promise<string> { return ''; }
export async function loadLinks(): Promise<ShareLink[]> { return []; }
export async function saveLinks(): Promise<void> {}
export async function createShareLink(): Promise<ShareLink> { throw new Error('STUB'); }
export function getShareUrl(): string { return ''; }
export async function revokeLink(): Promise<void> {}
export async function deleteLink(): Promise<void> {}
export function isLinkExpired(): boolean { return false; }
export function isLinkActive(): boolean { return false; }
export function formatExpiry(): string { return ''; }
