/**
 * reader.mjs — validated, read-only snapshot + state reader (W-03/04/05/06).
 *
 * Rules:
 *  - Never creates directories, never writes, never chmods.
 *  - Reads current.json once and reads exactly one snapshot per call.
 *  - Validates id charset/length, rejects symlinked / non-regular files, checks
 *    manifest id + schema + cross-area term consistency.
 *  - Applies the current collection-policy allowlists so fields removed from
 *    the policy are not re-exposed by queries.
 *  - Malformed meetings are preserved as "problem meetings" (never guessed),
 *    and structural problems are reported as typed diagnostics, not swallowed.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { layoutOf } from '../config.mjs';
import { canonicalJson, sha256Hex } from '../core/normalize.mjs';
import { meetingProblem } from '../query/timetable.mjs';

const MAX_CURRENT_BYTES = 4096;
const MAX_STATE_BYTES = 262144;
const MAX_SNAPSHOT_FILE_BYTES = 10 * 1024 * 1024;
const ID_RE = /^[A-Za-z0-9-]+$/;
const MAX_ID_LENGTH = 128;
const FILES = ['profile.json', 'courses.json', 'schedule.json', 'manifest.json'];

export class ReadError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = 'ReadError';
    this.code = code;
    this.detail = detail;
  }
}

async function isRegularFile(p) {
  const st = await fs.lstat(p);
  return st.isFile();
}

async function statIfExists(p) {
  try {
    return await fs.lstat(p);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

async function readLimitedJson(p, maxBytes) {
  const st = await fs.lstat(p);
  if (!st.isFile()) throw new ReadError('PATH_NOT_REGULAR', `${path.basename(p)} is not a regular file`);
  if (st.size > maxBytes) throw new ReadError('FILE_TOO_LARGE', `${path.basename(p)} exceeds size limit`);
  const text = await fs.readFile(p, 'utf8');
  return JSON.parse(text);
}

/** Read and validate current.json -> snapshot id. */
export async function readCurrentSnapshotIdSafe(settings) {
  const L = layoutOf(settings);
  const st = await statIfExists(L.currentFile);
  if (!st) throw new ReadError('NO_CURRENT', 'current.json does not exist');
  if (!st.isFile()) throw new ReadError('CURRENT_NOT_REGULAR', 'current.json is not a regular file');
  if (st.isSymbolicLink()) throw new ReadError('CURRENT_SYMLINK', 'current.json must not be a symlink');
  if (st.size > MAX_CURRENT_BYTES) throw new ReadError('CURRENT_TOO_LARGE', 'current.json exceeds 4 KiB');
  let raw;
  try {
    raw = JSON.parse(await fs.readFile(L.currentFile, 'utf8'));
  } catch (e) {
    throw new ReadError('CURRENT_CORRUPT', 'current.json is not valid JSON');
  }
  const id = raw && typeof raw === 'object' && typeof raw.snapshot_id === 'string' ? raw.snapshot_id : null;
  if (!id) throw new ReadError('CURRENT_INVALID', 'current.json has no snapshot_id');
  if (!ID_RE.test(id) || id.length > MAX_ID_LENGTH) {
    throw new ReadError('CURRENT_INVALID', 'current.json snapshot_id has an unsafe format');
  }
  return id;
}

function pick(source, allowSet) {
  const out = {};
  for (const key of allowSet) {
    if (source && Object.prototype.hasOwnProperty.call(source, key)) {
      out[key] = source[key];
    }
  }
  return out;
}

function pickRecord(record, allowSet) {
  return {
    record_key: record.record_key,
    source: pick(record.source, allowSet),
    normalized: pick(record.normalized ?? {}, allowSet),
  };
}

function diag(code, severity, message, extra = {}) {
  return { code, severity, message, ...extra };
}

