/**
 * app-probe9.mjs — print the leaf field names (NO values) of the real data rows:
 * current term (dqxnxq), student basic info (cxxsjbxx), course list (cxxskclb),
 * and schedule-time info (cxxssksjctkcxx). Also prints row counts.
 */
import { chromium } from 'playwright';
import { loadSettings, ensureDataLayout } from '../config.mjs';
import { loadCookies, saveCookies } from '../auth/cookie-vault.mjs';
import { leafFieldNames } from './describe.mjs';

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
    page.on('request', (req) => {
      const u = req.url();
      if (/wdkb\/modules\/(xskcb|jshkcb)/.test(u) && req.method() === 'POST') {
        bodies.set(u.split('?')[0], req.postData() || '');
      }
    });
    await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    for (let i = 0; i < 8; i++) await page.waitForTimeout(3000);
    await saveCookies(settings, await context.cookies()).catch(() => {});

    const base = 'https://ehallapp.nju.edu.cn';
    const ctHdr = { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' };

    async function post(path, body) {
      const resp = await context.request.post(base + path, { data: body, headers: ctHdr, timeout: 30000 });
      const json = await resp.json();
      return json;
    }

    // dqxnxq — current term (replay with no body)
    const termJson = await post('/jwapp/sys/wdkb/modules/jshkcb/dqxnxq.do', '');
    const termRow = termJson?.datas?.dqxnxq?.rows?.[0] || null;
    process.stdout.write('\n=== dqxnxq (current term) ===\n');
    if (termRow) {
      process.stdout.write('leaf fields:\n' + [...leafFieldNames(termRow)].sort().join('\n') + '\n');
      // value-free presence checks
      for (const f of ['XNDM', 'XQDM', 'DM', 'MC', 'WID']) process.stdout.write(`${f}: ${termRow[f] !== undefined && termRow[f] !== null && termRow[f] !== '' ? 'present' : 'absent/empty'}\n`);
    } else process.stdout.write('(no row)\n');

    // cxxsjbxx — student info (needs XH from observed body; server infers if XH matches session)
    let sjBody = bodies.get(base + '/jwapp/sys/wdkb/modules/xskcb/cxxsjbxx.do') || 'XH=';
    const sjJson = await post('/jwapp/sys/wdkb/modules/xskcb/cxxsjbxx.do', sjBody);
    const sjRow = sjJson?.datas?.cxxsjbxx?.rows?.[0] || null;
    process.stdout.write('\n=== cxxsjbxx (student info) ===\n');
    if (sjRow) {
      process.stdout.write('row count: ' + sjJson.datas.cxxsjbxx.rows.length + '\n');
      process.stdout.write('leaf fields:\n' + [...leafFieldNames(sjRow)].sort().join('\n') + '\n');
    } else process.stdout.write('(no row)\n');

    // cxxskclb — course list for the current term. Use observed body with big page.
    let klBody = bodies.get(base + '/jwapp/sys/wdkb/modules/xskcb/cxxskclb.do') || 'XNXQDM=&pageSize=100&pageNumber=1';
    const sp = new URLSearchParams(klBody);
    sp.set('pageSize', '200');
    sp.set('pageNumber', '1');
    const klJson = await post('/jwapp/sys/wdkb/modules/xskcb/cxxskclb.do', sp.toString());
    const klRows = klJson?.datas?.cxxskclb?.rows || [];
    process.stdout.write('\n=== cxxskclb (course list) ===\n');
    process.stdout.write('totalSize: ' + klJson?.datas?.cxxskclb?.totalSize + ' rows returned: ' + klRows.length + '\n');
    if (klRows.length) {
      process.stdout.write('leaf fields:\n' + [...leafFieldNames(klRows[0])].sort().join('\n') + '\n');
    } else process.stdout.write('(no rows)\n');

    // cxxssksjctkcxx — schedule/time config
    let skBody = bodies.get(base + '/jwapp/sys/wdkb/modules/xskcb/cxxssksjctkcxx.do') || 'XNXQDM=';
    const skJson = await post('/jwapp/sys/wdkb/modules/xskcb/cxxssksjctkcxx.do', skBody);
    const sk = skJson?.datas?.cxxssksjctkcxx || null;
    process.stdout.write('\n=== cxxssksjctkcxx (schedule info) ===\n');
    if (sk) {
      process.stdout.write('keys: ' + Object.keys(sk).join(',') + '\n');
      const rows = sk.rows || [];
      process.stdout.write('rows: ' + rows.length + '\n');
      if (rows.length) process.stdout.write('leaf fields:\n' + [...leafFieldNames(rows[0])].sort().join('\n') + '\n');
    } else process.stdout.write('(none)\n');
  } finally {
    await context.close().catch(() => {});
  }
}

main().catch((e) => {
  process.stderr.write(`app-probe9 failed: ${e.message}\n`);
  process.exit(1);
});
