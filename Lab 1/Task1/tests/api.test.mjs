import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createServer, buildAssets } from '../src/web/server.mjs';
import { hostAllowed, originAllowed, fetchMetadataAllowed, methodAllowed } from '../src/web/security.mjs';
import { makeSettings, seedSnapshot, syncedState, fingerprint } from './helpers.mjs';

function request(port, pathname, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: pathname, method, headers }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function closeServer(server) {
  await new Promise((r) => {
    server.close(() => r());
    server.closeAllConnections?.();
    server.closeIdleConnections?.();
    setTimeout(r, 300).unref();
  });
}

async function withServer(settings, fn, key = 'test-access-key-123') {
  const { server, port, url } = await createServer(settings, { port: 0, accessKey: key });
  const addr = server.address();
  try {
    return await fn({ port, url, address: addr.address, family: addr.family });
  } finally {
    await closeServer(server);
  }
}

test('security: guard predicates behave as designed', () => {
  assert.equal(hostAllowed('127.0.0.1:4317', 4317), true);
  assert.equal(hostAllowed('localhost:4317', 4317), false);
  assert.equal(hostAllowed('evil.example:4317', 4317), false);
  assert.equal(originAllowed('http://127.0.0.1:4317', 4317), true);
  assert.equal(originAllowed('http://evil.example', 4317), false);
  assert.equal(fetchMetadataAllowed('cross-site'), false);
  assert.equal(fetchMetadataAllowed('same-origin'), true);
  assert.equal(methodAllowed('GET'), true);
  assert.equal(methodAllowed('POST'), false);
});

