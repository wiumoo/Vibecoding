/* pages/schedule.mjs */
import { el, icon, text, badge, emptyState, periodLabel, weekRangeLabel, meetingSource, derivedFootnote, footnotes, accentOf, cls, dayFull, dayName } from '../components.mjs';
import { t, problemText } from '../locale.mjs';
import { meetingProblem, activeInWeek, collectWeeks, assignLanes, meetingsConflict } from '/assets/modules/timetable.mjs';

const ROW_H = 52;

export default function render(ctx) {
  const { snapshot, showSource } = ctx;
  const meetings = snapshot.meetings || [];

  const courseByKey = new Map();
  snapshot.courses.forEach((c, i) => courseByKey.set(c.record_key, { source: c.source, index: i }));
  const courseName = (m) => (courseByKey.get(m.course_key)?.source?.JXBMC) || null;
  const indexOf = new Map(meetings.map((m, i) => [m, i]));

  const valid = [];
  const problems = [];
  meetings.forEach((m, i) => {
    const code = meetingProblem(m);
    if (code) problems.push({ index: i, code, meeting: m });
    else valid.push(m);
  });

  const rowsN = valid.reduce((mx, m) => Math.max(mx, Number(m.end_period) || 0), 0);
  const weekOptions = collectWeeks(valid);
  const state = { week: 'all', mode: window.matchMedia?.('(max-width: 1100px)').matches ? 'agenda' : 'grid' };

  const pageHead = (title, desc, right) =>
    el('div', { class: 'page-head' }, [
      el('div', {}, [el('h1', { class: 'page-title' }, title), el('p', { class: 'page-desc' }, desc || '')]),
      right ? el('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } }, right) : null,
    ]);

  if (!valid.length && !problems.length) {
    return el('div', {}, [
      pageHead(t('sc.emptyHead'), t('sc.empty1')),
      emptyState('calendar', t('sc.emptyT'), t('sc.empty1')),
      el('div', { style: { marginTop: 'var(--space-4)' } }, footnotes()),
    ]);
  }

  const gridWrap = el('div', {});
  const agendaWrap = el('div', { class: 'agenda', style: { display: 'none' } });

  const activeList = () => (state.week === 'all' ? valid : valid.filter((m) => activeInWeek(m, Number(state.week))));

  function renderAll() {
    gridWrap.replaceChildren(buildGrid(activeList(), rowsN));
    agendaWrap.replaceChildren(buildAgenda(activeList()));
    const empty = !activeList().length;
    if (empty) {
      gridWrap.appendChild(el('div', { class: 'banner neutral', style: { marginTop: 'var(--space-3)' } }, [
        el('span', { class: 'ico' }, icon('calendar', 15)), text(t('sc.bEmptyWeek')),
      ]));
    } else if (state.week === 'all') {
      gridWrap.appendChild(el('div', { class: 'banner neutral', style: { marginTop: 'var(--space-3)' } }, [
        el('span', { class: 'ico' }, icon('info', 15)), text(t('sc.bAll')),
      ]));
    }
  }
  renderAll();

  const toolbar = el('div', { class: 'sched-toolbar' }, [
    el('div', { class: 'group' }, [
      el('span', { style: { fontWeight: 700, fontSize: 14 } }, t('sc.week')),
      el('select', { class: 'select', 'aria-label': t('sc.weekAria'), onchange: (e) => { state.week = e.target.value; renderAll(); } },
        [el('option', { value: 'all' }, t('sc.weekAll')), ...weekOptions.map((w) => el('option', { value: String(w) }, t('sc.weekOpt', { n: w })))]),
      el('span', { class: 'sub', style: { fontSize: 'var(--text-xs)', color: 'var(--text-2)' } }, t('sc.weekNote')),
    ]),
    el('div', { class: 'group' }, [
      el('span', { style: { fontWeight: 700, fontSize: 14 } }, t('sc.view')),
      el('div', { class: 'seg', role: 'group', 'aria-label': t('sc.viewAria') }, [
        el('button', { class: state.mode === 'grid' ? 'on' : '', onClick: () => setMode('grid') }, t('sc.viewGrid')),
        el('button', { class: state.mode === 'agenda' ? 'on' : '', onClick: () => setMode('agenda') }, t('sc.viewAgenda')),
      ]),
    ]),
  ]);

  function setMode(mode) {
    state.mode = mode;
    const btns = toolbar.querySelectorAll('.seg button');
    btns.forEach((b, i) => b.classList.toggle('on', (i === 0 && mode === 'grid') || (i === 1 && mode === 'agenda')));
    gridWrap.style.display = mode === 'grid' ? '' : 'none';
    agendaWrap.style.display = mode === 'agenda' ? '' : 'none';
  }
  setMode(state.mode);

  const head = pageHead(
    `${t('sc.title')} — ${snapshot.term}`,
    [text(t('sc.desc1')), ' ', el('strong', {}, t('sc.desc2')), text(t('sc.desc3'))],
    [badge('neutral', t('sc.badgeCount', { n: meetings.length })), problems.length ? badge('warn', t('sc.badgeNeed', { n: problems.length })) : null]
  );

  const problemCard = problems.length
    ? el('div', { class: 'card' }, [
        el('h2', { class: 'card-title' }, [icon('exclaim', 15), text(t('sc.problemTitle')), el('span', { class: 'sub' }, t('sc.problemSub'))]),
        el('div', {}, problems.map((p) => el('div', { class: 'field', style: { borderBottom: '1px dashed var(--border)', padding: '10px 0' } }, [
          el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' } }, [
            el('span', { style: { fontWeight: 600 } }, `#${p.index} · ${p.meeting.course_code || p.meeting.course_key || t('misc.keyNone')}`),
            el('button', { class: 'sec-btn', onClick: () => showSource(meetingSource(snapshot, p.index, p.meeting, null)) }, [icon('source', 12), text(t('btn.source'))]),
          ]),
          el('div', { class: 'card-foot', style: { margin: '2px 0 0' } }, [text(problemText(p.code)), text(t('sc.problemNote'))]),
        ]))),
      ])
    : null;

  return el('div', {}, [
    head,
    toolbar,
    gridWrap,
    agendaWrap,
    problems.length ? el('div', { style: { height: 'var(--space-4)' } }) : null,
    problemCard,
    derivedFootnote(),
    el('div', { style: { marginTop: 'var(--space-3)' } }, footnotes()),
  ]);

  /* ---------------- builders ---------------- */

  function buildGrid(list, nRows) {
    const grid = el('div', { class: 'tt-grid' });
    grid.style.setProperty('--row-h', ROW_H + 'px');
    grid.style.gridTemplateRows = `44px repeat(${nRows}, var(--row-h))`;
    grid.appendChild(el('div', { class: 'tt-corner' }));
    for (let d = 1; d <= 7; d++) {
      grid.appendChild(el('div', { class: 'tt-dayhead' }, [text(dayName(d)), el('small', {}, dayFull(d))]));
    }
    const gutter = el('div', { class: 'tt-gutter', style: { gridRow: `2 / span ${nRows}`, height: nRows * ROW_H } });
    for (let p = 1; p <= nRows; p++) {
      gutter.appendChild(el('div', { class: 'tt-period', style: { top: (p - 1) * ROW_H + 'px', height: ROW_H + 'px' } }, String(p)));
    }
    grid.appendChild(gutter);
    for (let d = 1; d <= 7; d++) {
      const cell = el('div', { class: 'tt-daycell', style: { gridRow: `2 / span ${nRows}`, height: nRows * ROW_H, minHeight: nRows * ROW_H } });
      const dayList = list.filter((m) => Number(m.day_of_week) === d);
      if (dayList.length) {
        const { meetings: placed, laneCount } = assignLanes(dayList);
        for (const { meeting: m, lane } of placed) {
          const sp = Number(m.start_period); const ep = Number(m.end_period);
          const conflict = dayList.some((o) => o !== m && meetingsConflict(m, o));
          cell.appendChild(buildCard(m, { top: (sp - 1) * ROW_H + 2, height: (ep - sp + 1) * ROW_H - 4, lane, laneCount, conflict }));
        }
      }
      grid.appendChild(cell);
    }
    const outer = el('div', { class: 'tt-scroll' }, grid);
    const legend = buildLegend(list);
    return el('div', {}, [outer, legend || null]);
  }

  function buildCard(m, pos) {
    const name = courseName(m);
    const c = courseByKey.get(m.course_key);
    const card = el('div', {
      class: cls('tt-card', accentOf(m.course_code || name || ''), pos.conflict ? 'conflict' : ''),
      style: {
        top: pos.top + 'px',
        height: pos.height + 'px',
        left: `calc(${((pos.lane / pos.laneCount) * 100).toFixed(2)}% + 2px)`,
        width: `calc(${(100 / pos.laneCount).toFixed(2)}% - 4px)`,
      },
      role: 'button',
      tabindex: '0',
      'aria-label': `${name || m.course_code || t('misc.nameNone')} ${weekRangeLabel(m)}`,
    }, [
      el('div', { class: 'cname' }, name || m.course_code || t('misc.nameNone')),
      el('div', { class: 'cmeta' }, [
        text(weekRangeLabel(m) + (m.week_type && m.week_type !== 'all' ? ' · ' + weekTypeShort(m.week_type) : '')),
        el('div', {}, m.location ? text(m.location) : text(t('misc.roomNone'))),
      ]),
      pos.conflict ? el('span', { class: 'cflag' }, t('sc.conflict')) : null,
    ]);
    const openSource = () => {
      const idx = indexOf.get(m);
      showSource(meetingSource(snapshot, idx, m, c ? c.index : null));
    };
    card.addEventListener('click', openSource);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSource(); } });
    return card;
  }

  function weekTypeShort(wt) {
    return t(`wt.${wt}`);
  }

  function buildLegend(list) {
    const seen = new Set();
    const chips = [];
    for (const m of list) {
      const key = m.course_key || m.course_code;
      if (seen.has(key)) continue;
      seen.add(key);
      const name = courseName(m);
      chips.push(el('span', {}, [el('span', { class: cls('sw', accentOf(m.course_code || name || '')) }, ''), text(name || m.course_code || t('misc.nameNone'))]));
    }
    return chips.length ? el('div', { class: 'legend', 'aria-label': t('sc.legendAria') }, chips) : null;
  }

  function buildAgenda(list) {
    const out = [];
    for (let d = 1; d <= 7; d++) {
      const items = list.filter((m) => Number(m.day_of_week) === d);
      const day = el('div', { class: 'agenda-day' }, [
        el('div', { class: 'agenda-day-head' }, [text(dayFull(d)), el('span', { class: 'badge neutral' }, `${items.length}`)]),
        items.length
          ? items.map((m) => {
              const c = courseByKey.get(m.course_key);
              const name = courseName(m);
              return el('div', { class: 'agenda-item' }, [
                el('div', { class: 'agenda-time' }, periodLabel(m.start_period, m.end_period)),
                el('div', { class: 'agenda-main' }, [
                  el('div', { class: 'n', style: { color: 'var(--' + accentOf(m.course_code || name || '').replace('accent-', 'acc-') + ')' } }, name || m.course_code || t('misc.nameNone')),
                  el('div', { class: 'm' }, [
                    el('span', {}, weekRangeLabel(m) + (m.week_type !== 'all' ? ' · ' + weekTypeShort(m.week_type) : '')),
                    m.location ? el('span', {}, m.location) : el('span', {}, t('misc.roomNone')),
                  ]),
                ]),
                el('button', { class: 'sec-btn', onClick: () => { const idx = indexOf.get(m); showSource(meetingSource(snapshot, idx, m, c ? c.index : null)); } }, [icon('source', 12)]),
              ]);
            })
          : el('div', { class: 'agenda-empty-day' }, t('sc.agendaEmptyDay')),
      ]);
      out.push(day);
    }
    return out;
  }
}
