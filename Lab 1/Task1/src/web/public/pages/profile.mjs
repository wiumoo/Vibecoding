/* pages/profile.mjs */
import { el, icon, text, fieldValue, profileSource, footnotes, cls } from '../components.mjs';
import { t, profileFieldLabel } from '../locale.mjs';

const GROUPS = [
  { key: 'gBasic', fields: ['XM', 'XH'], badgeId: 'XH' },
  { key: 'gAcademic', fields: ['YXMC', 'YXDM', 'ZYMC', 'BJMC', 'XZNJ', 'XZNJMC'] },
  { key: 'gOther', fields: ['XSBH', 'XBMC', 'MZMC'], internal: true },
];

export default function render(ctx) {
  const { snapshot, showSource } = ctx;
  const source = snapshot.profile.source || {};
  const present = (f) => Object.prototype.hasOwnProperty.call(source, f);

  const head = el('div', { class: 'page-head' }, [
    el('div', {}, [
      el('h1', { class: 'page-title' }, t('pr.title')),
      el('p', { class: 'page-desc' }, [
        text(t('pr.desc1') + ' '),
        el('strong', {}, t('pr.desc2')),
        text(t('pr.desc3')),
      ]),
    ]),
    el('button', { class: 'icon-btn primary', onClick: () => showSource(profileSource(snapshot)) }, [
      icon('source', 15), text(t('btn.source')),
    ]),
  ]);

  const groups = GROUPS.map((g) => {
    const rows = g.fields.filter((f) => present(f));
    const missing = g.fields.filter((f) => !present(f));
    const items = rows.map((f) => {
      const isMono = f === 'XH' || f === 'XSBH' || f === 'XZNJ' || f === 'YXDM';
      return el('div', { class: 'field' }, [
        el('dt', {}, [
          text(profileFieldLabel(f)),
          f === g.badgeId ? el('span', { class: 'badge neutral mono', style: { marginLeft: 6 } }, t('pr.badgeId')) : null,
        ]),
        el('dd', { class: isMono ? 'mono' : undefined }, fieldValue(source[f])),
      ]);
    });
    for (const f of missing) {
      items.push(el('div', { class: 'field' }, [
        el('dt', {}, text(profileFieldLabel(f))),
        el('dd', { class: 'muted' }, fieldValue(undefined)),
      ]));
    }
    if (!items.length) return null;
    return el('div', { class: 'card' }, [
      el('div', { class: 'card-title seg-head' }, [
        el('span', {}, text(t(`pr.${g.key}`))),
        g.internal
          ? el('span', { class: 'badge neutral' }, t('pr.gInternalBadge'))
          : el('span', { class: 'sub' }, t('pr.gCount', { n: g.fields.length })),
      ]),
      el('dl', { class: 'field-list' }, items),
    ]);
  }).filter(Boolean);

  return el('div', {}, [
    head,
    ...groups,
    el('div', { style: { marginTop: 'var(--space-4)' } }, [
      el('div', { class: 'banner info', style: { marginBottom: 'var(--space-3)' } }, [
        el('span', { class: 'ico' }, icon('info', 15)),
        el('span', {}, [el('strong', {}, t('pr.infoTitle')), text(t('pr.info1'))]),
      ]),
      footnotes(),
    ]),
  ]);
}
