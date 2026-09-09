/**
 * app-probe6.mjs — UI-driven: open wdkb app, click around schedule views, and
 * identify which endpoints return data rows (counts only, never values).
 */
import { chromium } from 'playwright';
import { loadSettings, ensureDataLayout } from '../config.mjs';
import { loadCookies, saveCookies } from '../auth/cookie-vault.mjs';
import { safeUrl } from './describe.mjs';

const APP = 'https://ehallapp.nju.edu.cn/jwapp/sys/wdkb/*default/index.do';

async function summarize(js) {
  const out = [];
  const walk = (v, path) => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      if (v.length) { out.push(`${path}[]=${v.length}`); walk(v[0], path + '[]'); }
      return;
    }
    for (const k of Object.keys(v)) {
      const val = v[k];
      if (val !== null && typeof val === 'object') walk(val, path + '.' + k);
      else if (/^(totalSize|total|code)$/i.test(k)) out.push(`${path}.${k}=${val}`);
    }
  };
  walk(js, '');
  return out.join(' ');
}

async function main() {
  const settings = await loadSettings();
  const L = await ensureDataLayout(settings);
  const cookies = await loadCookies(settings);
  const context = await chromium.launchPersistentContext('', { channel: 'chrome', headless: true });
  try {
    await context.addCookies(cookies);
    const page = context.pages()[0] || (await context.newPage());

    const calls = new Map();
    page.on('response', async (resp) => {
      const req = resp.request();
      const u = req.url();
      if (!/wdkb\/modules/.test(u) || req.method() !== 'POST') return;
      if (calls.has(u)) return;
      const ct = resp.headers()['content-type'] || '';
      let summary = ct;
      if (ct.includes('json')) {
        try { summary = await summarize(await resp.json()); } catch { summary = 'json?'; }
      }
      calls.set(u, { keys: [...new URLSearchParams(req.postData() || '').keys()].join(','), summary });
    });

    await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(8000);

    // Try to switch to schedule-related views by clicking matching text.
    const labels = ['学期课表', '我的课表', '课程', '个人课表', '上课时间', '周次', '学年学期'];
    for (const lab of labels) {
      try {
        const el = page.locator(`text=${lab}`).first();
        if (await el.isVisible().catch(() => false)) {
          await el.click({ timeout: 3000 }).catch(() => {});
          await page.waitForTimeout(4000);
        }
      } catch { /* not present */ }
    }
    await page.waitForTimeout(6000);

    await saveCookies(settings, await context.cookies()).catch(() => {});
    process.stdout.write('=== POST calls with row summaries (counts only) ===\n');
    for (const [u, v] of [...calls.entries()].sort()) {
      process.stdout.write(`${safeUrl(u)}\n  bodyKeys: ${v.keys || '(none)'}\n  resp: ${v.summary}\n`);
    }
  } finally {
    await context.close().catch(() => {});
  }
}

main().catch((e) => {
  process.stderr.write(`app-probe6 failed: ${e.message}\n`);
  process.exit(1);
});
