export const NATIVE_HELPER_PROTOCOL_VERSION = 1;

export type NativeHelperOperation =
  | 'ping'
  | 'derive-master-key-argon2id'
  | 'wrap-master-key-with-password'
  | 'unwrap-master-key-with-password'
  | 'derive-hkdf-aes-handle'
  | 'derive-hkdf-hmac-handle'
  | 'import-aes-handle'
  | 'encrypt-with-aes-handle'
  | 'decrypt-with-aes-handle'
  | 'sign-with-hmac-handle'
  | 'verify-with-hmac-handle'
  | 'release-handle'
  | 'encrypt-vault-file'
  | 'decrypt-vault-file'
  | 'rotate-wrapped-file-keys'
  | 'append-audit-entry';

export interface NativeHelperEnvelope<TPayload = unknown> {
  version: typeof NATIVE_HELPER_PROTOCOL_VERSION;
  requestId: string;
  operation: NativeHelperOperation;
  payload: TPayload;
}

export interface NativeHelperSuccess<TPayload = unknown> {
  ok: true;
  requestId: string;
  payload: TPayload;
}

export interface NativeHelperFailure {
  ok: false;
  requestId: string;
  code:
    | 'not-available'
    | 'invalid-request'
    | 'invalid-response'
    | 'access-denied'
    | 'crypto-failed'
    | 'cancelled'
    | 'timeout'
    | 'internal-error';
  message: string;
  retryable?: boolean;
}

export type NativeHelperResponse<TPayload = unknown> = NativeHelperSuccess<TPayload> | NativeHelperFailure;

export interface NativeHelperTransport {
  send<TRequest = unknown, TResponse = unknown>(message: NativeHelperEnvelope<TRequest>): Promise<NativeHelperResponse<TResponse>>;
}

export interface NativeHelperCapabilities {
  protocolVersion: number;
  helperVersion: string;
  supportsStreaming: boolean;
  supportsHardwareBackedKeys: boolean;
  supportedOperations: NativeHelperOperation[];
}

export interface NativeHelperHandshake {
  clientName: 'stratus-web';
  clientVersion: string;
  requestedProtocolVersion: number;
}

export interface NativeHelperSessionRequest {
  vaultId: string;
  reason: 'unlock' | 'decrypt' | 'encrypt' | 'rotation' | 'audit';
  interactive: boolean;
}

export interface NativeHelperSessionGrant {
  sessionId: string;
  expiresAt: number;
  capabilities: NativeHelperCapabilities;
}

export interface OpaqueCryptoHandle {
  id: string;
  kind: 'aes-gcm' | 'hmac-sha256';
  origin: 'web' | 'native-helper' | 'wasm';
  exportable: false;
}

export interface NativeHelperHandlePayload {
  handle: OpaqueCryptoHandle;
}

/**
 * Design contract for a future native helper/daemon bridge.
 *
 * Security goal:
 * - move long-lived key material and sensitive crypto state out of the browser JS heap
 * - operate on opaque handles instead of exposing raw key bytes back to app code
 *
 * Planned transport options:
 * - localhost loopback with mTLS or signed challenge
 * - browser extension/native messaging bridge
 * - desktop shell bridge in a packaged app
 */
export interface NativeHelperBridge {
  handshake(handshake: NativeHelperHandshake): Promise<NativeHelperCapabilities>;
  requestSession(request: NativeHelperSessionRequest): Promise<NativeHelperSessionGrant>;
  send<TRequest = unknown, TResponse = unknown>(message: NativeHelperEnvelope<TRequest>): Promise<NativeHelperResponse<TResponse>>;
}
