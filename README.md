# Stratus Drive

A Dropbox-powered file manager with **post-quantum encrypted vaults**, secure sharing, and client-side cryptographic protection for sensitive files.

---

## Quantum-Resistant Architecture

Stratus Drive implements **NIST-standardized post-quantum cryptography** in a hybrid model that combines classical and post-quantum algorithms — if either class of algorithm breaks, the other still protects your data.

| Algorithm | Standard | Purpose | Used In |
|-----------|----------|---------|---------|
| **ML-KEM-1024** | NIST FIPS 203 | Key Encapsulation | v8, v9 vaults |
| **ML-DSA-87** | NIST FIPS 204 | Digital Signatures | v8 vaults |
| **SLH-DSA (SPHINCS+)** | NIST FIPS 205 | Hash-Based Signatures | v9 vaults |
| **Deoxys-II-256** | CAESAR Winner | Authenticated Encryption | v9 vaults |
| **XChaCha20-Poly1305** | IETF RFC 8439 | Stream Cipher | v7, v8 vaults |
| **AES-256-GCM-SIV** | IETF RFC 8452 | Nonce-Misuse Resistant AEAD | v8, v9 fallback |

### Hybrid Model

<pre class="no-copy">
v8: ML-KEM-1024 + P-256 ECDH → if PQ breaks, classical protects
    ML-DSA-87 + Ed25519        → if lattice breaks, EdDSA protects

v9: ML-KEM-1024 + P-256 ECDH → same hybrid KEM
    SLH-DSA + Ed25519          → hash-based signatures survive lattice breaks
    Deoxys-II-256              → CAESAR winner, tweakable block cipher
</pre>

---

## Vault System

Seven vault format versions with progressive security hardening:

| Version | Cipher | Key Model | Nonce Size | Notes |
|---------|--------|-----------|------------|-------|
| **v3** | AES-256-GCM | HKDF-derived | 96-bit | Legacy compatibility |
| **v4** | AES-256-GCM | Wrapped key | 96-bit | Password change without re-encryption |
| **v5** | AES-256-GCM | Wrapped key | 96-bit | Padded size buckets (anti-fingerprinting) |
| **v7** | XChaCha20-Poly1305 | WASM-native | 192-bit | Extended nonce eliminates reuse risk |
| **v8** | AES-256-GCM-SIV or XChaCha20 | Hybrid PQ | 96/192-bit | Post-quantum KEM + signatures |
| **v9** | Deoxys-II-256 | Hybrid PQ | 256-bit | Ultra-conservative, hash-based signatures |

### Key Derivation

<pre class="no-copy">
Password → Argon2id (64MB, 3 iterations, parallelism 4) → Master Key (256-bit)
Master Key → HKDF-SHA256 → Per-File Encryption Key
Per-File Key → AES-256-GCM / XChaCha20 / Deoxys-II → Encrypted File
</pre>

### Vault Features

- **Password Packet**: Master key wrapped by password-derived key (AES-GCM)
- **Recovery Packet**: Master key wrapped by recovery key with SHA-256 verification
- **Emergency Backup**: Encrypted vault backup with separate passphrase
- **Key Rotation**: Re-wrap file keys without re-encrypting content (v4+)
- **Audit Log**: Per-vault encrypted audit trail stored on Dropbox
- **Entropy Verification**: RNG quality check before vault creation
- **Rollback Protection**: Manifest-based integrity verification with Merkle roots

---

## Crypto Engine

Three pluggable backends with automatic fallback:

<pre class="no-copy">
┌─────────────────┐
│   WebCrypto     │ ← Browser SubtleCrypto API (default)
│   (Blue)        │
├─────────────────┤
│   Rust/WASM     │ ← Compiled Rust crypto (v7/v8/v9 required)
│   (Purple)      │
├─────────────────┤
│   Native Helper │ ← Desktop daemon / browser extension (future)
│   (Yellow)      │
└─────────────────┘
</pre>

- **Opaque Crypto Handles**: Keys referenced by ID, raw bytes never exposed to JS heap
- **Crypto Operation Firewall**: Rate-limits sensitive operations with configurable thresholds
- **Argon2id Batching**: Pre-derive all HKDF children in one pass for large vaults

---

## Cloud Integration

### Dropbox API

- **OAuth PKCE**: No client secret required for frontend auth
- **API Proxy**: All Dropbox calls routed through backend (token never exposed to frontend)
- **Chunked Uploads**: 4MB chunks for large files with retry logic
- **Concurrency Control**: Max 2 concurrent Dropbox API calls (prevents 429 rate limits)
- **Token Cache**: AES-256-GCM encrypted token storage in OS temp directory

### File Operations

- List, upload, download, move, copy, delete, rename, create folder
- Search via Dropbox search API
- Folder download as ZIP
- Storage quota monitoring (Dropbox `/2/users/get_space_usage`)
- Temporary links for file preview
- Shareable links with expiry

### Sync

- Favorites synced to `/.stratus/favorites.json` on Dropbox
- Share links synced to `/.stratus/links.json` on Dropbox
- Vault registry stored at `/.stratus/vaults.json`
- Per-vault manifest for integrity verification

---

## Sharing System

| Feature | Description |
|---------|-------------|
| **Expiry** | Permanent, 1h, 6h, 24h, 48h, 7d, 30d |
| **PIN Protection** | SHA-256 hashed, 4-8 digits |
| **One-Time Links** | Auto-delete after first access |
| **Max Views** | Auto-revoke after N downloads |
| **Custom Alias** | Custom URL slug |
| **Access Logging** | Timestamp, IP, device per access |
| **Analytics** | Bar chart visualization (Recharts) |
| **QR Codes** | Generated per share link |

