/**
 * login-flow.mjs — shared NJU CAS login routine for the persistent profile.
 * Returns { page } after a verified login. Throws on failure.
 */
import { loadSettings, ensureDataLayout } from '../config.mjs';
import { getCredential } from './keychain.mjs';

export const AUTH_SERVER_HOST = 'authserver.nju.edu.cn';

export async function buildLoginEntry(settings) {
  return `${settings.ehall.loginEntry}?service=${encodeURIComponent(settings.ehall.portalHome)}`;
}

/**
 * Drive the visible (#loginViewDiv) username/password form. username+password are
 * read from Keychain. The human only needs to solve the slider captcha.
 */
export async function doLogin({ context, page, settings, started }) {
  const { account, password } = await getCredential({ service: settings.keychain.service });
  const entry = await buildLoginEntry(settings);

  process.stdout.write('Opening Chrome and navigating to the NJU login page...\n');
  await page.goto(entry, { waitUntil: 'domcontentloaded', timeout: 90000 });

  const vis = (sel) => page.locator(sel);
  const usernameVisible = await vis('#loginViewDiv #username').isVisible().catch(() => false);
  if (!usernameVisible) {
    await page.click('#pwdLoginSpan').catch(() => {});
    await page.waitForTimeout(1000);
    if (!(await vis('#loginViewDiv #username').isVisible().catch(() => false))) {
      throw new Error('username field not visible on login page (structure changed?)');
    }
  }

  await vis('#loginViewDiv #username').fill(account);

  // Remember-me checkbox (may not exist on this deployment) — harmless if absent.
  const rm = vis('#loginViewDiv input[name="rememberMe"], #loginViewDiv #myRememberMe');
  if ((await rm.count()) > 0) {
    const checked = await rm.first().isChecked().catch(() => false);
    if (!checked) await rm.first().check({ force: true }).catch(() => {});
  }

  const pwdSel = '#loginViewDiv #password';
  await page
    .waitForFunction(
      (s) => {
        const el = document.querySelector(s);
        return el && !el.hasAttribute('readonly') && el.offsetParent !== null;
      },
      pwdSel,
      { timeout: 20000 }
    )
    .catch(() => {});
  await vis(pwdSel).click();
  await vis(pwdSel).fill(password);

  const filled = await page
    .evaluate(() => (document.querySelector('#loginViewDiv #password')?.value || '').length)
    .catch(() => 0);

  process.stdout.write('----------------------------------------------------------------------\n');
  process.stdout.write(
    filled > 0
      ? `Auto-filled from Keychain (username + password length ${filled}).\n`
      : 'WARNING: password auto-fill did not register — please type it in the browser.\n'
  );
  process.stdout.write('A slider captcha should appear. Drag the puzzle to the end to log in.\n');
  process.stdout.write('(If login fails, fix fields in the browser and click 登录.)\n');
  process.stdout.write('----------------------------------------------------------------------\n');

  await page.waitForTimeout(1500);
  await vis('#loginViewDiv #login_submit').click().catch(() => {});

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
  return { page };
}

/** Verify the session by reopening the portal; throws if bounced to authserver. */
export async function verifySession({ context, settings }) {
  const page = await context.newPage();
  try {
    await page.goto(settings.ehall.portalHome, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);
    const host = await page.evaluate(() => location.host).catch(() => '');
    if (!host || host.includes(AUTH_SERVER_HOST)) {
      throw new Error('session verification failed: portal bounced back to authserver');
    }
    return true;
  } finally {
    await page.close().catch(() => {});
  }
}
