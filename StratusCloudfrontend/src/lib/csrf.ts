/**
 * csrf.ts — CSRF token management for frontend
 *
 * The server sets a readable (non-httpOnly) cookie named `csrf_token`.
 * Every mutating request (POST/PUT/DELETE) must read this cookie and
 * send it back as the `X-CSRF-Token` header.
 *
 * Why this works:
 *   - Attackers on other origins cannot READ our cookies (SameSite=Strict + CORS)
 *   - So they cannot forge the X-CSRF-Token header
 *   - Server verifies cookie value === header value → CSRF blocked
 */

const CSRF_COOKIE_NAME = 'csrf_token';
let csrfTokenMemory = '';

export function setCsrfToken(token: string | null): void {
  if (!token) return;
  csrfTokenMemory = token;
}

export function captureCsrfToken(response: Response, fallbackToken?: string | null): void {
  setCsrfToken(response.headers.get('X-CSRF-Token') || fallbackToken || null);
}

/**
 * Read the CSRF token from in-memory state first, then fall back to the cookie.
 * Returns empty string if not found (dev mode / first load).
 */
export function getCsrfToken(): string {
  if (csrfTokenMemory) return csrfTokenMemory;

  try {
    const match = document.cookie
      .split('; ')
      .find(row => row.startsWith(`${CSRF_COOKIE_NAME}=`));
    return match ? decodeURIComponent(match.split('=')[1]) : '';
  } catch {
    return '';
  }
}

/**
 * Returns headers object with X-CSRF-Token included.
 * Merge this into any fetch() call that mutates state (POST/PUT/DELETE).
 *
 * Usage:
 *   fetch('/api/dropbox', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
 *     credentials: 'include',
 *     body: JSON.stringify(...)
 *   });
 */
export function csrfHeaders(): Record<string, string> {
  const token = getCsrfToken();
  return token ? { 'X-CSRF-Token': token } : {};
}
