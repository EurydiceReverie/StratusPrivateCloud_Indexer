// STUB - Original API envelope removed for public release
import { randomBytes } from 'crypto';

const API_ENVELOPE_TTL_MS = 30 * 60 * 1000;

export function encryptEnvelopeForSession(session, path, method, data) {
  return { v: 1, kid: session?.kid || '', ts: Date.now(), nonce: '', aad: '', ciphertext: '', data };
}

export function decryptUploadMetadata(req) {
  return null;
}

export function handleApiEnvelopeBootstrap(req, res) {
  const session = {
    v: 1,
    kid: randomBytes(12).toString('base64url'),
    key: randomBytes(32).toString('base64'),
    exp: Date.now() + API_ENVELOPE_TTL_MS,
  };
  res.json({ kid: session.kid, key: session.key, expiresAt: session.exp });
}

export async function apiEnvelopeMiddleware(req, res, next) {
  next();
}
