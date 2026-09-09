/**
 * draftfile.mjs — draft .md compose / parse / body-extract / lint (plan §6.3, §7.4).
 * Pure string logic, shared by draft creation (M3) and the send path (M4).
 *
 * Layout:
 *   ---            (YAML-ish frontmatter; approve is the user's intent, §4.2)
 *   ...
 *   ---
 *   ## 초안 본문 (...)
 *   <reply body — this is what gets sent, ending with the code-attached signature>
 *   <!-- BODY END --> (sentinel; everything below is NOT sent)
 *   ## 받은 메일 요약 / ## 근거 ...
 */

export const BODY_END = '<!-- BODY END — 이 줄 아래는 발송되지 않습니다. 지우지 마세요 -->';
const BODY_HEADING = '## 초안 본문 (이 아래를 편집해서 보내세요)';

function fmValue(v) {
  return JSON.stringify(v ?? null);
}

/** Serialize a draft to Markdown. `frontmatter` is an object; body/summary/evidence are strings. */
export function composeDraft({ frontmatter, body, summary, evidence }) {
  const fm = ['---'];
  for (const [k, v] of Object.entries(frontmatter)) fm.push(`${k}: ${fmValue(v)}`);
  fm.push('---');
  return [
    fm.join('\n'),
    '',
    BODY_HEADING,
    body.trimEnd(),
    '',
    BODY_END,
    '',
    '## 받은 메일 요약',
    summary || '',
    '',
    '## 근거 (초안 작성에 사용한 자료 — 발송되지 않음)',
    evidence || '',
    '',
  ].join('\n');
}

/** Split raw draft file into { frontmatter(object), afterFm(string) }. */
export function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { frontmatter: {}, afterFm: raw };
  const fm = {};
  for (const line of m[1].split('\n')) {
    const mm = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!mm) continue;
    let v = mm[2];
    try {
      v = JSON.parse(v);
    } catch {
      /* keep string */
    }
    fm[mm[1]] = v;
  }
  return { frontmatter: fm, afterFm: m[2] };
}

/**
 * Extract the sendable body: everything between the body heading and the BODY_END
 * sentinel. Sentinel-based (NOT heading-based) so deleting a later `##` heading
 * cannot leak the evidence section (plan §6.3). Throws if the sentinel is gone.
 */
export function extractBody(raw) {
  const { afterFm } = parseFrontmatter(raw);
  const endIdx = afterFm.indexOf(BODY_END);
  if (endIdx === -1) {
    const err = new Error('BODY END sentinel missing — refusing to extract (do not delete the sentinel line)');
    err.code = 'ENOSENTINEL';
    throw err;
  }
  let body = afterFm.slice(0, endIdx);
  const h = body.indexOf(BODY_HEADING);
  if (h !== -1) body = body.slice(h + BODY_HEADING.length);
  return body.trim();
}

// Patterns specific to OUR evidence/summary structure, kept narrow so ordinary
// English ("I attached a snapshot", a URL with "#/") is not falsely refused. The
// sentinel in extractBody is the primary guarantee; this is the secondary net.
const LEAK_PATTERNS = [
  /^##\s/m, // an evidence/summary heading pasted above the sentinel
  /\barchive\/\d{4}-\d{2}\//, // our archive path: archive/YYYY-MM/
  /#\/(meetings|list|source)\b/, // our ehall json_pointers
  /\bsnapshot\s+S\d/i, // our snapshot ids (S<digits>...)
];

/**
 * Lint the extracted send body for leaked structure (plan §7.4 step 3).
 * Returns { ok, problems:[] }. Any hit → send must be refused.
 */
export function lintSendBody(body) {
  const problems = [];
  if (!body.trim()) problems.push('empty body');
  for (const re of LEAK_PATTERNS) {
    if (re.test(body)) problems.push(`leaked pattern ${re}`);
  }
  return { ok: problems.length === 0, problems };
}

/**
 * Lint a freshly generated draft body (plan §6.2 step 7): English (non-ASCII
 * ratio ≤ threshold, excluding whitespace) + citation numbers valid.
 * @param {string} body
 * @param {number[]} citedNumbers numbers the model cited
 * @param {number} candidateCount how many evidence candidates existed
 */
export function lintDraftBody(body, citedNumbers, candidateCount, { nonAsciiMax = 0.1 } = {}) {
  const problems = [];
  const chars = [...body.replace(/\s/g, '')];
  const nonAscii = chars.filter((c) => c.charCodeAt(0) > 127).length;
  const ratio = chars.length ? nonAscii / chars.length : 0;
  if (ratio > nonAsciiMax) problems.push(`non-ASCII ratio ${ratio.toFixed(2)} > ${nonAsciiMax} (not English?)`);
  for (const n of citedNumbers || []) {
    if (!Number.isInteger(n) || n < 1 || n > candidateCount) problems.push(`citation #${n} out of range 1..${candidateCount}`);
  }
  return { ok: problems.length === 0, problems, nonAsciiRatio: ratio };
}
