/**
 * detect-sends.mjs — detect a reply sent from the phone (plan-04 "발송 감지").
 * Scans the Sent folder for a reply to a drafted incoming message: In-Reply-To
 * match first (works if iOS preserves the header), then a To+subject+time-window
 * fallback (if it does not). Read-only IMAP; local matching (exmail server HEADER
 * search is unreliable — plan §5.3).
 */
import { simpleParser } from 'mailparser';
import { matchesByFallback } from './drafts.mjs';

/**
 * @returns {{found:boolean, via:'in-reply-to'|'fallback'|null}}
 */
export async function scanSentForReply(client, sentFolder, { recipient, messageId, subject, sinceDate }) {
  if (!sentFolder || !recipient) return { found: false, via: null };
  const lock = await client.getMailboxLock(sentFolder, { readOnly: true });
  try {
    if (!client.mailbox.exists) return { found: false, via: null };
    const criteria = { to: recipient };
    if (sinceDate) criteria.since = sinceDate;
    let uids = [];
    try {
      uids = await client.search(criteria, { uid: true });
    } catch {
      return { found: false, via: null };
    }
    const sinceMs = sinceDate ? sinceDate.getTime() : undefined;
    const untilMs = Date.now() + 5 * 60 * 1000; // small forward skew for clock drift
    // Newest first, and scan a generous cap (a recent reply is near the top).
    const ordered = (uids || []).sort((a, b) => b - a).slice(0, 200);
    for (const uid of ordered) {
      const msg = await client.fetchOne(uid, { uid: true, source: true }, { uid: true });
      if (!msg || !msg.source) continue;
      const parsed = await simpleParser(msg.source);
      const irt = parsed.inReplyTo ? String(parsed.inReplyTo) : '';
      const refs = parsed.references ? [].concat(parsed.references).join(' ') : '';
      const hasReplyHeader = !!(irt || refs);
      if (messageId && (irt.includes(messageId) || refs.includes(messageId))) {
        return { found: true, via: 'in-reply-to' };
      }
      // Fallback ONLY when this Sent message carries no reply header at all (iOS
      // stripped it). If it has an In-Reply-To to a DIFFERENT message, that is
      // authoritative — never fuzzy-match it to this draft (avoids sibling
      // drafts in the same thread being falsely marked sent).
      if (hasReplyHeader) continue;
      const rec = {
        to: (parsed.to?.value || []).map((v) => ({ address: v.address })),
        subject: parsed.subject,
        date: parsed.date ? parsed.date.toISOString() : null,
      };
      if (matchesByFallback(rec, { recipient, subject, sinceMs, untilMs })) return { found: true, via: 'fallback' };
    }
    return { found: false, via: null };
  } finally {
    lock.release();
  }
}
