/**
 * triage.mjs — resolve a needs_triage message (plan §6.1).
 *   npm run mail:triage <id> draft|skip
 * `draft` runs the draft pipeline immediately (no waiting for the next sync),
 * acquiring the run lock; `skip` records skipped:manual-triage.
 */
import { loadSettings, ensureDataLayout } from '../config.mjs';
import { acquire, release } from '../state/lock.mjs';
import { currentStates, appendEvent } from '../state/ledger.mjs';
import { connect, resolveSentFolder } from '../fetch/imap.mjs';
import { readArchiveById } from '../index/archive.mjs';
import { readThreads, writeThreads } from '../index/threadstore.mjs';
import { draftForMessage } from '../draft/pipeline.mjs';
import { resolveClaude } from '../draft/llm.mjs';

const log = (l) => process.stdout.write(l + '\n');

async function main() {
  const [id, action] = process.argv.slice(2);
  if (!id || !['draft', 'skip'].includes(action)) {
    process.stdout.write('usage: mail:triage <id> draft|skip\n');
    process.exitCode = 1;
    return;
  }
  const settings = await loadSettings();
  await ensureDataLayout(settings);
  const statesMap = await currentStates(settings);
  const ev = [...statesMap.values()].find((e) => e.id === id && e.direction === 'incoming');
  if (!ev) throw new Error(`no ledger entry for id ${id}`);
  if (ev.status !== 'needs_triage') throw new Error(`id ${id} is '${ev.status}', not needs_triage`);

  if (action === 'skip') {
    const s = { mailKey: ev.mailKey, direction: 'incoming', month: ev.month, id, threadKey: ev.threadKey, from: ev.from, status: 'skipped', reason: 'manual-triage' };
    await appendEvent(settings, s);
    log(`${id}: skipped (manual triage)`);
    return;
  }

  await acquire(settings);
  let client;
  try {
    const msg = await readArchiveById(settings, ev.id, ev.month);
    if (!msg) throw new Error(`archive json missing for ${id}`);
    const conn = await connect(settings);
    client = conn.client;
    const sentFolder = await resolveSentFolder(client, settings);
    const threadsRef = { value: await readThreads(settings) };
    const ctx = {
      settings, client, statesMap, threadsRef,
      inbox: settings.folders.inbox || 'INBOX', sent: sentFolder,
      myAddress: conn.account, claudePath: await resolveClaude(settings), model: settings.llm.model,
    };
    // Force draft: bypass classify's triage by drafting directly.
    await draftForMessage({ ...ctx, forceDraft: true }, msg);
    await writeThreads(settings, threadsRef.value); // persist backfill threading
    log(`${id}: drafted via triage`);
  } finally {
    if (client) await client.logout().catch(() => {});
    await release(settings);
  }
}

main().catch((e) => {
  process.stderr.write(`triage failed [${e.code || 'ERROR'}]: ${e.message}\n`);
  process.exitCode = 1;
});
