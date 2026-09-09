/**
 * history.mjs — on-demand targeted history for a sender (plan §5.3, §6.1).
 * INBOX `SEARCH FROM <sender>` + Sent `SEARCH TO <sender>` (each capped),
 * parsed locally; References matching is done in code (exmail's server-side
 * HEADER search is unreliable — plan §5.3). Read-only IMAP.
 */
import { normalizeMessage } from '../index/normalize.mjs';

async function searchFolder(client, folder, criteria, direction, cap) {
  const lock = await client.getMailboxLock(folder, { readOnly: true });
  const out = [];
  try {
    if (!client.mailbox.exists) return out;
    const uidValidity = String(client.mailbox.uidValidity);
    let uids = [];
    try {
      uids = await client.search(criteria, { uid: true });
    } catch {
      return out;
    }
    uids = (uids || []).sort((a, b) => b - a).slice(0, cap); // most recent first
    for (const uid of uids) {
      const msg = await client.fetchOne(uid, { uid: true, source: true }, { uid: true });
      if (!msg || !msg.source) continue;
      out.push(await normalizeMessage(msg.source, { folder, uid: msg.uid, uidValidity, direction, backfilled: true }));
    }
    return out;
  } finally {
    lock.release();
  }
}

/**
 * Fetch prior exchanges with a sender.
 * @returns {{ messages: object[], inbound: object[], outbound: object[] }}
 */
export async function fetchSenderHistory(client, { inbox, sent, senderAddress, cap = 20 }) {
  const inbound = senderAddress ? await searchFolder(client, inbox, { from: senderAddress }, 'incoming', cap) : [];
  const outbound = sent && senderAddress ? await searchFolder(client, sent, { to: senderAddress }, 'outgoing', cap) : [];
  return { messages: [...inbound, ...outbound], inbound, outbound };
}

/**
 * already_answered (plan §6.1-4): does any outbound message reference the target
 * mail_key? Only decidable when the target has a real Message-ID; an h: fallback
 * key cannot be matched against a reply's In-Reply-To → returns
 * { answered:false, decidable:false } so the caller can log "undecidable".
 */
export function isAlreadyAnswered(targetMsg, outbound) {
  if (!targetMsg.message_id) return { answered: false, decidable: false };
  const id = targetMsg.message_id;
  const answered = (outbound || []).some(
    (o) => o.in_reply_to === id || (o.references || []).includes(id)
  );
  return { answered, decidable: true };
}
