/* app.mjs — shell, routing, theme + language controls, connect gate, source
   drawer, banners. Nothing here ever writes private data to storage; the theme
   and language choices are the only localStorage values used. */
import { el, icon, text, badge, statusBadge, banner, emptyState, fmtDateTime, cls } from './components.mjs';
import { LANGS, currentLang, setLang, t, navLabel, pageTitle, friendlyCode } from './locale.mjs';
import { fetchView, setAccessKey, hasAccessKey, clearAccessKey } from './api.mjs';
import overview from './pages/overview.mjs';
import profile from './pages/profile.mjs';
import courses from './pages/courses.mjs';
import schedule from './pages/schedule.mjs';
import search from './pages/search.mjs';

const PAGES = { overview, profile, courses, schedule, search };
const ORDER = ['overview', 'profile', 'courses', 'schedule', 'search'];

const THEME_KEY = 'task1.theme';
let theme = localStorage.getItem(THEME_KEY) || 'system';

function applyThemeMode(mode) {
  const resolved = mode === 'system'
    ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : mode;
  document.documentElement.dataset.theme = resolved;
}
function setTheme(next) {
  theme = next;
  localStorage.setItem(THEME_KEY, next);
  applyThemeMode(next);
  updateThemeIcon();
}
function initTheme() { applyThemeMode(theme); }

let draftQuery = '';

const state = { payload: null, route: currentRoute(), reloadError: null, loading: false };

function currentRoute() {
  const h = location.hash.replace(/^#\/?/, '').split('?')[0];
  return ORDER.includes(h) ? h : 'overview';
}

const root = document.getElementById('app-root');
initTheme();
setLang(currentLang()); // sync <html lang>
if (!hasAccessKey()) root.replaceChildren(connectScreen());
else bootShell();

/* ---------- connect gate ---------- */
function connectScreen() {
  const input = el('input', {
    type: 'password', placeholder: t('con.keyPh'), autocomplete: 'off', 'aria-label': t('con.keyAria'),
  });
  const errMsg = el('p', { class: 'card-foot', style: { color: 'var(--danger)' } });
  const submit = () => {
    const k = input.value.trim();
    if (!k) return;
    setAccessKey(k);
    bootShell();
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  const card = el('div', { class: 'connect-card' }, [
    el('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } }, [
      el('span', { style: { display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 12, background: 'var(--accent-soft)', color: 'var(--accent)' } }, icon('lock', 20)),
      el('div', {}, [
        el('div', { style: { fontWeight: 800, fontSize: 18 } }, t('con.title')),
        el('div', { style: { color: 'var(--text-2)', fontSize: 13 } }, t('con.sub')),
      ]),
    ]),
    el('p', { style: { margin: '20px 0 4px', lineHeight: 1.7 } }, [
      text(t('con.p1')),
      el('strong', {}, t('con.p1b')),
      text(t('con.p1c')),
    ]),
    el('div', { class: 'key-field' }, [input, el('button', { class: 'icon-btn primary', onClick: submit }, t('btn.connect'))]),
    errMsg,
    el('div', { class: 'why-note' }, [
      el('div', { style: { fontWeight: 700, marginBottom: 4 } }, t('con.why')),
      text(t('con.why1')),
    ]),
    el('div', { class: 'why-note' }, [
      el('div', { style: { fontWeight: 700, marginBottom: 4 } }, t('con.can')),
      text(t('con.can1')),
    ]),
  ]);
  return el('div', { class: 'connect-screen' }, card);
}

/* ---------- shell ---------- */
const chromeRefs = {};

function bootShell() {
  applyThemeMode(theme);
  setLang(currentLang());
  buildShell();
  void refresh();
}

function buildShell() {
  const navButtons = [];
  for (const id of ORDER) {
    navButtons.push(el('button', {
      class: 'nav-item', dataset: { route: id },
      onClick: () => navigate(id),
      'aria-current': state.route === id ? 'page' : null,
    }, [el('span', { class: 'nav-ico' }, icon(navIcon(id), 16)), el('span', { class: 'nav-label' }, text(navLabel(id)))]));
  }

  const globalSearch = el('input', {
    type: 'search', placeholder: t('ui.globalSearchPh'), maxlength: '200',
    'aria-label': t('ui.globalSearchAria'),
    style: { width: 220 },
  });
  globalSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { draftQuery = globalSearch.value; navigate('search'); }
  });

  const themeBtn = el('button', { class: 'icon-btn ghost', 'aria-label': t('ui.themeAria'), onClick: cycleTheme }, icon('moon', 16));
  const langSeg = el('div', { class: 'seg seg-lang', role: 'group', 'aria-label': t('lang.group') },
    LANGS.map((l) => el('button', {
      'data-lang': l.id, title: l.name, class: currentLang() === l.id ? 'on' : '',
      'aria-label': l.name, 'aria-pressed': currentLang() === l.id ? 'true' : 'false',
      onClick: () => { if (currentLang() !== l.id) { setLang(l.id); bootShell(); } },
    }, l.label)));
  const reloadBtn = el('button', { class: 'icon-btn', 'aria-label': t('ui.readAgainAria'), onClick: () => { void refresh(); } }, [icon('refresh', 15), text(t('btn.reload'))]);
  const closeBtn = el('button', { class: 'icon-btn ghost', 'aria-label': t('ui.closeAria'), onClick: () => { clearAccessKey(); location.reload(); } }, icon('x', 15));

  chromeRefs.langSeg = langSeg;

  const chrome = el('div', { class: 'app-shell' }, [
    el('aside', { class: 'sidebar' }, [
      el('div', { class: 'brand' }, [
        el('span', { class: 'brand-name' }, 'Task1'),
        el('span', { class: 'brand-sub' }, 'Local Academic'),
      ]),
      ...navButtons,
      el('div', { class: 'sidebar-foot' }, text(t('ui.sidebarFoot'))),
    ]),
    el('div', { class: 'main' }, [
      el('header', { class: 'topbar' }, [
        el('div', {}, [
          el('div', { class: 'topbar-title' }, 'Task1 · Local Academic'),
          el('div', { class: 'topbar-meta', id: 'topbar-meta' }, []),
        ]),
        el('div', { class: 'topbar-right' }, [
          el('div', { class: 'search-box', style: { minWidth: 230 } }, [
            el('span', {}, icon('search', 15)),
            globalSearch,
            el('span', { class: 'kbd' }, '/'),
          ]),
          langSeg,
          themeBtn,
          reloadBtn,
          closeBtn,
        ]),
      ]),
      el('main', { class: 'content', id: 'content' }, skeleton()),
    ]),
  ]);
  root.replaceChildren(chrome);

  document.addEventListener('keydown', (e) => {
    const tgt = e.target;
    const typing = tgt instanceof HTMLElement && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable);
    if (e.key === '/' && !typing) { e.preventDefault(); globalSearch.focus(); }
  });
  window.addEventListener('hashchange', () => { state.route = currentRoute(); render(); });
  updateThemeIcon();
}

