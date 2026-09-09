/**
 * service.mjs — pure read/search helpers shared by the CLI and the web API.
 * Pure functions only: no filesystem, process, network. The web never shells
 * out to the CLI; both sides consume these functions directly.
 */

/** Normalize one search term / haystack for substring matching. */
export function normalizeSearch(text) {
  return String(text ?? '').normalize('NFC').toLowerCase().trim();
}

/** Does any allowlisted field of `record.source` contain the query? */
export function courseMatches(course, q) {
  const nq = normalizeSearch(q);
  if (!nq) return false;
  const hay = normalizeSearch(JSON.stringify(course.source ?? {}));
  return hay.includes(nq);
}

/** Which allowlisted fields of a course matched? (used to show “matched field”) */
export function matchedCourseFields(course, q) {
  const nq = normalizeSearch(q);
  if (!nq) return [];
  const out = [];
  for (const [k, v] of Object.entries(course.source || {})) {
    if (normalizeSearch(String(v)).includes(nq)) out.push(k);
  }
  return out;
}

/** Do meeting-level search targets (room / course code / key) contain the query? */
export function meetingMatches(meeting, q) {
  const nq = normalizeSearch(q);
  if (!nq) return false;
  const blob = [meeting.course_key, meeting.course_code, meeting.location]
    .map((v) => normalizeSearch(v ?? ''))
    .join(' ');
  return blob.includes(nq);
}

/**
 * Search courses + meetings. Scope matches the legacy CLI:
 * courses are matched across their full source record; meetings across
 * location / course key / course code. Course-name hits additionally expose
 * their linked meetings through the UI (not duplicated into meeting hits).
 */
export function searchSnapshot({ courses = [], meetings = [] }, query) {
  const nq = normalizeSearch(query);
  if (!nq) return { query: nq, courseHits: [], meetingHits: [] };
  const courseHits = [];
  const meetingHits = [];
  for (let i = 0; i < courses.length; i++) {
    const c = courses[i];
    if (courseMatches(c, nq)) {
      courseHits.push({ index: i, record: c, matchedFields: matchedCourseFields(c, nq) });
    }
  }
  for (let i = 0; i < meetings.length; i++) {
    const m = meetings[i];
    if (meetingMatches(m, nq)) meetingHits.push({ index: i, meeting: m });
  }
  return { query: nq, courseHits, meetingHits };
}

/** Sum XF credits; returns { total, counted, skipped } where skipped counts
 *  values that are present but not parseable as finite numbers. */
export function creditSummary(courses) {
  let total = 0;
  let counted = 0;
  let skipped = 0;
  for (const c of courses) {
    const v = c.source?.XF;
    if (v === undefined || v === null || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n)) {
      total += n;
      counted += 1;
    } else {
      skipped += 1;
    }
  }
  return { total: Math.round(total * 100) / 100, counted, skipped };
}
