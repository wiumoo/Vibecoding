/**
 * detect.mjs — pre-SMTP other-device send detection (plan §7 step 4).
 * Before sending, check whether a reply to this message already exists in Sent
 * (e.g. sent from the phone). Uses `SEARCH TO <recipient> SINCE <draftDate>` then
 * LOCAL In-Reply-To matching (exmail's server HEADER search is unreliable — §5.3).
 * A hit is a definite positive → refuse to send. A miss is not proof of anything
 * (that is why §4.2 does not use Sent for MY-send success), so a miss just proceeds.
 */
import { simpleParser } from 'mailparser';

export async function alreadySentReply(client, sentFolder, { recipient, inReplyTo, sinceDate }) {
  if (!sentFolder || !inReplyTo) return false;
  const lock = await client.getMailboxLock(sentFolder, { readOnly: true });
  try {
    if (!client.mailbox.exists) return false;
    const criteria = { to: recipient };
    if (sinceDate) criteria.since = sinceDate;
    let uids = [];
    try {
      uids = await client.search(criteria, { uid: true });
    } catch {
      return false; // search unsupported → cannot confirm; proceed (miss ≠ proof)
    }
    for (const uid of (uids || []).slice(-30)) {
      const msg = await client.fetchOne(uid, { uid: true, source: true }, { uid: true });
      if (!msg || !msg.source) continue;
      const parsed = await simpleParser(msg.source);
      const irt = parsed.inReplyTo ? String(parsed.inReplyTo).trim() : '';
      const refs = parsed.references ? [].concat(parsed.references).join(' ') : '';
      if (irt.includes(inReplyTo) || refs.includes(inReplyTo)) return true;
    }
    return false;
  } finally {
    lock.release();
  }
}