function navIcon(id) {
  return { overview: 'overview', profile: 'profile', courses: 'book', schedule: 'calendar', search: 'search' }[id] || 'dot';
}

function cycleTheme() {
  const next = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
  setTheme(next);
}
function updateThemeIcon() {
  const btn = root.querySelector('.topbar-right .icon-btn.ghost');
  if (!btn) return;
  const dark = (document.documentElement.dataset.theme === 'dark');
  btn.replaceChildren(icon(dark ? 'sun' : 'moon', 16));
}

function navigate(route) {
  state.route = route;
  if (location.hash !== `#/${route}`) location.hash = `#/${route}`;
  render();
}

/* ---------- data / refresh ---------- */
async function refresh() {
  state.loading = true;
  const meta = root.querySelector('#topbar-meta');
  if (meta) meta.replaceChildren(text(t('ui.reading')));
  const { status, payload, aborted } = await fetchView();
  state.loading = false;
  if (status === 401) {
    state.reloadError = t('err.keyInvalid');
  } else if (status === 0 || aborted) {
    state.reloadError = t('err.unreachable');
  } else {
    state.payload = payload;
    state.reloadError = null;
  }
  render();
}

/* ---------- render ---------- */
function render() {
  const content = root.querySelector('#content');
  const meta = root.querySelector('#topbar-meta');
  const p = state.payload;
  if (!content) return;

  if (meta) {
    if (p?.snapshot) meta.replaceChildren(text(t('ui.metaTerm', { term: p.snapshot.term, id: p.snapshot.snapshot_id })));
    else if (p) meta.replaceChildren(text(t('ui.metaNone')));
  }
  for (const b of root.querySelectorAll('.nav-item')) {
    b.classList.toggle('active', b.dataset.route === state.route);
    b.setAttribute('aria-current', b.dataset.route === state.route ? 'page' : null);
  }
  const segBtns = chromeRefs.langSeg?.querySelectorAll('button');
  if (segBtns) {
    segBtns.forEach((b) => {
      const on = b.dataset.lang === currentLang();
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  const bannerZone = el('div', { class: 'banner-zone' });
  const pageWrap = el('div', {});
  if (state.reloadError) bannerZone.appendChild(banner('danger', state.reloadError, []));
  if (!p) {
    pageWrap.appendChild(el('div', { class: 'state-card card' }, skeletonBlock()));
    content.replaceChildren(bannerZone, pageWrap);
    return;
  }

  const st = p.status;
  if (!p.snapshot) {
    bannerZone.appendChild(banner('info', t('bnd.noSnapT'), [text(t('bnd.noSnap1', { code: 'npm run sync' }))]));
    const errDiag = p.diagnostics.find((d) => d.severity === 'error');
    if (errDiag) {
      bannerZone.appendChild(banner('danger', friendlyCode(errDiag.code), [text(t('bnd.corruptT'))]));
    }
  } else {
    const lastCol = st?.lastSuccessfulCollectionAt ? fmtDateTime(st.lastSuccessfulCollectionAt) : t('misc.noRecord');
    if (st?.freshness === 'stale') {
      bannerZone.appendChild(banner('warn', t('bnd.staleT'), [text(t('bnd.stale1', { t: lastCol, code: 'npm run sync' }))]));
    } else if (st?.freshness === 'clock-warning') {
      bannerZone.appendChild(banner('danger', t('bnd.clockT'), [text(t('bnd.clock1'))]));
    } else if (st?.freshness === 'unknown' && !p.diagnostics.some((d) => d.code === 'NO_CURRENT')) {
      bannerZone.appendChild(banner('neutral', t('bnd.unknownT'), [text(t('bnd.unknown1'))]));
    }
    const policyDiag = p.diagnostics.find((d) => d.code === 'policy-mismatch');
    if (policyDiag) {
      bannerZone.appendChild(banner('warn', t('bnd.policyT'), [text(t('bnd.policy1'))]));
    }
  }

  const snapshot = p.snapshot;
  if (!snapshot) {
    pageWrap.appendChild(renderNoSnapshot(p));
  } else {
    const pageFn = PAGES[state.route] || PAGES.overview;
    pageWrap.appendChild(pageFn({
      payload: p, snapshot, status: p.status,
      now: Date.parse(p.observed_at) || Date.now(),
      showSource,
      navigate,
      initialQuery: state.route === 'search' ? draftQuery : '',
    }));
  }
  content.replaceChildren(bannerZone, pageWrap);
}

function renderNoSnapshot(p) {
  const title = pageTitle(state.route);
  const codes = p.diagnostics.map((d) => d.code).filter((c) => c && c !== 'NO_CURRENT');
  return el('div', {}, [
    el('div', { class: 'page-head' }, [
      el('div', {}, [el('h1', { class: 'page-title' }, title), el('p', { class: 'page-desc' }, t('ns.head'))]),
    ]),
    emptyState('calendar', t('ns.emptyT'), [
      text(t('ns.line1')),
      el('div', { style: { margin: '14px auto 0' } }, [
        el('code', { class: 'inline' }, 'cd "…/Lab 1/Task1"'), text('  →  '), el('code', { class: 'inline' }, 'npm run sync'),
      ]),
      el('div', { style: { marginTop: 8 } }, t('ns.line2')),
    ]),
    codes.length
      ? el('div', { class: 'card', style: { marginTop: 'var(--space-4)' } }, [
          el('h2', { class: 'card-title' }, t('ns.diagTitle')),
          el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8 } }, codes.map((c) => badge('warn', friendlyCode(c)))),
        ])
      : null,
  ]);
}

