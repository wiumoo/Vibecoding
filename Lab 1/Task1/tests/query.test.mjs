import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeInWeek, collectWeeks, meetingsConflict, sameSlotButDisjoint, assignLanes, meetingProblem, periodsOverlap } from '../src/query/timetable.mjs';
import { projectStatus, syncStatusToken, publishStatusToken, freshnessOf, FRESHNESS_WINDOW_MS } from '../src/query/status.mjs';
import { searchSnapshot, normalizeSearch, creditSummary, courseMatches } from '../src/query/service.mjs';
import { recordLocator, areaSource } from '../src/query/source.mjs';

// ---------- timetable ----------
const base = (over) => ({ course_key: 'k1', course_code: 'C1', day_of_week: 2, start_period: 3, end_period: 4, week_start: 1, week_end: 8, week_type: 'all', location: 'A-101', ...over });

test('timetable: activeInWeek respects range and parity', () => {
  const m = base({ week_start: 2, week_end: 18, week_type: 'odd' });
  assert.equal(activeInWeek(m, 3), true);
  assert.equal(activeInWeek(m, 4), false);
  assert.equal(activeInWeek(m, 1), false);
  assert.equal(activeInWeek(m, 19), false);
  const all = base({ week_type: 'all' });
  assert.equal(activeInWeek(all, 4), true);
});

test('timetable: invalid inputs return null (never guessed)', () => {
  assert.equal(activeInWeek(base({ week_type: 'fortnightly' }), 2), null);
  assert.equal(activeInWeek(base({ week_start: 9, week_end: 1 }), 2), null);
});

test('timetable: collectWeeks unions valid ranges', () => {
  const weeks = collectWeeks([
    base({ week_start: 1, week_end: 4 }),
    base({ week_start: 6, week_end: 7, day_of_week: 3 }),
  ]);
  assert.deepEqual(weeks, [1, 2, 3, 4, 6, 7]);
  assert.deepEqual(collectWeeks([base({ week_start: 5, week_end: 2 })]), []);
  assert.deepEqual(collectWeeks([]), []);
});

test('timetable: real conflicts need shared weeks; odd/even never conflict', () => {
  const a = base({});
  const sameWeeks = base({ course_key: 'k2', course_code: 'C2', week_type: 'all' }); // same day/period/weeks
  assert.equal(meetingsConflict(a, sameWeeks), true);
  const odd = base({ course_key: 'k3', course_code: 'C3', week_type: 'odd' });
  const even = base({ course_key: 'k4', course_code: 'C4', week_type: 'even' });
  assert.equal(meetingsConflict(odd, even), false); // exclusive parity
  assert.equal(sameSlotButDisjoint(odd, even), true);
  const all2 = base({ course_key: 'k5', course_code: 'C5', week_type: 'all' });
  assert.equal(meetingsConflict(odd, all2), true); // all overlaps odd weeks
});

test('timetable: disjoint week ranges in same slot do not conflict', () => {
  const a = base({ week_start: 1, week_end: 4 });
  const b = base({ course_key: 'k2', course_code: 'C2', week_start: 5, week_end: 8 });
  assert.equal(meetingsConflict(a, b), false);
  assert.equal(periodsOverlap(a, b), true); // same slot visually
});

test('timetable: lanes never overlap a column', () => {
  const m1 = base({});
  const m2 = base({ course_key: 'k2', course_code: 'C2', start_period: 3, end_period: 5 }); // overlaps m1
  const m3 = base({ course_key: 'k3', course_code: 'C3', start_period: 6, end_period: 6 });
  const { meetings, laneCount } = assignLanes([m1, m2, m3]);
  assert.equal(laneCount, 2);
  assert.equal(meetings.find((x) => x.meeting.course_key === 'k3').lane, 0);
});

test('timetable: problem detection surfaces malformed meetings', () => {
  assert.equal(meetingProblem(base({ day_of_week: 9 })), 'invalid-day');
  assert.equal(meetingProblem(base({ end_period: 2 })), 'invalid-period');
  assert.equal(meetingProblem(base({ week_type: 'x' })), 'invalid-week-type');
  assert.equal(meetingProblem(base()), null);
});

// ---------- status ----------
const snap = { id: 'S1', term: 'T1', collectedAt: '2026-09-09T00:00:00.000Z' };
const NOW = Date.parse('2026-09-09T12:00:00.000Z');

test('status: fresh within 26h via state lastCollectedAt', () => {
  const state = { lastStatus: 'no-change', lastCollectedAt: '2026-09-09T10:00:00.000Z' };
  assert.equal(freshnessOf({ state, snapshot: snap, now: NOW }).state, 'fresh');
  assert.equal(projectStatus({ state, snapshot: snap, now: NOW }).freshness, 'fresh');
});

