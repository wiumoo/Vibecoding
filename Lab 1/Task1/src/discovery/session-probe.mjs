/**
 * session-probe.mjs — ONE interactive session that:
 *   1) logs in (human solves slider),
 *   2) audits the resulting cookies (names/hosts/expiry only),
 *   3) reloads the ehall portal and captures JSON/XHR endpoint URLs,
 *   4) prints response *structure* (keys/types) for captured endpoints,
 *   5) searches the app catalog for schedule/course/profile related services.
 *
 * Personal values are never printed. Run in Terminal:
 *   npm run auth:probe
 */
import { chromium } from 'playwright';
import { loadSettings, ensureDataLayout, layoutOf } from '../config.mjs';
import { doLogin, verifySession } from '../auth/login-flow.mjs';
import { safeUrl, describeJson } from './describe.mjs';

const E = (s) => s.ehall;

async function auditCookies(context) {
  const cookies = await context.cookies();
  const rows = cookies
    .filter((c) => c.domain.includes('nju.edu.cn'))
    .map((c) => ({
      host: c.domain,
      name: c.name,
      exp: c.expires === -1 ? 'session' : new Date(c.expires * 1000).toISOString(),
      httpOnly: c.httpOnly,
    }));
  process.stdout.write('\n=== COOKIE AUDIT (names/expiry only) ===\n');
  for (const r of rows) process.stdout.write(JSON.stringify(r) + '\n');
  process.stdout.write(`total=${rows.length}\n`);
}

async function captureEndpoints(page, seconds) {
  const seen = new Set();
  const onResp = (resp) => {
    const req = resp.request();
    if (req.resourceType() === 'xhr' || req.resourceType() === 'fetch') {
      const u = safeUrl(resp.url());
      if (/nju\.edu\.cn/.test(u)) seen.add(u);
    }
  };
  page.on('response', onResp);
  await page.goto(E(await loadSettings()).portalHome, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(seconds * 1000);
  page.off('response', onResp);
  return [...seen].sort();
}

async function fetchStructure(context, url) {
  try {
    const resp = await context.request.get(url, { timeout: 20000 });
    const ct = (resp.headers()['content-type'] || '');
    if (!ct.includes('json')) return '  (content-type=' + ct.split(';')[0] + ')';
    const body = await resp.json();
    return describeJson(body).join('\n');
  } catch (e) {
    return `  (error ${e.message.split('\n')[0].slice(0, 90)})`;
  }
}

async function searchApps(context, endpoints) {
  process.stdout.write('\n=== SERVICE/APP CATALOG SEARCH ===\n');
  const kw = /课表|课|选课|教务|学籍|成绩|教学|课程|课表|个人资料|个人信息|我的/;
  for (const ep of endpoints) {
    if (!/app|service|desktop|category|recUse|center/i.test(ep)) continue;
    try {
      const resp = await context.request.get(ep, { timeout: 20000 });
      if (!(resp.headers()['content-type'] || '').includes('json')) continue;
      const body = await resp.json();
      const hits = [];
      const walk = (v, depth) => {
        if (!v || depth > 5) return;
        if (Array.isArray(v)) { v.forEach((x) => walk(x, depth + 1)); return; }
        if (typeof v === 'object') {
          const name = String(v.appName || v.serviceName || v.name || v.title || '');
          if (kw.test(name)) {
            hits.push({
              name: name.slice(0, 60),
              id: v.appId || v.serviceId || v.id || '',
              url: v.appUrl || v.url || v.href || '',
            });
          }
          for (const k of Object.keys(v)) walk(v[k], depth + 1);
        }
      };
      walk(body, 0);
      if (hits.length) {
        process.stdout.write(`\n[${safeUrl(ep)}]\n`);
        for (const h of hits.slice(0, 30)) {
          const u = /nju\.edu\.cn/.test(h.url) ? safeUrl(h.url) : h.url.slice(0, 120);
          process.stdout.write(`  name=${h.name} id=${h.id} url=${u}\n`);
        }
      }
    } catch { /* next */ }
  }
}

async function main() {
  const settings = await loadSettings();
  const L = await ensureDataLayout(settings);
  const started = Date.now();

  const context = await chromium.launchPersistentContext(L.profileDir, {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1360, height: 920 },
  });
  const page = context.pages()[0] || (await context.newPage());

  try {
    await doLogin({ context, page, settings, started });
    await verifySession({ context, settings });
    await auditCookies(context);

    process.stdout.write('\nCapturing portal endpoints (please wait ~15s)...\n');
    const endpoints = await captureEndpoints(page, 15);
    process.stdout.write('\n=== PORTAL XHR/FETCH ENDPOINTS ===\n');
    for (const u of endpoints) process.stdout.write(u + '\n');
    process.stdout.write(`total=${endpoints.length}\n`);

    process.stdout.write('\n=== TOP STRUCTURE (first 20 json endpoints) ===\n');
    let n = 0;
    for (const u of endpoints) {
      if (!/\.(json|do|htl)(\?|$)/i.test(u) && !/jsonp/i.test(u)) continue;
      if (n++ >= 20) break;
      process.stdout.write(`\n--- ${u}\n`);
      const s = await fetchStructure(context, u);
      process.stdout.write(s + '\n');
    }

    await searchApps(context, endpoints);
    process.stdout.write('\nProbe finished. Closing browser.\n');
  } finally {
    await context.close().catch(() => {});
  }
}

main().catch((e) => {
  process.stderr.write(`session-probe failed: ${e.message}\n`);
  process.exit(1);
});
