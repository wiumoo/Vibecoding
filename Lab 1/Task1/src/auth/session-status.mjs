/**
 * session-status.mjs — headless session check + silent-SSO refresh using the
 * Keychain cookie vault (no persistent profile needed).
 *
 * Loads saved cookies into a fresh headless context and follows the login chain.
 * If the ehall cookie is stale but the CAS TGC is still valid, the silent SSO
 * redirect yields a fresh ehall session and the vault is updated.
 *
 * Output / exit 0:
 *   VALID    — landed on ehall portal (session usable, vault refreshed)
 *   INVALID  — ended on the authserver login page (interactive login needed)
 *   NO_VAULT — no cookies stored yet (run npm run auth:login)
 *   UNKNOWN  — could not classify in time
 */
import { chromium } from 'playwright';
import { loadSettings, ensureDataLayout, layoutOf } from '../config.mjs';
import { loadCookies, saveCookies } from './cookie-vault.mjs';

const AUTH_HOST = 'authserver.nju.edu.cn';

async function main() {
  const settings = await loadSettings();
  const L = await ensureDataLayout(settings);
  const cookies = await loadCookies(settings);
  if (!cookies.length) {
    process.stdout.write('NO_VAULT\n');
    process.exit(0);
  }

  const context = await chromium.launchPersistentContext('', { channel: 'chrome', headless: true });
  try {
    await context.addCookies(cookies);
    const page = context.pages()[0] || (await context.newPage());
    const entry = `${settings.ehall.loginEntry}?service=${encodeURIComponent(settings.ehall.portalHome)}`;
    await page.goto(entry, { waitUntil: 'domcontentloaded', timeout: 60000 });

    let last = 'UNKNOWN';
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      const host = await page.evaluate(() => location.host).catch(() => '');
      if (host && host.includes('ehall.nju.edu.cn')) {
        await page.waitForTimeout(3000);
        const host2 = await page.evaluate(() => location.host).catch(() => '');
        if (host2 && host2.includes('ehall.nju.edu.cn')) {
          last = 'VALID';
          // Refresh vault with whatever cookies we now have (fresh ehall session).
          await saveCookies(settings, await context.cookies()).catch(() => {});
        }
        break;
      }
      if (host && host.includes(AUTH_HOST)) {
        const hasForm = await page
          .locator('#pwdLoginDiv #username, #loginViewDiv #username')
          .first()
          .isVisible()
          .catch(() => false);
        if (hasForm) {
          await page.waitForTimeout(3000);
          const stable = await page
            .locator('#loginViewDiv #username, #pwdLoginDiv #username')
            .first()
            .isVisible()
            .catch(() => false);
          if (stable) {
            last = 'INVALID';
            break;
          }
        }
      }
      await page.waitForTimeout(1000);
    }
    process.stdout.write(`${last}\n`);
  } finally {
    await context.close().catch(() => {});
  }
}

main().catch((e) => {
  process.stderr.write(`session-status failed: ${e.message}\n`);
  process.exit(1);
});
