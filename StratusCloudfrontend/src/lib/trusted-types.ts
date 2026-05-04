import { sanitizeUntrustedHtml } from './html-sanitizer';

declare global {
  interface Window {
    trustedTypes?: {
      createPolicy?: (
        name: string,
        rules: {
          createHTML?: (input: string) => string;
          createScript?: (input: string) => string;
          createScriptURL?: (input: string) => string;
        }
      ) => unknown;
      getPolicyNames?: () => string[];
    };
  }
}

let initialized = false;

export function initializeTrustedTypes(): void {
  if (initialized || typeof window === 'undefined' || !window.trustedTypes?.createPolicy) return;
  initialized = true;

  try {
    const names = window.trustedTypes.getPolicyNames?.() ?? [];
    if (names.includes('stratus-html')) return;

    window.trustedTypes.createPolicy('stratus-html', {
      createHTML: (input) => sanitizeUntrustedHtml(input),
      createScript: () => '',
      createScriptURL: () => '',
    });
  } catch {
    // Best-effort only; do not block app startup if the browser or CSP rejects policy creation.
  }
}
