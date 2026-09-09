/**
 * resolve.mjs — mail:resolve <id> sent|unsent (plan §4.2).
 * The ONLY user path that writes the ledger, to clear a 'sending' that got stuck
 * (SMTP outcome unknown after a crash/timeout). Verify the real outcome first
 * (recipient inbox / their reply / webmail Sent) — NOT the Sent folder alone,
 * since our APPEND is best-effort (§4.3).
 *   sent   → record 'sent'
 *   unsent → record 'drafted' AND reset approve:false in the draft (force re-review)
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadSettings, layoutOf, ensureDataLayout } from '../config.mjs';
import { currentStates, appendEvent } from '../state/ledger.mjs';

const out = (l = '') => process.stdout.write(l + '\n');

async function resetApprove(settings, id) {
  const p = path.join(layoutOf(settings).draftsDir, `${id}.md`);
  try {
    const raw = await fs.readFile(p, 'utf8');
    const next = raw.replace(/^approve:\s*true\s*$/m, 'approve: false');
    if (next !== raw) {
      const tmp = p + '.tmp';
      await fs.writeFile(tmp, next, { encoding: 'utf8', mode: 0o600 });
      await fs.rename(tmp, p);
      return true;
    }
  } catch {
    /* draft file gone — ledger reset still stands */
  }
  return false;
}

async function main() {
  const [id, outcome] = process.argv.slice(2);
  if (!id || !['sent', 'unsent'].includes(outcome)) {
    out('usage: mail:resolve <id> sent|unsent');
    process.exitCode = 1;
    return;
  }
  const settings = await loadSettings();
  await ensureDataLayout(settings);
  const states = await currentStates(settings);
  const ev = [...states.values()].find((e) => e.id === id && e.direction === 'incoming');
  if (!ev) throw new Error(`no ledger entry for id ${id}`);
  if (ev.status !== 'sending') {
    throw new Error(`id ${id} is '${ev.status}', not 'sending' — mail:resolve only clears a stuck sending`);
  }
  const base = { mailKey: ev.mailKey, direction: 'incoming', id, threadKey: ev.threadKey, from: ev.from };
  if (outcome === 'sent') {
    await appendEvent(settings, { ...base, status: 'sent', sentAt: new Date().toISOString(), resolved: true });
    out(`${id}: recorded as sent (post-processing will run on next sync).`);
  } else {
    await appendEvent(settings, { ...base, status: 'drafted', resolved: true });
    const reset = await resetApprove(settings, id);
    out(`${id}: back to drafted${reset ? ', approve reset to false (re-review before resending)' : ''}.`);
  }
}

main().catch((e) => {
  process.stderr.write(`resolve failed [${e.code || 'ERROR'}]: ${e.message}\n`);
  process.exitCode = 1;
});
