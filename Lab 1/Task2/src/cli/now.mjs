/**
 * now.mjs — mail:now (check + draft right now, then show what to review).
 * Runs one sync immediately (same code path as the hourly launchd job) and then
 * prints the actionable review list: drafts awaiting approval and messages
 * awaiting triage, each with its file path and the exact next command. This is
 * the on-demand counterpart to the scheduled agent.
 *
 *   npm run mail:now
 */
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSettings, layoutOf } from '../config.mjs';
import { currentStates } from '../state/ledger.mjs';
import { parseFrontmatter } from '../draft/draftfile.mjs';

const out = (l = '') => process.stdout.write(l + '\n');
const HERE = path.dirname(fileURLToPath(import.meta.url));

function runSync() {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [path.join(HERE, 'sync.mjs')], { timeout: 300000 });
    child.stdout?.pipe(process.stdout);
    child.stderr?.pipe(process.stderr);
    child.on('close', (code) => resolve(code ?? 1));
  });
}

async function draftSubject(settings, id) {
  try {
    const raw = await fs.readFile(path.join(layoutOf(settings).draftsDir, `${id}.md`), 'utf8');
    const { frontmatter } = parseFrontmatter(raw);
    return { subject: frontmatter.subject || '', approve: frontmatter.approve === true };
  } catch {
    return { subject: '', approve: false };
  }
}

async function main() {
  const settings = await loadSettings();
  out('checking now…\n');
  const code = await runSync();
  if (code !== 0) {
    out(`\nsync exited with code ${code} — see the error above.`);
    process.exitCode = code;
    return;
  }

  const states = await currentStates(settings);
  const drafted = [];
  const triage = [];
  for (const ev of states.values()) {
    if (ev.direction !== 'incoming') continue;
    if (ev.status === 'drafted' || ev.status === 'send_failed') drafted.push(ev);
    else if (ev.status === 'needs_triage') triage.push(ev);
  }

  out('\n' + '='.repeat(60));
  if (!drafted.length && !triage.length) {
    out('검토할 초안이 없습니다. (새 사람 발신 메일 없음 / 이미 처리됨)');
    return;
  }

  if (drafted.length) {
    out(`\n📝 검토 대기 초안 ${drafted.length}건 — 편집 후 approve: true 로 바꾸고 발송:`);
    for (const ev of drafted) {
      const info = await draftSubject(settings, ev.id);
      out(`  • ${ev.id}  «${info.subject}»  from ${ev.from || '?'}${ev.status === 'send_failed' ? '  [이전 발송 실패]' : ''}${info.approve ? '  ✔approve' : ''}`);
      out(`      파일: ${path.join(layoutOf(settings).draftsDir, ev.id + '.md')}`);
      out(`      발송: npm run mail:send -- ${ev.id}`);
    }
  }
  if (triage.length) {
    out(`\n❓ 판단 대기(triage) ${triage.length}건 — 초안 생성 또는 무시:`);
    for (const ev of triage) {
      out(`  • ${ev.id}  from ${ev.from || '?'}  (${ev.reason || ''})`);
      out(`      npm run mail:triage -- ${ev.id} draft   |   npm run mail:triage -- ${ev.id} skip`);
    }
  }
  out('\n(iPhone을 쓰면 임시 저장함에서 바로 편집·발송해도 됩니다 — 다음 mail:now가 감지합니다.)');
}

main().catch((e) => {
  process.stderr.write(`mail:now failed: ${e.message}\n`);
  process.exitCode = 1;
});
