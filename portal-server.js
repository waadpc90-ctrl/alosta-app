const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { spawn } = require('child_process');

const PORT = process.env.DEFAULT_APP_PORT || 3000;
const ASSETS_DIR = path.join(__dirname, 'app', 'src', 'main', 'assets');

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
  '.apk': 'application/vnd.android.package-archive'
};

let currentPublicTunnelUrl = '';

async function updateFirestorePortalUrl(tunnelUrl) {
  if (!tunnelUrl) return;
  try {
    const base = tunnelUrl.endsWith('/') ? tunnelUrl : (tunnelUrl + '/');
    const apkDirectUrl = 'https://github.com/waadpc90-ctrl/alosta-app/raw/main/AlOsta_App.apk';
    const dashApkDirectUrl = '';
    const endpoint = 'https://firestore.googleapis.com/v1/projects/craftsmanapp-3e46b/databases/(default)/documents/settings/app_config?updateMask.fieldPaths=portalBaseUrl&updateMask.fieldPaths=apkUrl&updateMask.fieldPaths=rawApkUrl&updateMask.fieldPaths=dashboardApkUrl&updateMask.fieldPaths=latestVersion&updateMask.fieldPaths=latestDashboardVersion&updateMask.fieldPaths=forceUpdate&updateMask.fieldPaths=stopUpdate&updateMask.fieldPaths=pushUpdateToken&updateMask.fieldPaths=pushTargetVersion';
    const res = await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          portalBaseUrl: { stringValue: 'https://waadpc90-ctrl.github.io/alosta-app/' },
          apkUrl: { stringValue: apkDirectUrl },
          rawApkUrl: { stringValue: apkDirectUrl },
          dashboardApkUrl: { stringValue: dashApkDirectUrl },
          latestVersion: { stringValue: '1.0.10' },
          latestDashboardVersion: { stringValue: '1.0.10' },
          forceUpdate: { booleanValue: true },
          stopUpdate: { booleanValue: false },
          pushUpdateToken: { stringValue: '' },
          pushTargetVersion: { stringValue: '' }
        }
      })
    });
    if (res.ok) {
      console.log('Synced public portalBaseUrl & apkUrl (v1.0.10) to Firestore:', apkDirectUrl);
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

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache');

    if (pathname === '/__portal_status') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, publicUrl: currentPublicTunnelUrl }));
      return;
    }

    if (pathname.toLowerCase().endsWith('.apk')) {
      const apkName = path.basename(pathname);
      const rootApkPath = path.join(__dirname, apkName);
      if (fs.existsSync(rootApkPath)) {
        const stat = fs.statSync(rootApkPath);
        res.writeHead(200, {
          'Content-Type': 'application/vnd.android.package-archive',
          'Content-Length': stat.size,
          'Content-Disposition': `attachment; filename="${apkName}"`
        });
        fs.createReadStream(rootApkPath).pipe(res);
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
      filePath = path.join(filePath, 'dashboard.html');
    }

    if (!fs.existsSync(filePath)) {
      filePath = path.join(ASSETS_DIR, 'dashboard.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Server Error');
        return;
      }
      const headers = { 'Content-Type': contentType };
      if (path.basename(filePath) === 'sw.js') {
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
  console.log(`Al-Osta Web & Store Portal Server listening on http://0.0.0.0:${PORT}`);
  startCloudflaredTunnel();
});
