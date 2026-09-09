/**
 * pipeline.mjs — draft generation for one incoming message (plan §6, §4.4, §7.6).
 *
 * classify → (skip/triage/already_answered) or human → gather history + ehall
 * evidence (numbered) → isolated LLM (cites numbers) → lint (retry once) →
 * code-attached signature → draft .md + ledger event. Stale drafts handled per
 * §4.4 (same-thread supersede; same-sender related warning) in the LEDGER only —
 * never rewriting a user-editable draft file.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { layoutOf, PROJECT_ROOT } from '../config.mjs';
import { appendEvent, ledgerKey } from '../state/ledger.mjs';
import { fileId, monthDir } from '../state/mailkey.mjs';
import { writeArchive } from '../index/archive.mjs';
import { addMessage } from '../index/threads.mjs';
import { writeThreads } from '../index/threadstore.mjs';
import { classify } from './classify.mjs';
import { fetchSenderHistory, isAlreadyAnswered } from './history.mjs';
import {
  gatherEhallCandidates, historyCandidates, numberCandidates,
  promptEvidenceBlock, parseCitations, renderEvidence,
} from './evidence.mjs';
import { resolveSignature, attachSignature } from './signature.mjs';
import { runIsolated, wrapMailData, usageOf } from './llm.mjs';
import { composeDraft, lintDraftBody } from './draftfile.mjs';
import { resolveDraftsFolder, buildDraftRfc822, appendDraft, deleteDraftById } from '../mobile/drafts.mjs';

const log = (l) => process.stdout.write(l + '\n');

async function logUsage(settings, rec) {
  await fs.appendFile(layoutOf(settings).usageFile, JSON.stringify(rec) + '\n', { encoding: 'utf8', mode: 0o600 });
}

function historyForLocators(messages) {
  return messages.map((h) => ({
    date: h.date, direction: h.direction, from: h.from, subject: h.subject,
    archiveMonth: monthDir(h.date), archiveId: fileId(h.mail_key, h.date),
  }));
}

/** Load the mail-drafting skill guidance (SKILL.md + rules.md), read-only (§7.6). */
async function loadSkillGuidance() {
  const dir = path.join(PROJECT_ROOT, 'skills', 'mail-drafting');
  const read = async (f) => {
    try {
      return await fs.readFile(path.join(dir, f), 'utf8');
    } catch {
      return '';
    }
  };
  return `${await read('SKILL.md')}\n\n${await read('rules.md')}`.trim();
}

function buildPrompt(msg, historyView, candidates, skillGuidance) {
  const received = [
    `From: ${msg.from?.name || ''} <${msg.from?.address || ''}>`,
    `Subject: ${msg.subject || ''}`,
    `Date: ${msg.date || ''}`,
    '',
    msg.text || '',
  ].join('\n');
  const hist = historyView.length
    ? historyView.map((h) => `- ${(h.date || '').slice(0, 10)} ${h.direction === 'outgoing' ? 'me→them' : 'them→me'}: ${(h.subject || '').slice(0, 80)}`).join('\n')
    : '(none)';
  return [
    'You are drafting a reply email on behalf of the mailbox owner. Follow this skill:',
    '',
    skillGuidance || '(no skill file found)',
    '',
    'Received message:',
    wrapMailData(received),
    '',
    'Prior exchanges with this sender:',
    wrapMailData(hist),
    '',
    'Evidence candidates:',
    promptEvidenceBlock(candidates),
  ].join('\n');
}

function replyRecipients(msg) {
  const to = msg.reply_to ? [msg.reply_to] : msg.from ? [msg.from] : [];
  return to.map((a) => (a.name ? `${a.name} <${a.address}>` : a.address));
}

