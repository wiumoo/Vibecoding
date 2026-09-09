/* pages/courses.mjs */
import { el, icon, text, badge, banner, emptyState, fieldValue, periodLabel, weekRangeLabel, weekTypeLabel, footnotes, courseSource, dayName, cls } from '../components.mjs';
import { t, coursesCols, courseFieldLabel } from '../locale.mjs';

export default function render(ctx) {
  const { snapshot, showSource } = ctx;
  const courses = snapshot.courses;
  if (!courses.length) {
    return el('div', {}, [
      el('div', { class: 'page-head' }, [
        el('div', {}, [el('h1', { class: 'page-title' }, t('cs.title')), el('p', { class: 'page-desc' }, t('cs.empty1'))]),
      ]),
      emptyState('book', t('cs.emptyT'), t('cs.empty1')),
    ]);
  }
  const open = new WeakMap();

  const head = el('div', { class: 'page-head' }, [
    el('div', {}, [
      el('h1', { class: 'page-title' }, t('cs.title')),
      el('p', { class: 'page-desc' }, [text(t('cs.desc1', { n: courses.length })), text(t('cs.desc2'))]),
    ]),
    el('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } }, [
      badge('neutral', t('cs.count', { n: courses.length })),
    ]),
  ]);

  const TABLE_COLS = coursesCols();
  const thead = el('thead', {}, el('tr', {}, TABLE_COLS.map((c) => el('th', {}, c))));
  const tbody = el('tbody', {});

  courses.forEach((c, i) => {
    const src = c.source || {};
    const tr = el('tr', {}, [
      el('td', {}, [
        el('div', { style: { fontWeight: 700 } }, src.JXBMC ?? t('misc.notAvail')),
        src.JXBID
          ? el('div', { style: { fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 2, fontFamily: 'var(--font-mono)' } }, `JXBID ${src.JXBID}`)
          : null,
      ]),
      el('td', { class: 'code' }, src.KCH ?? '—'),
      el('td', { class: 'num' }, src.XF ?? '—'),
      el('td', {}, src.SKJS ?? '—'),
      el('td', {}, src.PKDWDM_DISPLAY ?? '—'),
      el('td', {}, src.XKLY_DISPLAY ?? '—'),
      el('td', { style: { textAlign: 'right', whiteSpace: 'nowrap' } }, [
        el('button', { class: 'sec-btn', onClick: () => toggleDetail(tbody, tr, open, i, c, ctx) }, [text(t('btn.detail')), icon('chevron-down', 12)]),
        el('button', { class: 'sec-btn', style: { marginLeft: 6 }, onClick: () => showSource(courseSource(snapshot, i, c)) }, [icon('source', 12), text(t('btn.source'))]),
      ]),
    ]);
    tbody.appendChild(tr);
  });

  const table = el('div', { class: 'table-wrap' }, [el('table', { class: 'dtable' }, [thead, tbody])]);

  return el('div', {}, [
    head,
    el('div', { class: 'banner neutral', style: { marginBottom: 'var(--space-4)' } }, [
      el('span', { class: 'ico' }, icon('info', 15)),
      el('span', {}, [el('strong', {}, t('cs.noticeT')), text(t('cs.notice1'))]),
    ]),
    table,
    el('div', { style: { marginTop: 'var(--space-4)' } }, footnotes()),
  ]);
}

function toggleDetail(tbody, tr, open, i, c, ctx) {
  if (open.get(tr)) {
    open.get(tr).remove();
    open.delete(tr);
    return;
  }
  const src = c.source || {};
  const { snapshot } = ctx;
  const linked = snapshot.meetings.filter((m) => m.course_key === c.record_key);
  const rows = [
    [t('cs.det.code'), 'code', src.KCH],
    [t('cs.det.jxbid'), 'mono', src.JXBID],
    [t('cs.det.xf'), 'num', src.XF],
    [t('cs.det.raw'), 'plain', src.ZCXQJCDD],
    [t('cs.det.key'), 'mono', c.record_key],
  ];
  const grid = el('div', { class: 'detail-grid' }, rows.map(([k, typ, v]) =>
    el('div', {}, [el('div', { class: 'k' }, k), el('div', { class: typ === 'plain' ? 'v plain' : 'v' }, v ?? '—')])
  ));
  const meetingNote = linked.length
    ? el('div', {}, [
        el('div', { class: 'k', style: { marginBottom: 4 } }, t('cs.det.linked', { n: linked.length })),
        el('ul', { style: { margin: 0, paddingLeft: 18, color: 'var(--text-2)', fontSize: 13 } },
          linked.map((m) => el('li', {}, [
            text(`${dayName(m.day_of_week)} ${periodLabel(m.start_period, m.end_period)} · ${weekRangeLabel(m)}${m.week_type && m.week_type !== 'all' ? ' · ' + weekTypeLabel(m.week_type) : ''}`),
            m.location ? text(` · ${m.location}`) : null,
          ]))),
      ])
    : el('div', { class: 'k' }, t('cs.det.none'));

  const det = el('tr', { class: 'row-detail' }, el('td', { colspan: 7 }, el('div', { class: 'detail-body' }, [grid, meetingNote])));
  tr.after(det);
  open.set(tr, det);
  tr.scrollIntoView({ block: 'nearest' });
}
