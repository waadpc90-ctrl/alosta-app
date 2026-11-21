const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { spawn } = require('child_process');

const PORT = process.env.DEFAULT_APP_PORT || 3000;
const ASSETS_DIR = path.join(__dirname, 'app', 'src', 'main', 'assets');
const PORTAL_VERSION = '1.0.18';
const GITHUB_PAGES_BASE = 'https://waadpc90-ctrl.github.io/alustadh/';
const GITHUB_APK_URL = 'https://github.com/waadpc90-ctrl/alustadh/raw/main/AlOsta_App.apk';

const ALLOWED_ORIGINS = new Set([
  'https://waadpc90-ctrl.github.io',
  'https://craftsmanapp-3e46b.web.app',
  'https://craftsmanapp-3e46b.firebaseapp.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
]);

const isOriginAllowed = (origin) => {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.(run\.app|trycloudflare\.com)$/i.test(origin)) return true;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
  return false;
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json',
  '.mp4': 'video/mp4',
  '.apk': 'application/vnd.android.package-archive',
  '.zip': 'application/zip'
};

let currentPublicTunnelUrl = '';

async function updateFirestorePortalUrl(tunnelUrl) {
  if (!tunnelUrl) return;
  // Require explicit platform admin bearer token; never attempt unauthenticated Firestore writes
  const adminToken = String(process.env.FIREBASE_ADMIN_TOKEN || '').trim();
  if (!adminToken) return;
  try {
    const endpoint = 'https://firestore.googleapis.com/v1/projects/craftsmanapp-3e46b/databases/(default)/documents/settings/app_config?updateMask.fieldPaths=portalBaseUrl&updateMask.fieldPaths=apkUrl&updateMask.fieldPaths=rawApkUrl&updateMask.fieldPaths=latestVersion';
    const res = await fetch(endpoint, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        fields: {
          portalBaseUrl: { stringValue: GITHUB_PAGES_BASE },
          apkUrl: { stringValue: GITHUB_APK_URL },
          rawApkUrl: { stringValue: GITHUB_APK_URL },
          latestVersion: { stringValue: PORTAL_VERSION }
        }
      })
    });
    if (res.ok) {
      console.log(`Synced portalBaseUrl & apkUrl (v${PORTAL_VERSION}) to Firestore:`, GITHUB_APK_URL);
    }
  } catch (err) {
    console.error('Failed to sync portalBaseUrl:', err.message);
  }
}

function startCloudflaredTunnel() {
  const binPath = path.join(__dirname, '.portal', 'cloudflared');
  if (!fs.existsSync(binPath)) return;
  try {
    const child = spawn(binPath, ['tunnel', '--url', `http://localhost:${PORT}`, '--no-autoupdate', '--protocol', 'http2'], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const onOutput = (chunk) => {
      const text = String(chunk || '');
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (match && match[0] && match[0] !== currentPublicTunnelUrl) {
        currentPublicTunnelUrl = match[0];
        console.log('PUBLIC_TUNNEL_URL=' + currentPublicTunnelUrl);
        updateFirestorePortalUrl(currentPublicTunnelUrl);
      }
    };
    child.stdout.on('data', onOutput);
    child.stderr.on('data', onOutput);
    child.on('exit', () => {
      setTimeout(startCloudflaredTunnel, 5000);
    });
  } catch (e) {
    console.error('Tunnel error:', e.message);
  }
}

const server = http.createServer((req, res) => {
  try {
    const parsedUrl = url.parse(req.url || '/', true);
    let pathname = decodeURIComponent(parsedUrl.pathname || '/');

    const reqOrigin = req.headers.origin;
    if (isOriginAllowed(reqOrigin)) {
      res.setHeader('Access-Control-Allow-Origin', reqOrigin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cache-Control', 'no-cache');

    if (pathname === '/__portal_status') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: true,
        version: PORTAL_VERSION,
        portalBaseUrl: GITHUB_PAGES_BASE,
        publicUrl: currentPublicTunnelUrl
      }));
      return;
    }

    if (pathname === '/contractor-video.html') {
      const extVideoPage = path.join(__dirname, 'contractor-video.html');
      if (fs.existsSync(extVideoPage)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        fs.createReadStream(extVideoPage).pipe(res);
        return;
      }
    }

    if (pathname.toLowerCase().endsWith('.apk') || pathname.toLowerCase().endsWith('.mp4') || pathname.toLowerCase().endsWith('.zip')) {
      const fileName = path.basename(pathname);
      const isMp4 = fileName.toLowerCase().endsWith('.mp4');
      const isZip = fileName.toLowerCase().endsWith('.zip');
      let targetFilePath = path.join(__dirname, fileName);
      if (!fs.existsSync(targetFilePath)) {
        targetFilePath = path.join(__dirname, '.portal', fileName);
      }
      if (!fs.existsSync(targetFilePath)) {
        targetFilePath = path.join(ASSETS_DIR, fileName);
      }
      if (fs.existsSync(targetFilePath)) {
        const stat = fs.statSync(targetFilePath);
        const mime = isMp4 ? 'video/mp4' : isZip ? 'application/zip' : 'application/vnd.android.package-archive';
        const range = req.headers.range;
        if (isMp4 && range) {
          const parts = range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10) || 0;
          const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
          const chunkSize = (end - start) + 1;
          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': mime
          });
          fs.createReadStream(targetFilePath, { start, end }).pipe(res);
          return;
        }
        res.writeHead(200, {
          'Content-Type': mime,
          'Content-Length': stat.size,
          'Accept-Ranges': 'bytes',
          ...(parsedUrl.query && parsedUrl.query.download ? { 'Content-Disposition': `attachment; filename="${fileName}"` } : (!isMp4 ? { 'Content-Disposition': `attachment; filename="${fileName}"` } : {}))
        });
        fs.createReadStream(targetFilePath).pipe(res);
        return;
      }
    }

    if (pathname === '/' || pathname === '/index.html') {
      pathname = (parsedUrl.query && parsedUrl.query.storePortal) ? '/dashboard.html' : '/index.html';
    }

    const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    let filePath = path.join(ASSETS_DIR, safePath);

    if (!filePath.startsWith(ASSETS_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    if (!fs.existsSync(filePath)) {
      filePath = path.join(ASSETS_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const baseName = path.basename(filePath).toLowerCase();
    const contentType = baseName === 'manifest.json'
      ? 'application/manifest+json; charset=utf-8'
      : (MIME_TYPES[ext] || 'application/octet-stream');

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Server Error');
        return;
      }
      const headers = { 'Content-Type': contentType };
      if (baseName === 'sw.js') {
        headers['Service-Worker-Allowed'] = '/';
      }
      res.writeHead(200, headers);
      res.end(content);
    });
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Al-Osta Web & Store Portal Server v${PORTAL_VERSION} listening on http://0.0.0.0:${PORT}`);
  startCloudflaredTunnel();
});
