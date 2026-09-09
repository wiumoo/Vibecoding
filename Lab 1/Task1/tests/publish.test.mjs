import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadSettings, ensureDataLayout } from '../src/config.mjs';
import { buildPublicDocs, leakCheck, loadSnapshot } from '../src/publish/mask.mjs';
import { ensureRepo, writeMaskedFiles, commitIfChanged, pushIfApproved, approveRemote, dataDirRel } from '../src/publish/git.mjs';

const px = promisify(execFile);

async function makeEnv() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'task1-pub-test-'));
  const settings = await loadSettings();
  settings.dataHome = path.join(tmp, 'data');
  // shared-dev-repo model
  const repo = path.join(tmp, 'devrepo');
  await fs.mkdir(repo);
  await px('git', ['init', '-q', '-b', 'main', repo]);
  await px('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init']);
  settings.publish = { repoRoot: repo, dataDir: 'public-data' };
  return { tmp, settings, repo };
}

async function seedSnapshot(settings) {
  const snapshots = path.join(settings.dataHome, 'private', 'snapshots');
  const id = 'S20260909T000000-aaaaaa';
  await fs.mkdir(path.join(snapshots, id), { recursive: true });
  const profile = { source: { XH: '202100001', XM: '홍길동', MZMC: '한족' }, normalized: { XH: '202100001', XM: '홍길동' } };
  const courses = { term: 'T1', count: 1, list: [{ record_key: 'KCH=CS101', source: { KCH: 'CS101', JXBMC: 'Intro', SKJS: 'Kim' }, normalized: {} }] };
  const schedule = { term: 'T1', timezone: 'Asia/Shanghai', count: 1, meetings: [{ course_key: 'KCH=CS101', course_code: 'CS101', day_of_week: 2, start_period: 3, end_period: 4, week_start: 1, week_end: 8, week_type: 'all', location: 'A-1' }] };
  const manifest = { schema_version: 2, snapshot_id: id, term: 'T1', source_system: 'NJU ehall', content_hashes: {}, counts: {} };
  await fs.writeFile(path.join(snapshots, id, 'profile.json'), JSON.stringify(profile));
  await fs.writeFile(path.join(snapshots, id, 'courses.json'), JSON.stringify(courses));
  await fs.writeFile(path.join(snapshots, id, 'schedule.json'), JSON.stringify(schedule));
  await fs.writeFile(path.join(snapshots, id, 'manifest.json'), JSON.stringify(manifest));
  await fs.writeFile(path.join(settings.dataHome, 'private', 'current.json'), JSON.stringify({ snapshot_id: id }));
}

test('publish pipeline: masking + leak + idempotent commit + clean push (shared repo model)', async () => {
  const { tmp, settings, repo } = await makeEnv();
  try {
    await ensureDataLayout(settings);
    await seedSnapshot(settings);
    const snap = await loadSnapshot(settings);
    const policy = await (await import('../src/core/normalize.mjs')).loadPublishPolicy();

    // mimic user-approved public policy
    policy.profile_publish.allow = [
      { field: 'XM', rule: 'first_char_only' },
      { field: 'XH', rule: 'student_id_prefix4' },
    ];
    policy.courses_publish.allow = ['KCH', 'JXBMC', 'SKJS'];
    policy.schedule_publish = { mode: 'full', allow: ['course_code', 'day_of_week', 'start_period', 'end_period', 'week_start', 'week_end'] };

    const docs = await buildPublicDocs(snap, policy);
    assert.equal(docs.profile.XM, '홍**');
    assert.equal(docs.profile.XH, '2021*****');
    assert.equal(docs.profile.MZMC, undefined); // denied field excluded
    assert.equal(docs.courses[0].JXBMC, 'Intro');
    assert.equal(docs.schedule.meetings[0].location, undefined); // denied

    const violations = leakCheck(docs, { knownSensitive: ['홍길동', '202100001'], policy });
    assert.deepEqual(violations, []);

    // bare remote + approve
    const bare = path.join(tmp, 'remote.git');
    await px('git', ['init', '--bare', '-q', bare]);
    await px('git', ['-C', repo, 'remote', 'add', 'origin', bare]);
    await ensureRepo(settings);
    const approved = await approveRemote(settings, bare);
    assert.equal(approved, bare);

    await writeMaskedFiles(settings, docs);
    const c1 = await commitIfChanged(settings, ['mask-refresh']);
    assert.equal(c1.committed, true);
    const p1 = await pushIfApproved(settings);
    assert.equal(p1.pushed, true);

    // idempotent
    const c2 = await commitIfChanged(settings, ['mask-refresh']);
    assert.equal(c2.committed, false);
    const p2 = await pushIfApproved(settings);
    assert.equal(p2.reason, 'up-to-date');

    // a manual commit on origin (divergence) must NOT be pushed automatically
    await px('git', ['-C', repo, 'checkout', '-q', '-b', 'tmpb']);
    const manual = path.join(repo, 'manual.txt');
    await fs.writeFile(manual, 'user change');
    await px('git', ['-C', repo, 'add', 'manual.txt']);
    await px('git', ['-C', repo, '-c', 'user.name=u', '-c', 'user.email=u@u', 'commit', '-q', '-m', 'manual']);
    await px('git', ['-C', repo, 'push', '-q', 'origin', 'tmpb:main']);
    await px('git', ['-C', repo, 'checkout', '-q', 'main']);
    const p3 = await pushIfApproved(settings);
    assert.equal(p3.pushed, false);
    assert.equal(p3.reason, 'diverged');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
