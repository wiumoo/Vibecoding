/**
 * app-probe4.mjs — replay the wdkb app's own POST bodies (kept in memory only)
 * against candidate endpoints and print the response *field names*.
 * No personal values are printed.
 */
import { chromium } from 'playwright';
import { loadSettings, ensureDataLayout } from '../config.mjs';
import { loadCookies, saveCookies } from '../auth/cookie-vault.mjs';
import { safeUrl, leafFieldNames, describeJson } from './describe.mjs';

const APP = 'https://ehallapp.nju.edu.cn/jwapp/sys/wdkb/*default/index.do';
const INTEREST = [
  'dqxnxq.do', 'xskcb.do', 'cxxsjbxx.do', 'cxxskclb.do',
  'cxxssksjctkcxx.do', 'cxbxqxkcztdgxdlb.do', 'cxxsxkyyhcjcztdgxdlb.do',
];

async function main() {
  const settings = await loadSettings();
  const L = await ensureDataLayout(settings);
  const cookies = await loadCookies(settings);
  const context = await chromium.launchPersistentContext('', { channel: 'chrome', headless: true });
  try {
    await context.addCookies(cookies);
    const page = context.pages()[0] || (await context.newPage());

    const bodies = new Map();
    const onReq = (req) => {
      const u = req.url();
      if (/wdkb\/modules/.test(u) && INTEREST.some((f) => u.includes(f))) {
        if (!bodies.has(u)) bodies.set(u, req.postData() || '');
      }
    };
    page.on('request', onReq);
    await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    for (let i = 0; i < 8; i++) await page.waitForTimeout(3000);
    page.off('request', onReq);
    await saveCookies(settings, await context.cookies()).catch(() => {});

    const base = 'https://ehallapp.nju.edu.cn';
    for (const [url, body] of [...bodies.entries()].sort()) {
      process.stdout.write(`\n===== ${safeUrl(url)} =====\n`);
      process.stdout.write(`postData: ${body ? '(captured, ' + body.length + 'b)' : '(none)'}\n`);
      try {
        const resp = await context.request.post(url, {
          data: body || '',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          timeout: 30000,
        });
        const ct = resp.headers()['content-type'] || '';
        process.stdout.write(`POST http=${resp.status()} ct=${ct.split(';')[0]}\n`);
        if (ct.includes('json')) {
          const json = await resp.json();
          const walk = (v, p) => {
            if (!v || typeof v !== 'object') return;
            if (Array.isArray(v)) { if (v.length) walk(v[0], p); return; }
            for (const k of Object.keys(v)) {
              const val = v[k];
              if (val !== null && typeof val === 'object') walk(val, p ? p + '.' + k : k);
              else process.stdout.write(`field: ${p ? p + '.' + k : k} (${typeof val})\n`);
            }
          };
          process.stdout.write('fields:\n');
          for (const k of Object.keys(json)) {
            const v = json[k];
            if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
              // descend one level naming containers then leaves under each
              process.stdout.write(`container: ${k}\n`);
              walk(v, k);
            } else if (Array.isArray(v)) {
              process.stdout.write(`array: ${k} len=${v.length}\n`);
              if (v.length) walk(v[0], k + '[]');
            } else {
              process.stdout.write(`field: ${k} (${typeof v})\n`);
            }
          }
        } else {
          process.stdout.write('(non-json len=' + (await resp.body()).length + ')\n');
        }
      } catch (e) {
        process.stdout.write('error: ' + e.message.split('\n')[0] + '\n');
      }
    }
  } finally {
    await context.close().catch(() => {});
  }
}

main().catch((e) => {
  process.stderr.write(`app-probe4 failed: ${e.message}\n`);
  process.exit(1);
});
