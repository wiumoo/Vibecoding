/**
 * imap.mjs — IMAP connection + new-message fetch (plan §4.1, §5.4).
 * Read-only: opens mailboxes with readOnly, never flags/moves/deletes.
 */
import { ImapFlow } from 'imapflow';
import { getCredential } from '../../../Task1/src/auth/keychain.mjs';

export async function connect(settings) {
  const { account, password } = await getCredential({ service: settings.keychain.service });
  const client = new ImapFlow({
    host: settings.imap.host,
    port: settings.imap.port,
    secure: settings.imap.secure !== false,
    auth: { user: account, pass: password },
    logger: false,
    greetingTimeout: 30000,
    connectionTimeout: 30000,
    socketTimeout: 120000,
  });
  client.on('error', () => {}); // errors surface via awaited calls
  await client.connect();
  return { client, account };
}

/** Resolve the real \Sent folder: settings override → SPECIAL-USE → candidates. */
export async function resolveSentFolder(client, settings) {
  if (settings.folders?.sent) return settings.folders.sent;
  const list = await client.list();
  const special = list.find((f) => f.specialUse === '\\Sent');
  if (special) return special.path;
  for (const cand of settings.folders?.sentCandidates || []) {
    const hit = list.find((f) => f.path === cand || f.name === cand);
    if (hit) return hit.path;
  }
  return null;
}

/**
 * Fetch messages with UID > cursor from a folder. Takes the STORED cursor
 * ({uidValidity, lastSeenUid}) and decides reset itself from the server's
 * UIDVALIDITY read under the same mailbox lock — no extra status round-trip.
 * Returns { uidValidity, maxUid, messages:[{uid, source}], reset, lastSeenUid }.
 * Applies the mandatory client-side uid>lastSeenUid filter (plan §4.1): IMAP
 * returns the last message even when lastSeenUid+1 exceeds the max UID.
 */
export async function fetchNew(client, folder, storedCursor) {
  const lock = await client.getMailboxLock(folder, { readOnly: true });
  try {
    const uidValidity = String(client.mailbox.uidValidity);
    const reset = !!storedCursor && String(storedCursor.uidValidity) !== uidValidity;
    const lastSeenUid = storedCursor && !reset ? storedCursor.lastSeenUid || 0 : 0;
    const exists = client.mailbox.exists;
    if (!exists) return { uidValidity, maxUid: lastSeenUid, messages: [], reset, lastSeenUid };

    const messages = [];
    let maxUid = lastSeenUid;
    const range = `${lastSeenUid + 1}:*`;
    for await (const msg of client.fetch({ uid: range }, { uid: true, source: true }, { uid: true })) {
      if (msg.uid <= lastSeenUid) continue; // the n:* over-return guard
      messages.push({ uid: msg.uid, source: msg.source });
      if (msg.uid > maxUid) maxUid = msg.uid;
    }
    messages.sort((a, b) => a.uid - b.uid);
    return { uidValidity, maxUid, messages, reset, lastSeenUid };
  } finally {
    lock.release();
  }
}

/** Current UIDVALIDITY + max UID of a folder without fetching bodies (first-run init). */
export async function folderHead(client, folder) {
  const lock = await client.getMailboxLock(folder, { readOnly: true });
  try {
    const uidValidity = String(client.mailbox.uidValidity);
    const exists = client.mailbox.exists;
    let maxUid = 0;
    if (exists) {
      for await (const msg of client.fetch('*', { uid: true })) {
        if (msg.uid > maxUid) maxUid = msg.uid;
      }
    }
    return { uidValidity, maxUid };
  } finally {
    lock.release();
  }
}