/* ---------- source drawer ---------- */
function showSource(sheet) {
  if (!sheet) return;
  const prevFocus = document.activeElement;
  const close = () => {
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
    prevFocus?.focus?.();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') {
      const f = drawer.querySelectorAll('button, a, input, [tabindex]');
      if (!f.length) return;
      const first = f[0]; const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  const rows = (sheet.rows || []).map(([k, v]) =>
    el('div', { class: 'src-row' }, [el('div', { class: 'k' }, k), el('div', { class: 'v' }, v === null || v === undefined ? '—' : String(v))]));
  const derived = (sheet.derived || []).map((d) =>
    el('div', { class: 'src-row' }, [el('div', { class: 'k' }, `${d.what}`), el('div', { class: 'v' }, `${d.file} ${d.pointer}`)]));
  const drawer = el('div', { class: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': sheet.title || t('src.dialogAria') }, [
    el('div', { class: 'drawer-head' }, [
      el('div', { class: 'drawer-title' }, [icon('source', 15), ' ', sheet.title || t('src.dialogAria')]),
      el('button', { class: 'icon-btn ghost', 'aria-label': t('btn.close'), onClick: close }, icon('x', 16)),
    ]),
    el('div', { class: 'drawer-body' }, [
      ...rows,
      ...derived,
      sheet.derivedNote ? el('div', { class: 'src-note' }, [el('span', { class: 'ico' }, icon('note', 14)), text(sheet.derivedNote)]) : null,
      sheet.note ? el('div', { class: 'src-note' }, [el('span', { class: 'ico' }, icon('info', 14)), text(sheet.note)]) : null,
      el('div', { class: 'src-note' }, [
        el('span', { class: 'ico' }, icon('shield', 14)),
        text(t('src.snapshotNote', { id: state.payload?.snapshot?.snapshot_id || '?' })),
      ]),
    ]),
  ]);
  const backdrop = el('div', { class: 'drawer-backdrop' }, drawer);
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', onKey);
  root.appendChild(backdrop);
  (drawer.querySelector('button') || drawer).focus?.();
}

/* ---------- helpers ---------- */
function skeleton() { return el('div', {}, skeletonBlock()); }
function skeletonBlock() {
  return [
    el('div', { class: 'sk', style: { width: '40%', height: 34, marginBottom: 18 } }),
    el('div', { class: 'grid-metrics', style: { gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' } },
      [0, 1, 2, 3].map(() => el('div', { class: 'metric' }, [el('div', { class: 'sk', style: { height: 14, width: '55%' } }), el('div', { class: 'sk', style: { height: 26, width: '70%', marginTop: 10 } })]))),
  ];
}
