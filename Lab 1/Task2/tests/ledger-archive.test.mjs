import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureDataLayout, layoutOf } from '../src/config.mjs';
import { appendEvent, currentStates, isKnown } from '../src/state/ledger.mjs';
import { writeArchive, archivePaths } from '../src/index/archive.mjs';
import { normalizeMessage } from '../src/index/normalize.mjs';

async function withTempHome(fn) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'njusmail-test-'));
  const prev = process.env.NJU_SMAIL_DATA_HOME;
  process.env.NJU_SMAIL_DATA_HOME = home;
  try {
    return await fn({ dataHome: home });
  } finally {
    if (prev === undefined) delete process.env.NJU_SMAIL_DATA_HOME;
    else process.env.NJU_SMAIL_DATA_HOME = prev;
    await fs.rm(home, { recursive: true, force: true });
  }
}

const RAW = [
  'From: Prof Wang <wang@nju.edu.cn>',
  'To: me <215220030@smail.nju.edu.cn>',
  'Subject: Meeting',
  'Message-ID: <a@nju.edu.cn>',
  'Date: Wed, 09 Sep 2026 11:00:00 +0800',
  '',
  'body',
].join('\r\n');

test('ledger current state is last-write-wins per (mail_key, direction)', async () => {
  await withTempHome(async (settings) => {
    await ensureDataLayout(settings);
    await appendEvent(settings, { mailKey: '<a@x>', direction: 'incoming', status: 'new' });
    await appendEvent(settings, { mailKey: '<a@x>', direction: 'incoming', status: 'drafted' });
    await appendEvent(settings, { mailKey: '<a@x>', direction: 'outgoing', status: 'archived_only' });
    const states = await currentStates(settings);
    assert.equal(states.get('incoming <a@x>').status, 'drafted');
    assert.equal(states.get('outgoing <a@x>').status, 'archived_only');
    assert.ok(isKnown(states, '<a@x>', 'incoming'));
    assert.ok(isKnown(states, '<a@x>', 'outgoing'));
    assert.ok(!isKnown(states, '<zzz@x>', 'incoming'));
  });
});

test('archive writes .json + .md at a UID-free path and is overwrite-stable', async () => {
  await withTempHome(async (settings) => {
    await ensureDataLayout(settings);
    const msg = await normalizeMessage(RAW, { folder: 'INBOX', uid: 5, uidValidity: '100', direction: 'incoming' });
    const id1 = await writeArchive(settings, msg);
    // same message fetched again under a different UID → same id (UID-free)
    const msg2 = await normalizeMessage(RAW, { folder: 'INBOX', uid: 999, uidValidity: '777', direction: 'incoming' });
    const id2 = await writeArchive(settings, msg2);
    assert.equal(id1, id2);
    const { jsonFile, mdFile } = archivePaths(settings, msg);
    const j = JSON.parse(await fs.readFile(jsonFile, 'utf8'));
    assert.equal(j.mail_key, '<a@nju.edu.cn>');
    const md = await fs.readFile(mdFile, 'utf8');
    assert.match(md, /Meeting/);
    // exactly one archive file pair (no duplication)
    const dir = path.dirname(jsonFile);
    const files = await fs.readdir(dir);
    assert.equal(files.filter((f) => f.endsWith('.json')).length, 1);
  });
});
