/**
 * app-probe7.mjs — capture the xskcb.do landing body and print the menu models
 * (name/modelName/url/type) plus *json inner keys. Non-personal app structure.
 */
import { chromium } from 'playwright';
import { loadSettings, ensureDataLayout } from '../config.mjs';
import { loadCookies, saveCookies } from '../auth/cookie-vault.mjs';

const APP = 'https://ehallapp.nju.edu.cn/jwapp/sys/wdkb/*default/index.do';

async function main() {
  const settings = await loadSettings();
  const L = await ensureDataLayout(settings);
  const cookies = await loadCookies(settings);
  const context = await chromium.launchPersistentContext('', { channel: 'chrome', headless: true });
  try {
    await context.addCookies(cookies);
    const page = context.pages()[0] || (await context.newPage());

    let body = '';
    page.on('request', (req) => {
      if (/modules\/xskcb\.do/.test(req.url()) && !body) body = req.postData() || '';
    });
    await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    for (let i = 0; i < 8; i++) await page.waitForTimeout(3000);
    await saveCookies(settings, await context.cookies()).catch(() => {});

    // inner keys of *json parameter (no values)
    if (body) {
      const sp = new URLSearchParams(body);
      process.stdout.write('xskcb.do *json keys: ' + [...sp.keys()].join(',') + '\n');
      const j = sp.get('*json');
      if (j) {
        try { process.stdout.write('*json inner keys: ' + Object.keys(JSON.parse(j)).join(',') + '\n'); }
        catch { /* raw */ }
      }
    }
    const resp = await context.request.post('https://ehallapp.nju.edu.cn/jwapp/sys/wdkb/modules/xskcb.do', {
      data: body || 'XNXQDM=',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      timeout: 30000,
    });
    const json = await resp.json();
    const models = json?.datas?.models || [];
    process.stdout.write(`models=${models.length}\n`);
    for (const m of models) {
      process.stdout.write(
        JSON.stringify({
          name: m.name, modelName: m.modelName, type: m.type, url: m.url,
          controls: (m.controls || []).map((c) => c.name + '=' + c.caption),
          params: (m.params || []).map((p) => p.name),
        }) + '\n'
      );
    }
  } finally {
    await context.close().catch(() => {});
  }
}

main().catch((e) => {
  process.stderr.write(`app-probe7 failed: ${e.message}\n`);
  process.exit(1);
});
