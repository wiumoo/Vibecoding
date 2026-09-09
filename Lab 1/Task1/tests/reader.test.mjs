import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { readDashboardData, ReadError, readCurrentSnapshotIdSafe } from '../src/storage/reader.mjs';
import { makeSettings, seedSnapshot, mkProfile, mkCourse, mkMeeting, mkManifest, SYN_TERM } from './helpers.mjs';

function diagCodes(d) {
  return d.diagnostics.map((x) => `${x.severity}:${x.code}`);
}

test('reader: normal synthetic snapshot returns filtered fields', async () => {
  const settings = await makeSettings();
  const extraCourse = { ...mkCourse(), source: { ...mkCourse().source, LATEX: 'should-drop', PRIVATE_NOTE: 'x' } };
  const profile = mkProfile({ source: { XH: '202600101', XM: '홍길동', SECRET_EXTRA: 'drop-me' } });
  await seedSnapshot(settings, { profile, courses: [extraCourse] });
  const d = await readDashboardData(settings);
  assert.equal(d.ok, true);
  assert.equal(d.snapshot.term, SYN_TERM);
  assert.equal(d.snapshot.profile.source.XH, '202600101');
  assert.equal(d.snapshot.profile.source.XM, '홍길동');
  assert.equal('SECRET_EXTRA' in d.snapshot.profile.source, false); // not in collection allowlist
  assert.equal('LATEX' in d.snapshot.courses.list[0].source, false);
  assert.equal('PRIVATE_NOTE' in d.snapshot.courses.list[0].source, false);
  assert.equal(d.snapshot.schedule.meetings.length, 1);
});

test('reader: no current.json -> empty state, no throw', async () => {
  const settings = await makeSettings();
  const d = await readDashboardData(settings);
  assert.equal(d.ok, false);
  assert.equal(d.snapshot, null);
  assert.ok(diagCodes(d).includes('info:NO_CURRENT'));
});

test('reader: corrupt current.json -> CURRENT_CORRUPT', async () => {
  const settings = await makeSettings();
  const L = (await import('../src/config.mjs')).layoutOf(settings);
  await fs.mkdir(L.privateDir, { recursive: true });
  await fs.writeFile(path.join(L.privateDir, 'current.json'), '{not json');
  const d = await readDashboardData(settings);
  assert.equal(d.snapshot, null);
  assert.ok(diagCodes(d).includes('error:CURRENT_CORRUPT'));
});

test('reader: unsafe or overlong snapshot ids are rejected', async () => {
  for (const bad of ['../outside', '..\\secret', 'a/../../x', 'S 1', 'x'.repeat(200), 'a?b=1']) {
    const settings = await makeSettings();
    const L = (await import('../src/config.mjs')).layoutOf(settings);
    await fs.mkdir(L.privateDir, { recursive: true });
    await fs.writeFile(path.join(L.privateDir, 'current.json'), JSON.stringify({ snapshot_id: bad }));
    const d = await readDashboardData(settings);
    assert.ok(diagCodes(d).includes('error:CURRENT_INVALID'), `should reject id=${bad}`);
  }
});

test('reader: snapshot dir missing after current points at it', async () => {
  const settings = await makeSettings();
  const L = (await import('../src/config.mjs')).layoutOf(settings);
  await fs.mkdir(L.privateDir, { recursive: true });
  await fs.writeFile(path.join(L.privateDir, 'current.json'), JSON.stringify({ snapshot_id: 'S20260909T000000-aaaaaa' }));
  const d = await readDashboardData(settings);
  assert.ok(diagCodes(d).includes('error:SNAPSHOT_MISSING'));
});

test('reader: symlinked snapshot file rejected', async () => {
  const settings = await makeSettings();
  const id = await seedSnapshot(settings, {});
  const L = (await import('../src/config.mjs')).layoutOf(settings);
  const dir = path.join(L.snapshotsDir, id);
  await fs.rename(path.join(dir, 'profile.json'), path.join(dir, 'profile.real.json'));
  await fs.symlink(path.join(dir, 'profile.real.json'), path.join(dir, 'profile.json'));
  const d = await readDashboardData(settings);
  assert.ok(diagCodes(d).includes('error:SNAPSHOT_PATH_VIOLATION'));
});

test('reader: manifest id mismatch and unsupported schema are fatal', async () => {
  const settings = await makeSettings();
  await seedSnapshot(settings, { manifest: mkManifest({ id: 'S20000000T000000-zzzzzz' }) });
  let d = await readDashboardData(settings);
  assert.ok(diagCodes(d).includes('error:MANIFEST_ID_MISMATCH'));

  const settings2 = await makeSettings();
  await seedSnapshot(settings2, { manifest: mkManifest({ schemaVersion: 3 }) });
  d = await readDashboardData(settings2);
  assert.ok(diagCodes(d).includes('error:UNSUPPORTED_SCHEMA'));
});

