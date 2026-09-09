/**
 * query/db.mjs — read-only LOCAL TRUSTED query CLI against the private snapshot.
 *
 *   node src/query/db.mjs profile
 *   node src/query/db.mjs courses
 *   node src/query/db.mjs schedule
 *   node src/query/db.mjs search <text>
 *   node src/query/db.mjs status
 *
 * The heavy lifting lives in src/storage/reader.mjs and the pure modules under
 * src/query/ so the web API can share the exact same query logic without ever
 * shelling out to this CLI. Querying never mutates data, directories or git
 * (this file performs no mkdir/chmod/write).
 */
import { loadSettings } from '../config.mjs';
import { readDashboardData } from '../storage/reader.mjs';
import { projectStatus } from './status.mjs';
import { searchSnapshot } from './service.mjs';
import { recordLocator } from './source.mjs';

function formatProfile(snap, id) {
  return {
    term: snap.term,
    data: snap.profile,
    source: recordLocator(id, 'profile.json', { record_key: snap.profile.source?.XH || null, json_pointer: '/source' }),
  };
}

function formatCourses(snap, id) {
  return {
    term: snap.term,
    count: snap.courses.list.length,
    data: snap.courses.list,
    source: recordLocator(id, 'courses.json', { json_pointer: '/list' }),
  };
}

function formatSchedule(snap, id) {
  return {
    term: snap.term,
    timezone: snap.schedule.timezone,
    count: snap.schedule.meetings.length,
    meetings: snap.schedule.meetings,
    source: recordLocator(id, 'schedule.json', { json_pointer: '/meetings' }),
  };
}

function formatSearch(snap, id, q) {
  const res = searchSnapshot({ courses: snap.courses.list, meetings: snap.schedule.meetings }, q);
  const hits = [];
  for (const h of res.courseHits) {
    hits.push({
      record: h.record,
      matchedFields: h.matchedFields,
      source: recordLocator(id, 'courses.json', { record_key: h.record.record_key, json_pointer: `/list/${h.index}/source` }),
    });
  }
  for (const h of res.meetingHits) {
    hits.push({
      meeting: h.meeting,
      source: recordLocator(id, 'schedule.json', { record_key: h.meeting.course_key, json_pointer: `/meetings/${h.index}` }),
    });
  }
  return { query: res.query, hitCount: hits.length, hits };
}

function formatStatus(snap, state, diagnostics, observedAt) {
  const status = projectStatus({ state, snapshot: snap, now: Date.parse(observedAt) });
  return {
    current: snap ? snap.id : null,
    term: snap ? snap.term : null,
    counts: snap ? { profile: 1, courses: snap.courses.list.length, schedule: snap.schedule.meetings.length } : null,
    collectedAt: snap ? snap.collectedAt : null,
    observedAt,
    freshness: status.freshness,
    sync: status.sync,
    publish: status.publish,
    diagnostics: diagnostics.map((d) => ({ code: d.code, severity: d.severity, message: d.message })),
  };
}

async function runQuery(settings, cmd, arg) {
  const dashboard = await readDashboardData(settings);
  const snap = dashboard.snapshot;
  if (cmd === 'status') {
    return { ok: true, result: formatStatus(snap, dashboard.state, dashboard.diagnostics, dashboard.observedAt) };
  }
  if (!snap) {
    const fatal = dashboard.diagnostics.find((d) => d.severity === 'error');
    const err = new Error('no usable snapshot: ' + (fatal ? fatal.message : 'no current snapshot yet — run npm run sync'));
    err.code = fatal ? fatal.code : 'NO_SNAPSHOT';
    throw err;
  }
  if (cmd === 'profile') return { ok: true, result: formatProfile(snap, snap.id) };
  if (cmd === 'courses') return { ok: true, result: formatCourses(snap, snap.id) };
  if (cmd === 'schedule') return { ok: true, result: formatSchedule(snap, snap.id) };
  if (cmd === 'search') {
    if (!arg || !String(arg).trim()) throw new Error('usage: db search <text>');
    return { ok: true, result: formatSearch(snap, snap.id, arg) };
  }
  return { ok: false };
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  const settings = await loadSettings();
  if (!cmd) {
    process.stdout.write('usage: db <profile|courses|schedule|search <text>|status>\n');
    process.exitCode = 1;
    return;
  }
  const out = await runQuery(settings, cmd, arg);
  if (!out.ok) {
    process.stdout.write('usage: db <profile|courses|schedule|search <text>|status>\n');
    process.exitCode = 1;
    return;
  }
  process.stdout.write(JSON.stringify(out.result, null, 2) + '\n');
}

// Guard so importing this module (e.g. for its pure parts in tests) never runs main.
import { pathToFileURL } from 'node:url';
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    process.stderr.write(`db error [${e.code || 'ERROR'}]: ${e.message}\n`);
    process.exitCode = 1;
  });
}

export { runQuery };
