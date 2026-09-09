/**
 * Canonical serialization + semantic hashing used for change detection.
 * Only "canonical representation" (policy-normalized business data) is hashed —
 * not timestamps, tokens, or raw file bytes.
 */
import { createHash } from 'node:crypto';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { loadSettings, layoutOf, writePrivateFile, PROJECT_ROOT } from '../config.mjs';

/** Stable recursive JSON serializer (sorted keys). */
export function canonicalJson(value) {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v !== null && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortDeep(v[k]);
    return out;
  }
  return v;
}

export function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Whitespace normalize: collapse runs of unicode whitespace to a single space, trim ends. */
export function normText(s, rule = 'trim') {
  if (s === null || s === undefined) return '';
  const str = String(s);
  if (rule === 'identity') return str.trim();
  return str.replace(/\s+/g, ' ').trim();
}

/** Apply a field allowlist with normalization to one site record -> {source, normalized}. */
export function pickAllowlist(record, policy, prefix = '') {
  const allow = policy.allow || [];
  const normMap = policy.normalization || {};
  const src = {};
  const norm = {};
  for (const key of allow) {
    const k = prefix ? `${prefix}.${key}` : key;
    if (!(key in record) || record[key] === null || record[key] === undefined) continue;
    const raw = String(record[key]);
    const rule = normMap[key] || 'trim';
    src[k] = raw;               // source: exact site representation of allowlisted fields
    norm[k] = normText(raw, rule); // normalized: for search & semantic compare
  }
  return { source: src, normalized: norm };
}

/** Load a config/policy JSON file from the project config dir. */
export async function loadPolicyFile(name) {
  const p = path.join(PROJECT_ROOT, 'config', name);
  return JSON.parse(await fs.readFile(p, 'utf8'));
}

export async function loadCollectionPolicy() {
  return loadPolicyFile('collection-policy.json');
}

export async function loadPublishPolicy() {
  return loadPolicyFile('publish-policy.json');
}

/** Semantic hash over normalized arrays (already normalized + sorted by caller). */
export function hashArea(recordsOrValue) {
  return sha256Hex(canonicalJson(recordsOrValue));
}

/** Load current.json safely: only a safe snapshot id string is accepted. */
export async function readCurrentSnapshotId(settings) {
  const L = layoutOf(settings);
  try {
    const raw = JSON.parse(await fs.readFile(L.currentFile, 'utf8'));
    const id = typeof raw?.snapshot_id === 'string' ? raw.snapshot_id : null;
    if (!id || !/^[A-Za-z0-9-]+$/.test(id)) return null;
    return id;
  } catch {
    return null;
  }
}
