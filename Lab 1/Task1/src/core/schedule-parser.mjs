/**
 * schedule-parser.mjs — derive structured meetings from a course's ZCXQJCDD
 * display string (e.g. "周二 3-4节 2-18周 仙Ⅰ-107,周二 3-4节 1周 逸B-212").
 * Conservative: returns ok=false when anything cannot be consumed.
 */

const DAYS = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };

const SEG_SPLIT = /[,，;；\n]/;
const DAY_RE = /(?:星期|礼拜|周)?([一二三四五六日天])/;
const PERIOD_RE = /第?\s*(\d{1,2})\s*[-–—~至到]\s*(\d{1,2})\s*节/;
const BRACES = /[（(]?\s*([0-9～~\-–—至到周单双]{1,30})\s*[)）]?/;
const WEEK_RE = /[（({\[]?\s*(\d{1,2})\s*[-–—~至]\s*(\d{1,2})\s*周\s*[)}\] ]?/;
const WEEK_SINGLE_RE = /[（({\[]?\s*(\d{1,2})\s*周\s*[)}\] ]?/;

/**
 * Parse one raw meeting segment text.
 */
function parseSegment(seg) {
  let s = seg.trim();
  const dayM = s.match(DAY_RE);
  if (!dayM) return { ok: false, rest: seg };
  const dayChar = dayM[1];
  s = s.slice(dayM.index + dayM[0].length);

  const perM = s.match(PERIOD_RE);
  if (!perM) return { ok: false, rest: seg };
  const start_period = Number(perM[1]);
  const end_period = Number(perM[2]);
  s = s.slice(perM.index + perM[0].length);

  // odd/even marker (单周/双周) anywhere in the remainder
  let week_type = 'all';
  const oe = s.match(/单周|双周/);
  if (oe) {
    week_type = oe[0] === '单周' ? 'odd' : 'even';
    s = s.slice(0, oe.index) + s.slice(oe.index + oe[0].length);
  }

  let week_start = null;
  let week_end = null;
  const wkM = s.match(WEEK_RE) || s.match(WEEK_SINGLE_RE);
  if (wkM) {
    if (wkM[2] !== undefined) {
      week_start = Number(wkM[1]);
      week_end = Number(wkM[2]);
    } else {
      week_start = Number(wkM[1]);
      week_end = Number(wkM[1]);
    }
    s = s.slice(wkM.index + wkM[0].length);
  }

  if (week_start === null) return { ok: false, rest: seg }; // weeks are mandatory

  // strip any residual bracket characters and collapse spaces for location
  const location = s
    .replace(/[{}()（）\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    ok: true,
    day: dayChar,
    day_of_week: DAYS[dayChar] ?? null,
    start_period,
    end_period,
    week_start,
    week_end,
    week_type,
    location,
  };
}

/**
 * @param {string} raw ZCXQJCDD value
 * @returns {{ ok:boolean, meetings:Array, unparsed:Array }}
 */
export function parseMeetings(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return { ok: true, meetings: [], unparsed: [] };
  }
  const segments = String(raw).split(SEG_SPLIT).map((x) => x.trim()).filter(Boolean);
  const meetings = [];
  const unparsed = [];
  for (const seg of segments) {
    const m = parseSegment(seg);
    if (m.ok) meetings.push({
      day: m.day,
      day_of_week: m.day_of_week,
      start_period: m.start_period,
      end_period: m.end_period,
      week_start: m.week_start,
      week_end: m.week_end,
      week_type: m.week_type,
      location: m.location,
    });
    else unparsed.push(seg);
  }
  return { ok: unparsed.length === 0, meetings, unparsed };
}
