/**
 * threads.mjs — threads.json index (plan §5.1). thread_key → { mail_keys, ids }
 * is the single source of truth for thread membership. thread_key is assigned by
 * the References chain ONLY (never a sender+subject heuristic, which would merge
 * every weekly "通知").
 *
 * Each thread carries an `ids` set = the union of every member's mail_key plus
 * all Message-IDs its members reference. A message joins a thread when any of its
 * own ids (mail_key + References + In-Reply-To) intersects that thread's ids.
 * This links in BOTH directions — a reply inserted before its original still
 * merges when the original arrives — which matters because sync processes Sent
 * (replies) before INBOX (originals). If a message bridges two existing threads
 * they are merged (index-only; archive files never move).
 */

function idsOf(msg) {
  const s = new Set([msg.mail_key]);
  for (const r of msg.references || []) s.add(r);
  if (msg.in_reply_to) s.add(msg.in_reply_to);
  return [...s];
}

/**
 * Insert a normalized message; returns { threads, threadKey }.
 * Shape: { threads: { <tk>: { mail_keys:[], ids:[], updatedAt } } }
 */
export function addMessage(threads, msg) {
  const map = { ...(threads.threads || {}) };
  const msgIds = idsOf(msg);
  const msgIdSet = new Set(msgIds);

  // every existing thread sharing at least one id with this message
  const matched = [];
  for (const [tk, entry] of Object.entries(map)) {
    if ((entry.ids || entry.mail_keys || []).some((id) => msgIdSet.has(id))) matched.push(tk);
  }

  let threadKey;
  const merged = { mail_keys: [], ids: [] };
  if (matched.length === 0) {
    threadKey = msg.mail_key; // new thread rooted at this message
  } else {
    threadKey = matched.slice().sort()[0]; // deterministic canonical key on merge
    for (const tk of matched) {
      const e = map[tk];
      merged.mail_keys.push(...(e.mail_keys || []));
      merged.ids.push(...(e.ids || e.mail_keys || []));
      if (tk !== threadKey) delete map[tk]; // absorb the others
    }
  }

  merged.mail_keys = [...new Set([...merged.mail_keys, msg.mail_key])];
  merged.ids = [...new Set([...merged.ids, ...msgIds])];
  merged.updatedAt = new Date().toISOString();
  map[threadKey] = merged;
  return { threads: { threads: map }, threadKey };
}
