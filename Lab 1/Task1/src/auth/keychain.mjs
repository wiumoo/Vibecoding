import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const pexec = promisify(execFile);
const SECURITY = '/usr/bin/security';

/**
 * macOS Keychain helpers.
 * Username is stored as the item "account", password as the item secret.
 * Only the keychain service label lives in settings; the account (username) is
 * read back from the Keychain record, so the username never needs to appear in
 * code or config.
 */

/** Read the password for a service. Throws ENOENT-equivalent when missing. */
export async function getPassword({ service }) {
  const { stdout } = await pexec(SECURITY, ['find-generic-password', '-s', service, '-w'], {
    maxBuffer: 1024 * 1024,
  });
  return stdout.replace(/\r?\n$/, '');
}

/** Read the account (username) for a service. */
export async function getAccount({ service }) {
  const { stdout } = await pexec(SECURITY, ['find-generic-password', '-s', service], {
    maxBuffer: 1024 * 1024,
  });
  const lines = stdout.split('\n');
  for (const line of lines) {
    // Newer format: "acct"<blob>="..." ; legacy: acct: "..."
    const m1 = line.match(/"acct"<blob>="([^"]*)"/);
    if (m1) return m1[1];
    const m2 = line.match(/^\s*acct:\s*"([^"]*)"/);
    if (m2) return m2[1];
  }
  throw new Error('account not found in keychain record');
}

export async function hasCredential({ service }) {
  try {
    await getPassword({ service });
    return true;
  } catch {
    return false;
  }
}

export async function getCredential({ service }) {
  const [account, password] = await Promise.all([
    getAccount({ service }),
    getPassword({ service }),
  ]);
  if (!account || !password) throw new Error('keychain credential incomplete');
  return { account, password };
}
