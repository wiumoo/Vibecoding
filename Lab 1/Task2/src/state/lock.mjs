/**
 * lock.mjs — single-run lock at state/run.lock (plan §3, §4.3).
 * Holds {pid, at}. Acquired with an ATOMIC O_EXCL create ('wx') so two concurrent
 * runs cannot both win. A lock whose pid is dead (or older than maxAgeMs) is
 * stale: it is reclaimed and the create retried, so a crashed run never blocks
 * the next one forever.
 */
import { promises as fs } from 'node:fs';
import { layoutOf } from '../config.mjs';

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM'; // exists but not ours
  }
}

async function tryCreate(file, payload) {
  const fh = await fs.open(file, 'wx', 0o600); // throws EEXIST if present (atomic)
  try {
    await fh.writeFile(payload);
  } finally {
    await fh.close();
  }
}

export async function acquire(settings, { maxAgeMs = 30 * 60 * 1000 } = {}) {
  const L = layoutOf(settings);
  const payload = JSON.stringify({ pid: process.pid, at: new Date().toISOString() });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await tryCreate(L.runLockFile, payload);
      return;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let raw = null;
      try {
        raw = JSON.parse(await fs.readFile(L.runLockFile, 'utf8'));
      } catch {
        // unreadable/corrupt → treat as stale
      }
      const stale = !raw || !pidAlive(raw.pid) || Date.now() - Date.parse(raw.at || 0) >= maxAgeMs;
      if (!stale) {
        const err = new Error(`another run holds the lock (pid ${raw.pid})`);
        err.code = 'ELOCKED';
        throw err;
      }
      await fs.rm(L.runLockFile, { force: true }); // reclaim, then retry create
    }
  }
  const err = new Error('could not acquire run lock after reclaiming a stale lock');
  err.code = 'ELOCKED';
  throw err;
}

export async function release(settings) {
  const L = layoutOf(settings);
  await fs.rm(L.runLockFile, { force: true });
}
