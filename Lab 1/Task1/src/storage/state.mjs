/** state.mjs — minimal local run state under <data>/state/sync-state.json (0700/0600). */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { layoutOf, writePrivateFile } from '../config.mjs';

export async function readState(settings) {
  const L = layoutOf(settings);
  try {
    return JSON.parse(await fs.readFile(L.syncStateFile, 'utf8'));
  } catch {
    return {};
  }
}

export async function writeState(settings, patch) {
  const L = layoutOf(settings);
  const cur = await readState(settings);
  const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
  await writePrivateFile(L.syncStateFile, next, { pretty: true });
  return next;
}