/** Load + validate the snapshot directory for a single id. Throws ReadError. */
export async function loadSnapshotDir(settings, id) {
  const L = layoutOf(settings);
  const dir = path.join(L.snapshotsDir, id);

  const dirStat = await statIfExists(dir);
  if (!dirStat) throw new ReadError('SNAPSHOT_MISSING', 'snapshot directory does not exist', { id });
  if (!dirStat.isDirectory()) throw new ReadError('SNAPSHOT_NOT_DIR', 'snapshot path is not a directory', { id });
  if (dirStat.isSymbolicLink()) throw new ReadError('SNAPSHOT_SYMLINK', 'snapshot directory must not be a symlink', { id });

  const snapsStat = await statIfExists(L.snapshotsDir);
  if (snapsStat && snapsStat.isSymbolicLink()) {
    throw new ReadError('SNAPSHOT_ROOT_SYMLINK', 'snapshots root must not be a symlink');
  }

  // Presence + regular-file + size checks before reading content.
  const texts = {};
  for (const f of FILES) {
    const p = path.join(dir, f);
    const st = await statIfExists(p);
    if (!st) throw new ReadError('SNAPSHOT_MISSING', `snapshot file ${f} is missing`, { id });
    if (!st.isFile() || st.isSymbolicLink()) {
      throw new ReadError('SNAPSHOT_PATH_VIOLATION', `snapshot file ${f} is not a plain regular file`, { id });
    }
    if (st.size > MAX_SNAPSHOT_FILE_BYTES) {
      throw new ReadError('SNAPSHOT_TOO_LARGE', `snapshot file ${f} exceeds 10 MiB`, { id });
    }
  }
  for (const f of FILES) {
    try {
      texts[f] = await fs.readFile(path.join(dir, f), 'utf8');
    } catch (e) {
      if (e.code === 'ENOENT') throw new ReadError('SNAPSHOT_RACE', 'snapshot disappeared while reading', { id });
      throw e;
    }
  }

  let parsed = {};
  for (const f of FILES) {
    try {
      parsed[f] = JSON.parse(texts[f]);
    } catch {
      throw new ReadError('SNAPSHOT_CORRUPT', `${f} is not valid JSON`, { id });
    }
  }

  const manifest = parsed['manifest.json'];
  if (!manifest || typeof manifest !== 'object') {
    throw new ReadError('SNAPSHOT_CORRUPT', 'manifest.json is not an object', { id });
  }
  if (manifest.snapshot_id !== id) {
    throw new ReadError('MANIFEST_ID_MISMATCH', 'manifest.snapshot_id does not match the directory id', { id });
  }
  if (![1, 2].includes(manifest.schema_version)) {
    throw new ReadError('UNSUPPORTED_SCHEMA', `schema_version ${manifest.schema_version} is not supported`, { id });
  }
  if (typeof manifest.term !== 'string' || !manifest.term) {
    throw new ReadError('SNAPSHOT_CORRUPT', 'manifest.term is missing', { id });
  }

  const diagnostics = [];

  // ---- area containers ----
  const profile = parsed['profile.json'];
  if (!profile || typeof profile !== 'object' || !profile.source || typeof profile.source !== 'object') {
    throw new ReadError('SNAPSHOT_CORRUPT', 'profile.json is missing its source container', { id });
  }

  const courses = parsed['courses.json'];
  if (!courses || typeof courses !== 'object' || !Array.isArray(courses.list)) {
    throw new ReadError('SNAPSHOT_CORRUPT', 'courses.json is missing its list array', { id });
  }
  if (typeof courses.count !== 'number' && courses.count !== undefined) {
    throw new ReadError('SNAPSHOT_CORRUPT', 'courses.json count has an unexpected type', { id });
  }
  if (courses.count !== undefined && courses.count !== courses.list.length) {
    diagnostics.push(diag('count-mismatch', 'warn', 'courses.json count differs from the list length', { declared: courses.count, actual: courses.list.length }));
  }

  const schedule = parsed['schedule.json'];
  if (!schedule || typeof schedule !== 'object' || !Array.isArray(schedule.meetings)) {
    throw new ReadError('SNAPSHOT_CORRUPT', 'schedule.json is missing its meetings array', { id });
  }
  if (schedule.count !== undefined && schedule.count !== schedule.meetings.length) {
    diagnostics.push(diag('count-mismatch', 'warn', 'schedule.json count differs from the meetings length', { declared: schedule.count, actual: schedule.meetings.length }));
  }

  // ---- cross-area term consistency (fatal) ----
  const term = manifest.term;
  if (typeof courses.term === 'string' && courses.term && courses.term !== term) {
    throw new ReadError('TERM_MISMATCH', 'courses.json term differs from manifest term', { id });
  }
  if (typeof schedule.term === 'string' && schedule.term && schedule.term !== term) {
    throw new ReadError('TERM_MISMATCH', 'schedule.json term differs from manifest term', { id });
  }

  // ---- course record shape + duplicates ----
  const recordKeys = new Set();
  const dupKeys = new Set();
  for (const c of courses.list) {
    if (!c || typeof c !== 'object' || typeof c.record_key !== 'string' || !c.source || typeof c.source !== 'object') {
      throw new ReadError('SNAPSHOT_CORRUPT', 'a course record is missing record_key/source', { id });
    }
    if (recordKeys.has(c.record_key)) dupKeys.add(c.record_key);
    recordKeys.add(c.record_key);
  }
  if (dupKeys.size) {
    diagnostics.push(diag('duplicate-course-keys', 'warn', 'duplicate course record keys found', { keys: [...dupKeys] }));
  }

  // ---- meeting shape: malformed ones kept as problems, not guessed ----
  const problemMeetings = [];
  for (let i = 0; i < schedule.meetings.length; i++) {
    const m = schedule.meetings[i];
    if (!m || typeof m !== 'object' || typeof m.course_key !== 'string') {
      problemMeetings.push({ index: i, code: 'invalid-shape' });
      continue;
    }
    const prob = meetingProblem(m);
    if (prob) problemMeetings.push({ index: i, code: prob });
  }
  if (problemMeetings.length) {
    diagnostics.push(diag('problem-meetings', 'warn', 'meetings that cannot be rendered as regular classes', { meetings: problemMeetings }));
  }

  // ---- unlinked meetings ----
  const unlinked = [];
  for (let i = 0; i < schedule.meetings.length; i++) {
    const m = schedule.meetings[i];
    if (m && typeof m.course_key === 'string' && !recordKeys.has(m.course_key)) unlinked.push(i);
  }
  if (unlinked.length) {
    diagnostics.push(diag('unlinked-meetings', 'warn', 'meetings without a matching course record', { indices: unlinked }));
  }

  return {
    id,
    dir,
    schemaVersion: manifest.schema_version,
    term,
    sourceSystem: typeof manifest.source_system === 'string' ? manifest.source_system : 'NJU ehall',
    collectedAt: typeof manifest.collected_at === 'string' ? manifest.collected_at : null,
    policyHash: typeof manifest.policy_hash === 'string' ? manifest.policy_hash : null,
    contentHashes: manifest.content_hashes ?? null,
    counts: manifest.counts ?? null,
    profile,
    courses,
    schedule,
    diagnostics,
  };
}

