/**
 * normalize.mjs — RFC822 → normalized record (plan §5.2 schema).
 * The JSON shape is the reuse contract for other skills (e.g. ehall in stage 5),
 * so keep field names stable. HTML is stripped to text; attachments are metadata
 * only (no body saved — plan §5.2).
 */
import { simpleParser } from 'mailparser';
import { computeMailKey, normalizeMessageId } from '../state/mailkey.mjs';

const SCHEMA_VERSION = 1;

function addr(a) {
  if (!a || !a.value || !a.value.length) return [];
  return a.value.map((v) => ({ name: v.name || '', address: (v.address || '').toLowerCase() }));
}

function refList(parsed) {
  const out = [];
  const push = (v) => {
    if (!v) return;
    const arr = Array.isArray(v) ? v : String(v).split(/\s+/);
    for (const x of arr) {
      const id = normalizeMessageId(x);
      if (id && !out.includes(id)) out.push(id);
    }
  };
  push(parsed.references);
  return out;
}

/**
 * @param {Buffer|string} source raw message
 * @param {{folder:string, uid:number, uidValidity:string|number, direction:'incoming'|'outgoing', backfilled?:boolean}} meta
 */
export async function normalizeMessage(source, meta) {
  const parsed = await simpleParser(source);
  const from = addr(parsed.from);
  const text = parsed.text != null ? parsed.text : (parsed.html ? stripHtml(parsed.html) : '');
  const mailKey = computeMailKey({
    messageId: parsed.messageId,
    from: from[0]?.address || '',
    date: parsed.date ? parsed.date.toISOString() : '',
    subject: parsed.subject || '',
    text,
  });
  const inReplyTo = normalizeMessageId(parsed.inReplyTo);
  const references = refList(parsed);
  if (inReplyTo && !references.includes(inReplyTo)) references.push(inReplyTo);

  // Minimal headers kept for classification (plan §6.1 bulk/list detection).
  const h = parsed.headers || new Map();
  const flat = (v) => {
    if (v == null) return null;
    if (Array.isArray(v)) return v.map((x) => flat(x)).filter(Boolean).join(' ');
    if (typeof v === 'object') return v.value != null ? String(v.value) : JSON.stringify(v);
    return String(v);
  };
  const hget = (k) => (h.get ? flat(h.get(k)) : null);
  const headers = {
    precedence: hget('precedence'),
    'list-id': hget('list-id'),
    'list-unsubscribe': hget('list-unsubscribe'),
  };

  return {
    schema_version: SCHEMA_VERSION,
    mail_key: mailKey,
    message_id: normalizeMessageId(parsed.messageId),
    references,
    in_reply_to: inReplyTo,
    from: from[0] || { name: '', address: '' },
    to: addr(parsed.to),
    cc: addr(parsed.cc),
    reply_to: addr(parsed.replyTo)[0] || null,
    date: parsed.date ? parsed.date.toISOString() : null,
    subject: parsed.subject || '',
    text,
    html_stripped: parsed.text == null && !!parsed.html,
    attachments: (parsed.attachments || []).map((a) => ({
      filename: a.filename || '',
      size: a.size || 0,
      contentType: a.contentType || '',
      saved: false,
    })),
    headers,
    classification: null, // set in M3
    direction: meta.direction,
    backfilled: !!meta.backfilled,
    source: {
      folder: meta.folder,
      uidValidity: String(meta.uidValidity),
      uid: meta.uid,
      fetched_at: new Date().toISOString(),
    },
  };
}

function stripHtml(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