test('status: stale beyond 26h', () => {
  const old = new Date(NOW - FRESHNESS_WINDOW_MS - 1000).toISOString();
  const state = { lastStatus: 'no-change', lastCollectedAt: old };
  assert.equal(freshnessOf({ state, snapshot: snap, now: NOW }).state, 'stale');
});

test('status: unknown when no reliable time; clock-warning on future time', () => {
  assert.equal(freshnessOf({ state: null, snapshot: null, now: NOW }).state, 'no-snapshot');
  const noState = { lastStatus: 'failed', lastCollectedAt: null };
  assert.equal(freshnessOf({ state: noState, snapshot: null, now: NOW }).state, 'no-snapshot');
  const fut = { lastStatus: 'no-change', lastCollectedAt: new Date(NOW + 86400000).toISOString() };
  assert.equal(freshnessOf({ state: fut, snapshot: snap, now: NOW }).state, 'clock-warning');
});

test('status: state pointing at a different snapshot is not trusted', () => {
  const state = { lastStatus: 'no-change', lastCollectedAt: '2026-09-09T10:00:00.000Z', currentSnapshotId: 'S-OTHER' };
  const f = freshnessOf({ state, snapshot: snap, now: NOW });
  assert.equal(f.state, 'unknown');
  assert.equal(f.basis, 'state-snapshot-mismatch');
});

test('status: running is only "recorded", sync/publish tokens map safely', () => {
  const st = projectStatus({ state: { lastStatus: 'running' }, snapshot: snap, now: NOW });
  assert.equal(st.sync.token, 'running-recorded');
  assert.equal(st.recordedRunning, true);
  assert.equal(syncStatusToken({ lastStatus: 'need-login' }), 'need-login');
  assert.equal(syncStatusToken(null), 'never');
  assert.equal(publishStatusToken({ lastPublishPush: { pushed: true } }), 'pushed');
  assert.equal(publishStatusToken({ lastPublishPush: { pushed: false, reason: 'up-to-date' } }), 'up-to-date');
  assert.equal(publishStatusToken({ lastPublishPush: { pushed: false, reason: 'diverged' } }), 'diverged');
  assert.equal(publishStatusToken({}), 'never');
});

// ---------- service ----------
function course(name) {
  return { record_key: `k-${name}`, source: { KCH: 'CS' + name, JXBMC: name, SKJS: 'Kim', XF: '3' } };
}
const SNAP = {
  courses: [course('소프트웨어공학'), course('操作系统'), course('Algorithms')],
  meetings: [
    { course_key: 'k-소프트웨어공학', course_code: 'CS소프트웨어공학', location: 'A-101' },
    { course_key: 'k-Algorithms', course_code: 'CSAlgorithms', location: 'B-202' },
  ],
};

test('service: mixed CJK/English substring search', () => {
  assert.equal(courseMatches(SNAP.courses[0], '공학'), true);
  const r1 = searchSnapshot(SNAP, '系统');
  assert.equal(r1.courseHits.length, 1);
  assert.equal(r1.courseHits[0].record.source.JXBMC, '操作系统');
  const r2 = searchSnapshot(SNAP, 'algo');
  assert.equal(r2.courseHits.length, 1);
  assert.equal(normalizeSearch('  ALGO '), 'algo');
});

test('service: meeting search covers room / code / key only', () => {
  const r = searchSnapshot(SNAP, 'A-101');
  assert.equal(r.meetingHits.length, 1);
  assert.equal(r.meetingHits[0].meeting.course_key, 'k-소프트웨어공학');
  const r2 = searchSnapshot(SNAP, 'nope-not-there');
  assert.equal(r2.courseHits.length, 0);
  assert.equal(r2.meetingHits.length, 0);
});

test('service: empty query returns nothing, no crash', () => {
  const r = searchSnapshot(SNAP, '   ');
  assert.equal(r.courseHits.length, 0);
  assert.equal(r.meetingHits.length, 0);
});

test('service: credit summary counts parseable values and skips junk', () => {
  const rows = [
    course('a'),
    { record_key: 'b', source: { XF: '2.5' } },
    { record_key: 'c', source: { XF: '' } },
    { record_key: 'd', source: { XF: '불명' } },
  ];
  const s = creditSummary(rows);
  assert.equal(s.total, 5.5);
  assert.equal(s.counted, 2);
  assert.equal(s.skipped, 1);
});

// ---------- source ----------
test('source: locators are snapshot-relative and never absolute paths', () => {
  const loc = recordLocator('S1', 'schedule.json', { record_key: 'k1', json_pointer: '/meetings/0' });
  assert.equal(loc.snapshot_id, 'S1');
  assert.equal(loc.local_file, 'schedule.json');
  assert.equal(loc.json_pointer, '/meetings/0');
  assert.ok(!loc.local_file.startsWith('/'));
  assert.equal(areaSource('profile.json', 'X1').source_system, 'NJU ehall');
});
