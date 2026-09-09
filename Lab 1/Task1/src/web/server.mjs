/**
 * server.mjs — LOCAL TRUSTED read-only HTTP server.
 *
 *   node src/web/server.mjs            # http://127.0.0.1:4317
 *   node src/web/server.mjs --port 0  # ephemeral port (tests / tooling)
 *
 * Binds IPv4 loopback only. Serves a static HTML shell + explicit allowlisted
 * assets and one JSON endpoint (GET /api/view). Opening a page or calling the
 * API never syncs, saves snapshots, touches state, runs git, or starts the
 * launchd agent — the server only reads the PRIVATE snapshot files.
 */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promises as fs } from 'node:fs';
import { loadSettings } from '../config.mjs';
import { buildApiView } from './view-model.mjs';
import { securityHeaders, newAccessKey, hostAllowed, originAllowed, fetchMetadataAllowed, methodAllowed } from './security.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(MODULE_DIR, '..');
const PUBLIC_DIR = path.join(MODULE_DIR, 'public');
const QUERY_DIR = path.join(PROJECT_ROOT, 'query');

/** Explicit asset allowlist — the only files ever served. */
function buildAssets() {
  const map = new Map();
  const add = (urlPath, abs) => map.set(urlPath, abs);
  add('/', path.join(PUBLIC_DIR, 'index.html'));
  add('/assets/icon.svg', path.join(PUBLIC_DIR, 'icon.svg'));
  const css = ['tokens', 'layout', 'components', 'timetable'];
  for (const n of css) add(`/assets/styles/${n}.css`, path.join(PUBLIC_DIR, 'styles', `${n}.css`));
  for (const n of ['app', 'api', 'components', 'locale']) {
    add(`/assets/${n}.mjs`, path.join(PUBLIC_DIR, `${n}.mjs`));
  }
  for (const n of ['overview', 'profile', 'courses', 'schedule', 'search']) {
    add(`/assets/pages/${n}.mjs`, path.join(PUBLIC_DIR, 'pages', `${n}.mjs`));
  }
  // Shared pure query modules served verbatim so CLI and Web use the same code.
  add('/assets/modules/timetable.mjs', path.join(QUERY_DIR, 'timetable.mjs'));
  add('/assets/modules/service.mjs', path.join(QUERY_DIR, 'service.mjs'));
  return map;
}

const CONTENT = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function sendJson(res, status, obj, port) {
  const headers = securityHeaders(port);
  headers['Content-Type'] = CONTENT['.json'];
  res.writeHead(status, headers);
  res.end(JSON.stringify(obj));
}

export async function createServer(settings = null, { port = 4317, accessKey = null } = {}) {
  const s = settings || (await loadSettings());
  const key = accessKey || newAccessKey();
  const assets = buildAssets();

  const server = http.createServer(async (req, res) => {
    // ---- header-level guard (applies to every route) ----
    const raw = req.url || '/';
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(raw, 'http://127.0.0.1').pathname);
    } catch {
      sendJson(res, 400, { error: { code: 'BAD_URL' } }, 0);
      return;
    }

    const handleError = (status, code) => {
      if (!res.headersSent) sendJson(res, status, { error: { code } }, 0);
      else res.destroy();
    };

    try {
      const boundPort = server.address()?.port;
      const hh = req.headers.host;
      if (!hostAllowed(hh, boundPort)) return handleError(403, 'HOST_FORBIDDEN');
      if (!originAllowed(req.headers.origin, boundPort)) return handleError(403, 'ORIGIN_FORBIDDEN');
      if (!fetchMetadataAllowed(req.headers['sec-fetch-site'])) return handleError(403, 'FETCH_METADATA_FORBIDDEN');
      if (!methodAllowed(req.method)) {
        res.writeHead(405, { Allow: 'GET, HEAD', ...securityHeaders(boundPort) });
        res.end();
        return;
      }

      if (pathname === '/') {
        const body = await fs.readFile(assets.get('/'));
        res.writeHead(200, { 'Content-Type': CONTENT['.html'], ...securityHeaders(boundPort) });
        res.end(body);
        return;
      }

      if (pathname.startsWith('/assets/')) {
        const abs = assets.get(pathname);
        if (!abs) return handleError(404, 'NOT_FOUND');
        const body = await fs.readFile(abs);
        const ext = path.extname(abs).toLowerCase();
        res.writeHead(200, { 'Content-Type': CONTENT[ext] || 'application/octet-stream', ...securityHeaders(boundPort) });
        res.end(body);
        return;
      }

      if (pathname === '/api/view') {
        if (raw.includes('?')) return handleError(400, 'NO_PARAMS');
        if (req.headers['x-task1-key'] !== key) return handleError(401, 'ACCESS_KEY_REQUIRED');
        const { payload } = await buildApiView(s);
        const headers = securityHeaders(boundPort);
        headers['Content-Type'] = CONTENT['.json'];
        res.writeHead(200, headers);
        res.end(JSON.stringify(payload));
        return;
      }

      return handleError(404, 'NOT_FOUND');
    } catch (e) {
      // Never log request content; only a generic code.
      try {
        handleError(500, 'SERVER_ERROR');
      } catch { /* ignore */ }
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const boundPort = server.address().port;
  return { server, port: boundPort, accessKey: key, url: `http://127.0.0.1:${boundPort}` };
}

async function main() {
  const argv = process.argv.slice(2);
  let port = 4317;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port' && argv[i + 1]) port = Number(argv[i + 1]);
  }
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    process.stderr.write('invalid --port value\n');
    process.exit(1);
  }
  const { server, url, accessKey } = await createServer(null, { port });
  process.stdout.write('────────────────────────────────────────────────────────\n');
  process.stdout.write('  Task1 Local Dashboard (LOCAL TRUSTED · READ ONLY)\n');
  process.stdout.write(`  주소 : ${url}\n`);
  process.stdout.write('  접근 : 브라우저로 위 주소를 연 뒤 아래 키를 입력하세요\n');
  process.stdout.write(`  키   : ${accessKey}\n`);
  process.stdout.write('  종료 : Ctrl+C\n');
  process.stdout.write('  주의 : 이 화면은 저장된 snapshot만 읽습니다.\n');
  process.stdout.write('         sync/Git/launchd 를 실행하거나 수정하지 않습니다.\n');
  process.stdout.write('         외부 배포·원격 접속 용도가 아닙니다.\n');
  process.stdout.write('────────────────────────────────────────────────────────\n');
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    process.stdout.write('\n서버를 종료합니다.\n');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 800).unref();
  };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    process.stderr.write(`server failed: ${e.message}\n`);
    process.exit(1);
  });
}

export { buildAssets };
