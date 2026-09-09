import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
  const settings = {
    ...example,
    ...over,
    keychain: { ...(example.keychain || {}), ...(over.keychain || {}) },
    ehall: { ...(example.ehall || {}), ...(over.ehall || {}) },
    schedule: { ...(example.schedule || {}), ...(over.schedule || {}) },
    publish: { ...(example.publish || {}), ...(over.publish || {}) },
  };
  cached = settings;
  return settings;
}

export function dataHomeOf(settings) {
  // Test / CLI override only: set NJU_EHALL_DATA_HOME to redirect the PRIVATE
  // data home without touching config files. Default behavior is unchanged.
  if (process.env.NJU_EHALL_DATA_HOME) {
    return path.resolve(process.env.NJU_EHALL_DATA_HOME);
  }
  return (
    settings.dataHome ||
    path.join(os.homedir(), 'Library', 'Application Support', 'NJUEhall')
  );
}

export function layoutOf(settings) {
  const root = dataHomeOf(settings);
  return {
    root,
    privateDir: path.join(root, 'private'),
    snapshotsDir: path.join(root, 'private', 'snapshots'),
    currentFile: path.join(root, 'private', 'current.json'),
    authDir: path.join(root, 'private', 'auth'),
    profileDir: path.join(root, 'private', 'auth', 'profile'),
    stateDir: path.join(root, 'state'),
    syncStateFile: path.join(root, 'state', 'sync-state.json'),
    runLockFile: path.join(root, 'state', 'run.lock'),
    logsDir: path.join(root, 'logs'),
    publishDir: path.join(root, 'publish-repo'),
    publishDataDir: path.join(root, 'publish-repo', 'data'),
  };
}

const MODE_DIR = 0o700;
const MODE_FILE = 0o600;

export async function ensureDataLayout(settings) {
  const L = layoutOf(settings);
  for (const d of [L.root, L.privateDir, L.snapshotsDir, L.authDir, L.stateDir, L.logsDir, L.publishDataDir]) {
    await fs.mkdir(d, { recursive: true, mode: MODE_DIR });
    // Enforce permissions even if directory pre-existed with looser mode.
    await fs.chmod(d, MODE_DIR);
  }
  return L;
}

export async function writePrivateFile(file, data, { pretty = false } = {}) {
  const text = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  const tmp = file + '.tmp';
  await fs.writeFile(tmp, text, { encoding: 'utf8', mode: MODE_FILE });
  await fs.chmod(tmp, MODE_FILE);
  await fs.rename(tmp, file);
}
