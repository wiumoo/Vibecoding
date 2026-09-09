/**
 * cursor.mjs — per-folder UID cursors in mail-state.json (plan §4.1).
 *
 *   { folders: { INBOX: {uidValidity, lastSeenUid}, "Sent Messages": {...} },
 *     initialized: bool, updatedAt }
 *
 * fetch range is `UID lastSeenUid+1:*`, but IMAP returns the last message even
 * when n exceeds the max UID, so callers MUST also apply a client-side
 * `uid > lastSeenUid` filter (plan §4.1). If the server's UIDVALIDITY differs
 * from the stored one the whole UID space is invalid → cursor resets to 0 and
 * the ledger becomes the dedup defense.
 */
import { promises as fs } from 'node:fs';
import { layoutOf, writePrivateFile } from '../config.mjs';

export async function readState(settings) {
  const L = layoutOf(settings);
  try {
    return JSON.parse(await fs.readFile(L.mailStateFile, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return { folders: {}, initialized: false };
    throw e;
  }
}

export async function writeState(settings, state) {
  const L = layoutOf(settings);
  await writePrivateFile(L.mailStateFile, { ...state, updatedAt: new Date().toISOString() }, { pretty: true });
}

/**
 * Effective cursor for a folder given the server's current UIDVALIDITY.
 * Returns { lastSeenUid, reset, known }:
 *  - known=false → no stored cursor. The caller must initialize (init to current
 *    max UID, archive nothing) rather than backfill, so a folder that appears on
 *    a later run — e.g. resolveSentFolder resolving to a new path — never triggers
 *    a full-folder backfill (plan §5.3 no backfill).
 *  - reset=true → known folder whose UIDVALIDITY changed: start from 0 and rely
 *    on the ledger to dedup (plan §4.1). This re-scan IS intended.
 */
export function effectiveCursor(state, folder, serverUidValidity) {
  const cur = state.folders?.[folder];
  if (!cur) return { lastSeenUid: 0, reset: false, known: false };
  if (String(cur.uidValidity) !== String(serverUidValidity)) {
    return { lastSeenUid: 0, reset: true, known: true };
  }
  return { lastSeenUid: cur.lastSeenUid || 0, reset: false, known: true };
}

export function setCursor(state, folder, uidValidity, lastSeenUid) {
  const next = { ...state, folders: { ...(state.folders || {}) } };
  next.folders[folder] = { uidValidity: String(uidValidity), lastSeenUid };
  return next;
}
