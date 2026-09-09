/**
 * jwapp.mjs — authenticated collection from ehallapp "我的课表" (wdkb) using the
 * Keychain cookie vault. Runs headless; silent SSO via stored cookies. Personal
 * values never printed or logged here.
 */
import { chromium } from 'playwright';
import { loadSettings, ensureDataLayout, layoutOf } from '../config.mjs';
import { loadCookies, saveCookies } from '../auth/cookie-vault.mjs';
import { parseMeetings } from '../core/schedule-parser.mjs';
import { pickAllowlist, normText } from '../core/normalize.mjs';

const CT = { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' };
const BASE = 'https://ehallapp.nju.edu.cn';

export class CollectionError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

/** Open a fresh headless context, inject vault cookies, establish the app session. */
export async function openSession(settings, { headless = true } = {}) {
  const cookies = await loadCookies(settings);
  if (!cookies.length) throw new CollectionError('NO_VAULT', 'no session cookies in vault — run npm run auth:login');
  const context = await chromium.launchPersistentContext('', { channel: 'chrome', headless });
  try {
    await context.addCookies(cookies);
    const page = context.pages()[0] || (await context.newPage());
    const policy = await (await import('../core/normalize.mjs')).loadCollectionPolicy();
    const appIndex = policy.endpoints.app_index;
    await page.goto(appIndex, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    // give silent SSO + SPA a moment
    await page.waitForTimeout(8000);
    return { context, page };
  } catch (e) {
    await context.close().catch(() => {});
    throw e;
  }
}

async function post(context, pathname, body) {
  const resp = await context.request.post(BASE + pathname, { data: body || '', headers: CT, timeout: 40000 });
  const ct = resp.headers()['content-type'] || '';
  if (!ct.includes('json')) {
    throw new CollectionError('NOT_JSON', `endpoint ${pathname} returned ${ct.split(';')[0]}`);
  }
  const json = await resp.json();
  if (String(json?.code) !== '0') {
    throw new CollectionError('API_ERROR', `endpoint ${pathname} code=${json?.code}`);
  }
  return json;
}

export async function fetchTerm(context) {
  const j = await post(context, '/jwapp/sys/wdkb/modules/jshkcb/dqxnxq.do', '');
  const row = j?.datas?.dqxnxq?.rows?.[0];
  if (!row?.DM) throw new CollectionError('NO_TERM', 'current term not returned');
  return row;
}

export async function fetchProfile(context, policy, xh) {
  const j = await post(context, policy.endpoints.profile, `XH=${encodeURIComponent(xh)}`);
  const rows = j?.datas?.cxxsjbxx?.rows || [];
  if (!rows.length) throw new CollectionError('NO_PROFILE', 'profile rows empty');
  if (rows.length > 1) throw new CollectionError('PROFILE_MULTI', `profile rows=${rows.length}`);
  return rows[0];
}

export async function fetchCourses(context, policy, termCode) {
  const endpoint = policy.endpoints.courses;
  const out = [];
  let pageNumber = 1;
  const pageSize = 200;
  for (let guard = 0; guard < 20; guard++) {
    const body = `XNXQDM=${encodeURIComponent(termCode)}&pageSize=${pageSize}&pageNumber=${pageNumber}`;
    const j = await post(context, endpoint, body);
    const area = j?.datas?.cxxskclb;
    const rows = area?.rows || [];
    out.push(...rows);
    const total = Number(area?.totalSize);
    if (!Number.isFinite(total) || total < 0 || out.length >= total || rows.length < pageSize) break;
    pageNumber += 1;
  }
  return out;
}

/**
 * Collect all three areas and shape them per collection policy.
 * Returns { term, profile, courses, schedule, meta } with source+normalized shapes.
 */
export async function collectAll(settings, context, { account } = {}) {
  const policy = await (await import('../core/normalize.mjs')).loadCollectionPolicy();
  const termRow = await fetchTerm(context);
  const termCode = String(termRow[policy.semester.code_field]);
  const termPicked = pickAllowlist(termRow, policy.semester.fields ? { allow: policy.semester.fields.allow, normalization: {} } : policy.semester, '');

  const profileRow = await fetchProfile(context, policy, account);
  const profilePicked = pickAllowlist(profileRow, policy.identity, '');

  const courseRows = await fetchCourses(context, policy, termCode);
  const courses = courseRows.map((row) => {
    const picked = pickAllowlist(row, policy.courses, '');
    const keyParts = (policy.courses.record_key || ['KCH'])
      .map((k) => `${k}=${row[k] ?? ''}`)
      .join(';');
    return { record_key: keyParts, source: picked.source, normalized: picked.normalized };
  });

  // derive schedule meetings from course rows (ZCXQJCDD)
  const meetings = [];
  const problems = [];
  for (const row of courseRows) {
    const keyParts = (policy.courses.record_key || ['KCH'])
      .map((k) => `${k}=${row[k] ?? ''}`)
      .join(';');
    const raw = row.ZCXQJCDD;
    const parsed = parseMeetings(raw);
    if (!parsed.ok) {
      problems.push({ course_key: keyParts, unparsed: parsed.unparsed });
      continue;
    }
    for (const m of parsed.meetings) {
      meetings.push({
        course_key: keyParts,
        course_code: row.KCH ?? null,
        day: m.day,
        day_of_week: m.day_of_week,
        start_period: m.start_period,
        end_period: m.end_period,
        week_start: m.week_start,
        week_end: m.week_end,
        week_type: m.week_type,
        location: m.location === '' ? null : normText(m.location),
      });
    }
  }
  if (problems.length) {
    throw new CollectionError('SCHEDULE_PARSE', `unparsed schedule segments for ${problems.length} course(s)`, { problems });
  }

  // consistent record keys: profile uses XH
  const meta = {
    source_system: policy.source_system,
    collectedAt: new Date().toISOString(),
    profileRowCount: 1,
    courseRowCount: courses.length,
    meetingCount: meetings.length,
    parseOk: true,
  };
  return {
    term: { code: termCode, ...termPicked },
    profile: profilePicked,
    courses,
    schedule: { term: termCode, timezone: policy.schedule.timezone, meetings },
    meta,
  };
}

/** Close session after persisting fresh cookies to the vault. */
export async function closeSession(settings, context) {
  try {
    await saveCookies(settings, await context.cookies());
  } catch { /* non-fatal */ }
  await context.close().catch(() => {});
}
