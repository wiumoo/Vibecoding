/**
 * mailkey.mjs — stable identity for a message (plan §4.1).
 *
 * mail_key: normalized Message-ID when present; otherwise a header hash
 * `h:<16 hex>` over From + Date + Subject + first 1KB of body. Message-ID is
 * neither guaranteed present (some CN senders omit it) nor unique (resend /
 * forward), so the ledger keys on (mail_key, direction) and the hash fallback
 * covers the missing case. File id never uses UID (UIDVALIDITY reset collides).
 */
import { createHash } from 'node:crypto';

function sha256hex(s) {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

/** Normalize a Message-ID: trim, collapse to a single `<...>` token if present. */
export function normalizeMessageId(raw) {
  if (!raw) return null;
  const m = String(raw).trim().match(/<[^>]+>/);
  if (m) return m[0];
  const t = String(raw).trim();
  return t ? t : null;
}

/**
 * Compute the mail_key for a parsed message.
 * @param {{messageId?:string, from?:string, date?:string, subject?:string, text?:string}} p
 */
export function computeMailKey(p) {
  const mid = normalizeMessageId(p.messageId);
  if (mid) return mid;
  const from = (p.from || '').trim().toLowerCase();
  const date = (p.date || '').trim();
  const subject = (p.subject || '').trim();
  const body = (p.text || '').slice(0, 1024);
  return 'h:' + sha256hex([from, date, subject, body].join('|')).slice(0, 16);
}

/** 8-hex short hash of a mail_key, for file ids. */
export function keyHash8(mailKey) {
  return sha256hex(mailKey).slice(0, 8);
}

/** File / draft id: YYYYMMDD-<hash8>. Date is the message date (UTC), UID-free. */
export function fileId(mailKey, dateIso) {
  const d = dateIso ? new Date(dateIso) : null;
  const ymd = d && !Number.isNaN(d.getTime())
    ? d.toISOString().slice(0, 10).replace(/-/g, '')
    : '00000000';
  return `${ymd}-${keyHash8(mailKey)}`;
}

/** Archive month directory name (YYYY-MM) from a message date (UTC). */
export function monthDir(dateIso) {
  const d = dateIso ? new Date(dateIso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 7) : '0000-00';
}
