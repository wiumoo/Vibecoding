/**
 * interactive-login.mjs — one-time authenticated session bootstrap.
 *
 * Opens headful Chrome (persistent profile under PRIVATE auth dir), drives the NJU
 * CAS login form. The page clones the username/password form into #loginViewDiv;
 * we target the visible clones. username+password are auto-filled from Keychain,
 * remember-me is enabled when present, then 登录 is clicked. NJU forces a slider
 * captcha on every primary login, so a human must finish the slider; afterwards the
 * script waits until the CAS redirect lands on ehall and verifies the session.
 */
import { chromium } from 'playwright';
import { loadSettings, ensureDataLayout, layoutOf } from '../config.mjs';
import { getCredential } from './keychain.mjs';
import { saveCookies } from './cookie-vault.mjs';

const AUTH_SERVER_HOST = 'authserver.nju.edu.cn';

async function main() {
  const settings = await loadSettings();
  const L = await ensureDataLayout(settings);
  const { account, password } = await getCredential({ service: settings.keychain.service });

  const portal = settings.ehall.portalHome;
  const entry = `${settings.ehall.loginEntry}?service=${encodeURIComponent(portal)}`;

  process.stdout.write('Opening Chrome and navigating to the NJU login page...\n');

  const context = await chromium.launchPersistentContext(L.profileDir, {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1360, height: 920 },
  });
  const page = context.pages()[0] || (await context.newPage());
  const started = Date.now();

  const vis = (sel) => page.locator(sel);
  const visibleCount = async (sel) => (await vis(sel).count()) > 0 && (await vis(sel).first().isVisible().catch(() => false));

  try {
    await page.goto(entry, { waitUntil: 'domcontentloaded', timeout: 90000 });

    // The visible username/password form lives inside #loginViewDiv (JS clones it).
    // Wait until a visible username input exists; fall back to selecting the pwd tab.
    let usernameReady = await visibleCount('#loginViewDiv #username');
    if (!usernameReady) {
      await page.click('#pwdLoginSpan').catch(() => {});
      await page.waitForTimeout(1000);
      usernameReady = await visibleCount('#loginViewDiv #username');
    }
    if (!usernameReady) {
      throw new Error('username field not visible on login page (page structure changed?)');
    }

    await vis('#loginViewDiv #username').fill(account);

    // Remember me (extends CAS TGC for later unattended silent SSO).
    const rm = vis('#loginViewDiv #myRememberMe, #loginViewDiv input[name="rememberMe"]');
    if ((await rm.count()) > 0) {
      const checked = await rm.first().isChecked().catch(() => false);
      if (!checked) await rm.first().check({ force: true }).catch(() => {});
    }

    // Password: readonly is removed shortly after load; wait, then fill the visible field.
    const pwdSel = '#loginViewDiv #password';
    await page.waitForFunction((s) => {
      const el = document.querySelector(s);
      return el && !el.hasAttribute('readonly') && el.offsetParent !== null;
    }, pwdSel, { timeout: 20000 }).catch(() => {});
    await vis(pwdSel).click();
    await vis(pwdSel).fill(password);

    const filled = await page
      .evaluate(() => (document.querySelector('#loginViewDiv #password')?.value || '').length)
      .catch(() => 0);

    process.stdout.write('----------------------------------------------------------------------\n');
    if (filled > 0) {
      process.stdout.write(`Auto-filled from Keychain (username + password length ${filled}).\n`);
    } else {
      process.stdout.write('WARNING: password auto-fill did not register — please type it in the browser.\n');
    }
    process.stdout.write('A slider captcha should appear. Drag the puzzle to the end to log in.\n');
    process.stdout.write('(If the slider does not appear or login fails, fix fields and click 登录.)\n');
    process.stdout.write('----------------------------------------------------------------------\n');

    // Click 登录 so the slider captcha (or a direct submit) is triggered.
    await page.waitForTimeout(1500);
    await vis('#loginViewDiv #login_submit').click().catch(() => {});

    // Wait until we leave the CAS host (success) while printing visible feedback.
    let outcome = 'timeout';
    let lastError = '';
    for (;;) {
      if (Date.now() - started > 360000) break;
      const host = await page.evaluate(() => location.host).catch(() => '');
      if (host && !host.includes(AUTH_SERVER_HOST)) {
        outcome = 'redirected';
        break;
      }
      const err = await page
        .evaluate(() => (document.querySelector('#showErrorTip span')?.textContent || '').trim())
        .catch(() => '');
      if (err && err !== lastError) {
        lastError = err;
        process.stdout.write(`Login page feedback: ${err.slice(0, 160)}\n`);
      }
      await page.waitForTimeout(1500);
    }

    if (outcome !== 'redirected') {
      throw new Error(`login did not complete in time (last feedback: ${lastError || 'none'})`);
    }

    // Verify by reopening the portal — must NOT bounce back to authserver.
    const check = await context.newPage();
    const resp = await check.goto(portal, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null);
    await check.waitForTimeout(4000);
    const host2 = await check.evaluate(() => location.host).catch(() => '');
    await check.close();

    if (!host2 || host2.includes(AUTH_SERVER_HOST)) {
      throw new Error('session verification failed: portal bounced back to authserver');
    }

    // Persist the live session cookies into the Keychain vault so later headless
    // runs can reuse / refresh the session without a browser restart.
    const cookies = await context.cookies();
    const saved = await saveCookies(settings, cookies);
    process.stdout.write('Session OK — ehall session stored in persistent profile.\n');
    process.stdout.write(`Session cookies saved to Keychain vault (${saved} cookies).\n`);
    process.stdout.write(`Profile dir: ${L.profileDir}\n`);
    process.stdout.write('Next: npm run auth:status\n');
  } finally {
    await context.close().catch(() => {});
  }
}

main().catch((e) => {
  process.stderr.write(`interactive-login failed: ${e.message}\n`);
  process.exitCode = 1;
});
