import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeSettings, seedSnapshot, fingerprint, SYN_TERM } from './helpers.mjs';

const px = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function runDb(settings, args) {
  return px('/opt/homebrew/bin/node', [path.join(ROOT, 'src/query/db.mjs'), ...args], {
    cwd: ROOT,
    env: { ...process.env, NJU_EHALL_DATA_HOME: settings.dataHome },
    maxBuffer: 8 * 1024 * 1024,
  });
}

test('cli: profile/courses/search/status return stable, read-only results (golden)', async () => {
  const settings = await makeSettings();
  await seedSnapshot(settings, { state: { lastStatus: 'no-change', lastCollectedAt: new Date().toISOString() } });
  const before = await fingerprint(settings);

  const prof = JSON.parse((await runDb(settings, ['profile'])).stdout);
  assert.equal(prof.term, SYN_TERM);
  assert.equal(prof.data.source.XH, '202600101'); // preserved as string
  assert.equal(typeof prof.data.source.XH, 'string');
  assert.equal(prof.source.local_file, 'profile.json');
  assert.equal(prof.source.source_system, 'NJU ehall');
  assert.ok(prof.source.json_pointer);

  const courses = JSON.parse((await runDb(settings, ['courses'])).stdout);
  assert.equal(courses.count, 1);
  assert.equal(courses.data[0].source.KCH, 'CS1010');
  assert.ok(courses.data[0].record_key.includes('KCH=CS1010'));

  const sch = JSON.parse((await runDb(settings, ['schedule'])).stdout);
  assert.equal(sch.count, 1);
  assert.equal(sch.meetings[0].day_of_week, 2);
  assert.equal(sch.timezone, 'Asia/Shanghai');

  const search = JSON.parse((await runDb(settings, ['search', 'CS1010'])).stdout);
  assert.ok(search.hitCount >= 1);
  assert.ok(search.hits.every((h) => h.source?.snapshot_id));

  const status = JSON.parse((await runDb(settings, ['status'])).stdout);
  assert.equal(status.current, 'S20260909T000000-aaaaaa');
  assert.ok(['fresh', 'unknown'].includes(status.freshness));
  assert.equal(status.sync.token, 'success');

  const after = await fingerprint(settings);
  assert.equal(before, after, 'CLI query must never write/create/modify PRIVATE files');
});

test('cli: status works without a snapshot; profile fails with a typed message', async () => {
  const settings = await makeSettings();
  const status = JSON.parse((await runDb(settings, ['status'])).stdout);
  assert.equal(status.current, null);
  assert.equal(status.freshness, 'no-snapshot');
  assert.ok(status.diagnostics.some((d) => d.code === 'NO_CURRENT'));

  await assert.rejects(() => runDb(settings, ['profile']), (e) => /NO_SNAPSHOT|no current snapshot/.test(String(e.stderr || e.message)));
});

test('cli: import does not execute main (module import is side-effect free)', async () => {
  const mod = await import('../src/query/db.mjs');
  assert.equal(typeof mod.runQuery, 'function');
});
