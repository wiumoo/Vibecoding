import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDraftRfc822, matchesByFallback, DRAFT_HEADER } from '../src/mobile/drafts.mjs';

test('buildDraftRfc822 carries the id header + reply headers, body only, CRLF-safe', () => {
  const rfc = buildDraftRfc822({
    id: '20260909-abcd1234', from: 'me@smail.nju.edu.cn', to: ['Prof <prof@nju.edu.cn>'], cc: [],
    subject: 'Re: Meeting\r\nBcc: evil@x', bodyText: 'Hi Prof,\n\nSee you Wednesday.\n\nBest, me',
    inReplyTo: '<a@x>', references: ['<a@x>'],
  });
  assert.match(rfc, new RegExp(`^${DRAFT_HEADER}: 20260909-abcd1234$`, 'm'));
  assert.match(rfc, /^In-Reply-To: <a@x>$/m);
  assert.doesNotMatch(rfc, /^Bcc:/m, 'CRLF in subject must not inject a Bcc header');
  assert.match(rfc, /See you Wednesday/);
  // body only — no evidence/summary markers ever
  assert.doesNotMatch(rfc, /## 근거|snapshot S|archive\//);
});

test('matchesByFallback: To + normalized subject + time window', () => {
  const base = { to: [{ address: 'prof@nju.edu.cn' }], subject: 'Re: Meeting', date: '2026-09-09T12:00:00Z' };
  const opts = { recipient: 'prof@nju.edu.cn', subject: 'Meeting', sinceMs: Date.parse('2026-09-09T00:00:00Z') };
  assert.ok(matchesByFallback(base, opts));
  // wrong recipient
  assert.ok(!matchesByFallback({ ...base, to: [{ address: 'other@x' }] }, opts));
  // different subject
  assert.ok(!matchesByFallback({ ...base, subject: 'Re: Something else' }, opts));
  // before the window
  assert.ok(!matchesByFallback({ ...base, date: '2026-09-08T00:00:00Z' }, opts));
});
