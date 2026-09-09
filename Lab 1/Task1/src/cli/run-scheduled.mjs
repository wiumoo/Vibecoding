/**
 * run-scheduled.mjs — entry point for launchd (08:00 / 20:00 local).
 * 1) session check via light sync attempt; 2) full sync; 3) publish masked.
 * On failure that indicates the session died, post a macOS notification asking
 * for a one-time interactive re-login (slider). No secrets in notifications.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadSettings, ensureDataLayout, PROJECT_ROOT } from '../config.mjs';
import { writeState } from '../storage/state.mjs';
import { hasVault } from '../auth/cookie-vault.mjs';

const px = promisify(execFile);

async function notify(title, body) {
  try {
    const script = `display notification ${JSON.stringify(body)} with title ${JSON.stringify(title)}`;
    await px('/usr/bin/osascript', ['-e', script]);
  } catch { /* notification not available */ }
}

async function runNode(script) {
  const { stdout } = await px('/opt/homebrew/bin/node', [script], {
    cwd: PROJECT_ROOT,
    maxBuffer: 4 * 1024 * 1024,
  });
  return stdout;
}

async function main() {
  const settings = await loadSettings();
  await ensureDataLayout(settings);

  if (!(await hasVault(settings))) {
    await writeState(settings, { lastStatus: 'need-login' });
    await notify('NJU ehall Task1', '세션이 없습니다. interactive login이 필요합니다.');
    process.exit(3);
  }

  const results = {};
  try {
    const syncOut = await runNode(`${PROJECT_ROOT}/src/cli/sync.mjs`);
    results.sync = syncOut.trim().split('\n').pop();
  } catch (e) {
    results.sync = `failed: ${String(e.stderr || e.message).split('\n')[0]}`;
  }

  try {
    const pubOut = await runNode(`${PROJECT_ROOT}/src/cli/publish.mjs`);
    results.publish = pubOut.trim().split('\n').pop();
  } catch (e) {
    results.publish = `failed: ${String(e.stderr || e.message).split('\n')[0]}`;
  }

  process.stdout.write(`scheduled run: sync=${results.sync} | publish=${results.publish}\n`);
  const syncBad = /failed:/.test(results.sync);
  if (syncBad && /(NO_VAULT|NOT_JSON|API_ERROR)/.test(results.sync)) {
    await notify('NJU ehall Task1', '로그인 세션이 만료됐습니다. npm run auth:login (슬라이더 1회) 해 주세요.');
    await writeState(settings, { lastStatus: 'need-login' });
  } else if (syncBad) {
    await writeState(settings, { lastStatus: 'sync-failed', lastSyncOut: results.sync.slice(0, 300) });
  } else {
    await writeState(settings, { lastStatus: 'ok' });
  }
}

main().catch((e) => {
  process.stderr.write(`run-scheduled fatal: ${e.message}\n`);
  process.exit(1);
});
