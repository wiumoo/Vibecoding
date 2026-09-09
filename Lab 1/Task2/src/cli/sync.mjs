/**
 * sync.mjs — mail:sync (plan §2.2). Order fixed: Sent → INBOX → (draft is M3).
 *
 *   npm run mail:sync
 *
 * First run initializes per-folder cursors to the current max UID and archives
 * nothing (plan §5.3 no backfill). Later runs fetch UID>cursor, and for each
 * message: if (mail_key, direction) is already in the ledger, skip (idempotency
 * 2nd defense); otherwise archive + index the thread + record the ledger event
 * (INBOX→new, Sent→archived_only). Cursor advances per folder.
 */
import { promises as fs } from 'node:fs';
import { loadSettings, layoutOf, ensureDataLayout, writePrivateFile } from '../config.mjs';
import { acquire, release } from '../state/lock.mjs';
import { readState, writeState, setCursor } from '../state/cursor.mjs';
import { currentStates, isKnown, appendEvent, ledgerKey } from '../state/ledger.mjs';
import { normalizeMessage } from '../index/normalize.mjs';
import { writeArchive } from '../index/archive.mjs';
import { addMessage } from '../index/threads.mjs';
import { connect, resolveSentFolder, fetchNew, folderHead } from '../fetch/imap.mjs';

const log = (l) => process.stdout.write(l + '\n');

async function readThreads(settings) {
  const L = layoutOf(settings);
  try {
    return JSON.parse(await fs.readFile(L.threadsFile, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return { threads: {} };
    throw e;
  }
}

async function processFolder(settings, client, folder, direction, state, threadsRef, statesMap) {
  const stored = state.folders?.[folder];
  if (!stored) {
    // Unknown folder on a non-first run (e.g. \Sent resolved to a new path):
    // initialize like first run — no backfill (plan §5.3, cursor.mjs known=false).
    const head = await folderHead(client, folder);
    log(`  ${folder}: new folder → cursor initialized to uid ${head.maxUid}, no backfill`);
    return setCursor(state, folder, head.uidValidity, head.maxUid);
  }

  const { uidValidity, maxUid, messages, reset, lastSeenUid } = await fetchNew(client, folder, stored);
  if (reset) log(`  ${folder}: UIDVALIDITY changed → cursor reset to 0 (ledger is the dedup defense)`);

  let archived = 0;
  let skippedKnown = 0;
  for (const m of messages) {
    const msg = await normalizeMessage(m.source, { folder, uid: m.uid, uidValidity, direction });
    if (isKnown(statesMap, msg.mail_key, direction)) {
      skippedKnown++;
      continue;
    }
    const id = await writeArchive(settings, msg);
    const { threads, threadKey } = addMessage(threadsRef.value, msg);
    threadsRef.value = threads;
    // Flush threads.json BEFORE the ledger event: anything the ledger marks
    // processed is then guaranteed present in threads.json, so a crash cannot
    // leave a message ledgered-but-unthreaded (finding: incremental persistence).
    await writePrivateFile(layoutOf(settings).threadsFile, threadsRef.value, { pretty: true });
    const status2 = direction === 'incoming' ? 'new' : 'archived_only';
    const ev = { mailKey: msg.mail_key, direction, folder, uidValidity, uid: m.uid, threadKey, id, status: status2 };
    await appendEvent(settings, ev);
    statesMap.set(ledgerKey(msg.mail_key, direction), ev);
    archived++;
  }
  const next = setCursor(state, folder, uidValidity, Math.max(maxUid, lastSeenUid));
  log(`  ${folder} (${direction}): fetched ${messages.length}, archived ${archived}, skipped-known ${skippedKnown}, cursor→${Math.max(maxUid, lastSeenUid)}`);
  return next;
}

async function main() {
  const settings = await loadSettings();
  await ensureDataLayout(settings);
  await acquire(settings);
  let client;
  try {
    const conn = await connect(settings);
    client = conn.client;
    const sentFolder = await resolveSentFolder(client, settings);
    if (!sentFolder) throw new Error('Sent folder not found — set settings.folders.sent (M1 확정값)');
    const inbox = settings.folders.inbox || 'INBOX';
    // Sent first, then INBOX (plan §2.2) — already_answered in M3 depends on it.
    const order = [
      { folder: sentFolder, direction: 'outgoing' },
      { folder: inbox, direction: 'incoming' },
    ];

    let state = await readState(settings);

    if (!state.initialized) {
      for (const { folder } of order) {
        const head = await folderHead(client, folder);
        state = setCursor(state, folder, head.uidValidity, head.maxUid);
        log(`first run: ${folder} cursor initialized to uid ${head.maxUid} (uidValidity ${head.uidValidity}) — no backfill`);
      }
      state.initialized = true;
      await writeState(settings, state);
      log('first run complete: cursors set, nothing archived (plan §5.3)');
      return;
    }

    const statesMap = await currentStates(settings);
    const threadsRef = { value: await readThreads(settings) };
    for (const { folder, direction } of order) {
      state = await processFolder(settings, client, folder, direction, state, threadsRef, statesMap);
      await writeState(settings, state); // persist cursor progress per folder
    }
    log('sync complete');
  } finally {
    if (client) await client.logout().catch(() => {});
    await release(settings);
  }
}

main().catch((e) => {
  process.stderr.write(`sync failed [${e.code || 'ERROR'}]: ${e.message}\n`);
  process.exitCode = 1;
});
