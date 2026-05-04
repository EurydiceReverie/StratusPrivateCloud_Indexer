import { API_BASE } from './api-base';
import { captureCsrfToken, csrfHeaders } from './csrf';

export interface ApiEncryptedEnvelope {
  v: 1;
  kid: string;
  ts: number;
  nonce: string;
  aad: string;
  ciphertext: string;
}

interface ApiEnvelopeSession {
  v: 1;
  kid: string;
  key: string; // base64 raw 32-byte key
  token?: string;
  expiresAt: number;
}

const SESSION_STORAGE_KEY = 'stratus_api_envelope_session_v1';
const SESSION_TTL_MS = 30 * 60 * 1000;
const API_ENVELOPE_ENABLED = String(import.meta.env.VITE_API_ENVELOPE_ENABLED ?? 'true').toLowerCase() !== 'false';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}

function getStoredSession(): ApiEnvelopeSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ApiEnvelopeSession;
    if (!parsed?.kid || !parsed?.key || parsed.expiresAt <= Date.now()) {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function storeSession(session: ApiEnvelopeSession): void {
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

async function bootstrapSession(): Promise<ApiEnvelopeSession> {
  if (!API_ENVELOPE_ENABLED) throw new Error('STRATUS_ERR_API_ENVELOPE_DISABLED');
  const res = await fetch(`${API_BASE}/api/secure/bootstrap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
    credentials: 'include',
    body: JSON.stringify({}),
  });
  captureCsrfToken(res);
  if (!res.ok) {
    throw new Error('STRATUS_ERR_API_ENVELOPE_BOOTSTRAP');
  }
  const data = await res.json() as { kid: string; key: string; token?: string; expiresAt?: number };
  if (!data?.kid || !data?.key) throw new Error('STRATUS_ERR_API_ENVELOPE_BOOTSTRAP');
  const session: ApiEnvelopeSession = {
    v: 1,
    kid: data.kid,
    key: data.key,
    token: data.token,
    expiresAt: typeof data.expiresAt === 'number' ? data.expiresAt : Date.now() + SESSION_TTL_MS,
  };
  storeSession(session);
  return session;
}

async function getSession(): Promise<ApiEnvelopeSession> {
  return getStoredSession() ?? bootstrapSession();
}

async function importAesKey(rawKeyB64: string, usage: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', fromBase64(rawKeyB64), { name: 'AES-GCM' }, false, usage);
}

async function encryptPayload(path: string, method: string, payload: unknown): Promise<ApiEncryptedEnvelope> {
  const session = await getSession();
  const key = await importAesKey(session.key, ['encrypt']);
  const ts = Date.now();
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const aad = `${method.toUpperCase()}:${path}:${session.kid}:${ts}`;
  const plaintext = new TextEncoder().encode(JSON.stringify(payload ?? {}));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: new TextEncoder().encode(aad) },
    key,
    plaintext,
  );
  return {
    v: 1,
    kid: session.kid,
    ts,
    nonce: toBase64(nonce),
    aad,
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

async function decryptEnvelope(envelope: ApiEncryptedEnvelope): Promise<unknown> {
  const session = await getSession();
  if (session.kid !== envelope.kid) {
    const refreshed = await bootstrapSession();
    if (refreshed.kid !== envelope.kid) throw new Error('STRATUS_ERR_API_ENVELOPE_KID');
    return decryptEnvelope(envelope);
  }
  const key = await importAesKey(session.key, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: fromBase64(envelope.nonce),
      additionalData: new TextEncoder().encode(envelope.aad),
    },
    key,
    fromBase64(envelope.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}

export async function buildSecureUploadHeaders(path: string, payload: unknown, headers: Record<string, string> = {}): Promise<Record<string, string>> {
  if (!API_ENVELOPE_ENABLED) {
    const plain = payload as Record<string, unknown> | null;
    return {
      ...headers,
      ...(plain?.endpoint ? { 'X-Dropbox-Endpoint': String(plain.endpoint) } : {}),
      ...(plain?.dropboxApiArg ? { 'Dropbox-API-Arg': JSON.stringify(plain.dropboxApiArg) } : {}),
      ...csrfHeaders(),
    };
  }
  const envelope = await encryptPayload(path, 'POST', payload);
  const session = await getSession();
  return {
    ...headers,
    'X-Stratus-Upload-Meta': btoa(JSON.stringify(envelope)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''),
    ...(session.token ? { 'X-Api-Envelope-Session': session.token } : {}),
    ...csrfHeaders(),
  };
}

export async function secureFetch(path: string, payload: unknown, init: Omit<RequestInit, 'body' | 'headers'> & { headers?: Record<string, string> } = {}): Promise<Response> {
  const method = (init.method || 'POST').toUpperCase();
  if (!API_ENVELOPE_ENABLED) {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      method,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...csrfHeaders(),
        ...(init.headers || {}),
      },
      body: JSON.stringify(payload ?? {}),
    });
    captureCsrfToken(res);
    return res;
  }
  const session = await getSession();
  const envelope = await encryptPayload(path, method, payload);
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Encrypted-Envelope': '1',
      ...(session.token ? { 'X-Api-Envelope-Session': session.token } : {}),
      ...csrfHeaders(),
      ...(init.headers || {}),
    },
    body: JSON.stringify(envelope),
  });
  captureCsrfToken(res);
  return res;
}

export async function readMaybeEncryptedJson<T>(response: Response): Promise<T> {
  captureCsrfToken(response);
  const data = await response.json();
  if (response.headers.get('X-Encrypted-Envelope') === '1' && data?.ciphertext) {
    return await decryptEnvelope(data as ApiEncryptedEnvelope) as T;
  }
  return data as T;
}

export async function unwrapEncryptedJsonResponse(response: Response): Promise<Response> {
  if (response.headers.get('X-Encrypted-Envelope') !== '1') return response;
  const data = await readMaybeEncryptedJson<unknown>(response);
  const headers = new Headers(response.headers);
  headers.delete('X-Encrypted-Envelope');
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(data), { status: response.status, statusText: response.statusText, headers });
}
