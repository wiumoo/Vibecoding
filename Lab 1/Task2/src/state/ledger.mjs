/**
 * ledger.mjs — append-only processing ledger (plan §4.1/§4.2).
 *
 * One JSONL line per state-transition event. The current state of a message is
 * the LAST line for its (mail_key, direction) pair. Append-only so a crash can
 * damage at most the final line, and a human can audit the history.
 *
 * Ledger = system truth (what we did: archived / drafted / sent). User intent
 * (approve) lives in the draft file, never here (plan §4.2).
 */
import { promises as fs } from 'node:fs';
import { layoutOf } from '../config.mjs';

/** Composite key: a message's inbound copy and outbound copy are distinct events. */
export function ledgerKey(mailKey, direction) {
  return direction + '\x20' + mailKey;
}

/** Append one event. Atomic per line (single write, newline-terminated). */
export async function appendEvent(settings, event) {
  const L = layoutOf(settings);
  const line = JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n';
  await fs.appendFile(L.ledgerFile, line, { encoding: 'utf8', mode: 0o600 });
}

/** Read all events in order. Tolerates a torn final line (skips unparseable). */
export async function readEvents(settings) {
  const L = layoutOf(settings);
  let text;
  try {
    text = await fs.readFile(L.ledgerFile, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  const events = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // torn final line from a crash mid-append — skip it
    }
  }
  return events;
}

/** Map of ledgerKey -> last event (current state). */
export async function currentStates(settings) {
  const events = await readEvents(settings);
  const map = new Map();
  for (const ev of events) {
    if (!ev.mailKey || !ev.direction) continue;
    map.set(ledgerKey(ev.mailKey, ev.direction), ev);
  }
  return map;
}

/** Has this (mail_key, direction) ever been recorded? (idempotency 2nd defense) */
export function isKnown(statesMap, mailKey, direction) {
  return statesMap.has(ledgerKey(mailKey, direction));
}
