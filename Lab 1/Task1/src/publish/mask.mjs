/**
 * mask.mjs — build PUBLIC documents by ADDING only publish-policy allowed fields
 * to an empty object, then run a leak check. Nothing is copied-then-masked.
 */
import { loadPublishPolicy, canonicalJson, sha256Hex } from '../core/normalize.mjs';
import { readCurrentSnapshotId } from '../core/normalize.mjs';
import { layoutOf } from '../config.mjs';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export class PublishError extends Error {
  constructor(message, violations = []) {
    super(message);
    this.violations = violations;
  }
}

/** Simple first-character-only masking for CJK/Latin names; single char fully masked. */
export function maskName(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  const chars = [...s];
  if (chars.length === 1) return '*';
  return chars[0] + '*'.repeat(chars.length - 1);
}

/** Keep the first 4 chars, mask the rest (digit-safe, length preserving). */
export function maskPrefix4(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  const chars = [...s];
  if (chars.length <= 4) return '*'.repeat(chars.length);
  return chars.slice(0, 4).join('') + '*'.repeat(chars.length - 4);
}

/** Mask all but last 4 digits of a phone-like string (keeps format separators loose). */
export function maskPhone(value) {
  const s = String(value ?? '').trim();
  return s.replace(/\d/g, (m, off, full) => {
    const digits = full.replace(/\D/g, '');
    const idx = [...full.slice(0, off)].filter((c) => /\d/.test(c)).length;
    const total = digits.length;
    return idx < total - 4 ? '*' : m;
  });
}

export function maskEmail(value) {
  const s = String(value ?? '').trim();
  const at = s.indexOf('@');
  if (at <= 0) return s.replace(/./g, '*');
  return s[0] + '*'.repeat(Math.max(1, at - 1)) + s.slice(at);
}

export function maskStudentId(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  // keep leading 4 chars if policy says so; default: all masked
  return '*'.repeat(s.length);
}

/** Load a snapshot set (same layout as query). */
export async function loadSnapshot(settings) {
  const id = await readCurrentSnapshotId(settings);
  if (!id) throw new PublishError('no snapshot', []);
  const L = layoutOf(settings);
  const dir = path.join(L.snapshotsDir, id);
  const read = async (n) => JSON.parse(await fs.readFile(path.join(dir, n), 'utf8'));
  const [profile, courses, schedule, manifest] = await Promise.all([
    read('profile.json'), read('courses.json'), read('schedule.json'), read('manifest.json'),
  ]);
  return { id, dir, profile, courses, schedule, manifest };
}

/** Apply a per-field publish rule to a normalized value. */
function applyFieldRule(value, rule) {
  const map = {
    first_char_only: maskName,
    mask_all: () => (value ? '*'.repeat(String(value).length) : ''),
    student_id_prefix4: maskPrefix4,
    partial_if_verified_format: maskPhone,
    mask_email: maskEmail,
    raw: (v) => String(v ?? ''),
  };
  return (map[rule] || map.mask_all)(value);
}

/**
 * Build public masked docs from the private snapshot.
 * Default (empty allow) publishes nothing except policy/schema metadata.
 */
export async function buildPublicDocs(snapshot, publishPolicy) {
  const profileOut = {};
  const allowIds = publishPolicy.profile_publish?.allow || [];
  for (const entry of allowIds) {
    const f = typeof entry === 'string' ? entry : entry.field;
    const raw = snapshot.profile.source[f];
    if (raw === undefined || raw === null) continue;
    const rule = typeof entry === 'string' ? null : entry.rule;
    profileOut[f] = rule ? applyFieldRule(raw, rule) : String(raw);
  }

  const coursesOut = [];
  const courseAllow = publishPolicy.courses_publish?.allow || [];
  if (courseAllow.length) {
    for (const c of snapshot.courses.list) {
      const row = {};
      for (const f of courseAllow) {
        if (c.source[f] !== undefined && c.source[f] !== null) row[f] = String(c.source[f]);
      }
      coursesOut.push(row);
    }
  }

  const schedAllow = publishPolicy.schedule_publish?.allow || [];
  const schedMode = publishPolicy.schedule_publish?.mode || 'summary_only';
  const scheduleOut = {};
  if (schedMode === 'full') {
    scheduleOut.meetings = snapshot.schedule.meetings.map((m) => {
      const row = {};
      for (const f of schedAllow) if (m[f] !== undefined && m[f] !== null) row[f] = m[f];
      return row;
    });
  } else {
    // summary_only: per-day meeting counts, no times/rooms
    const perDay = {};
    for (const m of snapshot.schedule.meetings) {
      perDay[m.day_of_week] = (perDay[m.day_of_week] || 0) + 1;
    }
    scheduleOut.days = perDay;
  }

  const maskedContentHash = sha256Hex(
    canonicalJson({ profile: profileOut, courses: coursesOut, schedule: scheduleOut })
  );
  const publicManifest = {
    public_schema_version: 1,
    publish_policy_version: publishPolicy.policy_version,
    term: snapshot.manifest.term,
    source_system: snapshot.manifest.source_system,
    content_hash: maskedContentHash,
  };

  return {
    profile: profileOut,
    courses: coursesOut,
    schedule: scheduleOut,
    manifest: publicManifest,
  };
}

/** Leak check the serialized public docs against patterns + known sensitive values. */
export function leakCheck(docs, { knownSensitive = [], policy } = {}) {
  const violations = [];
  const serialized = JSON.stringify(docs);
  const patterns = policy?.always_deny_patterns || {};
  for (const [name, src] of Object.entries(patterns)) {
    try {
      const re = new RegExp(src, 'i');
      if (re.test(serialized)) violations.push(`pattern:${name}`);
    } catch { /* skip bad pattern */ }
  }
  for (const v of knownSensitive) {
    if (v && String(v).length >= 4 && serialized.includes(String(v))) {
      violations.push('known-sensitive-value');
    }
  }
  return violations;
}
