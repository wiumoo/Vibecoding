import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRfc822 } from '../src/send/smtp.mjs';
import { extractBody, lintSendBody, parseFrontmatter, composeDraft } from '../src/draft/draftfile.mjs';

test('buildRfc822 sets In-Reply-To/References and a plain-text body', () => {
  const rfc = buildRfc822({
    from: 'me@smail.nju.edu.cn', to: ['prof@nju.edu.cn'], cc: [],
    subject: 'Re: Meeting', text: 'Hello.\nBest, me', inReplyTo: '<a@x>', references: ['<a@x>'], date: 'Wed, 09 Sep 2026 11:00:00 +0000',
  });
  assert.match(rfc, /^From: me@smail\.nju\.edu\.cn/m);
  assert.match(rfc, /^In-Reply-To: <a@x>/m);
  assert.match(rfc, /^References: <a@x>/m);
  assert.match(rfc, /Content-Type: text\/plain/);
  assert.match(rfc, /Hello\./);
});

// The send path's gate logic mirrored as pure assertions over a draft file.
function draft(approve, body = 'Dear Prof, I can meet Wednesday.\n\nBest regards,\nMinwoo') {
  return composeDraft({
    frontmatter: { id: '20260909-abcd1234', approve, to: ['Prof <prof@nju.edu.cn>'], cc: [], subject: 'Re: Meeting', in_reply_to: '<a@x>', references: ['<a@x>'], language: 'en' },
    body, summary: 'they asked about Wednesday', evidence: '- [ehall] snapshot S20260909T... / schedule.json /meetings',
  });
}

test('approve gate: only approve:true passes the frontmatter check', () => {
  assert.equal(parseFrontmatter(draft(false)).frontmatter.approve, false);
  assert.equal(parseFrontmatter(draft(true)).frontmatter.approve, true);
});

test('extract + send-lint: evidence never leaks into the sent body', () => {
  const raw = draft(true);
  const body = extractBody(raw);
  assert.doesNotMatch(body, /snapshot S/);
  assert.doesNotMatch(body, /schedule\.json/);
  assert.ok(lintSendBody(body).ok);
});

test('send-lint refuses if the user pasted evidence above the sentinel', () => {
  const raw = draft(true, 'Dear Prof\n\nsee snapshot S20260909T153957-c583cf for details');
  const body = extractBody(raw);
  assert.ok(!lintSendBody(body).ok, 'leaked snapshot id must be refused');
});

test('buildRfc822 strips CRLF from header values (no header injection into Sent copy)', () => {
  const rfc = buildRfc822({
    from: 'me@x', to: ['a@x'], cc: [], subject: 'Hi\r\nBcc: victim@evil.com', text: 'body', date: 'Wed, 09 Sep 2026 11:00:00 +0000',
  });
  assert.doesNotMatch(rfc, /^Bcc:/m, 'injected Bcc header must not appear as its own line');
  assert.match(rfc, /^Subject: Hi Bcc: victim@evil\.com$/m, 'CRLF folded into a single Subject line');
});
