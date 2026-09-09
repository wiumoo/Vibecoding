/**
 * timetable.mjs — pure timetable model shared by Node tests and the browser.
 * Operates on meeting objects like:
 *   { course_key, course_code, day_of_week:1..7, start_period, end_period,
 *     week_start, week_end, week_type: 'all'|'odd'|'even', location }
 * Meetings that cannot be evaluated are never guessed here — they are surfaced
 * as "check" problems by the caller.
 */

export const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일'];
export const WEEK_TYPES = new Set(['all', 'odd', 'even']);

/** Validate the numeric shape of a meeting. Returns a code or null when ok. */
export function meetingProblem(m) {
  const day = Number(m.day_of_week);
  const s = Number(m.start_period);
  const e = Number(m.end_period);
  const ws = Number(m.week_start);
  const we = Number(m.week_end);
  if (!Number.isInteger(day) || day < 1 || day > 7) return 'invalid-day';
  if (!Number.isInteger(s) || !Number.isInteger(e) || s < 1 || e < s) return 'invalid-period';
  if (!Number.isInteger(ws) || !Number.isInteger(we) || ws < 1 || we < ws) return 'invalid-weeks';
  if (we > 60) return 'invalid-weeks';
  if (!WEEK_TYPES.has(m.week_type)) return 'invalid-week-type';
  return null;
}

/** Is the meeting active in the given 1-based academic week? null = cannot evaluate. */
export function activeInWeek(m, week) {
  const ws = Number(m.week_start);
  const we = Number(m.week_end);
  const w = Number(week);
  if (!Number.isInteger(ws) || !Number.isInteger(we) || !Number.isInteger(w)) return null;
  if (ws > we) return null; // malformed range -> never guessed
  if (w < ws || w > we) return false;
  if (m.week_type === 'odd') return w % 2 === 1;
  if (m.week_type === 'even') return w % 2 === 0;
  if (m.week_type === 'all') return true;
  return null; // unsupported week_type -> problem surfaced elsewhere
}

/** Finite sorted list of weeks that at least one meeting could occupy. */
export function collectWeeks(meetings, { max = 60 } = {}) {
  const set = new Set();
  for (const m of meetings) {
    if (meetingProblem(m)) continue;
    const ws = Math.max(1, Number(m.week_start));
    const we = Math.min(max, Number(m.week_end));
    for (let w = ws; w <= we; w++) set.add(w);
  }
  return [...set].sort((a, b) => a - b);
}

/** Half-open [start, end+1) period span for overlap math. */
function span(m) {
  return [Number(m.start_period), Number(m.end_period) + 1];
}

/** Do two periods overlap? (same day, half-open spans intersect) */
export function periodsOverlap(a, b) {
  if (Number(a.day_of_week) !== Number(b.day_of_week)) return false;
  const [as, ae] = span(a);
  const [bs, be] = span(b);
  return Math.max(as, bs) < Math.min(ae, be);
}

/**
 * Do two meetings truly conflict (same day, overlapping periods AND at least one
 * shared active week)? Parity is respected: odd/even are mutually exclusive.
 * Returns false when either meeting is malformed (caller keeps those separate).
 */
export function meetingsConflict(a, b) {
  if (!periodsOverlap(a, b)) return false;
  if (meetingProblem(a) || meetingProblem(b)) return false;
  if (a.week_type === b.week_type) {
    return Number(a.week_start) <= Number(b.week_end) && Number(b.week_start) <= Number(a.week_end);
  }
  // different parity types overlap only if both cover the same parity weeks
  const common = (x, y) => Number(x.week_start) <= Number(y.week_end) && Number(y.week_start) <= Number(x.week_end);
  if (!common(a, b)) return false;
  // identical parity check: odd vs even never share a week, but all overlaps each
  if (a.week_type === 'all' || b.week_type === 'all') return common(a, b);
  return false; // odd vs even -> disjoint by construction
}

/**
 * True when two meetings occupy the same day+period span even if their weeks
 * never co-occur (used to explain "same slot, different weeks" placement).
 */
export function sameSlotButDisjoint(a, b) {
  return (
    periodsOverlap(a, b) &&
    !meetingsConflict(a, b) &&
    !meetingProblem(a) &&
    !meetingProblem(b) &&
    a.week_type !== b.week_type
  );
}

/**
 * Lane assignment for meetings sharing a day & overlapping periods, so cards
 * never overlap. Caller passes meetings that are all active in the selected
 * week (or the full-term placement list).
 */
export function assignLanes(dayMeetings) {
  const sorted = [...dayMeetings].sort(
    (x, y) => Number(x.start_period) - Number(y.start_period) || Number(x.end_period) - Number(y.end_period)
  );
  const lanes = []; // lane -> latest end period
  const assigned = [];
  for (const m of sorted) {
    let placed = -1;
    for (let li = 0; li < lanes.length; li++) {
      if (lanes[li] <= Number(m.start_period)) {
        placed = li;
        break;
      }
    }
    if (placed === -1) {
      lanes.push(Number(m.end_period));
      placed = lanes.length - 1;
    } else {
      lanes[placed] = Math.max(lanes[placed], Number(m.end_period));
    }
    assigned.push({ meeting: m, lane: placed });
  }
  return { meetings: assigned, laneCount: lanes.length };
}
