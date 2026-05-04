/**
 * get-dropbox-token.js
 *
 * Run this ONCE to get your long-lived refresh token.
 * Then paste the refresh token into .env.server as DROPBOX_REFRESH_TOKEN=...
 *
 * Usage:
 *   node get-dropbox-token.js
 *
 * Requirements:
 *   - DROPBOX_CLIENT_ID and DROPBOX_CLIENT_SECRET must be set in .env.server
 *   - Your Dropbox app redirect URI must include: http://localhost:9876/callback
 */

import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.server
const envPath = path.join(__dirname, '.env.server');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

const CLIENT_ID = process.env.DROPBOX_CLIENT_ID;
const CLIENT_SECRET = process.env.DROPBOX_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:9876/callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ DROPBOX_CLIENT_ID and DROPBOX_CLIENT_SECRET must be set in .env.server');
  process.exit(1);
}

// Generate PKCE code verifier + challenge
const crypto = await import('crypto');
const verifier = crypto.default.randomBytes(32).toString('base64url');
const challenge = crypto.default.createHash('sha256').update(verifier).digest('base64url');

const authUrl = new URL('https://www.dropbox.com/oauth2/authorize');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('code_challenge', challenge);
authUrl.searchParams.set('code_challenge_method', 'S256');
authUrl.searchParams.set('token_access_type', 'offline'); // ← gets refresh_token

console.log('\n🔐 Dropbox Refresh Token Generator');
console.log('=====================================');
console.log('\n1. Make sure http://localhost:9876/callback is added as a redirect URI');
console.log('   in your Dropbox App Console → OAuth 2 → Redirect URIs\n');
console.log('2. Open this URL in your browser:\n');
console.log('   ' + authUrl.toString());
console.log('\n3. Authorize the app — you will be redirected back automatically.\n');

// Start local server to catch the callback
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:9876');
  if (!url.pathname.startsWith('/callback')) {
    res.end('Not found');
    return;
  }

  const code = url.searchParams.get('code');
  if (!code) {
    res.end('❌ No code in callback. Try again.');
    server.close();
    return;
  }

  try {
    const tokenRes = await fetch('https://api.dropbox.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
      }),
    });

    const data = await tokenRes.json();

    if (!data.refresh_token) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<h2>❌ Error</h2><pre>${JSON.stringify(data, null, 2)}</pre>`);
      console.error('❌ No refresh token received:', data);
      server.close();
      return;
    }

    // Success!
    console.log('\n✅ SUCCESS! Add this to your .env.server:\n');
    console.log(`DROPBOX_REFRESH_TOKEN=${data.refresh_token}`);
    console.log('\nAccount ID:', data.account_id);
    console.log('Access Token (short-lived, ignore):', data.access_token?.slice(0, 20) + '...');

    // Auto-write to .env.server
    let envContent = fs.readFileSync(envPath, 'utf8');
    if (envContent.includes('DROPBOX_REFRESH_TOKEN=')) {
      envContent = envContent.replace(/DROPBOX_REFRESH_TOKEN=.*/g, `DROPBOX_REFRESH_TOKEN=${data.refresh_token}`);
    } else {
      envContent += `\nDROPBOX_REFRESH_TOKEN=${data.refresh_token}\n`;
    }
    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log('\n✅ Automatically saved to .env.server!');
    console.log('   Now restart your server: node server.js\n');

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <h2>✅ Success!</h2>
      <p>Refresh token saved to <code>.env.server</code></p>
      <p>You can close this tab and restart your server.</p>
      <pre>DROPBOX_REFRESH_TOKEN=${data.refresh_token.slice(0, 20)}...</pre>
    `);

  } catch (e) {
    console.error('❌ Token exchange error:', e.message);
    res.end('❌ Error: ' + e.message);
  }

  server.close();
});

server.listen(9876, () => {
  console.log('⏳ Waiting for Dropbox authorization...');
  console.log('   (Local server listening on http://localhost:9876/callback)\n');
});
