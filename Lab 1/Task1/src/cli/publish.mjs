/**
 * publish.mjs — generate PUBLIC masked files from the current private snapshot,
 * leak-check them, write to the dedicated publish repo, and commit when changed.
 * Push happens only when an approved remote is recorded (user approval).
 *   node src/cli/publish.mjs
 */
import { loadSettings, ensureDataLayout } from '../config.mjs';
import { loadPublishPolicy } from '../core/normalize.mjs';
import { buildPublicDocs, leakCheck, loadSnapshot, PublishError } from '../publish/mask.mjs';
import { ensureRepo, writeMaskedFiles, commitIfChanged, pushIfApproved } from '../publish/git.mjs';
import { writeState } from '../storage/state.mjs';

async function main() {
  const settings = await loadSettings();
  await ensureDataLayout(settings);
  const policy = await loadPublishPolicy();
  const snap = await loadSnapshot(settings);

  const docs = await buildPublicDocs(snap, policy);

  const knownSensitive = [];
  for (const f of ['XH', 'XM', 'YHH', 'XSBH']) {
    if (snap.profile.source[f]) knownSensitive.push(snap.profile.source[f]);
  }
  const violations = leakCheck(docs, { knownSensitive, policy });
  if (violations.length) {
    throw new PublishError(`leak check failed: ${violations.join(', ')}`, violations);
  }

  await ensureRepo(settings);
  await writeMaskedFiles(settings, docs);
  const reasons = ['mask-refresh'];
  const { committed } = await commitIfChanged(settings, reasons);
  const push = await pushIfApproved(settings);

  await writeState(settings, {
    lastPublishAt: new Date().toISOString(),
    lastPublishCommitted: committed,
    lastPublishPush: push,
  });
  process.stdout.write(
    `publish done: committed=${committed} push=${push.pushed ? 'yes' : push.reason}\n`
  );
}

main().catch((e) => {
  process.stderr.write(`publish failed: ${e.message}\n`);
  if (e instanceof PublishError && e.violations?.length) {
    process.stderr.write(`violations: ${e.violations.join(', ')}\n`);
  }
  process.exit(1);
});
