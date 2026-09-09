/* components.mjs — DOM helpers (innerHTML never used with data), icons, and
   shared UI building blocks. All snapshot values are rendered through text
   nodes; only static strings may pass through SVG/HTML helpers. Text shown to
   the user is localized via locale.mjs `t()`. */
import { t, currentLang, dayShort, dayFull, weekTypeText, profileFieldLabel, courseFieldLabel } from './locale.mjs';

export { dayShort, dayFull } from './locale.mjs';

/* ---------- tiny DOM builder ---------- */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'value') node.value = v;
    else if (k === 'checked') node.checked = v;
    else if (k === 'disabled') node.disabled = true;
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  append(node, children);
  return node;
}

export function append(node, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const c of list) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(node, c);
    else if (c instanceof Node) node.appendChild(c);
    else if (typeof c === 'string' || typeof c === 'number') node.appendChild(text(String(c)));
    else if (c.nodeType) node.appendChild(c);
    else node.appendChild(text(String(c)));
  }
  return node;
}

export function text(s) {
  return document.createTextNode(String(s));
}

export function cls(...names) {
  return names.filter(Boolean).join(' ');
}

/* ---------- icons (static markup only) ---------- */
const ICON_PATHS = {
  overview: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  profile: '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 0-2 2z"/><path d="M4 19a2 2 0 0 1 2-2h13"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 3v4h-4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  source: '<path d="M8 6 2 12l6 6"/><path d="m16 6 6 6-6 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M12 12v5"/>',
  shield: '<path d="M12 3 5 6v6c0 4.4 3 8 7 9 4-1 7-4.6 7-9V6z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  exclaim: '<path d="M12 4v9"/><path d="M12 18h.01"/>',
  check: '<path d="m5 13 4 4L19 7"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  note: '<path d="M4 4h16v12H9l-5 4z"/>',
  dot: '<circle cx="12" cy="12" r="4"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'chevron-right': '<path d="m9 6 6 6-6 6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z"/>',
};

export function icon(name, size = 16) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const p = ICON_PATHS[name] || ICON_PATHS.info;
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.innerHTML = p; // static constant only
  svg.appendChild(g);
  return svg;
}

/* ---------- formatting ---------- */
function localeTag() {
  return currentLang() === 'ko' ? 'ko-KR' : currentLang() === 'zh' ? 'zh-CN' : 'en-US';
}

