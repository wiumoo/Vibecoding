/**
 * archive.mjs — flat archive writer (plan §5.2): private/archive/YYYY-MM/<id>.{json,md}.
 * <id> = YYYYMMDD-<mail_key hash8> (UID-free). Atomic writes (tmp→rename) via
 * Task1's writePrivateFile. The .json is the machine contract; the .md is the
 * human-readable copy.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { layoutOf, writePrivateFile } from '../config.mjs';
import { fileId, monthDir } from '../state/mailkey.mjs';

export function archivePaths(settings, msg) {
  const L = layoutOf(settings);
  const id = fileId(msg.mail_key, msg.date);
  const dir = path.join(L.archiveDir, monthDir(msg.date));
  return { id, dir, jsonFile: path.join(dir, `${id}.json`), mdFile: path.join(dir, `${id}.md`) };
}

function toMarkdown(msg, id) {
  const fm = [
    '---',
    `id: ${id}`,
    `mail_key: ${JSON.stringify(msg.mail_key)}`,
    `direction: ${msg.direction}`,
    `from: ${JSON.stringify(msg.from)}`,
    `to: ${JSON.stringify(msg.to)}`,
    `date: ${msg.date || ''}`,
    `subject: ${JSON.stringify(msg.subject)}`,
    msg.in_reply_to ? `in_reply_to: ${JSON.stringify(msg.in_reply_to)}` : null,
    msg.backfilled ? 'backfilled: true' : null,
    '---',
  ].filter(Boolean).join('\n');
  return `${fm}\n\n# ${msg.subject || '(no subject)'}\n\n${msg.text || ''}\n`;
}

/** Write both files atomically. Returns the archive id. */
export async function writeArchive(settings, msg) {
  const { id, dir, jsonFile, mdFile } = archivePaths(settings, msg);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  await writePrivateFile(jsonFile, msg, { pretty: true });
  await fs.writeFile(mdFile, toMarkdown(msg, id), { encoding: 'utf8', mode: 0o600 });
  return id;
}
