/**
 * cred-verify.mjs — M1 read-only connectivity probe. Answers plan §1 checklist:
 * which password works, CAPABILITY (UIDPLUS / SPECIAL-USE), the real \Sent folder
 * name, folder list, INBOX/Sent counts + 3 recent subjects, SMTP auth.
 * Never writes server or local state.
 *
 *   npm run mail:cred-verify
 */
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { loadSettings } from '../config.mjs';
import { getCredential } from '../../../Task1/src/auth/keychain.mjs';

function out(line = '') {
  process.stdout.write(line + '\n');
}

async function recentSubjects(client, mailbox, n = 3) {
  const lock = await client.getMailboxLock(mailbox, { readOnly: true });
  try {
    const exists = client.mailbox.exists;
    const uidValidity = String(client.mailbox.uidValidity);
    if (!exists) return { exists: 0, uidValidity, subjects: [] };
    const from = Math.max(1, exists - (n - 1));
    const subjects = [];
    for await (const msg of client.fetch(`${from}:*`, { envelope: true })) {
      subjects.push({
        date: msg.envelope.date ? new Date(msg.envelope.date).toISOString() : null,
        subject: msg.envelope.subject || '(no subject)',
      });
    }
    return { exists, uidValidity: String(client.mailbox.uidValidity), subjects };
  } finally {
    lock.release();
  }
}

function findSentFolder(folders, candidates) {
  const bySpecialUse = folders.find((f) => f.specialUse === '\\Sent');
  if (bySpecialUse) return { path: bySpecialUse.path, via: 'SPECIAL-USE' };
  for (const cand of candidates) {
    const hit = folders.find((f) => f.path === cand || f.name === cand);
    if (hit) return { path: hit.path, via: `candidate "${cand}"` };
  }
  return null;
}

async function main() {
  const settings = await loadSettings();
  const { account, password } = await getCredential({ service: settings.keychain.service });
  out(`account: ${account}`);

  // --- IMAP ---
  const client = new ImapFlow({
    host: settings.imap.host,
    port: settings.imap.port,
    secure: settings.imap.secure,
    auth: { user: account, pass: password },
    logger: false,
  });
  await client.connect();
  out(`IMAP login OK (${settings.imap.host}:${settings.imap.port})`);

  const caps = [...client.capabilities.keys()];
  out(`capabilities: ${caps.join(' ')}`);
  out(`  UIDPLUS: ${client.capabilities.has('UIDPLUS')}  SPECIAL-USE: ${client.capabilities.has('SPECIAL-USE')}  IDLE: ${client.capabilities.has('IDLE')}`);

  const folders = await client.list();
  out(`folders: ${folders.map((f) => f.path + (f.specialUse ? ` [${f.specialUse}]` : '')).join(' · ')}`);

  const sent = findSentFolder(folders, settings.folders.sentCandidates);
  if (sent) out(`\\Sent folder: "${sent.path}" (via ${sent.via}) → settings.folders.sent에 기록할 것`);
  else out('\\Sent folder: NOT FOUND — 후보 목록도 미적중. 폴더 목록을 보고 결정 필요');

  for (const [label, mailbox] of [['INBOX', settings.folders.inbox], ['Sent', sent?.path]]) {
    if (!mailbox) continue;
    const r = await recentSubjects(client, mailbox);
    out(`${label} ("${mailbox}"): ${r.exists} messages, uidValidity=${r.uidValidity}`);
    for (const s of r.subjects) out(`  - ${s.date}  ${s.subject}`);
  }
  await client.logout();

  // --- SMTP ---
  const transport = nodemailer.createTransport({
    host: settings.smtp.host,
    port: settings.smtp.port,
    secure: settings.smtp.secure,
    auth: { user: account, pass: password },
  });
  await transport.verify();
  out(`SMTP auth OK (${settings.smtp.host}:${settings.smtp.port})`);
  transport.close();

  out('\ncred-verify: all checks passed');
}

main().catch((e) => {
  process.stderr.write(`cred-verify failed: ${e.message}\n`);
  if (e.authenticationFailed || /auth/i.test(String(e.message))) {
    process.stderr.write(
      '인증 실패 → 웹메일에서 IMAP/SMTP 서비스 활성화 여부와, 보안 로그인 사용 시\n' +
        '클라이언트 전용 비밀번호가 필요한지 확인 후 npm run cred:setup으로 다시 저장하세요.\n'
    );
  }
  process.exitCode = 1;
});
