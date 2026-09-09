/**
 * classify.mjs — deterministic 3-way classification (plan §6.1), evaluated in
 * order. Pure: takes the normalized message + context, returns a decision. The
 * caller (draft pipeline) runs the on-demand history fetch (step 3) and supplies
 * its result as `history` so this stays side-effect-free and testable.
 *
 * Order:
 *  1. From = my address                       → skipped:self
 *  2. exclude rule hit                         → skipped:<reason>
 *  (3. on-demand history fetch — done by caller, passed in as `history`)
 *  4. Sent has my reply to this mail_key       → already_answered
 *  5. not-directly-to-me / bulk / cold outside → needs_triage
 *  6. otherwise                                → human  (draft)
 */

const norm = (s) => (s || '').toLowerCase();

function domainOf(address) {
  const a = norm(address);
  const at = a.lastIndexOf('@');
  return at >= 0 ? a.slice(at + 1) : '';
}

function isExcludedAddress(address, cls) {
  const a = norm(address);
  if (!a) return false;
  const local = a.split('@')[0];
  for (const pat of cls.excludeAddressPatterns || []) {
    if (local.includes(norm(pat))) return true;
  }
  if ((cls.excludeAddresses || []).some((x) => norm(x) === a)) return true;
  const dom = domainOf(address);
  if ((cls.excludeDomains || []).some((d) => dom === norm(d) || dom.endsWith('.' + norm(d)))) return true;
  return false;
}

/** Header-level bulk/list markers (plan §6.1-2). rawHeaders: lowercased map. */
function looksBulk(headers) {
  const prec = norm(headers?.['precedence']);
  if (prec === 'bulk' || prec === 'list') return true;
  if (headers?.['list-id'] || headers?.['list-unsubscribe']) return true;
  return false;
}

/**
 * @param {object} msg normalized message (§5.2)
 * @param {object} opts
 *   myAddress   — the account address (lowercased ok)
 *   classification — settings.classification
 *   headers     — lowercased header map (precedence, list-id, ...)
 *   alreadyAnswered — bool: Sent contains my reply whose In-Reply-To/References
 *                     includes this msg.mail_key (caller computes from history)
 *   historyCount — number of prior exchanges with this sender (on-demand, §5.3)
 * @returns {{status:string, reason:string}}
 */
export function classify(msg, opts) {
  const my = norm(opts.myAddress);
  const cls = opts.classification || {};
  const fromAddr = norm(msg.from?.address);

  if (fromAddr && fromAddr === my) return { status: 'skipped', reason: 'self' };

  if (isExcludedAddress(msg.from?.address, cls) || looksBulk(opts.headers)) {
    return { status: 'skipped', reason: 'notice/bulk' };
  }

  if (opts.alreadyAnswered) return { status: 'already_answered', reason: 'reply exists in Sent' };

  const recipients = [...(msg.to || []), ...(msg.cc || [])];
  const iAmDirectTo = (msg.to || []).some((r) => norm(r.address) === my);
  const tooMany = recipients.length >= (cls.recipientsMax || 5);
  const dom = domainOf(msg.from?.address);
  const isSchool = (cls.schoolDomains || []).some((d) => dom === norm(d) || dom.endsWith('.' + norm(d)));
  const coldOutside = !isSchool && (opts.historyCount || 0) === 0;

  if (!iAmDirectTo || tooMany || coldOutside) {
    const why = !iAmDirectTo ? 'not-direct-to-me' : tooMany ? 'many-recipients' : 'cold-outside-contact';
    return { status: 'needs_triage', reason: why };
  }

  return { status: 'human', reason: 'personal sender' };
}
