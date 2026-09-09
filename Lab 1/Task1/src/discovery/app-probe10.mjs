/**
 * app-probe10.mjs — confirm term code mapping and locate the visual timetable
 * (直观课表) data source by clicking the toggle and observing new calls.
 */
import { chromium } from 'playwright';
import { loadSettings, ensureDataLayout } from '../config.mjs';
import { loadCookies, saveCookies } from '../auth/cookie-vault.mjs';
import { safeUrl, leafFieldNames } from './describe.mjs';

const APP = 'https://ehallapp.nju.edu.cn/jwapp/sys/wdkb/*default/index.do';

async function main() {
  const settings = await loadSettings();
  const L = await ensureDataLayout(settings);
  const cookies = await loadCookies(settings);
  const context = await chromium.launchPersistentContext('', { channel: 'chrome', headless: true });
  try {
    await context.addCookies(cookies);
    const page = context.pages()[0] || (await context.newPage());
    const bodies = new Map();
    const responses = [];
    page.on('request', (req) => {
      const u = req.url();
      if (/wdkb\/modules/.test(u) && req.method() === 'POST' && !bodies.has(u.split('?')[0])) {
        bodies.set(u.split('?')[0], req.postData() || '');
      }
    });
    page.on('response', async (resp) => {
      const req = resp.request();
      const u = req.url();
      if (!/wdkb\/modules/.test(u)) return;
      const ct = resp.headers()['content-type'] || '';
      let shape = '';
      if (ct.includes('json')) {
        try {
          const js = await resp.json();
          const rowsInfo = [];
          const grab = (v, path) => {
            if (!v || typeof v !== 'object') return;
            if (Array.isArray(v)) {
              if (v.length) {
                rowsInfo.push(`${path}[]=${v.length} fields=${[...leafFieldNames(v[0])].length}`);
                grab(v[0], path + '[]');
              } else rowsInfo.push(`${path}[]=0`);
              return;
            }
            for (const k of Object.keys(v)) grab(v[k], path + '.' + k);
          };
          grab(js, '');
          shape = rowsInfo.join(' | ');
        } catch { shape = 'json?'; }
      }
      responses.push({ url: u, shape, keys: [...new URLSearchParams(req.postData() || '').keys()].join(',') });
    });

    await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(9000);

    // Confirm term mapping: UI XNXQDM value vs dqxnxq DM/MC.
    const termJson = await context.request.post('https://ehallapp.nju.edu.cn/jwapp/sys/wdkb/modules/jshkcb/dqxnxq.do', {
      data: '', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }, timeout: 30000,
    }).then((r) => r.json());
    const tr = termJson?.datas?.dqxnxq?.rows?.[0];
    if (tr) process.stdout.write(`term: DM=${tr.DM} XNDM=${tr.XNDM} XQDM=${tr.XQDM} MC=${tr.MC}\n`);
    const klBody = bodies.get('https://ehallapp.nju.edu.cn/jwapp/sys/wdkb/modules/xskcb/cxxskclb.do') || '';
    const klTerm = new URLSearchParams(klBody).get('XNXQDM');
    process.stdout.write(`UI XNXQDM matches DM? ${klTerm !== null && tr ? klTerm === tr.DM : 'n/a'}\n`);

    // Try toggling visual timetable & any nested links
    for (const lab of ['直观课表', '查看课表', '课表']) {
      const loc = page.locator(`text=${lab}`).first();
      if (await loc.isVisible().catch(() => false)) {
        process.stdout.write(`click: ${lab}\n`);
        await loc.click({ timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(6000);
      }
    }
    await page.waitForTimeout(4000);
    await saveCookies(settings, await context.cookies()).catch(() => {});

    process.stdout.write('\n=== module responses (order of occurrence) ===\n');
    for (const r of responses) process.stdout.write(`${safeUrl(r.url)}\n  keys: ${r.keys}\n  ${r.shape}\n`);
  } finally {
    await context.close().catch(() => {});
  }
}

main().catch((e) => {
  process.stderr.write(`app-probe10 failed: ${e.message}\n`);
  process.exit(1);
});
