/**
 * drafts.mjs — server Drafts folder for the iPhone Mail channel (plan-04-mobile).
 * Only used when settings.mobile.enabled. Puts a body-only copy of a draft in the
 * server Drafts folder so iPhone Mail shows it; deletes it by a custom header
 * match (NOT UID — iOS re-APPENDs on edit, so a recorded UID goes stale).
 *
 * The APPENDed body is the SENT body ONLY — never the evidence/summary sections
 * (plan-04: those must never reach a place the phone could send verbatim).
 */
export const DRAFT_HEADER = 'X-NJUSmail-Draft';

/** Resolve the Drafts folder: settings override → \Drafts SPECIAL-USE → candidates. */
export async function resolveDraftsFolder(client, settings) {
  const m = settings.mobile || {};
  if (m.draftsFolder) return m.draftsFolder;
  const list = await client.list();
  const special = list.find((f) => f.specialUse === '\\Drafts');
  if (special) return special.path;
  for (const cand of m.draftsCandidates || []) {
    const hit = list.find((f) => f.path === cand || f.name === cand);
    if (hit) return hit.path;
  }
  return null;
}

function hdr(v) {
  return String(v == null ? '' : v).replace(/[\r\n]+/g, ' ');
}

/** RFC822 for the server draft: body only, our id header, reply headers. */
export function buildDraftRfc822({ id, from, to, cc, subject, bodyText, inReplyTo, references, date }) {
  const lines = [
    `${DRAFT_HEADER}: ${hdr(id)}`,
    `From: ${hdr(from)}`,
    `To: ${to.map(hdr).join(', ')}`,
    cc && cc.length ? `Cc: ${cc.map(hdr).join(', ')}` : null,
    `Subject: ${hdr(subject)}`,
    `Date: ${hdr(date || new Date().toUTCString())}`,
    inReplyTo ? `In-Reply-To: ${hdr(inReplyTo)}` : null,
    references && references.length ? `References: ${references.map(hdr).join(' ')}` : null,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    bodyText,
  ].filter((l) => l !== null);
  return lines.join('\r\n');
}

/** APPEND a body-only draft to the server Drafts folder with the \Draft flag. */
export async function appendDraft(client, draftsFolder, rfc822) {
  if (!draftsFolder) return false;
  try {
    await client.append(draftsFolder, rfc822, ['\\Draft']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete server-Drafts messages for a draft, matched LOCALLY on headers (robust
 * to iOS re-APPEND changing UIDs). Primary key: our X-NJUSmail-Draft header.
 * Secondary key: In-Reply-To == the original message id (used when the client
 * stripped our custom header on edit — In-Reply-To is a standard header clients
 * preserve, and it is unique per draft). Best-effort.
 * @returns number of deleted messages
 */
export async function deleteDraftById(client, draftsFolder, draftId, { inReplyTo } = {}) {
  if (!draftsFolder) return 0;
  const lock = await client.getMailboxLock(draftsFolder, { readOnly: false });
  let deleted = 0;
  try {
    if (!client.mailbox.exists) return 0;
    const idNeedle = `${DRAFT_HEADER.toLowerCase()}: ${draftId.toLowerCase()}`;
    const victims = [];
    for await (const msg of client.fetch('1:*', { uid: true, headers: [DRAFT_HEADER.toLowerCase(), 'in-reply-to'] }, { uid: true })) {
      const raw = (msg.headers ? msg.headers.toString() : '').toLowerCase();
      const byHeader = raw.includes(idNeedle);
      const byIrt = inReplyTo && raw.includes(`in-reply-to:`) && raw.includes(inReplyTo.toLowerCase());
      if (byHeader || byIrt) victims.push(msg.uid);
    }
    if (victims.length) {
      await client.messageDelete(victims, { uid: true });
      deleted = victims.length;
    }
  } catch {
    /* best-effort */
  } finally {
    lock.release();
  }
  return deleted;
}

/**
 * Phone-send detection fallback (plan-04): does the Sent folder hold a reply that
 * matches this draft when In-Reply-To was NOT preserved by iOS? Match on
 * To + normalized subject + a time window. Parses `outboundMsg` records already
 * fetched by the Sent sync (no extra IO).
 */
export function matchesByFallback(outboundMsg, { recipient, subject, sinceMs, untilMs }) {
  const norm = (s) => (s || '').replace(/^(re|fwd|回复|答复):\s*/i, '').trim().toLowerCase();
  // Fallback is fuzzy — require BOTH a recipient and a non-empty subject on both
  // sides, plus a bounded window, so a blank-subject draft cannot match arbitrary
  // mail to the recipient.
  if (!recipient || !norm(subject)) return false;
  const to = (outboundMsg.to || []).map((a) => (a.address || '').toLowerCase());
  if (!to.includes(recipient.toLowerCase())) return false;
  if (norm(outboundMsg.subject) !== norm(subject)) return false;
  const t = outboundMsg.date ? Date.parse(outboundMsg.date) : NaN;
  if (Number.isNaN(t)) return false;
  if (sinceMs && t < sinceMs) return false;
  if (untilMs && t > untilMs) return false;
  return true;
}