test('reader: cross-area term mismatch is fatal', async () => {
  const settings = await makeSettings();
  const course = mkCourse();
  const meetings = [mkMeeting({ course_key: course.record_key, code: course.source.KCH })];
  const docs = {
    courseList: [course],
    meetings,
    write: true,
  };
  // seed then rewrite courses.json with a different term
  await seedSnapshot(settings, { courses: [course], meetings });
  const L = (await import('../src/config.mjs')).layoutOf(settings);
  const id = 'S20260909T000000-aaaaaa';
  await fs.writeFile(
    path.join(L.snapshotsDir, id, 'courses.json'),
    JSON.stringify({ term: '2099-2099-9', count: 1, list: docs.courseList })
  );
  const d = await readDashboardData(settings);
  assert.ok(diagCodes(d).includes('error:TERM_MISMATCH'));
});

test('reader: count mismatch, duplicates, unlinked and problem meetings are warnings', async () => {
  const settings = await makeSettings();
  const c1 = mkCourse({ code: 'CS1010' });
  const c2 = mkCourse({ code: 'CS2020' });
  const dup = { ...c1 };
  const meetings = [
    mkMeeting({ course_key: c1.record_key, code: c1.source.KCH }),
    mkMeeting({ course_key: 'XNXQDM=2026-2027-1;KCH=NOPE;JXBID=NOPE', code: 'NOPE', day: 9 }), // invalid day + unlinked
  ];
  const manifest = mkManifest({ id: 'S20260909T000000-aaaaaa', counts: { profile: 1, courses: 9, schedule: 9 } });
  await seedSnapshot(settings, { courses: [c1, c2, dup], meetings, manifest });
  // declared area count disagrees with the actual list length -> warning
  const L2 = (await import('../src/config.mjs')).layoutOf(settings);
  await fs.writeFile(
    path.join(L2.snapshotsDir, 'S20260909T000000-aaaaaa', 'courses.json'),
    JSON.stringify({ term: SYN_TERM, count: 9, list: [c1, c2, dup] })
  );
  const d = await readDashboardData(settings);
  assert.equal(d.ok, true);
  const codes = diagCodes(d);
  assert.ok(codes.includes('warn:count-mismatch'));
  assert.ok(codes.includes('warn:duplicate-course-keys'));
  assert.ok(codes.includes('warn:unlinked-meetings'));
  assert.ok(codes.includes('warn:problem-meetings'));
  assert.equal(d.snapshot.courses.list.length, 3);
});

test('reader: policy mismatch on manifest policy_hash is a warning', async () => {
  const settings = await makeSettings();
  await seedSnapshot(settings, { manifest: mkManifest({ policyHash: 'x'.repeat(64) }) });
  const d = await readDashboardData(settings);
  assert.equal(d.ok, true);
  assert.ok(diagCodes(d).includes('warn:policy-mismatch'));
});

test('reader: corrupt state is a warning while snapshot stays readable', async () => {
  const settings = await makeSettings();
  await seedSnapshot(settings, {});
  const L = (await import('../src/config.mjs')).layoutOf(settings);
  await fs.mkdir(path.dirname(L.syncStateFile), { recursive: true });
  await fs.writeFile(L.syncStateFile, '{oops');
  const d = await readDashboardData(settings);
  assert.equal(d.ok, true);
  assert.equal(d.state, null);
  assert.ok(diagCodes(d).includes('warn:state-unreadable'));
});

test('reader: empty courses and empty schedule are valid snapshots', async () => {
  const settings = await makeSettings();
  const manifest = mkManifest({ id: 'S20260909T000000-aaaaaa', counts: { profile: 1, courses: 0, schedule: 0 } });
  await seedSnapshot(settings, { courses: [], meetings: [], manifest });
  const d = await readDashboardData(settings);
  assert.equal(d.ok, true);
  assert.equal(d.snapshot.courses.list.length, 0);
  assert.equal(d.snapshot.schedule.meetings.length, 0);
});

test('reader: state with a healthy no-change record is parsed', async () => {
  const settings = await makeSettings();
  const { syncedState } = await import('./helpers.mjs');
  await seedSnapshot(settings, { state: syncedState() });
  const d = await readDashboardData(settings);
  assert.equal(d.ok, true);
  assert.equal(d.state.lastStatus, 'no-change');
  assert.ok(d.state.lastCollectedAt);
});

test('reader: readCurrentSnapshotIdSafe returns id and classifies absence', async () => {
  const settings = await makeSettings();
  await assert.rejects(() => readCurrentSnapshotIdSafe(settings), (e) => e instanceof ReadError && e.code === 'NO_CURRENT');
  await seedSnapshot(settings, {});
  assert.equal(await readCurrentSnapshotIdSafe(settings), 'S20260909T000000-aaaaaa');
});