function replySubject(subject) {
  const s = (subject || '').trim();
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

async function generateBody({ claudePath, model, prompt, candidates, settings, mailId }) {
  // Attempt 1: full prompt. Retry: a COMPACT correction turn (the previous body +
  // the failures) instead of resending skill+history+evidence — claude -p is
  // stateless so context must be included, but only the body needs re-editing;
  // citations from attempt 1 are reused.
  const res1 = await runIsolated({ claudePath, model, prompt });
  await logUsage(settings, usageOf(res1, { mailId }));
  const p1 = parseCitations(String(res1.result || ''));
  const l1 = lintDraftBody(p1.body, p1.citedNumbers, candidates.length);
  if (l1.ok) return { body: p1.body, citedNumbers: p1.citedNumbers, lintWarning: null };

  const fixPrompt = [
    'Rewrite the following email reply body to fix these problems: ' + l1.problems.join('; ') + '.',
    'Reply in ENGLISH only, no signature, output only the corrected body (no CITED line).',
    '',
    '--- previous body ---',
    p1.body,
  ].join('\n');
  const res2 = await runIsolated({ claudePath, model, prompt: fixPrompt });
  await logUsage(settings, usageOf(res2, { mailId }));
  const p2 = parseCitations(String(res2.result || ''));
  const l2 = lintDraftBody(p2.body, p1.citedNumbers, candidates.length);
  return {
    body: p2.body,
    citedNumbers: p1.citedNumbers, // reuse attempt-1 citations
    lintWarning: l2.ok ? null : l2.problems.join('; '), // keep with warning (plan §6.2 step 7)
  };
}

/**
 * Handle one incoming message that is in ledger status 'new' (or draft_failed retry).
 * ctx: { settings, client, statesMap, threadsRef, inbox, sent, myAddress, claudePath, model }
 * Returns the resulting status string.
 */
export async function draftForMessage(ctx, msg, { retryCount = 0 } = {}) {
  const { settings, client, statesMap, threadsRef, inbox, sent, myAddress, claudePath, model } = ctx;
  const draftId = fileId(msg.mail_key, msg.date);

  // 1. on-demand sender history (archive backfilled ones). The search matches the
  // just-arrived target too (it is FROM the sender); exclude it so it neither
  // inflates historyCount (which would stop cold-outside triage from ever firing)
  // nor cites itself as evidence.
  const senderAddr = msg.from?.address;
  const raw = await fetchSenderHistory(client, { inbox, sent, senderAddress: senderAddr });
  const outbound = raw.outbound.filter((h) => h.mail_key !== msg.mail_key);
  const history = raw.messages.filter((h) => h.mail_key !== msg.mail_key);
  for (const h of history) {
    const dir = h.direction;
    if (!statesMap.has(ledgerKey(h.mail_key, dir))) {
      await writeArchive(settings, h);
      const r = addMessage(threadsRef.value, h);
      threadsRef.value = r.threads;
      // Flush threads.json BEFORE the ledger event so a backfilled message is
      // never ledgered-but-unthreaded (same invariant as processFolder).
      await writeThreads(settings, threadsRef.value);
      const ev = { mailKey: h.mail_key, direction: dir, month: monthDir(h.date), id: fileId(h.mail_key, h.date), threadKey: r.threadKey, backfilled: true, status: 'archived_only' };
      await appendEvent(settings, ev);
      statesMap.set(ledgerKey(h.mail_key, dir), ev);
    }
  }

  // threadKey resolved AFTER backfill: a backfilled message can merge threads,
  // changing the canonical key, so compute it now for correct supersede/relate.
  const threadKey = findThreadKey(threadsRef.value, msg.mail_key) || msg.mail_key;

  // 2. already_answered (decidable only with a real Message-ID, §6.1-4)
  const aa = isAlreadyAnswered(msg, outbound);
  if (!aa.decidable) log(`  ${draftId}: already_answered undecidable (no Message-ID) — proceeding`);

  // 3. classify (skipped when the user forces a draft via mail:triage draft)
  const decision = ctx.forceDraft
    ? { status: 'human', reason: 'forced via triage' }
    : classify(msg, {
        myAddress, classification: settings.classification, headers: msg.headers || {},
        alreadyAnswered: aa.answered, historyCount: history.length,
      });

  if (decision.status !== 'human') {
    await recordStatus(ctx, msg, draftId, threadKey, decision.status, { reason: decision.reason });
    log(`  ${draftId}: ${decision.status} (${decision.reason})`);
    return decision.status;
  }

  // 4. §4.4 stale-draft handling (ledger only)
  const relatedDrafts = await handleStaleDrafts(ctx, msg, draftId, threadKey);

  // 5. evidence
  const ehall = await gatherEhallCandidates(msg);
  const histView = historyForLocators(history);
  const candidates = numberCandidates(ehall, historyCandidates(histView));

  // 6. generate (isolated) + lint
  const skillGuidance = await loadSkillGuidance();
  const prompt = buildPrompt(msg, histView, candidates, skillGuidance);
  const gen = await generateBody({ claudePath, model, prompt, candidates, settings, mailId: draftId });
  if (gen.lintWarning) log(`  ${draftId}: lint warning — ${gen.lintWarning}`);

  // 7. signature (code-attached) + compose
  const signature = await resolveSignature(settings);
  const body = attachSignature(gen.body, signature);
  const references = [...(msg.references || [])];
  if (msg.message_id && !references.includes(msg.message_id)) references.push(msg.message_id);
  const draftMd = composeDraft({
    frontmatter: {
      id: draftId, approve: false,
      to: replyRecipients(msg), cc: [],
      subject: replySubject(msg.subject),
      in_reply_to: msg.message_id || null,
      references, language: 'en',
      lint_warning: gen.lintWarning || null,
    },
    body,
    summary: `From ${msg.from?.address || ''} — ${(msg.subject || '').slice(0, 80)}\n\n${(msg.text || '').slice(0, 400)}`,
    evidence: renderEvidence(candidates, gen.citedNumbers),
  });
  const draftPath = path.join(layoutOf(settings).draftsDir, `${draftId}.md`);
  const tmp = draftPath + '.tmp';
  await fs.writeFile(tmp, draftMd, { encoding: 'utf8', mode: 0o600 });
  await fs.rename(tmp, draftPath);

  const extra = { retryCount };
  if (relatedDrafts.length) extra.related_drafts = relatedDrafts;
  await recordStatus(ctx, msg, draftId, threadKey, 'drafted', extra);
  log(`  ${draftId}: drafted (cited ${gen.citedNumbers.join(',') || 'none'})`);

  // Mobile channel (plan-04): put a body-only copy in server Drafts for iPhone.
  if (settings.mobile?.enabled && client) {
    const draftsFolder = await draftsFolderOf(ctx);
    if (draftsFolder) {
      const rfc = buildDraftRfc822({
        id: draftId, from: myAddress, to: replyRecipients(msg), cc: [],
        subject: replySubject(msg.subject), bodyText: body,
        inReplyTo: msg.message_id || null, references,
      });
      const ok = await appendDraft(client, draftsFolder, rfc);
      log(`  ${draftId}: server Drafts APPEND ${ok ? 'ok' : 'failed (best-effort)'}`);
    } else {
      log(`  ${draftId}: mobile enabled but Drafts folder not found`);
    }
  }
  return 'drafted';
}

/** Resolve the server Drafts folder once per run, memoized on ctx (finding: avoid
 *  a LIST round-trip per message). */
async function draftsFolderOf(ctx) {
  if (ctx._draftsFolder !== undefined) return ctx._draftsFolder;
  ctx._draftsFolder = ctx.client ? await resolveDraftsFolder(ctx.client, ctx.settings) : null;
  return ctx._draftsFolder;
}

function findThreadKey(threads, mailKey) {
  for (const [tk, e] of Object.entries(threads.threads || {})) {
    if ((e.mail_keys || []).includes(mailKey)) return tk;
  }
  return null;
}

async function recordStatus(ctx, msg, draftId, threadKey, status, extra = {}) {
  const ev = {
    mailKey: msg.mail_key, direction: 'incoming', month: monthDir(msg.date), id: draftId,
    threadKey, from: msg.from?.address || null, status, ...extra,
  };
  await appendEvent(ctx.settings, ev);
  ctx.statesMap.set(ledgerKey(msg.mail_key, 'incoming'), ev);
}

/**
 * §4.4 decision (pure): given current ledger states, which unsent drafts does a
 * new incoming message supersede (same thread) and which are merely related
 * (same sender, other thread)? Exported for testing.
 * @param {Map|Iterable} states  ledger current states (values are events)
 * @returns {{ supersede: object[], related: string[] }}
 */
export function staleDraftDecision(states, { mailKey, threadKey, fromAddr, resolveThreadKey }) {
  const supersede = [];
  const related = [];
  const values = states.values ? states.values() : states;
  for (const ev of values) {
    if (ev.direction !== 'incoming') continue;
    if (ev.mailKey === mailKey) continue;
    if (!['drafted', 'send_failed'].includes(ev.status)) continue;
    // Resolve the candidate's CURRENT thread key from threads.json when a resolver
    // is given (ledger threadKey can be stale after a later merge); fall back to
    // the recorded key otherwise.
    const evThreadKey = resolveThreadKey ? resolveThreadKey(ev.mailKey) || ev.threadKey : ev.threadKey;
    if (evThreadKey === threadKey) supersede.push(ev);
    else if (ev.from && fromAddr && ev.from === fromAddr) related.push(ev.id);
  }
  return { supersede, related };
}

/** §4.4: same-thread unsent drafts → superseded; same-sender other-thread → related warning. */
async function handleStaleDrafts(ctx, msg, newDraftId, threadKey) {
  const { supersede, related } = staleDraftDecision(ctx.statesMap, {
    mailKey: msg.mail_key, threadKey, fromAddr: msg.from?.address,
    resolveThreadKey: (mk) => findThreadKey(ctx.threadsRef.value, mk),
  });
  for (const ev of supersede) {
    const sup = { mailKey: ev.mailKey, direction: 'incoming', month: ev.month, id: ev.id, threadKey, from: ev.from, status: 'superseded', superseded_by: newDraftId };
    await appendEvent(ctx.settings, sup);
    ctx.statesMap.set(ledgerKey(ev.mailKey, 'incoming'), sup);
    log(`  ${ev.id}: superseded by ${newDraftId} (same thread)`);
    // Remove the stale copy from the phone (plan-04 lifecycle) so it can't be sent.
    if (ctx.settings.mobile?.enabled && ctx.client) {
      const df = await draftsFolderOf(ctx);
      const irt = ev.mailKey && ev.mailKey.startsWith('<') ? ev.mailKey : null; // draft's In-Reply-To
      const n = await deleteDraftById(ctx.client, df, ev.id, { inReplyTo: irt });
      log(n ? `  ${ev.id}: removed ${n} server Drafts copy (superseded)` : `  ${ev.id}: no server Drafts copy removed (may linger on phone — remove manually)`);
    }
  }
  if (related.length) log(`  ${newDraftId}: related drafts from same sender: ${related.join(', ')}`);
  return related;
}