export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(localeTag(), { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

export function relTime(iso, now = Date.now()) {
  if (!iso) return '';
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '';
  const diff = now - ts;
  const abs = Math.abs(diff);
  const min = 60e3; const hour = 3600e3; const day = 86400e3;
  const L = currentLang();
  if (diff < -hour) return t('rel.future');
  if (abs < min) return t('rel.just');
  if (abs < hour) return t('rel.min', { n: Math.round(abs / min) });
  if (abs < day) return t('rel.hour', { n: Math.round(abs / hour) });
  if (abs < 30 * day) return t('rel.day', { n: Math.round(abs / day) });
  return fmtDateTime(new Date(t));
}

/** Wrap matching text segments in <mark>. Building via text nodes only. */
export function markMatches(query, value) {
  const frag = document.createDocumentFragment();
  const hay = String(value);
  const q = String(query).trim().toLowerCase();
  if (!q) {
    frag.appendChild(text(hay));
    return frag;
  }
  const lower = hay.toLowerCase();
  let i = 0;
  let found = lower.indexOf(q);
  while (found >= 0) {
    if (found > i) frag.appendChild(text(hay.slice(i, found)));
    const m = el('mark', {}, hay.slice(found, found + q.length));
    frag.appendChild(m);
    i = found + q.length;
    found = lower.indexOf(q, i);
  }
  if (i < hay.length) frag.appendChild(text(hay.slice(i)));
  return frag;
}

/* ---------- shared building blocks ---------- */
export function badge(kind, content) {
  return el('span', { class: cls('badge', kind), role: 'status' }, content);
}

export function statusBadge(kind, dot, label) {
  return el('span', { class: cls('badge', kind) }, [el('span', { class: 'dot' }), text(label)]);
}

export function metric({ label, value, note, valueClass }) {
  return el('div', { class: 'metric' }, [
    el('div', { class: 'metric-label' }, label),
    el('div', { class: cls('metric-value', valueClass) }, value),
    note ? el('div', { class: 'metric-note' }, note) : null,
  ]);
}

export function banner(kind, title, descNodes = [], opts = {}) {
  const icoMap = { warn: 'exclaim', info: 'info', danger: 'exclaim', ok: 'check', neutral: 'clock' };
  return el('div', { class: cls('banner', kind), role: opts.role || 'status' }, [
    el('span', { class: 'ico' }, icon(icoMap[kind] || 'info', 16)),
    el('span', {}, [
      title ? el('strong', {}, title) : null,
      descNodes && descNodes.length ? [' ', ...descNodes] : null,
    ]),
  ]);
}

export function emptyState(iconName, title, descNodes, opts = {}) {
  return el('div', { class: cls('state-card', 'card'), style: { textAlign: 'center' } }, [
    el('div', { class: 'state-ico' }, icon(iconName, 26)),
    el('div', { class: 'state-title' }, title),
    el('p', { class: 'state-desc' }, descNodes),
    ...(opts.extra ? [opts.extra] : []),
  ]);
}

export function fieldValue(raw) {
  if (raw === undefined || raw === null) return el('span', { class: 'empty-val' }, t('misc.notProvided'));
  if (raw === '') return el('span', { class: 'empty-val' }, t('misc.emptyString'));
  return text(String(raw));
}

export function periodLabel(sp, ep) {
  const L = currentLang();
  if (L === 'en') return sp === ep ? `Period ${sp}` : `Period ${sp}–${ep}`;
  if (L === 'zh') return sp === ep ? `第 ${sp} 节` : `${sp}–${ep} 节`;
  return sp === ep ? `${sp}교시` : `${sp}–${ep}교시`;
}

export function weekRangeLabel(m) {
  const ws = m.week_start; const we = m.week_end;
  const L = currentLang();
  const base = ws === we ? ws : `${ws}–${we}`;
  if (L === 'en') return `Week ${base}`;
  if (L === 'zh') return `${base} 周`;
  return `${base}주`;
}

export function weekTypeLabel(wt) {
  return wt === 'all' ? '' : weekTypeText(wt);
}

/** Deterministic accent class from a course code. */
export function accentOf(code) {
  let h = 0;
  const s = String(code || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `accent-${h % 8}`;
}

/** Capability + derivation footnotes shown under data cards (no fabrication). */
export function footnotes() {
  return el('div', { class: 'card-foot', style: { gap: '6px 14px', display: 'flex', flexWrap: 'wrap' } }, [
    el('span', { class: 'ico' }, icon('info', 13)),
    text(t('note.period')),
    el('span', {}, ' · '),
    text(t('note.calendar')),
    el('span', {}, ' · '),
    text(t('note.exc')),
  ]);
}

export function derivedFootnote() {
  return el('div', { class: 'banner neutral', style: { marginTop: 'var(--space-4)' } }, [
    el('span', { class: 'ico' }, icon('note', 15)),
    text(t('note.derived')),
  ]);
}

export function dayName(d) {
  return dayShort(d);
}

/* ---------- Source sheet content builders (LOCAL, relative refs only) ---------- */
export function courseSource(snapshot, index, record) {
  return {
    title: t('src.courseTitle'),
    rows: [
      [t('src.localFile'), 'courses.json'],
      [t('src.recordKey'), record.record_key],
      [t('src.pointer'), `/list/${index}/source`],
      [t('src.system'), 'NJU ehall'],
      [t('src.page'), '我的课表 · 学生课程列表'],
    ],
    note: t('src.note'),
  };
}

export function meetingSource(snapshot, index, meeting, courseIndex) {
  const rows = [
    [t('src.localFile'), 'schedule.json'],
    [t('src.recordKey'), meeting.course_key || null],
    [t('src.pointer'), `/meetings/${index}`],
    [t('src.system'), 'NJU ehall'],
    [t('src.page'), '我的课表 · 课程时间'],
  ];
  const derived = [];
  if (courseIndex !== null && courseIndex !== undefined) {
    derived.push({ file: 'courses.json', pointer: `/list/${courseIndex}/source/ZCXQJCDD`, what: t('src.derivedRaw') });
    derived.push({ file: 'courses.json', pointer: `/list/${courseIndex}/source/JXBMC`, what: t('src.derivedName') });
  }
  return {
    title: t('src.meetingTitle'),
    rows,
    derived,
    derivedNote: t('src.derivedNote'),
    note: t('src.note'),
  };
}

export function profileSource(snapshot) {
  return {
    title: t('src.profileTitle'),
    rows: [
      [t('src.localFile'), 'profile.json'],
      [t('src.recordKey'), snapshot.profile.source?.XH || null],
      [t('src.pointer'), '/source'],
      [t('src.system'), 'NJU ehall'],
      [t('src.page'), '我的课表 · 学生基本信息'],
    ],
    note: t('src.note'),
  };
}
