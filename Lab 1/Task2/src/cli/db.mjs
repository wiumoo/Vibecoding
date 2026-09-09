/**
 * db.mjs — read-only query over the mail archive + ledger (plan §5, §6.5).
 *   npm run mail:db status          — ledger state counts, needs_triage & drafted lists, usage totals
 *   npm run mail:db search <text>   — substring search over archived message text/subject
 * Never mutates state.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadSettings, layoutOf } from '../config.mjs';
import { currentStates } from '../state/ledger.mjs';

const out = (l = '') => process.stdout.write(l + '\n');

async function readUsage(settings) {
  try {
    const text = await fs.readFile(layoutOf(settings).usageFile, 'utf8');
    const rows = text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const totals = rows.reduce(
      (a, r) => ({ calls: a.calls + 1, input: a.input + (r.inputTokens || 0), output: a.output + (r.outputTokens || 0), cost: a.cost + (r.costUsd || 0) }),
      { calls: 0, input: 0, output: 0, cost: 0 }
    );
    return totals;
  } catch {
    return { calls: 0, input: 0, output: 0, cost: 0 };
  }
}

async function status(settings) {
  const states = await currentStates(settings);
  const counts = {};
  const triage = [];
  const drafted = [];
  for (const ev of states.values()) {
    counts[ev.status] = (counts[ev.status] || 0) + 1;
    if (ev.status === 'needs_triage') triage.push(ev);
    if (ev.status === 'drafted') drafted.push(ev);
  }
  out('ledger state counts:');
  for (const [k, v] of Object.entries(counts).sort()) out(`  ${k}: ${v}`);
  if (triage.length) {
    out('\nneeds_triage (resolve with: npm run mail:triage <id> draft|skip):');
    for (const e of triage) out(`  ${e.id}  from ${e.from || '?'}  (${e.reason || ''})`);
  }
  if (drafted.length) {
    out('\ndrafted (edit the file, set approve: true, then mail:send <id>):');
    for (const e of drafted) out(`  ${e.id}  from ${e.from || '?'}${e.related_drafts ? `  related:${e.related_drafts.join(',')}` : ''}`);
  }
  const u = await readUsage(settings);
  out(`\nLLM usage: ${u.calls} calls, ${u.input} in / ${u.output} out tokens, ~$${u.cost.toFixed(4)}`);
}

async function search(settings, q) {
  const needle = q.toLowerCase();
  const L = layoutOf(settings);
  let months = [];
  try {
    months = await fs.readdir(L.archiveDir);
  } catch {
    /* none */
  }
  const hits = [];
  let skipped = 0;
  for (const m of months) {
    let files = [];
    try {
      files = await fs.readdir(path.join(L.archiveDir, m));
    } catch {
      continue;
    }
    for (const f of files.filter((x) => x.endsWith('.json'))) {
      let j;
      try {
        j = JSON.parse(await fs.readFile(path.join(L.archiveDir, m, f), 'utf8'));
      } catch {
        skipped++; // one corrupt/half-written archive must not abort the whole search
        continue;
      }
      if (`${j.subject}\n${j.text}`.toLowerCase().includes(needle)) {
        hits.push({ id: f.replace(/\.json$/, ''), from: j.from?.address, subject: j.subject, source: `archive/${m}/${f.replace(/\.json$/, '')}.md` });
      }
    }
  }
  out(`${hits.length} hit(s) for "${q}"${skipped ? ` (${skipped} unreadable file(s) skipped)` : ''}:`);
  for (const h of hits) out(`  ${h.id}  ${h.from}  ${h.subject}  — ${h.source}`);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const settings = await loadSettings();
  if (cmd === 'status') return status(settings);
  if (cmd === 'search') {
    const q = rest.join(' ').trim();
    if (!q) throw new Error('usage: mail:db search <text>');
    return search(settings, q);
  }
  out('usage: mail:db <status|search <text>>');
  process.exitCode = 1;
}

main().catch((e) => {
  process.stderr.write(`db failed: ${e.message}\n`);
  process.exitCode = 1;
});
