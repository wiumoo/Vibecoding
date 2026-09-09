/* pages/overview.mjs */
import { el, icon, text, metric, banner, statusBadge, fmtDateTime, relTime, footnotes, badge } from '../components.mjs';
import { t, freshnessText, syncTokenText, publishTokenText } from '../locale.mjs';

function creditsOf(courses) {
  let total = 0; let counted = 0; let skipped = 0;
  for (const c of courses) {
    const v = c.source?.XF;
    if (v === undefined || v === null || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n)) { total += n; counted += 1; } else skipped += 1;
  }
  return { total: Math.round(total * 100) / 100, counted, skipped };
}

function freshnessBadge(status) {
  const map = {
    fresh: ['ok', freshnessText('fresh')],
    stale: ['warn', freshnessText('stale')],
    unknown: ['neutral', freshnessText('unknown')],
    'clock-warning': ['danger', freshnessText('clock-warning')],
    'no-snapshot': ['neutral', freshnessText('no-snapshot')],
  };
  const [kind, label] = map[status?.freshness] || map.unknown;
  return statusBadge(kind, true, label);
}

export default function render(ctx) {
  const { payload, snapshot, status, now } = ctx;
  const s = snapshot;
  const term = s ? s.term : null;
  const courses = s ? s.courses : [];
  const meetings = s ? s.meetings : [];
  const credits = creditsOf(courses);
  const freshRel = status?.lastSuccessfulCollectionAt ? relTime(status.lastSuccessfulCollectionAt, now) : null;
  const noRecord = t('misc.noRecord');

  const metrics = el('div', { class: 'grid-metrics' }, [
    metric({
      label: t('ov.mCourses'),
      value: courses.length,
      note: s ? t('ov.sCourses') + ' · ' + s.term : '—',
    }),
    metric({
      label: t('ov.mCredits'),
      value: `${credits.total}`,
      note: credits.skipped ? t('ov.mCreditsSkip', { n: credits.skipped }) : t('ov.mCreditsNote', { n: credits.counted }),
    }),
    metric({
      label: t('ov.mLast'),
      value: status?.lastSuccessfulCollectionAt ? fmtDateTime(status.lastSuccessfulCollectionAt) : noRecord,
      note: freshRel ? t('ov.mLastRel', { rel: freshRel, basis: status.freshnessBasis === 'manifest' ? t('ov.mLastBasisManifest') : t('ov.mLastBasisState') }) : t('fr.unknown'),
    }),
    metric({
      label: t('ov.mTry'),
      value: status?.lastAttemptAt ? fmtDateTime(status.lastAttemptAt) : noRecord,
      note: t('ov.mTryNote'),
    }),
  ]);

  const row = (k, v, hint) =>
    el('div', { class: 'field', style: { padding: '6px 2px' } }, [
      el('dt', { style: { fontSize: 'var(--text-xs)', color: 'var(--text-3)' } }, text(k)),
      el('dd', { style: { margin: '2px 0 0', fontWeight: 600 } }, v),
      hint ? el('div', { class: 'card-foot', style: { marginTop: 2 } }, hint) : null,
    ]);

  const statusCard = el('div', { class: 'card' }, [
    el('h2', { class: 'card-title' }, [icon('clock', 16), text(t('ov.statusTitle')), el('span', { class: 'sub' }, t('ov.statusSub'))]),
    el('div', { class: 'field-list', style: { gap: 'var(--space-1) var(--space-5)' } }, [
      row(t('ov.rFresh'), freshnessBadge(status || {}),
        status?.lastSuccessfulCollectionAt
          ? t('ov.rSnapReadAt', { t: fmtDateTime(status.lastSuccessfulCollectionAt) })
          : t('ov.rFreshNoBasis')),
      row(t('ov.rSync'), statusSyncLabel(status),
        status?.sync?.token === 'running-recorded' ? t('ov.rSyncRunning') : t('ov.rSyncWeb')),
      row(t('ov.rPub'), statusPublishLabel(status), t('ov.rPubNote')),
      row(t('ov.rSnap'), s ? [el('span', { class: 'term-chip' }, s.snapshot_id), text(t('ov.rSnapCollected')), text(fmtDateTime(s.snapshot_collected_at))] : t('ov.rSnapNone'),
        s ? t('ov.rSnapReadAt', { t: fmtDateTime(payload.observed_at) }) : ''),
    ]),
  ]);

  const countsCard = el('div', { class: 'card' }, [
    el('h2', { class: 'card-title' }, [icon('book', 16), text(t('ov.summaryTitle'))]),
    s
      ? el('div', { class: 'field-list', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(150px,1fr))' } }, [
          row(t('ov.sCourses'), courses.length, 'courses.json list'),
          row(t('ov.sSegments'), meetings.length, 'schedule.json meetings'),
          row(t('ov.sProfileFields'), Object.keys(s.profile.source || {}).length, 'profile.json source'),
        ])
      : el('p', { class: 'state-desc', style: { marginTop: 0 } }, t('ov.sNone')),
  ]);

  return el('div', {}, [
    el('div', { class: 'page-head' }, [
      el('div', {}, [
        el('h1', { class: 'page-title' }, t('ov.title')),
        el('p', { class: 'page-desc' }, t('ov.desc')),
      ]),
      el('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } }, [
        statusBadge('ok', true, t('ui.trust')),
        statusBadge('accent', false, t('ui.readOnly')),
        term ? el('span', { class: 'term-chip' }, term) : null,
      ]),
    ]),
    metrics,
    el('div', { style: { height: 'var(--space-4)' } }),
    statusCard,
    el('div', { style: { height: 'var(--space-4)' } }),
    countsCard,
    footnotes(),
  ]);
}

function statusSyncLabel(status) {
  if (!status?.sync) return t('misc.noRecord');
  const base = syncTokenText(status.sync.token);
  if (status.sync.lastReasons?.length) {
    return [text(base), el('span', { class: 'card-foot', style: { marginLeft: 6 } }, t('ov.rReasons', { r: status.sync.lastReasons.join(', ') }))];
  }
  return base;
}

function statusPublishLabel(status) {
  if (!status?.publish) return t('misc.noRecord');
  const base = publishTokenText(status.publish.token);
  const committed = status.publish.committed === null
    ? ''
    : status.publish.committed ? t('ov.committedYes') : t('ov.committedNo');
  return [text(base), text(committed)];
}
