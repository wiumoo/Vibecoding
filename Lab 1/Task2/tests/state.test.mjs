import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMailKey, normalizeMessageId, fileId, keyHash8 } from '../src/state/mailkey.mjs';
import { effectiveCursor, setCursor } from '../src/state/cursor.mjs';
import { ledgerKey } from '../src/state/ledger.mjs';

test('mail_key uses normalized Message-ID when present', () => {
  const k = computeMailKey({ messageId: '  <abc@x.com> ', from: 'a', date: 'd', subject: 's', text: 't' });
  assert.equal(k, '<abc@x.com>');
});

test('mail_key falls back to a stable h:hash when Message-ID absent', () => {
  const a = computeMailKey({ from: 'A@x', date: '2026-09-09T00:00:00Z', subject: 'Hi', text: 'body' });
  const b = computeMailKey({ from: 'a@x', date: '2026-09-09T00:00:00Z', subject: 'Hi', text: 'body' });
  assert.match(a, /^h:[0-9a-f]{16}$/);
  assert.equal(a, b, 'from is case-normalized → same key');
  const c = computeMailKey({ from: 'A@x', date: '2026-09-09T00:00:00Z', subject: 'Hi', text: 'different' });
  assert.notEqual(a, c);
});

test('normalizeMessageId extracts the <...> token', () => {
  assert.equal(normalizeMessageId('Foo <x@y>'), '<x@y>');
  assert.equal(normalizeMessageId(''), null);
  assert.equal(normalizeMessageId(null), null);
});

test('fileId is UID-free: YYYYMMDD-hash8, hash keyed on mail_key', () => {
  const id = fileId('<abc@x>', '2026-09-09T11:00:00Z');
  assert.match(id, /^20260909-[0-9a-f]{8}$/);
  assert.ok(id.endsWith(keyHash8('<abc@x>')));
});

test('effectiveCursor: keep on match, reset on UIDVALIDITY change, unknown flags new folder', () => {
  let s = setCursor({ folders: {} }, 'INBOX', '100', 42);
  assert.deepEqual(effectiveCursor(s, 'INBOX', '100'), { lastSeenUid: 42, reset: false, known: true });
  assert.deepEqual(effectiveCursor(s, 'INBOX', '999'), { lastSeenUid: 0, reset: true, known: true });
  // unknown folder → known:false so the caller initializes instead of backfilling
  assert.deepEqual(effectiveCursor(s, 'NEW', '5'), { lastSeenUid: 0, reset: false, known: false });
});

test('ledgerKey separates inbound and outbound copies of the same mail_key', () => {
  assert.notEqual(ledgerKey('<m@x>', 'incoming'), ledgerKey('<m@x>', 'outgoing'));
});
