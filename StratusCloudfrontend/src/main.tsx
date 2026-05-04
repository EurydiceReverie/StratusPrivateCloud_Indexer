import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initializeCryptoEngine } from "@/lib/crypto-engine-bootstrap";
import { initializeNativeHelperBridge } from "@/lib/native-helper-client";
import { initializeTrustedTypes } from "@/lib/trusted-types";

function hardenRuntimeCrypto(): void {
  try {
    if (typeof window === 'undefined' || !window.crypto?.subtle) return;

    const subtle = window.crypto.subtle as SubtleCrypto & Record<string, unknown>;
    const protectedMethods = [
      'encrypt',
      'decrypt',
      'wrapKey',
      'unwrapKey',
      'deriveBits',
      'deriveKey',
      'importKey',
      'exportKey',
      'digest',
      'sign',
      'verify',
    ] as const;

    for (const method of protectedMethods) {
      const descriptor = Object.getOwnPropertyDescriptor(subtle, method);
      const value = subtle[method];
      if (descriptor?.configurable === false || typeof value !== 'function') continue;
      Object.defineProperty(subtle, method, {
        value,
        writable: false,
        configurable: false,
      });
    }

    Object.freeze(subtle);
  } catch {
    // Best-effort hardening only — never block app startup.
  }
}

function cleanupLegacyStorage(): void {
  try {
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('vault_audit_') || k.startsWith('vaultmanager_')) {
        localStorage.removeItem(k);
      }
    });
  } catch {
    /* ignore */
  }
}

async function bootstrapApp(): Promise<void> {
  initializeTrustedTypes();
  hardenRuntimeCrypto();
  cleanupLegacyStorage();
  await Promise.allSettled([
    initializeNativeHelperBridge(),
    initializeCryptoEngine(),
  ]);
  createRoot(document.getElementById("root")!).render(<App />);
}

void bootstrapApp();
