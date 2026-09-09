/**
 * send.mjs — mail:send <id> (plan §7). The ONLY send path.
 *
 *   npm run mail:send <id>
 *
 * Safety sequence: approve:true + ledger drafted/send_failed → extract body via
 * sentinel → send-lint → pre-SMTP other-device detect → show full body+recipients
 * (+ ledger warnings) and require an explicit "y" → ledger 'sending' → SMTP →
 * 'sent' immediately → best-effort Sent APPEND (post_send_done). No --yes flag.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { loadSettings, layoutOf, ensureDataLayout } from '../config.mjs';
import { acquire, release } from '../state/lock.mjs';
import { currentStates, appendEvent } from '../state/ledger.mjs';
import { connect, resolveSentFolder } from '../fetch/imap.mjs';
import { parseFrontmatter, extractBody, lintSendBody } from '../draft/draftfile.mjs';
import { alreadySentReply } from '../send/detect.mjs';
import { sendMail, appendToSent, buildRfc822 } from '../send/smtp.mjs';

const out = (l = '') => process.stdout.write(l + '\n');
const addrOf = (s) => {
  const m = String(s).match(/<([^>]+)>/);
  return (m ? m[1] : String(s)).trim();
};

async function main() {
  const id = process.argv[2];
  if (!id) {
    out('usage: mail:send <id>');
    process.exitCode = 1;
    return;
  }
  const settings = await loadSettings();
  await ensureDataLayout(settings);
  const states = await currentStates(settings);
  const ev = [...states.values()].find((e) => e.id === id && e.direction === 'incoming');
  if (!ev) throw new Error(`no ledger entry for id ${id}`);
  if (!['drafted', 'send_failed'].includes(ev.status)) {
    throw new Error(`id ${id} is '${ev.status}' — refusing to send (only drafted/send_failed are sendable)`);
  }

  const draftPath = path.join(layoutOf(settings).draftsDir, `${id}.md`);
  const raw = await fs.readFile(draftPath, 'utf8');
  const { frontmatter: fm } = parseFrontmatter(raw);
  if (fm.approve !== true) {
    throw new Error(`draft ${id} is not approved (set 'approve: true' in the file after review)`);
  }
  const body = extractBody(raw); // throws if the sentinel was deleted
  const lint = lintSendBody(body);
  if (!lint.ok) throw new Error(`send-lint refused: ${lint.problems.join('; ')}`);

  const to = Array.isArray(fm.to) ? fm.to : fm.to ? [fm.to] : [];
  const cc = Array.isArray(fm.cc) ? fm.cc : [];
  if (!to.length) throw new Error('draft has no recipient (to)');
  const recipient = addrOf(to[0]);

  await acquire(settings);
  let client;
  try {
    const conn = await connect(settings);
    client = conn.client;
    const sentFolder = await resolveSentFolder(client, settings);

    // pre-SMTP: was this already answered from another device?
    const since = ev.at ? new Date(Date.parse(ev.at) - 24 * 3600 * 1000) : undefined;
    if (await alreadySentReply(client, sentFolder, { recipient, inReplyTo: fm.in_reply_to, sinceDate: since })) {
      throw new Error(`a reply to this message already exists in Sent (likely sent from another device) — refusing. Run mail:resolve ${id} sent to reconcile.`);
    }

    out('─'.repeat(60));
    out(`To:      ${to.join(', ')}`);
    if (cc.length) out(`Cc:      ${cc.join(', ')}`);
    out(`Subject: ${fm.subject || ''}`);
    if (ev.related_drafts) out(`⚠ related drafts from same sender: ${ev.related_drafts.join(', ')}`);
    out('─'.repeat(60));
    out(body);
    out('─'.repeat(60));

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await rl.question('Send this exact message? [y/N] ')).trim().toLowerCase();
    rl.close();
    if (answer !== 'y') {
      out('aborted — nothing sent, no state change.');
      return;
    }

    const base = { mailKey: ev.mailKey, direction: 'incoming', id, threadKey: ev.threadKey, from: ev.from };
    // sending BEFORE the SMTP call closes the crash → double-send window.
    await appendEvent(settings, { ...base, status: 'sending', to: recipient });
    let info;
    try {
      info = await sendMail(settings, { to, cc, subject: fm.subject, text: body, inReplyTo: fm.in_reply_to, references: fm.references });
    } catch (e) {
      await appendEvent(settings, { ...base, status: 'send_failed', error: e.message.slice(0, 160) });
      throw new Error(`SMTP send failed (recorded send_failed): ${e.message}`);
    }
    // success → sent IMMEDIATELY, before any post-processing (plan §7 step 5).
    await appendEvent(settings, { ...base, status: 'sent', sentAt: new Date().toISOString(), inReplyTo: fm.in_reply_to || null });
    out(`sent to ${recipient}.`);

    // best-effort post-processing (never affects the 'sent' truth).
    if (settings.sentAutoSave === false) {
      const rfc = buildRfc822({ from: conn.account, to, cc, subject: fm.subject, text: body, inReplyTo: fm.in_reply_to, references: fm.references });
      const appended = await appendToSent(settings, client, sentFolder, rfc);
      await appendEvent(settings, { ...base, status: 'post_send_done', appended });
      out(appended ? 'appended a copy to Sent.' : 'Sent APPEND failed (best-effort) — next sync will pick up the server copy if any.');
    } else {
      out('server auto-saves to Sent; next sync will archive the outgoing copy.');
    }
  } finally {
    if (client) await client.logout().catch(() => {});
    await release(settings);
  }
}

main().catch((e) => {
  process.stderr.write(`send refused/failed [${e.code || 'ERROR'}]: ${e.message}\n`);
  process.exitCode = 1;
});
