import type {
  NativeHelperBridge,
  NativeHelperCapabilities,
  NativeHelperHandshake,
  NativeHelperSessionGrant,
  NativeHelperSessionRequest,
} from './native-helper-protocol';
import { NATIVE_HELPER_PROTOCOL_VERSION } from './native-helper-protocol';

export class NativeHelperUnavailableError extends Error {
  constructor(message = 'Native helper is unavailable') {
    super(message);
    this.name = 'NativeHelperUnavailableError';
  }
}

class BrowserNativeHelperBridge implements NativeHelperBridge {
  async handshake(_handshake: NativeHelperHandshake): Promise<NativeHelperCapabilities> {
    throw new NativeHelperUnavailableError();
  }

  async requestSession(_request: NativeHelperSessionRequest): Promise<NativeHelperSessionGrant> {
    throw new NativeHelperUnavailableError();
  }

  async send() {
    throw new NativeHelperUnavailableError();
  }
}

let activeBridge: NativeHelperBridge | null = null;

export function getNativeHelperBridge(): NativeHelperBridge | null {
  return activeBridge;
}

export function setNativeHelperBridge(bridge: NativeHelperBridge | null): void {
  activeBridge = bridge;
}

export async function initializeNativeHelperBridge(): Promise<NativeHelperBridge | null> {
  if (activeBridge) return activeBridge;

  const bridge = new BrowserNativeHelperBridge();
  try {
    await bridge.handshake({
      clientName: 'stratus-web',
      clientVersion: '0.0.0',
      requestedProtocolVersion: NATIVE_HELPER_PROTOCOL_VERSION,
    });
    activeBridge = bridge;
    return bridge;
  } catch {
    return null;
  }
}
