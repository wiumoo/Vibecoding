/**
 * app-probe.mjs — headless authenticated discovery of the "我的课表" (schedule /
 * courses) app and profile API. Uses the Keychain-less cookie vault.
 *
 * Prints URL lists and JSON *structure* only; never personal values.
 *   npm run auth:app-probe
 */
import { chromium } from 'playwright';
import { loadSettings, ensureDataLayout, layoutOf } from '../config.mjs';
import { loadCookies, saveCookies } from '../auth/cookie-vault.mjs';
import { safeUrl, describeJson } from './describe.mjs';

const EHALL = 'https://ehall.nju.edu.cn';

async function getJson(context, url) {
  const resp = await context.request.get(url, { timeout: 30000 });
  const ct = resp.headers()['content-type'] || '';
  if (!ct.includes('json')) return { ct, body: null };
  return { ct, body: await resp.json() };
}

async function main() {
  const settings = await loadSettings();
  const L = await ensureDataLayout(settings);
  const cookies = await loadCookies(settings);
  if (!cookies.length) {
    process.stderr.write('NO_VAULT — run npm run auth:login first\n');
    process.exit(1);
  }

  const context = await chromium.launchPersistentContext('', { channel: 'chrome', headless: true });
  try {
    await context.addCookies(cookies);

    // --- 1. online app catalog: find 我的课表 etc. ---
    process.stdout.write('=== onlineYwtbApps structure ===\n');
    const catalog = await getJson(context, `${EHALL}/jsonp/ywtb/onlineYwtbApps?_=${Date.now()}&maxItems=200`);
    if (catalog.body) {
      process.stdout.write(describeJson(catalog.body).join('\n') + '\n');
      const items = Array.isArray(catalog.body.data) ? catalog.body.data : [];
      const wanted = items.filter((it) => /课表|成绩|选课|课|教务/.test(String(it.appName || it.name || it.title || '')));
      process.stdout.write('\n=== matching apps (values: only id/name/entry url) ===\n');
      for (const it of wanted) {
        const rec = { id: it.appId || it.id, name: it.appName || it.name };
        for (const k of Object.keys(it)) {
          const v = it[k];
          if (typeof v === 'string' && /^https?:|^\//.test(v) && !/token|ticket/i.test(k)) {
            rec['entry_' + k] = safeUrl(v);
          }
        }
        process.stdout.write(JSON.stringify(rec) + '\n');
      }
    }

    // --- 2. user info / profile endpoint structure ---
    process.stdout.write('\n=== getUserInfoAndSchoolInfo (keys only) ===\n');
    const ui = await getJson(context, `${EHALL}/jsonp/ywtb/info/getUserInfoAndSchoolInfo?_=${Date.now()}`);
    if (ui.body) process.stdout.write(describeJson(ui.body).join('\n') + '\n');

    // --- 3. navigate into 我的课表 if we found an entry url ---
    const items = Array.isArray(catalog.body?.data) ? catalog.body.data : [];
    const target = items.find((it) => /课表/.test(String(it.appName || it.name || '')));
    let entryUrl = null;
    if (target) {
      for (const k of Object.keys(target)) {
        const v = target[k];
        if (typeof v === 'string' && (v.startsWith('http') || v.startsWith('/'))) {
          if (!/token|ticket|userId/i.test(k)) entryUrl = v;
        }
      }
    }
    if (!entryUrl && target) {
      // Fallback: guess the standard appShow route with appId.
      entryUrl = `${EHALL}/ywtb-portal/official/index.html#/appShow?appId=${target.appId || target.id}`;
    }

    if (entryUrl) {
      process.stdout.write(`\n=== navigating to 我的课表 entry ===\n${safeUrl(entryUrl)}\n`);
      const page = context.pages()[0] || (await context.newPage());
      const seen = new Set();
      const onResp = (resp) => {
        const req = resp.request();
        if (req.resourceType() === 'xhr' || req.resourceType() === 'fetch') {
          const u = safeUrl(resp.url());
          if (/nju\.edu\.cn/.test(u) && !/\.css|\.js|\.png|\.jpg|\.ico/.test(u)) seen.add(u);
        }
      };
      page.on('response', onResp);
      await page.goto(entryUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => process.stdout.write('goto warn: ' + e.message.split('\n')[0] + '\n'));
      // Allow SPA / inner app to load and fire requests.
      for (let i = 0; i < 6; i++) await page.waitForTimeout(3000);
      page.off('response', onResp);

      process.stdout.write('\n=== captured endpoints while loading 我的课表 ===\n');
      const list = [...seen].sort();
      for (const u of list) process.stdout.write(u + '\n');
      process.stdout.write(`total=${list.length}\n`);

      process.stdout.write('\n=== structure of JSON endpoints ===\n');
      let n = 0;
      for (const u of list) {
        if (!/\.(json|do|action|htl)(\?|$)/i.test(u) && !/jsonp|appShow|kbcx|kb|course|schedule/i.test(u)) continue;
        if (n++ >= 25) break;
        const { body } = await getJson(context, u);
        process.stdout.write(`\n--- ${u}\n`);
        process.stdout.write(body ? describeJson(body).join('\n') : '(no json body)\n');
      }
    } else {
      process.stdout.write('\n我的课表 entry url not found in catalog.\n');
    }
  } finally {
    await context.close().catch(() => {});
  }
}

main().catch((e) => {
  process.stderr.write(`app-probe failed: ${e.message}\n`);
  process.exit(1);
});
