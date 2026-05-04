// STUB - Original server removed for public release
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { buildCsp } from './server-security.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const startTime = Date.now();

app.use(express.json({ limit: '1mb' }));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', buildCsp());
  next();
});

// CORS
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',').map(s => s.trim());
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-CSRF-Token');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: `${((Date.now() - startTime) / 86400000).toFixed(2)} days` });
});

// STUB - All Dropbox proxy endpoints removed
app.post('/api/dropbox', (req, res) => res.status(501).json({ error: 'STUB' }));
app.post('/api/upload', (req, res) => res.status(501).json({ error: 'STUB' }));
app.get('/api/token', (req, res) => res.status(501).json({ error: 'STUB' }));
app.get('/api/auth/session', (req, res) => res.json({ authenticated: false }));
app.post('/api/auth/dropbox/token', (req, res) => res.status(501).json({ error: 'STUB' }));
app.post('/api/auth/logout', (req, res) => res.json({ ok: true }));
app.get('/api/app-access/session', (req, res) => res.json({ granted: false }));
app.post('/api/app-access/login', (req, res) => res.status(501).json({ error: 'STUB' }));
app.post('/api/app-access/logout', (req, res) => res.json({ ok: true }));
app.post('/api/links/load', (req, res) => res.json({ links: [] }));
app.post('/api/share/validate', (req, res) => res.status(501).json({ error: 'STUB' }));
app.post('/api/share/download', (req, res) => res.status(501).json({ error: 'STUB' }));
app.post('/api/share/download-file', (req, res) => res.status(501).json({ error: 'STUB' }));
app.post('/api/secure/bootstrap', (req, res) => res.status(501).json({ error: 'STUB' }));

// Serve frontend
const distPath = path.join(__dirname, 'dist');
const hasBundledFrontend = fs.existsSync(path.join(distPath, 'index.html'));
if (hasBundledFrontend) {
  app.use(express.static(distPath));
  app.get('*path', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
} else {
  app.get('/', (req, res) => res.json({ status: 'ok', service: 'stratuscloudbackend' }));
}

import fs from 'fs';
const server = createServer(app);
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

export async function shutdownServer() { server.close(); }
export { server };
export default app;
