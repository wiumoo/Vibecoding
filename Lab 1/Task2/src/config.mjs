import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

// Reused from Task1 (imported, not cloned): atomic JSON writes and Keychain access.
export { writePrivateFile } from '../../Task1/src/config.mjs';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TASK1_ROOT = path.resolve(PROJECT_ROOT, '..', 'Task1');

async function loadJson(p) {
  try {
    return JSON.parse(await fs.readFile(p, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

let cached = null;

/** Load runtime settings (settings.json over example defaults). No secrets expected. */
export async function loadSettings() {
  if (cached) return cached;
  const example = (await loadJson(path.join(PROJECT_ROOT, 'config', 'settings.example.json'))) || {};
  const over = (await loadJson(path.join(PROJECT_ROOT, 'config', 'settings.json'))) || {};
  const merge = (key) => ({ ...(example[key] || {}), ...(over[key] || {}) });
  cached = {
    ...example,
    ...over,
    keychain: merge('keychain'),
    imap: merge('imap'),
    smtp: merge('smtp'),
    folders: merge('folders'),
    classification: merge('classification'),
    llm: merge('llm'),
  };
  return cached;
}

export function dataHomeOf(settings) {
  // Test / CLI override only: redirect the PRIVATE data home without touching config.
  if (process.env.NJU_SMAIL_DATA_HOME) {
    return path.resolve(process.env.NJU_SMAIL_DATA_HOME);
  }
  return (
    settings.dataHome ||
    path.join(os.homedir(), 'Library', 'Application Support', 'NJUSmail')
  );
}

export function layoutOf(settings) {
  const root = dataHomeOf(settings);
  return {
    root,
    privateDir: path.join(root, 'private'),
    archiveDir: path.join(root, 'private', 'archive'),
    draftsDir: path.join(root, 'private', 'drafts'),
    stateDir: path.join(root, 'state'),
    mailStateFile: path.join(root, 'state', 'mail-state.json'),
    ledgerFile: path.join(root, 'state', 'ledger.jsonl'),
    threadsFile: path.join(root, 'state', 'threads.json'),
    usageFile: path.join(root, 'state', 'usage.jsonl'),
    runLockFile: path.join(root, 'state', 'run.lock'),
    logsDir: path.join(root, 'logs'),
  };
}

const MODE_DIR = 0o700;

export async function ensureDataLayout(settings) {
  const L = layoutOf(settings);
  for (const d of [L.root, L.privateDir, L.archiveDir, L.draftsDir, L.stateDir, L.logsDir]) {
    await fs.mkdir(d, { recursive: true, mode: MODE_DIR });
    await fs.chmod(d, MODE_DIR); // enforce even if the directory pre-existed looser
  }
  return L;
}