Public share page at `/share/:linkId` with PIN gate, file preview, and folder browsing.

---

## Security

### Transport Encryption

- **API Envelope**: All API requests wrapped in AES-256-GCM encrypted envelope
- **Session-based keys**: 30-minute TTL, rotated per session
- **AAD binding**: `method:path:kid:timestamp` prevents cross-context replay
- **CSRF Protection**: Double-submit cookie pattern

### Content Security Policy

<pre class="no-copy">
default-src 'self'
script-src 'self'
frame-ancestors 'none'
object-src 'none'
require-trusted-types-for 'script'
trusted-types default stratus-html
upgrade-insecure-requests
</pre>

### Session Management

- **App Access Gate**: Password-protected app entry with attempt limiting
- **Vault Sessions**: Master key in memory with 30-min inactivity TTL
- **Visibility-based auto-lock**: Tab hidden > 10 minutes → lock all vaults
- **Zero-wipe**: Passwords and key bytes overwritten before GC

### Build Security

- **SRI (Subresource Integrity)**: SHA-384 hashes on all script/link tags
- **JavaScript Obfuscation**: Three-tier obfuscation (crypto-core: maximum, vault-support: medium, general: standard)
- **Source maps disabled** in production
- **Debugger statements stripped**

---

## File Preview

| Format | Extensions | Engine |
|--------|-----------|--------|
| Image | jpg, png, gif, webp, svg, bmp, avif | `<img>` with temp links |
| Video | mp4, webm, ogg, mov, mkv | HTML5 `<video>` |
| Audio | mp3, wav, flac, aac, m4a, opus | HTML5 `<audio>` |
| PDF | pdf | pdfjs-dist canvas renderer |
| DOCX | docx | mammoth.js HTML conversion |
| XLSX | xlsx | xlsx library HTML table |
| PPTX | pptx | Google Docs Viewer embed |
| Code | js, ts, py, java, c, cpp, go, rs, 20+ | Monospace text preview |
| Vault | .vault | Decrypt-in-memory before preview |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+A` | Select all |
| `Ctrl+K` | Open search |
| `Ctrl+Shift+F` | Toggle favorites |
| `Ctrl+V` | Paste image from clipboard |
| `Delete` | Delete selected |
| `Escape` | Clear selection |
| `Space` | Preview focused file |
| `Arrow keys` | Navigate grid |
| `Shift+Arrow` | Extend selection |
| `Enter` | Open focused item |
| `Backspace` | Navigate up |

---

## Deployment

### Environment Variables

```env
# Frontend (.env)
VITE_DROPBOX_CLIENT_ID=your_dropbox_app_key
VITE_API_BASE_URL=http://localhost:3000
VITE_API_ENVELOPE_ENABLED=true
VITE_API_BASE=http://localhost:3000
VITE_CRYPTO_ENGINE=wasm (or) web
VITE_LINKS_SERVER_PUB_KEY=32-bit(eciesgenkeypair)

# Backend (.env.server)
PORT=3000
DROPBOX_CLIENT_ID=your_dropbox_app_key
DROPBOX_CLIENT_SECRET=your_dropbox_app_secret
DROPBOX_REFRESH_TOKEN=your_refresh_token
APP_ACCESS_PASSWORD=your_app_password
ALLOWED_ORIGINS=http://localhost:5173
API_ENVELOPE_ENABLED=true
APP_ACCESS_SESSION_SECRET=4d**32-bitrandom
LINKS_SERVER_PRIV_KEY=32-bit(eciesgenkeypair)
NODE_ENV=production
SHARE_TOKEN_SECRET=16-bithexstring
PORT=3000
```

### Build

```bash
# Frontend
npm install
npm run build

# Backend
cd ../StratusCloudbackend
npm install
node server.js
```

### Rust/WASM (Optional — required for v7/v8/v9 vaults)

```bash
cd rust/stratus-crypto-wasm
wasm-pack build --target web
cp -r pkg ../../src/lib/generated/
```

---


# Stratus Drive — Backend

Lightweight Express server that proxies Dropbox API calls, manages OAuth tokens, and serves the built frontend.

---

## Features

- **Dropbox API Proxy** — All Dropbox calls routed through server
- **OAuth Token Management** — PKCE-based token exchange with encrypted token cache
- **App Access Gate** — Password-protected app entry with rate limiting and IP blocking
- **Share Link Backend** — Link validation, PIN verification, file download proxy
- **API Envelope Encryption** — AES-256-GCM encrypted request/response wrapping
- **CSRF Protection** — Double-submit cookie pattern
- **Security Headers** — CSP, XSS protection, frame denial, content type sniffing prevention
- **Static File Serving** — Serves built frontend from `dist/` directory

---

## Environment Variables

```env
PORT=3000
DROPBOX_CLIENT_ID=your_dropbox_app_key
DROPBOX_CLIENT_SECRET=your_dropbox_app_secret
DROPBOX_REFRESH_TOKEN=your_refresh_token
APP_ACCESS_PASSWORD=your_app_password
ALLOWED_ORIGINS=http://localhost:5173
```

---

## Token Cache

Dropbox access tokens are encrypted with AES-256-GCM before writing to disk. The encryption key is derived from `DROPBOX_CLIENT_SECRET` using HMAC-SHA256 — the key is never stored, only derived at runtime.

<pre class="no-copy">
Token → AES-256-GCM(encryption_key, iv, plaintext) → Base64(iv + tag + ciphertext)
encryption_key = HMAC-SHA256(DROPBOX_CLIENT_SECRET, "stratus-token-cache-v1")
</pre>

---

## Run

```bash
npm install
node server.js
```

Server runs on port 3000 by default. Serves built frontend from `./dist/` if present.


## License

Proprietary — All rights reserved.
