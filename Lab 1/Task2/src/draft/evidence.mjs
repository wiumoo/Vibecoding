/**
 * evidence.mjs — numbered evidence candidates (plan §6.2 step 2, §6.3).
 *
 * Code builds a NUMBERED candidate list from the personal DB (Task1 runQuery)
 * and the mail history; the LLM may only cite candidates by NUMBER; code renders
 * the locator text from the cited numbers. The model never writes a locator, so
 * a mail body cannot inject a fake "evidence" line (plan §6.2/§7.6).
 *
 * Task1 is reused by importing runQuery (no shell-out, no side effects on import
 * — verified). ehall lookups are best-effort: if Task1 has no snapshot the
 * candidate list simply omits ehall entries.
 */
import { runQuery } from '../../../Task1/src/query/db.mjs';
import { loadSettings as loadTask1Settings } from '../../../Task1/src/config.mjs';

const STOP = new Set(['re', 'fwd', 'the', 'a', 'an', 'to', 'of', 'and', 'for', 'your', 'you', 'about', 'regarding']);

export function keywords(subject) {
  return [...new Set(
    (subject || '')
      .toLowerCase()
      .replace(/[\[\](){}<>.,:;!?"'`]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2 && !STOP.has(w))
  )].slice(0, 8);
}

function ehallLocatorLabel(source) {
  const jp = source.json_pointer ? ` ${source.json_pointer}` : '';
  return `snapshot ${source.snapshot_id} / ${source.local_file}${jp}`;
}

/** Gather ehall evidence candidates for a message. Never throws (best-effort). */
export async function gatherEhallCandidates(msg) {
  const out = [];
  let settings;
  try {
    settings = await loadTask1Settings();
  } catch {
    return out;
  }
  const q = (msg.subject || '').trim();
  try {
    if (q) {
      const res = await runQuery(settings, 'search', q);
      if (res?.ok) {
        for (const h of res.result.hits.slice(0, 5)) {
          if (h.record) {
            out.push({ kind: 'ehall', label: `course match: ${JSON.stringify(h.record.normalized || h.record.record_key).slice(0, 80)}`, locator: ehallLocatorLabel(h.source) });
          } else if (h.meeting) {
            const m = h.meeting;
            out.push({ kind: 'ehall', label: `schedule: ${m.course_key || ''} ${m.location || ''} ${m.day || ''}`.trim(), locator: ehallLocatorLabel(h.source) });
          }
        }
      }
    }
  } catch {
    /* NO_SNAPSHOT etc. — omit ehall evidence */
  }
  try {
    const sched = await runQuery(settings, 'schedule');
    if (sched?.ok && sched.result.count) {
      out.push({ kind: 'ehall', label: `my weekly schedule has ${sched.result.count} meetings (tz ${sched.result.timezone || '?'})`, locator: ehallLocatorLabel(sched.result.source) });
    }
  } catch {
    /* omit */
  }
  return out;
}

/** Turn prior history messages (archive records) into candidates. */
export function historyCandidates(history) {
  return (history || []).slice(0, 6).map((h) => ({
    kind: 'mail',
    label: `${(h.date || '').slice(0, 10)} ${h.direction === 'outgoing' ? 'me→' : 'from '}${h.from?.address || ''}: ${(h.subject || '').slice(0, 60)}`,
    locator: `archive/${h.archiveMonth}/${h.archiveId}.md`,
  }));
}

/** Number the full candidate set (ehall first, then mail history). */
export function numberCandidates(ehall, mail) {
  return [...ehall, ...mail].map((c, i) => ({ n: i + 1, ...c }));
}

/** Prompt block listing candidates by number for the LLM to cite. */
export function promptEvidenceBlock(candidates) {
  if (!candidates.length) return '(no evidence candidates available)';
  return candidates.map((c) => `${c.n}. [${c.kind}] ${c.label}`).join('\n');
}

/** Parse a "CITED: 1,3" line from the model output → { citedNumbers, bodyWithoutCited }. */
export function parseCitations(text) {
  const lines = text.split('\n');
  let cited = [];
  const kept = [];
  for (const line of lines) {
    const m = line.match(/^\s*CITED:\s*(.*)$/i);
    if (m) {
      cited = (m[1].match(/\d+/g) || []).map(Number);
    } else {
      kept.push(line);
    }
  }
  return { citedNumbers: [...new Set(cited)], body: kept.join('\n').trim() };
}

/** Render the evidence section (only cited candidates), code-authored locators. */
export function renderEvidence(candidates, citedNumbers) {
  const byN = new Map(candidates.map((c) => [c.n, c]));
  const rows = citedNumbers
    .map((n) => byN.get(n))
    .filter(Boolean)
    .map((c) => `- [${c.kind}] ${c.label} — ${c.locator}`);
  return rows.length ? rows.join('\n') : '(none cited)';
}