test('api: server binds only 127.0.0.1 and serves shell without personal data', async () => {
  const settings = await makeSettings();
  await withServer(settings, async ({ port, address, family }) => {
    assert.equal(family, 'IPv4');
    assert.ok(/127\.0\.0\.1/.test(address));
    const r = await request(port, '/');
    assert.equal(r.status, 200);
    assert.match(r.headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.ok(r.headers['cache-control'].includes('no-store'));
    // the shell carries no private profile values at all
    assert.ok(!r.body.includes('홍길동'));
  });
});

test('api: full flow with healthy snapshot + healthy state', async () => {
  const settings = await makeSettings();
  const state = syncedState({ lastCollectedAt: new Date().toISOString(), lastStatus: 'no-change' });
  await seedSnapshot(settings, { state });
  await withServer(settings, async ({ port }) => {
    // no key -> 401
    let r = await request(port, '/api/view');
    assert.equal(r.status, 401);
    // wrong key -> 401
    r = await request(port, '/api/view', { headers: { 'x-task1-key': 'wrong' } });
    assert.equal(r.status, 401);
    // correct key -> 200
    r = await request(port, '/api/view', { headers: { 'x-task1-key': 'test-access-key-123' } });
    assert.equal(r.status, 200);
    const p = JSON.parse(r.body);
    assert.equal(p.api_version, 1);
    assert.equal(p.data_state, 'ok');
    assert.equal(p.snapshot.term, '2026-2027-1');
    assert.equal(p.snapshot.courses.length, 1);
    assert.equal(p.status.freshness, 'fresh');
    assert.equal(p.capabilities.period_times, false);
    assert.equal(p.capabilities.exceptions, false);
    // never forward raw state internals / remote URLs
    assert.equal('gitApproved' in p, false);
    assert.ok(!JSON.stringify(p).includes('github.com'));
    // xss attempt inside data remains inert JSON text (client escapes it)
  });
});

test('api: no snapshot yet -> data_state empty, still 200', async () => {
  const settings = await makeSettings();
  await withServer(settings, async ({ port }) => {
    const r = await request(port, '/api/view', { headers: { 'x-task1-key': 'test-access-key-123' } });
    assert.equal(r.status, 200);
    const p = JSON.parse(r.body);
    assert.equal(p.data_state, 'empty');
    assert.equal(p.snapshot, null);
  });
});

test('api: corrupt current -> data_state error with typed code', async () => {
  const settings = await makeSettings();
  const L = (await import('../src/config.mjs')).layoutOf(settings);
  await fs.mkdir(L.privateDir, { recursive: true });
  await fs.writeFile(path.join(L.privateDir, 'current.json'), 'not json');
  await withServer(settings, async ({ port }) => {
    const r = await request(port, '/api/view', { headers: { 'x-task1-key': 'test-access-key-123' } });
    const p = JSON.parse(r.body);
    assert.equal(p.data_state, 'error');
    assert.equal(p.data_error, 'CURRENT_CORRUPT');
  });
});

test('api: host/origin/fetch-metadata/method and path guards', async () => {
  const settings = await makeSettings();
  await seedSnapshot(settings, {});
  await withServer(settings, async ({ port }) => {
    const good = { 'x-task1-key': 'test-access-key-123' };
    let r = await request(port, '/api/view', { headers: { ...good, host: 'evil.example:80' } });
    assert.equal(r.status, 403);
    r = await request(port, '/api/view', { headers: { ...good, origin: 'http://evil.example' } });
    assert.equal(r.status, 403);
    r = await request(port, '/api/view', { headers: { ...good, 'sec-fetch-site': 'cross-site' } });
    assert.equal(r.status, 403);
    r = await request(port, '/api/view', { method: 'POST', headers: good });
    assert.equal(r.status, 405);
    r = await request(port, '/api/view?q=secret', { headers: good });
    assert.equal(r.status, 400);
    // traversal / config / private / git are never served
    for (const p of ['/assets/../../src/config.mjs', '/config/settings.json', '/private/current.json', '/.git/config', '/auth']) {
      r = await request(port, p, { headers: good });
      assert.equal(r.status, 404, p);
    }
    r = await request(port, '/api/unknown', { headers: good });
    assert.equal(r.status, 404);
  });
});

test('api: restart invalidates the previous access key', async () => {
  const settings = await makeSettings();
  await seedSnapshot(settings, {});
  const s1 = await createServer(settings, { port: 0, accessKey: 'key-a' });
  const port1 = s1.port;
  const r1 = await request(port1, '/api/view', { headers: { 'x-task1-key': 'key-a' } });
  assert.equal(r1.status, 200);
  await closeServer(s1.server);

  const s2 = await createServer(settings, { port: 0, accessKey: 'key-b' });
  const port2 = s2.port;
  const stale = await request(port2, '/api/view', { headers: { 'x-task1-key': 'key-a' } });
  assert.equal(stale.status, 401);
  const fresh = await request(port2, '/api/view', { headers: { 'x-task1-key': 'key-b' } });
  assert.equal(fresh.status, 200);
  await closeServer(s2.server);
});

test('api: read-only proof — private tree unchanged across all requests', async () => {
  const settings = await makeSettings();
  await seedSnapshot(settings, { state: syncedState() });
  const before = await fingerprint(settings);
  await withServer(settings, async ({ port }) => {
    const good = { 'x-task1-key': 'test-access-key-123' };
    await request(port, '/');
    await request(port, '/assets/app.mjs');
    await request(port, '/assets/modules/timetable.mjs');
    await request(port, '/assets/styles/tokens.css');
    await request(port, '/api/view', { headers: good });
    await request(port, '/api/view', { headers: { ...good, origin: 'http://x' } });
    await request(port, '/api/view', { method: 'POST', headers: good });
    await request(port, '/api/view?x=1', { headers: good });
    await request(port, '/does-not-exist', { headers: good });
    await request(port, '/assets/../config/settings.json');
  });
  const after = await fingerprint(settings);
  assert.equal(before, after);
});

test('assets: only explicit files are served', () => {
  const assets = buildAssets();
  assert.ok(assets.get('/')?.endsWith('index.html'));
  assert.ok(assets.get('/assets/modules/timetable.mjs')?.endsWith('timetable.mjs'));
  assert.ok(assets.get('/assets/pages/schedule.mjs'));
  assert.equal(assets.get('/assets/../../x'), undefined);
});
