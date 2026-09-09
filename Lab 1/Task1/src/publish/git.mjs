/**
 * git.mjs — commit PUBLIC masked data into the shared dev repository
 * (repoRoot = parent repo of Task1, data under "Lab 1/Task1/public-data"),
 * and push only when the current origin matches the approved remote and the
 * push is a clean fast-forward. Never force-pushes, never rewrites history.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { readState, writeState } from '../storage/state.mjs';

const px = promisify(execFile);
const PUB_FILES = ['profile.masked.json', 'courses.masked.json', 'schedule.masked.json', 'manifest.json'];

export function repoRoot(settings) {
  return settings.publish?.repoRoot || null;
}
export function dataDirRel(settings) {
  return settings.publish?.dataDir || 'Lab 1/Task1/public-data';
}

async function git(settings, args) {
  const root = repoRoot(settings);
  if (!root) throw new Error('settings.publish.repoRoot not configured');
  const { stdout } = await px('git', ['-C', root, ...args], { maxBuffer: 32 * 1024 * 1024 });
  return stdout;
}

/** Verify the target is a git repo; create nothing. */
export async function ensureRepo(settings) {
  const root = repoRoot(settings);
  if (!root) throw new Error('settings.publish.repoRoot not configured');
  await fs.mkdir(path.join(root, dataDirRel(settings)), { recursive: true, mode: 0o700 });
  try {
    await git(settings, ['rev-parse', '--git-dir']);
  } catch {
    throw new Error(`not a git repository: ${root}`);
  }
}

/** Write masked docs to <repo>/<dataDir> (files 0600, dir 0700). */
export async function writeMaskedFiles(settings, docs) {
  const root = repoRoot(settings);
  const dir = path.join(root, dataDirRel(settings));
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  await fs.chmod(dir, 0o700);
  const map = {
    profile: 'profile.masked.json',
    courses: 'courses.masked.json',
    schedule: 'schedule.masked.json',
    manifest: 'manifest.json',
  };
  for (const key of Object.keys(map)) {
    const file = path.join(dir, map[key]);
    const tmp = file + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(docs[key], null, 2) + '\n', { mode: 0o600 });
    await fs.chmod(tmp, 0o600);
    await fs.rename(tmp, file);
  }
}

/**
 * Stage + commit ONLY the masked data dir (path-limited commit). Committer is set
 * per-commit with -c, leaving repo config and the user's own commits untouched.
 */
export async function commitIfChanged(settings, reasons = []) {
  const rel = dataDirRel(settings);
  await git(settings, ['add', '--', rel]);
  const diff = await git(settings, ['diff', '--cached', '--quiet']).catch(() => 'changed');
  if (diff === '') return { committed: false, message: null };
  const subject = 'update: refresh ehall personal data';
  await git(settings, [
    '-c', 'user.name=Task1 Sync',
    '-c', 'user.email=task1-sync@localhost',
    'commit', '-q', '-m', subject, '-m', `reasons: ${(reasons || []).join(',') || 'none'}`,
    '--', rel,
  ]);
  return { committed: true, message: subject };
}

/** Push only when origin URL matches the approved remote and history is clean. */
export async function pushIfApproved(settings) {
  const st = await readState(settings);
  const approved = st.gitApproved;
  if (!approved?.remoteUrl) return { pushed: false, reason: 'no-approved-remote' };
  let origin;
  try {
    origin = (await git(settings, ['remote', 'get-url', 'origin'])).trim();
  } catch {
    origin = '';
  }
  if (!origin || !sameRemote(origin, approved.remoteUrl)) {
    return { pushed: false, reason: 'origin-mismatch' };
  }
  const branch = approved.branch || 'main';
  let remoteSha = '';
  try {
    const ls = (await git(settings, ['ls-remote', 'origin', `refs/heads/${branch}`])).trim();
    remoteSha = ls ? ls.split(/\s+/)[0] : '';
  } catch {
    return { pushed: false, reason: 'ls-remote-failed', detail: 'remote unreachable' };
  }
  const ours = (await git(settings, ['rev-parse', 'HEAD'])).trim();
  if (!remoteSha) {
    // remote branch does not exist yet -> first push
    try {
      await git(settings, ['push', 'origin', `HEAD:${branch}`]);
      return { pushed: true, reason: null };
    } catch (e) {
      return { pushed: false, reason: 'push-failed', detail: String(e.stderr || e.message).split('\n')[0] };
    }
  }
  if (remoteSha === ours) return { pushed: false, reason: 'up-to-date' };
  const localAhead = Number((await git(settings, ['rev-list', '--count', `${remoteSha}..HEAD`])).trim());
  const remoteOnly = Number((await git(settings, ['rev-list', '--count', `HEAD..${remoteSha}`])).trim());
  if (remoteOnly === 0 && localAhead > 0) {
    try {
      await git(settings, ['push', 'origin', `HEAD:${branch}`]);
      return { pushed: true, reason: null };
    } catch (e) {
      return { pushed: false, reason: 'push-failed', detail: String(e.stderr || e.message).split('\n')[0] };
    }
  }
  return { pushed: false, reason: 'diverged' };
}

/** Approve a remote by recording the repo's ACTUAL origin URL (validated against a hint). */
export async function approveRemote(settings, expectedUrl) {
  let origin;
  try {
    origin = (await git(settings, ['remote', 'get-url', 'origin'])).trim();
  } catch {
    origin = '';
  }
  if (!origin) throw new Error('repo has no origin remote');
  if (expectedUrl && !sameRemote(origin, expectedUrl)) {
    throw new Error(`origin mismatch: expected ${expectedUrl}, actual ${origin}`);
  }
  await writeState(settings, {
    gitApproved: { remoteUrl: origin, branch: 'main', approvedAt: new Date().toISOString() },
  });
  return origin;
}

function sameRemote(a, b) {
  const norm = (s) => s.replace(/^git@github\.com:/, 'https://github.com/').replace(/\.git$/, '').replace(/\/$/, '');
  return norm(a) === norm(b);
}
