import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadSettings, layoutOf, dataHomeOf } from '../src/config.mjs';

test('settings load with expected M1 defaults', async () => {
  const s = await loadSettings();
  assert.equal(s.keychain.service, 'nju.smail');
  assert.equal(s.imap.host, 'imap.exmail.qq.com');
  assert.equal(s.imap.port, 993);
  assert.equal(s.smtp.port, 465);
  assert.ok(Array.isArray(s.folders.sentCandidates));
});

test('layout is rooted under the private data home and NJU_SMAIL_DATA_HOME overrides', async () => {
  const s = await loadSettings();
  const prev = process.env.NJU_SMAIL_DATA_HOME;
  delete process.env.NJU_SMAIL_DATA_HOME;
  assert.ok(dataHomeOf(s).endsWith(path.join('Application Support', 'NJUSmail')));
  process.env.NJU_SMAIL_DATA_HOME = '/tmp/njusmail-test-home';
  const L = layoutOf(s);
  assert.equal(L.root, '/tmp/njusmail-test-home');
  assert.equal(L.ledgerFile, '/tmp/njusmail-test-home/state/ledger.jsonl');
  if (prev === undefined) delete process.env.NJU_SMAIL_DATA_HOME;
  else process.env.NJU_SMAIL_DATA_HOME = prev;
});
