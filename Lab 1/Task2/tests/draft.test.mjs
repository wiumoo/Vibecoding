import test from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../src/draft/classify.mjs';
import { composeDraft, extractBody, lintSendBody, lintDraftBody, parseFrontmatter, BODY_END } from '../src/draft/draftfile.mjs';

const CLS = { excludeAddressPatterns: ['noreply', 'notice'], excludeAddresses: [], excludeDomains: [], recipientsMax: 5, schoolDomains: ['nju.edu.cn', 'smail.nju.edu.cn'] };
const ME = '215220030@smail.nju.edu.cn';

function msg(over = {}) {
  return {
    mail_key: '<x@nju.edu.cn>',
    from: { name: 'Prof', address: 'wang@nju.edu.cn' },
    to: [{ name: 'me', address: ME }],
    cc: [],
    ...over,
  };
}

test('classify: self mail is skipped', () => {
  const r = classify(msg({ from: { address: ME } }), { myAddress: ME, classification: CLS, headers: {} });
  assert.deepEqual(r, { status: 'skipped', reason: 'self' });
});

test('classify: noreply and bulk headers are skipped', () => {
  assert.equal(classify(msg({ from: { address: 'noreply@nju.edu.cn' } }), { myAddress: ME, classification: CLS, headers: {} }).status, 'skipped');
  assert.equal(classify(msg(), { myAddress: ME, classification: CLS, headers: { 'list-id': 'x' } }).status, 'skipped');
});

test('classify: already answered wins over triage/human', () => {
  const r = classify(msg(), { myAddress: ME, classification: CLS, headers: {}, alreadyAnswered: true });
  assert.equal(r.status, 'already_answered');
});

test('classify: not-direct-to-me → needs_triage', () => {
  const r = classify(msg({ to: [{ address: 'someone@else.com' }], cc: [{ address: ME }] }), { myAddress: ME, classification: CLS, headers: {} });
  assert.equal(r.status, 'needs_triage');
  assert.equal(r.reason, 'not-direct-to-me');
});

test('classify: cold outside sender with no history → needs_triage', () => {
  const r = classify(msg({ from: { address: 'stranger@gmail.com' } }), { myAddress: ME, classification: CLS, headers: {}, historyCount: 0 });
  assert.equal(r.status, 'needs_triage');
  assert.equal(r.reason, 'cold-outside-contact');
});

test('classify: outside sender WITH history → human', () => {
  const r = classify(msg({ from: { address: 'friend@gmail.com' } }), { myAddress: ME, classification: CLS, headers: {}, historyCount: 3 });
  assert.equal(r.status, 'human');
});

test('classify: normal school sender to me → human', () => {
  assert.equal(classify(msg(), { myAddress: ME, classification: CLS, headers: {}, historyCount: 0 }).status, 'human');
});

test('draft compose/parse round-trips frontmatter and body', () => {
  const raw = composeDraft({
    frontmatter: { id: '20260909-abcd1234', approve: false, to: ['x@y'], subject: 'Re: Hi' },
    body: 'Dear Professor,\n\nThanks.\n\nBest regards,\nMinwoo Park',
    summary: 'They asked about Wednesday.',
    evidence: '1. [ehall] schedule.json #/meetings/3',
  });
  const { frontmatter } = parseFrontmatter(raw);
  assert.equal(frontmatter.approve, false);
  assert.equal(frontmatter.id, '20260909-abcd1234');
  assert.deepEqual(frontmatter.to, ['x@y']);
});

test('extractBody returns only the body above the sentinel', () => {
  const raw = composeDraft({
    frontmatter: { id: 'x', approve: false },
    body: 'Hello there.\n\nBest regards,\nMinwoo Park',
    summary: 'summary text',
    evidence: '1. archive/2026-09/x.md',
  });
  const body = extractBody(raw);
  assert.match(body, /Hello there/);
  assert.doesNotMatch(body, /summary text/);
  assert.doesNotMatch(body, /archive\//);
});

test('extractBody refuses when the sentinel was deleted', () => {
  const raw = composeDraft({ frontmatter: { id: 'x' }, body: 'hi', summary: 's', evidence: 'e' }).replace(BODY_END, '');
  assert.throws(() => extractBody(raw), /sentinel/i);
});

test('lintSendBody rejects leaked evidence structure but allows ordinary prose', () => {
  assert.ok(lintSendBody('Dear Prof, thanks.').ok);
  assert.ok(lintSendBody('I attached a snapshot of the results for your review.').ok, 'ordinary "snapshot" allowed');
  assert.ok(!lintSendBody('Dear Prof\n## 근거\n- archive/2026-09/x.md').ok, 'heading + archive path');
  assert.ok(!lintSendBody('ref #/meetings/3').ok, 'ehall json pointer');
  assert.ok(!lintSendBody('from snapshot S20260909T153957-c583cf').ok, 'our snapshot id');
});

test('lintDraftBody flags non-English body and out-of-range citations', () => {
  const en = lintDraftBody('Dear Professor, I am available on Wednesday. Best regards, Minwoo', [1, 2], 3);
  assert.ok(en.ok, JSON.stringify(en.problems));
  const zh = lintDraftBody('尊敬的老师，我周三有空，谢谢您的来信，期待回复。', [], 0);
  assert.ok(!zh.ok);
  const badCite = lintDraftBody('Hello, thank you very much for the message.', [5], 2);
  assert.ok(!badCite.ok);
});

import { staleDraftDecision } from '../src/draft/pipeline.mjs';
import { parseCitations, renderEvidence, numberCandidates } from '../src/draft/evidence.mjs';

test('staleDraftDecision: same-thread draft is superseded, same-sender other-thread is related', () => {
  const states = new Map([
    ['incoming <a>', { direction: 'incoming', mailKey: '<a>', id: 'idA', threadKey: 'T1', from: 'wang@nju.edu.cn', status: 'drafted' }],
    ['incoming <c>', { direction: 'incoming', mailKey: '<c>', id: 'idC', threadKey: 'T2', from: 'wang@nju.edu.cn', status: 'drafted' }],
    ['incoming <d>', { direction: 'incoming', mailKey: '<d>', id: 'idD', threadKey: 'T3', from: 'other@x.com', status: 'sent' }],
  ]);
  const r = staleDraftDecision(states, { mailKey: '<b>', threadKey: 'T1', fromAddr: 'wang@nju.edu.cn' });
  assert.deepEqual(r.supersede.map((e) => e.id), ['idA'], 'same-thread A superseded');
  assert.deepEqual(r.related, ['idC'], 'same-sender other-thread C related');
});

test('parseCitations + renderEvidence: only cited candidates rendered with code locators', () => {
  const cands = numberCandidates(
    [{ kind: 'ehall', label: 'schedule', locator: 'snapshot X / schedule.json /meetings' }],
    [{ kind: 'mail', label: 'prior', locator: 'archive/2026-06/xx.md' }]
  );
  const { citedNumbers, body } = parseCitations('Reply text here.\nCITED: 1');
  assert.equal(body, 'Reply text here.');
  assert.deepEqual(citedNumbers, [1]);
  const ev = renderEvidence(cands, citedNumbers);
  assert.match(ev, /schedule\.json/);
  assert.doesNotMatch(ev, /archive\/2026-06/); // #2 not cited → not rendered
});
