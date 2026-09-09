/**
 * app-probe3.mjs — inspect wdkb data endpoints: method + post params + response
 * structure. Prints keys/param names only, never personal values.
 */
import { chromium } from 'playwright';
import { loadSettings, ensureDataLayout } from '../config.mjs';
import { loadCookies, saveCookies } from '../auth/cookie-vault.mjs';
import { safeUrl, describeJson } from './describe.mjs';

const APP = 'https://ehallapp.nju.edu.cn/jwapp/sys/wdkb/*default/index.do';
const CANDIDATES = [
  '/jwapp/sys/wdkb/modules/jshkcb/dqxnxq.do', // current term
  '/jwapp/sys/wdkb/modules/xskcb/cxxsjbxx.do', // student basic info
  '/jwapp/sys/wdkb/modules/xskcb/cxxskclb.do', // course list
  '/jwapp/sys/wdkb/modules/xskcb/cxxssksjctkcxx.do', // schedule times info
  '/jwapp/sys/wdkb/modules/xskcb.do',
];

function safeParams(pd) {
  if (!pd) return '(none)';
  try {
    const sp = new URLSearchParams(pd);
    return 'POST keys=' + [...sp.keys()].join(',');
  } catch {
    return '(raw ' + pd.length + 'b)';
  }
}

async function main() {
  const settings = await loadSettings();
  const L = await ensureDataLayout(settings);
  const cookies = await loadCookies(settings);
  const context = await chromium.launchPersistentContext('', { channel: 'chrome', headless: true });
  try {
    await context.addCookies(cookies);
    const page = context.pages()[0] || (await context.newPage());

    // Observe method + params while the app page loads.
    const calls = new Map();
    const onReq = (req) => {
      const url = req.url();
      const hit = CANDIDATES.find((c) => url.includes(c.split('/').pop()));
      if (!/wdkb\/modules/.test(url)) return;
      if (!calls.has(url)) calls.set(url, { method: req.method(), params: safeParams(req.postData()) });
    };
    page.on('request', onReq);

    await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch((e) => process.stdout.write('goto warn: ' + e.message.split('\n')[0] + '\n'));
    for (let i = 0; i < 8; i++) await page.waitForTimeout(3000);
    page.off('request', onReq);

    process.stdout.write('=== observed wdkb module calls ===\n');
    for (const [u, v] of [...calls.entries()].sort()) {
      process.stdout.write(`${v.method} ${safeUrl(u)}  ${v.params}\n`);
    }
    await saveCookies(settings, await context.cookies()).catch(() => {});

    // Now call each candidate (same method/params as observed, else GET) and print structure.
    process.stdout.write('\n=== response structures ===\n');
    for (const cand of CANDIDATES) {
      const obs = calls.get(APP.replace('*default/index.do', cand)) || calls.get(cand);
      const url = cand.startsWith('http') ? cand : `https://ehallapp.nju.edu.cn${cand}`;
      process.stdout.write(`\n--- ${url}\n`);
      try {
        const resp = await context.request.get(url, { timeout: 30000 });
        const ct = resp.headers()['content-type'] || '';
        process.stdout.write(`GET http=${resp.status()} ct=${ct.split(';')[0]}\n`);
        if (ct.includes('json')) process.stdout.write(describeJson(await resp.json()).join('\n') + '\n');
        else process.stdout.write('(non-json, len=' + ((await resp.body()).length) + ')\n');
      } catch (e) {
        process.stdout.write('GET error: ' + e.message.split('\n')[0] + '\n');
      }
    }
  } finally {
    await context.close().catch(() => {});
  }
}

main().catch((e) => {
  process.stderr.write(`app-probe3 failed: ${e.message}\n`);
  process.exit(1);
});
