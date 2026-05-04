/**
 * TransferManager — Global transfer state store
 * Handles uploads, downloads, moves, copies, deletes
 * React-independent — use dispatchEvent to notify UI
 */

export type TransferType = 'upload' | 'download' | 'move' | 'copy' | 'delete';
export type TransferStatus = 'pending' | 'active' | 'paused' | 'done' | 'failed' | 'cancelled';

export interface Transfer {
  id: string;
  type: TransferType;
  name: string;          // filename or operation description
  status: TransferStatus;
  progress: number;      // 0-100
  speed?: number;        // bytes/sec (upload/download only)
  eta?: number;          // seconds remaining
  error?: string;
  createdAt: number;
  completedAt?: number;
  size?: number;         // bytes
  bytesTransferred?: number;
  // Internal control
  _paused?: boolean;
  _cancelled?: boolean;
  _abortController?: AbortController;
  _retryFn?: () => void;
}

// ── Store ────────────────────────────────────────────────────────────────────

const transfers = new Map<string, Transfer>();
const HISTORY_KEY = 'transfer_history';
const MAX_HISTORY = 50;

function notify() {
  window.dispatchEvent(new CustomEvent('transfers-updated'));
}

export function createTransfer(params: Omit<Transfer, 'id' | 'createdAt' | 'progress' | 'status'>): Transfer {
  const transfer: Transfer = {
    ...params,
    id: crypto.randomUUID(),
    status: 'pending',
    progress: 0,
    createdAt: Date.now(),
  };
  transfers.set(transfer.id, transfer);
  notify();
  return transfer;
}

export function updateTransfer(id: string, updates: Partial<Transfer>): void {
  const t = transfers.get(id);
  if (!t) return;
  Object.assign(t, updates);
  notify();
}

export function completeTransfer(id: string): void {
  const t = transfers.get(id);
  if (!t) return;
  t.status = 'done';
  t.progress = 100;
  t.completedAt = Date.now();
  t.eta = 0;
  // Save to history
  saveToHistory(t);
  notify();
}

export function failTransfer(id: string, error: string, retryFn?: () => void): void {
  const t = transfers.get(id);
  if (!t) return;
  t.status = 'failed';
  t.error = error;
  t.completedAt = Date.now();
  if (retryFn) t._retryFn = retryFn;
  notify();
}

export function pauseTransfer(id: string): void {
  const t = transfers.get(id);
  if (!t || t.status !== 'active') return;
  t._paused = true;
  t.status = 'paused';
  notify();
}

export function resumeTransfer(id: string): void {
  const t = transfers.get(id);
  if (!t || t.status !== 'paused') return;
  t._paused = false;
  t.status = 'active';
  notify();
}

export function cancelTransfer(id: string): void {
  const t = transfers.get(id);
  if (!t) return;
  t._cancelled = true;
  t._abortController?.abort();
  t.status = 'cancelled';
  t.completedAt = Date.now();
  notify();
}

export function retryTransfer(id: string): void {
  const t = transfers.get(id);
  if (!t?._retryFn) return;
  t.status = 'pending';
  t.progress = 0;
  t.error = undefined;
  t.completedAt = undefined;
  t._retryFn();
  notify();
}

export function removeTransfer(id: string): void {
  transfers.delete(id);
  notify();
}

export function clearCompleted(): void {
  for (const [id, t] of transfers.entries()) {
    if (t.status === 'done' || t.status === 'cancelled') transfers.delete(id);
  }
  notify();
}

export function getTransfers(): Transfer[] {
  return Array.from(transfers.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function getActiveCount(): number {
  return Array.from(transfers.values()).filter(t => t.status === 'active' || t.status === 'pending').length;
}

export function hasBlockingOperation(): boolean {
  return Array.from(transfers.values()).some(
    t => ['move', 'copy', 'delete'].includes(t.type) && ['active', 'pending'].includes(t.status)
  );
}

// ── History (localStorage) ────────────────────────────────────────────────────

function saveToHistory(t: Transfer): void {
  try {
    const history: Transfer[] = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    history.unshift({ ...t, _retryFn: undefined, _abortController: undefined });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  } catch {}
}

export function getHistory(): Transfer[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}

export function clearHistory(): void {
  localStorage.removeItem(HISTORY_KEY);
  notify();
}
