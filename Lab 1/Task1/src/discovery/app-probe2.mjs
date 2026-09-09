/**
 * app-probe2.mjs — headless exploration of the "我的课表" app host (ehallapp.nju.edu.cn).
 * Navigates the real pcOpenUrl, follows the ticket/login flow, captures endpoints,
 * then hunts for schedule/course data route patterns in loaded scripts.
 * Prints URLs and structure only.
 */
import { chromium } from 'playwright';
import { loadSettings, ensureDataLayout } from '../config.mjs';
import { loadCookies, saveCookies } from '../auth/cookie-vault.mjs';
import { safeUrl, describeJson } from './describe.mjs';

const URL_WDKB = 'https://ehallapp.nju.edu.cn/jwapp/sys/wdkb/*default/index.do';

async function main() {
  const settings = await loadSettings();
  const L = await ensureDataLayout(settings);
  const cookies = await loadCookies(settings);
  const context = await chromium.launchPersistentContext('', { channel: 'chrome', headless: true });
  try {
    await context.addCookies(cookies);
    const page = context.pages()[0] || (await context.newPage());

    const seen = new Set();
    const jsUrls = new Set();
    const onResp = (resp) => {
      const req = resp.request();
      const rt = req.resourceType();
      const u = safeUrl(resp.url());
      if (!/nju\.edu\.cn/.test(u)) return;
      if (rt === 'xhr' || rt === 'fetch' || /\.(do|json|action)(\?|$)/i.test(u) || /jsonp|appShow|qxgl|auth/i.test(u)) seen.add(u);
      if (rt === 'script') jsUrls.add(resp.url());
    };
    page.on('response', onResp);

    process.stdout.write(`navigating: ${URL_WDKB}\n`);
    await page.goto(URL_WDKB, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => process.stdout.write('goto: ' + e.message.split('\n')[0] + '\n'));
    for (let i = 0; i < 10; i++) await page.waitForTimeout(3000);
    const finalUrl = await page.evaluate(() => location.href).catch(() => '');
    process.stdout.write('final url: ' + safeUrl(finalUrl) + '\n');

    const list = [...seen].sort();
    process.stdout.write('\n=== captured ehallapp/ehall endpoints ===\n');
    for (const u of list) process.stdout.write(u + '\n');
    process.stdout.write(`total=${list.length}\n`);

    // Save cookies (may now include ehallapp domain session).
    await saveCookies(settings, await context.cookies()).catch(() => {});

    // --- look for data route patterns inside loaded scripts ---
    process.stdout.write('\n=== route hints in loaded scripts (wdkb/kbcx/kb/学期/term patterns) ===\n');
    const routeRe = /(modules|sys)\/[a-zA-Z0-9_*]+\/[a-zA-Z0-9_*]+\/[a-zA-Z0-9_.]+\.do/;
    const hits = new Set();
    for (const js of [...jsUrls].slice(0, 40)) {
      try {
        const resp = await context.request.get(js, { timeout: 20000 });
        const txt = await resp.text();
        for (const m of txt.matchAll(routeRe)) {
          const s = m[0];
          if (/kbcx|wdkb|kb|xsxk|xskb|cjcx|portal/i.test(s)) hits.add(s);
        }
        // also find xnxq (学年学期) style API names
        for (const m of txt.matchAll(/[a-zA-Z_]+(xnxq|xq|xn|semester|term|kbcx|xskb)[a-zA-Z0-9_.]*\.do/g)) {
          hits.add(m[0]);
        }
      } catch { /* ignore */ }
    }
    for (const h of [...hits].sort().slice(0, 60)) process.stdout.write(h + '\n');
    process.stdout.write(`hints total=${hits.size}\n`);
  } finally {
    await context.close().catch(() => {});
  }
}

main().catch((e) => {
  process.stderr.write(`app-probe2 failed: ${e.message}\n`);
  process.exit(1);
});
