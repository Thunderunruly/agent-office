// ===== app.js =====
// Bundle entry: styles, locale dictionaries and the three slot registrations
// (central page, sidebar icon, Settings row). Owner: Lead.

const inject = ['slots', 'locale', 'sessions', 'workspaces', 'uiWorkspace', 'layout', 'remote', 'remote.session'];

/** Office building icon for the sidebar panel list: host outline style (16px grid). */
function PixelOfficeIcon(props) {
  const size = Number(props && props.size) > 0 ? Number(props.size) : 18;
  const windows = [
    [4.4, 4.3, 1], [7.6, 4.3, 0.55], [10.8, 4.3, 1],
    [4.4, 7.5, 0.55], [7.6, 7.5, 1], [10.8, 7.5, 0.55],
    [4.4, 10.7, 1], [10.8, 10.7, 1],
  ];
  return h('svg', {
    viewBox: '0 0 16 16',
    width: size,
    height: size,
    fill: 'none',
    'aria-hidden': true,
    focusable: false,
    style: { display: 'block' },
  }, [
    h('rect', { key: 'roof', x: 6.9, y: 0.8, width: 2.2, height: 1.6, rx: 0.5, fill: 'currentColor' }),
    h('rect', {
      key: 'frame',
      x: 2.2,
      y: 2.5,
      width: 11.6,
      height: 11.3,
      rx: 2.2,
      stroke: 'currentColor',
      strokeWidth: 1.4,
    }),
    ...windows.map(([x, y, dim], index) => h('rect', {
      key: `window-${index}`,
      x,
      y,
      width: 2.2,
      height: 2.2,
      rx: 0.7,
      fill: 'currentColor',
      opacity: dim,
    })),
    h('rect', { key: 'door', x: 7.1, y: 11.4, width: 1.8, height: 2.4, rx: 0.5, fill: 'currentColor' }),
  ]);
}

function apply(ctx) {
  ctx.effect(() => {
    if (typeof document === 'undefined') return () => {};
    const tag = document.createElement('style');
    tag.dataset.plugin = 'dsh-pixel-office';
    tag.dataset.pluginCss = 'dsh-pixel-office/page.css';
    tag.textContent = OFFICE_CSS;
    document.head.appendChild(tag);
    return () => {
      if (tag.parentNode) tag.parentNode.removeChild(tag);
    };
  }, 'pixel-office: styles');

  ctx.effect(() => ctx.locale.register(OFFICE_NS, OFFICE_STRINGS), 'pixel-office: dictionaries');
  const t = ctx.locale.bind(OFFICE_NS);

  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: OFFICE_PANEL_ID,
    locale: OFFICE_NS,
    inject: () => ({ ctx }),
  }, OfficePage));

  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: OFFICE_PANEL_ID,
    order: 21,
    locale: OFFICE_NS,
    label: () => t('panel.title'),
    inject: () => ({ ctx }),
  }, PixelOfficeIcon));

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'pixel-office-display',
    order: 27,
    locale: OFFICE_NS,
    inject: () => ({ ctx }),
  }, OfficeSettingRow));
}
