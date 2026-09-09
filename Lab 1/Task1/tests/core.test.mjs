import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMeetings } from '../src/core/schedule-parser.mjs';
import { canonicalJson, sha256Hex, normText, pickAllowlist } from '../src/core/normalize.mjs';
import { sortedCourses, sortedMeetings, areaHashes, buildAreas } from '../src/storage/snapshot.mjs';

test('parseMeetings: real-style segment', () => {
  const r = parseMeetings('周二 3-4节 2-18周 A-101,周二 3-4节 1周 B-202');
  assert.equal(r.ok, true);
  assert.equal(r.meetings.length, 2);
  const [m1, m2] = r.meetings;
  assert.equal(m1.day_of_week, 2);
  assert.equal(m1.start_period, 3);
  assert.equal(m1.end_period, 4);
  assert.equal(m1.week_start, 2);
  assert.equal(m1.week_end, 18);
  assert.equal(m1.location, 'A-101');
  assert.equal(m2.week_start, 1);
});

test('parseMeetings: single/double week + braces', () => {
  const r = parseMeetings('周五 5-6节 {1-16周(单周)} A-101');
  assert.equal(r.ok, true);
  assert.equal(r.meetings.length, 1);
  assert.equal(r.meetings[0].week_type, 'odd');
  assert.equal(r.meetings[0].location, 'A-101');
});

test('parseMeetings: missing weeks -> not ok', () => {
  const r = parseMeetings('周二 3-4节 教室');
  assert.equal(r.ok, false);
  assert.equal(r.unparsed.length, 1);
});

test('parseMeetings: empty -> ok empty', () => {
  const r = parseMeetings('');
  assert.equal(r.ok, true);
  assert.equal(r.meetings.length, 0);
});

test('normText trims and collapses whitespace', () => {
  assert.equal(normText('  a  b \n c '), 'a b c');
  assert.equal(normText('  学 号 ', 'identity'), '学 号');
});

test('pickAllowlist only includes allowlisted fields', () => {
  const rec = { XH: '202600101', XM: '  a  b ', SECRET: 'x' };
  const out = pickAllowlist(rec, { allow: ['XH', 'XM'], normalization: { XM: 'trim' } }, '');
  assert.deepEqual(out.source, { XH: '202600101', XM: '  a  b ' });
  assert.deepEqual(out.normalized, { XH: '202600101', XM: 'a b' });
});

test('canonicalJson is stable across key order', () => {
  assert.equal(canonicalJson({ b: 1, a: { y: 2, x: 1 } }), canonicalJson({ a: { x: 1, y: 2 }, b: 1 }));
});

test('sha256Hex deterministic', () => {
  assert.equal(sha256Hex('x'), sha256Hex('x'));
  assert.notEqual(sha256Hex('x'), sha256Hex('y'));
});

test('sortedCourses/Meetings stable', () => {
  const cs = sortedCourses([
    { record_key: 'b' },
    { record_key: 'a' },
    { record_key: 'a' },
  ]);
  assert.deepEqual(cs.map((c) => c.record_key), ['a', 'a', 'b']);
  const ms = sortedMeetings([
    { day_of_week: 2, start_period: 5, week_start: 1, course_key: 'y' },
    { day_of_week: 1, start_period: 1, week_start: 1, course_key: 'x' },
  ]);
  assert.equal(ms[0].day_of_week, 1);
});

test('buildAreas + areaHashes reflect content only', () => {
  const collected = {
    term: { code: '2026-2027-1' },
    profile: { source: { XH: '1' }, normalized: { XH: '1' } },
    courses: [{ record_key: 'KCH=a', source: { KCH: 'a' }, normalized: { KCH: 'a' } }],
    schedule: { term: '2026-2027-1', timezone: 'Asia/Shanghai', meetings: [{ course_key: 'KCH=a', day_of_week: 2 }] },
    meta: { source_system: 's', collectedAt: 't', profileRowCount: 1, courseRowCount: 1, meetingCount: 1 },
  };
  const areas = buildAreas(collected);
  const h1 = areaHashes(areas);
  const collected2 = JSON.parse(JSON.stringify(collected));
  collected2.meta.collectedAt = 'other-time';
  const h2 = areaHashes(buildAreas(collected2));
  assert.deepEqual(h1, h2); // timestamps excluded
});
