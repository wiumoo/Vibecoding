/**
 * app-probe8.mjs — walk the wdkb app UI: list clickable menu labels, click
 * schedule/course views, and record every POST to wdkb modules (url + body keys +
 * response row counts). Values are never printed.
 */
import { chromium } from 'playwright';
import { loadSettings, ensureDataLayout } from '../config.mjs';
import { loadCookies, saveCookies } from '../auth/cookie-vault.mjs';
import { safeUrl } from './describe.mjs';

const APP = 'https://ehallapp.nju.edu.cn/jwapp/sys/wdkb/*default/index.do';

async function summarizeJson(js) {
  const hits = [];
  const walk = (v, path) => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) { if (v.length) { hits.push(`${path}[]=${v.length}`); walk(v[0], path + '[]'); } return; }
    for (const k of Object.keys(v)) {
      const val = v[k];
      if (val !== null && typeof val === 'object') walk(val, path + '.' + k);
      else if (/^(totalSize|total|code)$/i.test(k) && path.includes('datas')) hits.push(`${path}.${k}=${val}`);
    }
  };
  walk(js, '');
  return hits.join(' ');
}

async function main() {
  const settings = await loadSettings();
  const L = await ensureDataLayout(settings);
  const cookies = await loadCookies(settings);
  const context = await chromium.launchPersistentContext('', { channel: 'chrome', headless: true });
  try {
    await context.addCookies(cookies);
    const page = context.pages()[0] || (await context.newPage());
    const calls = [];

    page.on('response', async (resp) => {
      const req = resp.request();
      const u = req.url();
      if (req.method() !== 'POST' || !/wdkb\/modules/.test(u)) return;
      const ct = resp.headers()['content-type'] || '';
      let summary = ct;
      if (ct.includes('json')) { try { summary = await summarizeJson(await resp.json()); } catch { summary = 'json?'; } }
      const keys = [...new URLSearchParams(req.postData() || '').keys()].join(',');
      calls.push({ url: u, keys, summary });
    });

    await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(8000);

    const dumpMenus = async (tag) => {
      const items = await page.evaluate(() => {
        const out = [];
        const els = document.querySelectorAll('li, a, span, div, button');
        for (const el of els) {
          const t = (el.textContent || '').trim();
          if (t && t.length <= 24 && !out.includes(t)) out.push(t);
        }
        return out.slice(0, 200);
      });
      process.stdout.write(`--- visible texts (${tag}) ---\n${items.join(' | ')}\n`);
      return items;
    };

    await dumpMenus('after load');
    const prefer = ['学期课表', '我的课表', '理论课表', '上课时间', '学生课表', '课程查询', '本学期课程', '课表查询', '选课'];
    const preferRe = new RegExp(prefer.join('|'));
    const clickables = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('li,a,div,button,span')) {
        const t = (el.textContent || '').trim();
        if (t && t.length <= 24) out.push({ tag: el.tagName, cls: String(el.className).slice(0, 40), text: t });
      }
      return out.slice(0, 300);
    });
    const cand = clickables.filter((c) => preferRe.test(c.text));
    process.stdout.write(`\npreferred clickable candidates: ${cand.length}\n`);
    for (const c of cand.slice(0, 20)) process.stdout.write(JSON.stringify(c) + '\n');

    for (const c of cand.slice(0, 8)) {
      try {
        const loc = page.locator(`${c.tag}:has-text("${c.text}")`).first();
        if (await loc.isVisible().catch(() => false)) {
          await loc.click({ timeout: 3000 }).catch(() => {});
          await page.waitForTimeout(5000);
          await dumpMenus('after click ' + c.text);
        }
      } catch { /* ignore */ }
    }
    await page.waitForTimeout(5000);
    await saveCookies(settings, await context.cookies()).catch(() => {});

    process.stdout.write('\n=== all POST calls observed ===\n');
    for (const c of calls) {
      process.stdout.write(`${safeUrl(c.url)}\n  keys: ${c.keys}\n  resp: ${c.summary}\n`);
    }
  } finally {
    await context.close().catch(() => {});
  }
}

main().catch((e) => {
  process.stderr.write(`app-probe8 failed: ${e.message}\n`);
  process.exit(1);
});