async function loadCollectionPolicyDoc() {
  const { loadPolicyFile } = await import('../core/normalize.mjs');
  return loadPolicyFile('collection-policy.json');
}

/**
 * Top-level dashboard read. Returns:
 * { ok, snapshot|null, state|null, diagnostics[], observedAt, policyHash|null }
 * Never throws for ordinary "no snapshot yet" conditions; throws ReadError only
 * for true file-system/parse faults the caller may decide to surface as errors.
 */
export async function readDashboardData(settings) {
  const observedAt = new Date().toISOString();
  const diagnostics = [];

  let id = null;
  try {
    id = await readCurrentSnapshotIdSafe(settings);
  } catch (e) {
    if (e instanceof ReadError) {
      diagnostics.push(diag(e.code, e.code === 'NO_CURRENT' ? 'info' : 'error', e.message));
      return { ok: false, snapshot: null, state: null, diagnostics, observedAt, policyHash: null };
    }
    throw e;
  }

  // One consistent snapshot per call, with a single retry for prune races.
  let loaded = null;
  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      loaded = await loadSnapshotDir(settings, id);
      break;
    } catch (e) {
      if (e instanceof ReadError && e.code === 'SNAPSHOT_RACE' && attempt === 1) {
        try {
          id = await readCurrentSnapshotIdSafe(settings);
        } catch (e2) {
          diagnostics.push(diag(e2.code, 'error', e2.message));
          return { ok: false, snapshot: null, state: null, diagnostics, observedAt, policyHash: null };
        }
        continue;
      }
      if (e instanceof ReadError) {
        diagnostics.push(diag(e.code, 'error', e.message, e.detail ?? {}));
        return { ok: false, snapshot: null, state: null, diagnostics, observedAt, policyHash: null };
      }
      throw e;
    }
  }

  // state read is best-effort (never fatal)
  let state = null;
  try {
    const L = layoutOf(settings);
    const st = await statIfExists(L.syncStateFile);
    if (st) {
      if (!st.isFile() || st.isSymbolicLink()) diagnostics.push(diag('state-not-regular', 'warn', 'sync-state.json is not a plain file'));
      else if (st.size > MAX_STATE_BYTES) diagnostics.push(diag('state-too-large', 'warn', 'sync-state.json exceeds 256 KiB'));
      else state = JSON.parse(await fs.readFile(L.syncStateFile, 'utf8'));
    }
  } catch {
    diagnostics.push(diag('state-unreadable', 'warn', 'sync-state.json could not be read'));
  }

  // Apply the CURRENT collection allowlist so removed fields are not re-exposed.
  let policyHash = null;
  let filterApplied = false;
  try {
    const policy = await loadCollectionPolicyDoc();
    policyHash = sha256Hex(canonicalJson(policy));
    const identityAllow = new Set(policy.identity?.allow || []);
    const courseAllow = new Set(policy.courses?.allow || []);
    loaded.profile = {
      source: pick(loaded.profile.source, identityAllow),
      normalized: pick(loaded.profile.normalized ?? {}, identityAllow),
    };
    loaded.courses.list = loaded.courses.list.map((c) => pickRecord(c, courseAllow));
    filterApplied = true;
    if (loaded.policyHash && loaded.policyHash !== policyHash) {
      diagnostics.push(diag('policy-mismatch', 'warn', 'snapshot was collected under a different collection policy', { snapshotPolicy: loaded.policyHash.slice(0, 12), currentPolicy: policyHash.slice(0, 12) }));
    }
  } catch (e) {
    diagnostics.push(diag('policy-unavailable', 'warn', 'collection policy could not be read; field filter not applied'));
  }

  diagnostics.push(...loaded.diagnostics);
  for (const d of diagnostics) delete d.detail;

  return {
    ok: true,
    snapshot: {
      id: loaded.id,
      schemaVersion: loaded.schemaVersion,
      term: loaded.term,
      sourceSystem: loaded.sourceSystem,
      collectedAt: loaded.collectedAt,
      policyHash: loaded.policyHash,
      contentHashes: loaded.contentHashes,
      counts: loaded.counts,
      profile: loaded.profile,
      courses: loaded.courses,
      schedule: loaded.schedule,
    },
    state,
    diagnostics,
    observedAt,
    policyHash,
    filterApplied,
  };
}
