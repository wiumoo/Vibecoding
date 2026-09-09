import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMessage } from '../src/index/normalize.mjs';
import { addMessage } from '../src/index/threads.mjs';

const RAW_A = [
  'From: Prof Wang <wang@nju.edu.cn>',
  'To: me <215220030@smail.nju.edu.cn>',
  'Subject: Meeting',
  'Message-ID: <a@nju.edu.cn>',
  'Date: Wed, 09 Sep 2026 11:00:00 +0800',
  '',
  'Are you free Wednesday afternoon?',
].join('\r\n');

const RAW_B_REPLY = [
  'From: Prof Wang <wang@nju.edu.cn>',
  'To: me <215220030@smail.nju.edu.cn>',
  'Subject: Re: Meeting',
  'Message-ID: <b@nju.edu.cn>',
  'In-Reply-To: <a@nju.edu.cn>',
  'References: <a@nju.edu.cn>',
  'Date: Wed, 09 Sep 2026 12:00:00 +0800',
  '',
  'Actually, let us make it Thursday.',
].join('\r\n');

const RAW_C_UNRELATED = [
  'From: Prof Wang <wang@nju.edu.cn>',
  'To: me <215220030@smail.nju.edu.cn>',
  'Subject: Notice',
  'Message-ID: <c@nju.edu.cn>',
  'Date: Wed, 09 Sep 2026 13:00:00 +0800',
  '',
  'Weekly notice.',
].join('\r\n');

test('normalizeMessage extracts the plan §5.2 fields', async () => {
  const m = await normalizeMessage(RAW_A, { folder: 'INBOX', uid: 10, uidValidity: '100', direction: 'incoming' });
  assert.equal(m.schema_version, 1);
  assert.equal(m.mail_key, '<a@nju.edu.cn>');
  assert.equal(m.from.address, 'wang@nju.edu.cn');
  assert.equal(m.subject, 'Meeting');
  assert.equal(m.direction, 'incoming');
  assert.equal(m.source.uid, 10);
  assert.match(m.text, /Wednesday afternoon/);
});

test('reply joins the referenced thread; unrelated message starts its own', async () => {
  const a = await normalizeMessage(RAW_A, { folder: 'INBOX', uid: 10, uidValidity: '100', direction: 'incoming' });
  const b = await normalizeMessage(RAW_B_REPLY, { folder: 'INBOX', uid: 11, uidValidity: '100', direction: 'incoming' });
  const c = await normalizeMessage(RAW_C_UNRELATED, { folder: 'INBOX', uid: 12, uidValidity: '100', direction: 'incoming' });

  let t = { threads: {} };
  let r = addMessage(t, a); t = r.threads; const tkA = r.threadKey;
  r = addMessage(t, b); t = r.threads; const tkB = r.threadKey;
  r = addMessage(t, c); t = r.threads; const tkC = r.threadKey;

  assert.equal(tkB, tkA, 'reply shares the thread key of the referenced message');
  assert.notEqual(tkC, tkA, 'unrelated same-sender message does NOT merge');
  assert.deepEqual(t.threads[tkA].mail_keys, ['<a@nju.edu.cn>', '<b@nju.edu.cn>']);
});

test('reverse link: reply inserted BEFORE its original still merges (Sent-before-INBOX)', async () => {
  const a = await normalizeMessage(RAW_A, { folder: 'INBOX', uid: 10, uidValidity: '100', direction: 'incoming' });
  const b = await normalizeMessage(RAW_B_REPLY, { folder: 'Sent', uid: 20, uidValidity: '100', direction: 'outgoing' });

  // reply first (as Sent is processed before INBOX), then the original
  let t = { threads: {} };
  let r = addMessage(t, b); t = r.threads; const tkB = r.threadKey;
  r = addMessage(t, a); t = r.threads; const tkA = r.threadKey;

  assert.equal(tkA, tkB, 'original merges into the reply’s thread even though inserted later');
  assert.equal(Object.keys(t.threads).length, 1, 'exactly one thread, not two');
  assert.deepEqual(t.threads[tkA].mail_keys.sort(), ['<a@nju.edu.cn>', '<b@nju.edu.cn>']);
});

test('a bridging message merges two previously-separate threads', async () => {
  // two standalone originals, then a reply that references both → merge
  const a = await normalizeMessage(RAW_A, { folder: 'INBOX', uid: 1, uidValidity: '100', direction: 'incoming' });
  const c = await normalizeMessage(RAW_C_UNRELATED, { folder: 'INBOX', uid: 2, uidValidity: '100', direction: 'incoming' });
  const bridgeRaw = [
    'From: me <215220030@smail.nju.edu.cn>',
    'To: Prof Wang <wang@nju.edu.cn>',
    'Subject: Re: both',
    'Message-ID: <bridge@x>',
    'References: <a@nju.edu.cn> <c@nju.edu.cn>',
    'Date: Wed, 09 Sep 2026 14:00:00 +0800',
    '',
    'linking',
  ].join('\r\n');
  const bridge = await normalizeMessage(bridgeRaw, { folder: 'Sent', uid: 3, uidValidity: '100', direction: 'outgoing' });

  let t = { threads: {} };
  t = addMessage(t, a).threads;
  t = addMessage(t, c).threads;
  assert.equal(Object.keys(t.threads).length, 2, 'two separate threads before the bridge');
  const r = addMessage(t, bridge); t = r.threads;
  assert.equal(Object.keys(t.threads).length, 1, 'bridge merged them into one');
  assert.deepEqual(t.threads[r.threadKey].mail_keys.sort(), ['<a@nju.edu.cn>', '<bridge@x>', '<c@nju.edu.cn>']);
});

test('re-adding the same message is idempotent in the index', async () => {
  const a = await normalizeMessage(RAW_A, { folder: 'INBOX', uid: 10, uidValidity: '100', direction: 'incoming' });
  let r = addMessage({ threads: {} }, a);
  r = addMessage(r.threads, a);
  const entry = r.threads.threads[r.threadKey];
  assert.deepEqual(entry.mail_keys, ['<a@nju.edu.cn>']);
});
