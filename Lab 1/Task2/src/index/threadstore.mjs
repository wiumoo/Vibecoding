/**
 * threadstore.mjs — read/write threads.json (the thread membership index).
 * One shared implementation so sync, triage and the draft pipeline can't drift
 * (they previously each had a copy, and the copies diverged on error handling).
 * Reads: ENOENT → empty index; any other error propagates (never silently
 * discards existing thread context). Writes: atomic (tmp→rename).
 */
import { promises as fs } from 'node:fs';
import { layoutOf, writePrivateFile } from '../config.mjs';

export async function readThreads(settings) {
  try {
    return JSON.parse(await fs.readFile(layoutOf(settings).threadsFile, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return { threads: {} };
    throw e;
  }
}

export async function writeThreads(settings, obj) {
  await writePrivateFile(layoutOf(settings).threadsFile, obj, { pretty: true });
}
