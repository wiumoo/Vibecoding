/**
 * probe-send.mjs — M1 probe mandated by plan §1/§11: sends ONE test mail to the
 * account's own address (never anyone else — the recipient is hardcoded to the
 * Keychain account), then inspects the INBOX copy and the Sent copy to answer:
 *   1. Does exmail preserve the nodemailer-generated Message-ID? (→ §7.4/§7.5
 *      sent_message_id matching vs In-Reply-To + time-window fallback)
 *   2. Is "auto-save SMTP mail to Sent" effectively ON? (→ §7.4 branch)
 * Interactive: asks for explicit "y" before sending. This is a one-off M1 probe,
 * not a send path — the production send path is mail:send only (plan §7).
 *
 *   npm run mail:probe-send
 */
import readline from 'node:readline/promises';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { loadSettings } from '../config.mjs';
import { getCredential } from '../../../Task1/src/auth/keychain.mjs';

const out = (l = '') => process.stdout.write(l + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findByToken(client, mailbox, token, { tail = 15 } = {}) {
  const lock = await client.getMailboxLock(mailbox, { readOnly: true });
  try {
    const exists = client.mailbox.exists;
    if (!exists) return null;
    const from = Math.max(1, exists - (tail - 1));
    // Local matching on recent envelopes; no server HEADER search (plan §5.3).
    for await (const msg of client.fetch(`${from}:*`, { envelope: true })) {
      if ((msg.envelope.subject || '').includes(token)) {
        return { subject: msg.envelope.subject, messageId: msg.envelope.messageId || null };
      }
    }
    return null;
  } finally {
    lock.release();
  }
}

async function main() {
  const settings = await loadSettings();
  const { account, password } = await getCredential({ service: settings.keychain.service });

  const token = `NJUSmail-probe-${Date.now()}`;
  out('이 프로브는 다음 테스트 메일 1통을 보냅니다 (수신자는 본인 계정으로 고정):');
  out(`  To: ${account}`);
  out(`  Subject: ${token}`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question('보낼까요? [y/N] ')).trim().toLowerCase();
  rl.close();
  if (answer !== 'y') {
    out('취소했습니다.');
    return;
  }

  const transport = nodemailer.createTransport({
    host: settings.smtp.host,
    port: settings.smtp.port,
    secure: settings.smtp.secure,
    auth: { user: account, pass: password },
  });
  const info = await transport.sendMail({
    from: account,
    to: account,
    subject: token,
    text: 'M1 probe: Message-ID preservation & Sent auto-save check. Safe to delete.',
  });
  transport.close();
  const localId = info.messageId;
  out(`sent. nodemailer Message-ID: ${localId}`);

  const client = new ImapFlow({
    host: settings.imap.host,
    port: settings.imap.port,
    secure: settings.imap.secure,
    auth: { user: account, pass: password },
    logger: false,
  });
  await client.connect();

  const sentFolder = settings.folders.sent;
  let inboxCopy = null;
  let sentCopy = null;
  for (let attempt = 1; attempt <= 6; attempt++) {
    await sleep(10_000);
    inboxCopy = inboxCopy || (await findByToken(client, settings.folders.inbox, token));
    if (sentFolder) sentCopy = sentCopy || (await findByToken(client, sentFolder, token));
    out(`  poll ${attempt}/6: INBOX=${inboxCopy ? 'found' : '-'} Sent=${sentFolder ? (sentCopy ? 'found' : '-') : 'folder unset'}`);
    if (inboxCopy && (sentCopy || !sentFolder)) break;
  }
  await client.logout();

  out('\n=== probe result (plan §1 체크리스트에 기록) ===');
  if (inboxCopy) {
    const preserved = inboxCopy.messageId === localId;
    out(`INBOX copy Message-ID: ${inboxCopy.messageId}`);
    out(`Message-ID preserved (recipient side): ${preserved}`);
  } else {
    out('INBOX copy: 60초 내 미도착 — 잠시 후 mail:cred-verify로 확인하거나 재실행');
  }
  if (!sentFolder) {
    out('Sent copy: settings.folders.sent 미설정 — mail:cred-verify 결과를 먼저 기록하세요');
  } else if (sentCopy) {
    out(`Sent copy Message-ID: ${sentCopy.messageId} (preserved: ${sentCopy.messageId === localId})`);
    out('sentAutoSave: ON — §7.4 분기: APPEND·사후 아카이빙 생략, Sent 동기화 단일 경로');
  } else {
    out('Sent copy: 없음 → sentAutoSave: OFF — §7.4 분기: best-effort APPEND+아카이빙');
  }
}

main().catch((e) => {
  process.stderr.write(`probe-send failed: ${e.message}\n`);
  process.exitCode = 1;
});
