/**
 * tests/helpers.mjs — synthetic-only fixtures. Real private data is never
 * copied into fixtures. Also provides a read-only "tree fingerprint" helper
 * used to prove that server/API access never writes to disk.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadSettings } from '../src/config.mjs';

export const SYN_XH = '202600101';
export const SYN_XM = '홍길동';
export const SYN_TERM = '2026-2027-1';
export const SYN_COLLECTED = '2026-09-09T00:00:00.000Z';

/** A settings object bound to a fresh temp dataHome (cloned, no cache mutation). */
export async function makeSettings() {
  const base = await loadSettings();
  const settings = structuredClone(base);
  settings.dataHome = await fs.mkdtemp(path.join(os.tmpdir(), 'task1-web-test-'));
  return settings;
}

export function mkProfile(over = {}) {
  const source = {
    XH: SYN_XH,
    XM: SYN_XM,
    YXDM: '020000',
    ZYMC: '컴퓨터과학과',
    BJMC: 'CS-2301',
    XZNJ: '2023',
    XSBH: 'U' + SYN_XH,
    ...(over.source || {}),
  };
  return { source, normalized: { ...source }, ...over };
}

export function mkCourse({ code = 'CS1010', idx = '01', name, teacher = '김교수', extra = {}, scheduleRaw } = {}) {
  const JXBMC = name || `소프트웨어공학${idx}반`;
  const JXBID = `JXB${code}${idx}`;
  const source = {
    KCH: code,
    JXBMC,
    JXBID,
    XF: '3',
    PKDWDM_DISPLAY: '컴퓨터학부',
    SKJS: teacher,
    XKLY_DISPLAY: '자유선택',
    ZCXQJCDD: scheduleRaw ?? '周二 3-4节 1-8周 A-101',
    ...extra,
  };
  const record_key = `XNXQDM=${SYN_TERM};KCH=${code};JXBID=${JXBID}`;
  return { record_key, source, normalized: { ...source } };
}

export function mkMeeting({ course_key, code, day = 2, sp = 3, ep = 4, ws = 1, we = 8, wt = 'all', location = 'A-101', extra = {} }) {
  return {
    course_key,
    course_code: code,
    day_of_week: day,
    start_period: sp,
    end_period: ep,
    week_start: ws,
    week_end: we,
    week_type: wt,
    location,
    ...extra,
  };
}

export function mkManifest({ id = 'S20260909T000000-aaaaaa', term = SYN_TERM, policyHash = 'p'.repeat(64), collectedAt = SYN_COLLECTED, counts = null, schemaVersion = 2 } = {}) {
  return {
    schema_version: schemaVersion,
    snapshot_id: id,
    policy_hash: policyHash,
    term,
    source_system: 'NJU ehall',
    content_hashes: { profile: 'a', courses: 'b', schedule: 'c' },
    collected_at: collectedAt,
    counts: counts || { profile: 1, courses: 0, schedule: 0 },
    prev_snapshot_id: null,
  };
}

/** Write a full synthetic snapshot set; returns the snapshot id. */
export async function seedSnapshot(settings, { id = 'S20260909T000000-aaaaaa', profile, courses, meetings, manifest, state } = {}) {
  const { layoutOf } = await import('../src/config.mjs');
  const L = layoutOf(settings);
  const dir = path.join(L.snapshotsDir, id);
  await fs.mkdir(dir, { recursive: true });

  const courseList = courses ?? [mkCourse()];
  const courseCount = courseList.length;
  const meetingList = meetings ?? [
    mkMeeting({ course_key: courseList[0].record_key, code: courseList[0].source.KCH }),
  ];
  const man = manifest ?? mkManifest({ id, counts: { profile: 1, courses: courseCount, schedule: meetingList.length } });

  const docs = {
    'profile.json': JSON.stringify(profile ?? mkProfile()),
    'courses.json': JSON.stringify({ term: man.term, count: courseList.length, list: courseList }),
    'schedule.json': JSON.stringify({ term: man.term, timezone: 'Asia/Shanghai', count: meetingList.length, meetings: meetingList }),
    'manifest.json': JSON.stringify(man),
  };
  for (const [name, body] of Object.entries(docs)) {
    await fs.writeFile(path.join(dir, name), body);
  }
  await fs.mkdir(L.privateDir, { recursive: true });
  await fs.writeFile(path.join(L.privateDir, 'current.json'), JSON.stringify({ snapshot_id: id }));
  if (state) {
    const stDir = path.dirname(L.syncStateFile);
    await fs.mkdir(stDir, { recursive: true });
    await fs.writeFile(L.syncStateFile, JSON.stringify(state));
  }
  return id;
}

/** Record a full-tree fingerprint (paths, contents, modes, mtimes, dir listing). */
export async function fingerprint(settings) {
  const { layoutOf } = await import('../src/config.mjs');
  const L = layoutOf(settings);
  const out = [];
  async function walk(p, rel) {
    let st;
    try {
      st = await fs.lstat(p);
    } catch {
      return;
    }
    if (st.isDirectory()) {
      out.push(`D ${rel}`);
      const kids = (await fs.readdir(p)).sort();
      for (const k of kids) await walk(path.join(p, k), rel ? `${rel}/${k}` : k);
    } else if (st.isFile()) {
      const body = await fs.readFile(p, 'utf8').catch(() => '<unreadable>');
      out.push(`F ${rel} mode=${st.mode & 0o777} mtime=${st.mtimeMs} len=${body.length} hash=${await sha(body)}`);
    } else {
      out.push(`X ${rel} kind=${st.isSymbolicLink() ? 'symlink' : 'special'}`);
    }
  }
  await walk(L.root, '');
  return out.sort().join('\n');
}

async function sha(body) {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(body).digest('hex').slice(0, 16);
}

export function syncedState({ lastStatus = 'no-change', lastCollectedAt = SYN_COLLECTED, lastRunAt = SYN_COLLECTED, extra = {} } = {}) {
  return {
    lastRunAt,
    lastStatus,
    updatedAt: new Date().toISOString(),
    lastCollectedAt,
    currentSnapshotId: 'S20260909T000000-aaaaaa',
    lastCounts: { profile: 1, courses: 1, schedule: 1, term: SYN_TERM },
    lastReasons: ['no-change'],
    ...extra,
  };
}
