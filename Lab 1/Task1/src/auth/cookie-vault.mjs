/**
 * cookie-vault.mjs — persist ehall/authserver session cookies for headless reuse.
 *
 * Stored at <private>/auth/cookies.vault.json with mode 0600 (directory 0700).
 * Cookie values are secrets; they are never written to git/logs/chat. The
 * on-disk protection is the same level as the Playwright profile cookie store
 * (plaintext, user-only permissions). macOS FileVault is recommended.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadSettings, ensureDataLayout, layoutOf } from '../config.mjs';

const FILE_MODE = 0o600;

function vaultFile(L) {
  return path.join(L.authDir, 'cookies.vault.json');
}

export async function saveCookies(settings, cookies) {
  const L = layoutOf(settings);
  await fs.mkdir(L.authDir, { recursive: true, mode: 0o700 });
  const relevant = cookies.filter((c) => c.domain.includes('nju.edu.cn'));
  const tmp = vaultFile(L) + '.tmp';
  const data = JSON.stringify({ savedAt: new Date().toISOString(), cookies: relevant });
  await fs.writeFile(tmp, data, { encoding: 'utf8', mode: FILE_MODE });
  await fs.chmod(tmp, FILE_MODE);
  await fs.rename(tmp, vaultFile(L));
  return relevant.length;
}

export async function loadCookies(settings) {
  const L = layoutOf(settings);
  try {
    const raw = await fs.readFile(vaultFile(L), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.cookies) ? parsed.cookies : [];
  } catch {
    return [];
  }
}

export async function hasVault(settings) {
  return (await loadCookies(settings)).length > 0;
}
