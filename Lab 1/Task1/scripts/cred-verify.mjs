/**
 * cred-verify.mjs — verify a Keychain credential exists WITHOUT printing the secret.
 * Prints account (masked) and password length. Exit 0 when present, 1 when missing.
 */
import { loadSettings } from '../src/config.mjs';
import { getCredential } from '../src/auth/keychain.mjs';

async function main() {
  const service = (await loadSettings()).keychain.service;
  try {
    const { account, password } = await getCredential({ service });
    process.stdout.write(
      `keychain credential present (service=${service}, account=${'*'.repeat(
        account.length
      )}, password length=${password.length})\n`
    );
    process.exit(0);
  } catch {
    process.stdout.write(
      `keychain credential MISSING (service=${service}). Run: npm run cred:setup\n`
    );
    process.exit(1);
  }
}

main().catch((e) => {
  process.stderr.write(`verify failed: ${e.message}\n`);
  process.exit(1);
});
