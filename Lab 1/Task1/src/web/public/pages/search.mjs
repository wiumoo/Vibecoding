/* pages/search.mjs */
import { el, icon, text, emptyState, badge, markMatches, periodLabel, weekRangeLabel, courseSource, meetingSource, footnotes, dayName } from '../components.mjs';
import { t, courseFieldLabel } from '../locale.mjs';
import { searchSnapshot } from '/assets/modules/service.mjs';

const DEBOUNCE_MS = 150;
const PAGE_SIZE = 50;

export default function render(ctx) {
  const { snapshot, showSource, initialQuery } = ctx;
  const courses = snapshot.courses;
  const meetings = snapshot.meetings;
  const courseByKey = new Map(courses.map((c, i) => [c.record_key, { ...c, index: i }]));

  const input = el('input', {
    type: 'search', placeholder: t('sr.ph'), maxlength: '200',
    'aria-label': t('sr.aria'),
    value: initialQuery || '',
    style: { flex: 1, minWidth: 0, border: '0', outline: 'none', background: 'transparent', fontSize: 15 },
  });
  let results = el('div', {});
  const countBadge = el('span', { class: 'badge neutral' }, t('sr.waiting'));
  let debounce;
  const run = () => { clearTimeout(debounce); debounce = setTimeout(() => execute(input.value), DEBOUNCE_MS); };
  input.addEventListener('input', run);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(debounce); execute(input.value); } });

  function execute(q) {
    if (!String(q).trim()) {
      countBadge.replaceChildren(text(t('sr.waiting')));
      results.replaceChildren(emptyState('search', t('sr.ask'), t('sr.ask1')));
      return;
    }
    const res = searchSnapshot({ courses, meetings }, q);
    countBadge.replaceChildren(text(t('misc.countUnit', { n: res.courseHits.length + res.meetingHits.length })));
    renderResults(res, q);
  }

  function renderResults(res, q) {
    if (!res.courseHits.length && !res.meetingHits.length) {
      results.replaceChildren(emptyState('search', t('sr.noneT'), t('sr.none1', { q })));
      return;
    }
    const chunks = [];
    if (res.courseHits.length) {
      const page = res.courseHits.slice(0, PAGE_SIZE);
      const overflow = res.courseHits.length > PAGE_SIZE;
      chunks.push(el('div', { class: 'result-group' }, [
        el('h3', { class: 'result-group-title' }, t('sr.groupCourse', { n: res.courseHits.length })),
        ...page.map((h) => {
          const src = h.record.source;
          const name = src.JXBMC;
          const fields = h.matchedFields.map((f) => el('span', { class: 'badge neutral' }, courseFieldLabel(f)));
          const linked = meetings.filter((m) => m.course_key === h.record.record_key);
          return el('div', { class: 'hit' }, [
            el('div', {}, [
              el('div', { class: 'hit-title' }, markMatches(q, name || src.KCH || t('misc.nameNone'))),
              el('div', { class: 'hit-sub' }, [
                el('span', { class: 'code', style: { fontFamily: 'var(--font-mono)' } }, markMatches(q, src.KCH || '')),
                src.SKJS ? el('span', {}, t('sr.teacher', { t: src.SKJS })) : null,
                src.XF ? el('span', {}, t('sr.credits', { n: src.XF })) : null,
                linked.length ? el('span', {}, t('sr.scheduleN', { n: linked.length })) : null,
              ]),
              fields.length ? el('div', { class: 'hit-sub', style: { marginTop: 6 } }, [text(t('sr.matchedFields')), ...fields]) : null,
            ]),
            el('div', { style: { display: 'flex', gap: 6 } }, [
              el('button', { class: 'sec-btn', onClick: () => showSource(courseSource(snapshot, h.index, h.record)) }, [icon('source', 12), text(t('btn.source'))]),
            ]),
          ]);
        }),
        overflow ? el('p', { class: 'card-foot' }, t('sr.overflow', { n: PAGE_SIZE })) : null,
      ]));
    }
    if (res.meetingHits.length) {
      chunks.push(el('div', { class: 'result-group' }, [
        el('h3', { class: 'result-group-title' }, t('sr.groupTime', { n: res.meetingHits.length })),
        ...res.meetingHits.slice(0, PAGE_SIZE).map((h) => {
          const m = h.meeting;
          const c = courseByKey.get(m.course_key);
          const name = c?.source?.JXBMC || m.course_code;
          return el('div', { class: 'hit' }, [
            el('div', {}, [
              el('div', { class: 'hit-title' }, markMatches(q, name || t('misc.nameNone'))),
              el('div', { class: 'hit-sub' }, [
                el('span', {}, `${dayName(m.day_of_week)} ${periodLabel(m.start_period, m.end_period)}`),
                el('span', {}, weekRangeLabel(m) + (m.week_type && m.week_type !== 'all' ? ' · ' + weekLabel(m.week_type) : '')),
                m.location ? el('span', {}, markMatches(q, m.location)) : null,
              ]),
            ]),
            el('div', { style: { display: 'flex', gap: 6 } }, [
              el('button', { class: 'sec-btn', onClick: () => showSource(meetingSource(snapshot, h.index, m, c?.index ?? null)) }, [icon('source', 12), text(t('btn.source'))]),
            ]),
          ]);
        }),
      ]));
    }
    results.replaceChildren(...chunks);
  }

  function weekLabel(wt) { return t(`wt.${wt}`); }
  execute(initialQuery || '');

  const head = el('div', { class: 'page-head' }, [
    el('div', {}, [
      el('h1', { class: 'page-title' }, t('sr.title')),
      el('p', { class: 'page-desc' }, t('sr.desc')),
    ]),
  ]);

  return el('div', {}, [
    head,
    el('div', { class: 'card' }, [
      el('div', { style: { display: 'flex', gap: 10, alignItems: 'center' } }, [
        el('span', { style: { display: 'grid', placeItems: 'center' } }, icon('search', 18)),
        input,
        countBadge,
      ]),
      el('p', { class: 'card-foot', style: { margin: 'var(--space-3) 0 0' } }, t('sr.foot')),
    ]),
    el('div', { style: { height: 'var(--space-2)' } }),
    results,
    el('div', { style: { marginTop: 'var(--space-4)' } }, footnotes()),
  ]);
}
