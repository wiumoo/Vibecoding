/**
 * snapshot.mjs — build area files, compare against the previous snapshot using
 * semantic content hashes, and atomically publish a complete new snapshot.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { layoutOf, writePrivateFile } from '../config.mjs';
import { canonicalJson, sha256Hex, readCurrentSnapshotId } from '../core/normalize.mjs';

const AREAS = ['profile', 'courses', 'schedule'];
const KEEP_SNAPSHOTS = 5;

function rid() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `S${stamp}-${crypto.randomBytes(3).toString('hex')}`;
}

export function sortedCourses(list) {
  return [...list].sort((a, b) => {
    const ka = a.record_key; const kb = b.record_key;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

export function sortedMeetings(list) {
  return [...list].sort((a, b) => {
    for (const k of ['day_of_week', 'start_period', 'week_start', 'course_key']) {
      const x = a[k] ?? ''; const y = b[k] ?? '';
      if (x < y) return -1;
      if (x > y) return 1;
    }
    return 0;
  });
}

/** Build the three private area documents from a collected payload. */
export function buildAreas(collected) {
  const { profile, courses, schedule, term, meta } = collected;
  const profileDoc = { source: profile.source, normalized: profile.normalized };
  const coursesDoc = {
    term: term.code,
    count: courses.length,
    list: sortedCourses(courses).map((c) => ({ record_key: c.record_key, source: c.source, normalized: c.normalized })),
  };
  const scheduleDoc = {
    term: schedule.term,
    timezone: schedule.timezone,
    count: schedule.meetings.length,
    meetings: sortedMeetings(schedule.meetings),
  };
  return {
    profileDoc,
    coursesDoc,
    scheduleDoc,
    meta: {
      term: term.code,
      source_system: meta.source_system,
      collectedAt: meta.collectedAt,
      profileRowCount: meta.profileRowCount,
      courseRowCount: meta.courseRowCount,
      meetingCount: meta.meetingCount,
    },
  };
}

/** Semantic hashes of the normalized content of each area. */
export function areaHashes(areas) {
  return {
    profile: sha256Hex(canonicalJson(areas.profileDoc.normalized)),
    courses: sha256Hex(canonicalJson(areas.coursesDoc.list.map((c) => c.normalized))),
    schedule: sha256Hex(canonicalJson(areas.scheduleDoc.meetings)),
  };
}

async function readSnapshotFile(settings, id, name) {
  const L = layoutOf(settings);
  const p = path.join(L.snapshotsDir, id, name);
  try {
    return JSON.parse(await fs.readFile(p, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Publish a new snapshot only when normalized content changed.
 * Returns { changed, id, prevId, changedAreas, reasons }.
 */
export async function publishSnapshot(settings, collected, policyHash) {
  const L = layoutOf(settings);
  await fs.mkdir(L.snapshotsDir, { recursive: true, mode: 0o700 });
  const areas = buildAreas(collected);
  const hashes = areaHashes(areas);

  const prevId = await readCurrentSnapshotId(settings);
  const prevManifest = prevId ? await readSnapshotFile(settings, prevId, 'manifest.json') : null;
  const prevHashes = prevManifest?.content_hashes || null;
  const policySame = prevManifest ? prevManifest.policy_hash === policyHash : false;

  const changedAreas = prevHashes
    ? AREAS.filter((a) => prevHashes[a] !== hashes[a])
    : AREAS;
  const anyChange = !prevHashes || !policySame || changedAreas.length > 0;
  const reasons = [];
  if (!prevHashes) reasons.push('initial');
  else if (!policySame) reasons.push('policy-or-schema-change');
  if (prevHashes && policySame) reasons.push(...changedAreas.map((a) => a + '-changed'));

  if (!anyChange) {
    return { changed: false, id: prevId, prevId, changedAreas: [], reasons: ['no-change'] };
  }

  const id = rid();
  const dir = path.join(L.snapshotsDir, id);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  await fs.chmod(dir, 0o700);

  // Reuse unchanged area docs from the previous snapshot to keep complete files.
  const fileBodies = { profile: areas.profileDoc, courses: areas.coursesDoc, schedule: areas.scheduleDoc };
  for (const a of AREAS) {
    if (prevManifest && prevHashes && changedAreas.includes(a)) {
      // new content for this area
      await writePrivateFile(path.join(dir, `${a}.json`), fileBodies[a], { pretty: true });
    } else if (prevManifest && prevHashes) {
      // reuse previous file content
      const prev = await readSnapshotFile(settings, prevId, `${a}.json`);
      await writePrivateFile(path.join(dir, `${a}.json`), prev ?? fileBodies[a], { pretty: true });
    } else {
      await writePrivateFile(path.join(dir, `${a}.json`), fileBodies[a], { pretty: true });
    }
  }

  const manifest = {
    schema_version: 2,
    snapshot_id: id,
    policy_hash: policyHash,
    term: areas.meta.term,
    source_system: areas.meta.source_system,
    content_hashes: hashes,
    collected_at: areas.meta.collectedAt,
    counts: {
      profile: areas.meta.profileRowCount,
      courses: areas.meta.courseRowCount,
      schedule: areas.meta.meetingCount,
    },
    prev_snapshot_id: prevId,
  };
  await writePrivateFile(path.join(dir, 'manifest.json'), manifest, { pretty: true });

  // atomic pointer switch
  const tmpCurrent = L.currentFile + '.tmp';
  await fs.writeFile(tmpCurrent, JSON.stringify({ snapshot_id: id }), { mode: 0o600 });
  await fs.chmod(tmpCurrent, 0o600);
  await fs.rename(tmpCurrent, L.currentFile);

  await prune(settings, id);
  return { changed: true, id, prevId, changedAreas, reasons };
}

async function prune(settings, currentId) {
  const L = layoutOf(settings);
  let entries;
  try {
    entries = await fs.readdir(L.snapshotsDir, { withFileTypes: true });
  } catch {
    return;
  }
  const dirs = entries
    .filter((e) => e.isDirectory() && /^S[0-9TZ-]+$/.test(e.name))
    .map((e) => e.name)
    .sort()
    .reverse();
  const keep = new Set([currentId, ...dirs.slice(0, KEEP_SNAPSHOTS)]);
  for (const d of dirs) {
    // drop incomplete snapshots (missing manifest) and overflow entries
    let hasManifest = true;
    if (!keep.has(d) || d !== currentId) {
      try {
        await fs.access(path.join(L.snapshotsDir, d, 'manifest.json'));
      } catch {
        hasManifest = false;
      }
    }
    if (!keep.has(d) || !hasManifest) {
      if (d !== currentId || !hasManifest) {
        await fs.rm(path.join(L.snapshotsDir, d), { recursive: true, force: true }).catch(() => {});
      }
    }
  }
}
