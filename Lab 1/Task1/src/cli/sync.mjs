/**
 * sync.mjs — full Phase 2 sync: open session -> collect -> validate -> publish
 * snapshot if changed. Prints a safe summary only (counts, no personal values).
 *   node src/cli/sync.mjs
 */
import { loadSettings, ensureDataLayout } from '../config.mjs';
import { getCredential } from '../auth/keychain.mjs';
import { loadCollectionPolicy, canonicalJson, sha256Hex } from '../core/normalize.mjs';
import { openSession, closeSession, collectAll } from '../collect/jwapp.mjs';
import { publishSnapshot } from '../storage/snapshot.mjs';
import { writeState } from '../storage/state.mjs';

async function main() {
  const settings = await loadSettings();
  const L = await ensureDataLayout(settings);
  const policy = await loadCollectionPolicy();
  const policyHash = sha256Hex(canonicalJson(policy));
  const { account } = await getCredential({ service: settings.keychain.service });

  const started = new Date();
  let sess = null;
  try {
    await writeState(settings, { lastRunAt: started.toISOString(), lastStatus: 'running' });
    sess = await openSession(settings, { headless: true });
    const collected = await collectAll(settings, sess.context, { account });
    const result = await publishSnapshot(settings, collected, policyHash);

    const m = collected.meta;
    await writeState(settings, {
      lastStatus: result.changed ? 'published' : 'no-change',
      lastCollectedAt: m.collectedAt,
      currentSnapshotId: result.id,
      lastCounts: {
        profile: m.profileRowCount,
        courses: m.courseRowCount,
        schedule: m.meetingCount,
        term: collected.term.code,
      },
      lastReasons: result.reasons,
    });

    process.stdout.write(
      `sync done: changed=${result.changed} reasons=${(result.reasons || []).join(',') || 'none'} ` +
      `term=${collected.term.code} profile=${m.profileRowCount} courses=${m.courseRowCount} schedule=${m.meetingCount}\n`
    );
    if (result.changed) process.stdout.write(`new snapshot: ${result.id}\n`);
  } catch (e) {
    const code = e?.code || 'ERROR';
    await writeState(settings, {
      lastStatus: 'failed',
      lastError: { code, message: String(e?.message || e).split('\n')[0] },
    });
    process.stderr.write(`sync failed [${code}]: ${String(e?.message || e).split('\n')[0]}\n`);
    process.exitCode = 2;
  } finally {
    if (sess) await closeSession(settings, sess.context).catch(() => {});
  }
}

main().catch((e) => {
  process.stderr.write(`sync fatal: ${String(e?.message || e).split('\n')[0]}\n`);
  process.exit(1);
});
