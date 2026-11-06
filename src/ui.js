// ===== ui.js =====
// Application shell for the pixel office: toolbar (breadcrumb / stats / day-night /
// help), canvas host with the DOM label layer, empty & loading states, the help
// overlay, Esc navigation and the Settings row. Owner: T3 (app shell).
//
// Boundaries:
//   * every user-visible string comes from OFFICE_STRINGS via ctx.locale;
//   * the scene painters only emit label DATA ({kind, text, anchor, data}); all wording
//     and presentation lives here;
//   * only --dsw-alias-* theme tokens are used for the page chrome. The label chips and
//     the canvas letterbox sit on top of the pixel art, so they keep a fixed dark "HUD"
//     palette that reads the same in light and dark themes;
//   * the renderer stays the only owner of the canvas: this file only feeds it scenes
//     and mirrors its layout for the label layer.

const OFFICE_PANEL_ID = 'pixel-office';
const OFFICE_DISPLAY_KEY = 'dsh.pixel-office.display.v1';
const OFFICE_DISPLAY_EVENT = 'dsh-pixel-office:display';
const OFFICE_DISPLAY_MODES = ['auto', 'day', 'night'];
const OFFICE_DEFAULT_STAGE_WIDTH = 640;
const OFFICE_DEFAULT_STAGE_HEIGHT = 360;
const OFFICE_VIEW_KINDS = ['city', 'building', 'room'];
const OFFICE_LABEL_TITLE_MAX = 28;
const OFFICE_LABEL_SUB_MAX = 48;
const OFFICE_LABEL_DETAIL_MAX = 56;

// ---------------------------------------------------------------------------
// Host UI primitives — preferred whenever the running Harness exposes them.
// `package.json > dsh.client.external` declares the package, so the Client module
// loader resolves this require. An older host (or a missing export) leaves the
// constants null and every control falls back to our copied geometry, so the page
// still renders instead of crashing the slot.
// ---------------------------------------------------------------------------

const OFFICE_PRIMITIVES = (() => {
  try {
    return require('@deepseek-ai/dsh-client-ui-primitives') || null;
  } catch (error) {
    return null;
  }
})();
const OFFICE_HOST_BUTTON = OFFICE_PRIMITIVES && OFFICE_PRIMITIVES.Button
  ? OFFICE_PRIMITIVES.Button
  : null;
const OFFICE_HOST_SEGMENTED = OFFICE_PRIMITIVES && OFFICE_PRIMITIVES.SegmentedControl
  ? OFFICE_PRIMITIVES.SegmentedControl
  : null;
const OFFICE_HOST_MODAL = OFFICE_PRIMITIVES && OFFICE_PRIMITIVES.Modal
  ? OFFICE_PRIMITIVES.Modal
  : null;
const OFFICE_HOST_TOOLTIP = OFFICE_PRIMITIVES && OFFICE_PRIMITIVES.Tooltip
  ? OFFICE_PRIMITIVES.Tooltip
  : null;

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

function officeUiFormat(template, params) {
  const source = String(template == null ? '' : template);
  return source.replace(/\{(\w+)\}/g, (match, key) => (
    params && Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
  ));
}

function officeUiClip(text, max) {
  const clean = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  if (!max || max <= 1 || clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

function officeUiNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function officeUiJoin(parts) {
  return (Array.isArray(parts) ? parts : []).filter(Boolean).join(' · ');
}

function officeUiSafeViewKind(kind) {
  return OFFICE_VIEW_KINDS.indexOf(kind) >= 0 ? kind : 'city';
}

function officeUiClampScroll(value, max) {
  const limit = Math.max(0, officeUiNumber(max, 0));
  return Math.min(limit, Math.max(0, Math.round(officeUiNumber(value, 0))));
}

/**
 * Painter scroll metadata: `scrollMax` is the last page index (0 = everything fits, so
 * there is nothing to page through). Older painters exposed the alias `maxScroll`.
 */
function officeUiSceneScroll(scene) {
  const source = scene && typeof scene === 'object' ? scene : {};
  const raw = source.scrollMax != null ? source.scrollMax : source.maxScroll;
  const max = Number(raw);
  return { max: Number.isFinite(max) ? Math.max(0, Math.round(max)) : 0 };
}

// ---------------------------------------------------------------------------
// Display mode (auto / day / night) — shared with OfficeSettingRow
// ---------------------------------------------------------------------------

function officeUiReadDisplayMode() {
  try {
    const value = window.localStorage.getItem(OFFICE_DISPLAY_KEY);
    if (OFFICE_DISPLAY_MODES.indexOf(value) >= 0) return value;
  } catch (error) {
    /* Storage unavailable: auto mode still works. */
  }
  return 'auto';
}

function officeUiWriteDisplayMode(mode) {
  const next = OFFICE_DISPLAY_MODES.indexOf(mode) >= 0 ? mode : 'auto';
  try {
    window.localStorage.setItem(OFFICE_DISPLAY_KEY, next);
  } catch (error) {
    /* Ignore quota/security failures; the in-page event still keeps the UI in sync. */
  }
  try {
    window.dispatchEvent(new CustomEvent(OFFICE_DISPLAY_EVENT));
  } catch (error) {
    /* No CustomEvent support: nothing else to do. */
  }
}

/** Subscribe to display-mode changes from this page, the Settings row and other windows. */
function officeUiSubscribeDisplay(listener) {
  if (typeof listener !== 'function') return () => {};
  const onChange = () => listener();
  const onStorage = (event) => {
    if (!event || event.key === null || event.key === OFFICE_DISPLAY_KEY) listener();
  };
  window.addEventListener(OFFICE_DISPLAY_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(OFFICE_DISPLAY_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

function officeUiIsNightNow() {
  const hour = new Date().getHours();
  return hour < 7 || hour >= 19;
}

function officeUiIsNight(mode) {
  if (mode === 'night') return true;
  if (mode === 'day') return false;
  return officeUiIsNightNow();
}

// ---------------------------------------------------------------------------
// Locale
// ---------------------------------------------------------------------------

function officeUiBindLocale(ctx) {
  const locale = ctx && ctx.locale;
  if (locale && typeof locale.bind === 'function') return locale.bind(OFFICE_NS);
  return (key) => {
    const dictionary = OFFICE_STRINGS && OFFICE_STRINGS.zh ? OFFICE_STRINGS.zh : {};
    return Object.prototype.hasOwnProperty.call(dictionary, key) ? dictionary[key] : key;
  };
}

/** Bound `t(key)` that re-renders the component when the host locale changes. */
function useOfficeLocale(ctx) {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const locale = ctx && ctx.locale;
    if (!locale || typeof locale.subscribe !== 'function') return undefined;
    const off = locale.subscribe(() => setVersion((value) => value + 1));
    return () => { if (typeof off === 'function') off(); };
  }, [ctx]);
  return useMemo(() => officeUiBindLocale(ctx), [ctx, version]);
}

// ---------------------------------------------------------------------------
// Label model: scene label data -> localized text
// ---------------------------------------------------------------------------

function officeUiWorkspaceName(text, ungrouped, t) {
  const clean = officeUiClip(text, 30);
  if (clean) return clean;
  return ungrouped ? t('workspace.ungrouped') : t('workspace.untitled');
}

function officeUiSessionName(text, t) {
  const clean = officeUiClip(text, 30);
  return clean || t('session.untitled');
}

function officeUiMemberName(text, t) {
  const clean = officeUiClip(text, OFFICE_LABEL_TITLE_MAX - 6);
  return clean || t('label.untitledMember');
}

function officeUiStatusText(t, running) {
  return running ? t('status.running') : t('status.idle');
}

function officeUiTodoText(t, todos) {
  if (!todos || typeof todos !== 'object') return '';
  const total = Math.max(0, officeUiNumber(todos.total, 0));
  if (total <= 0) return '';
  const done = Math.min(total, Math.max(0, officeUiNumber(todos.done, 0)));
  return officeUiFormat(t('status.todos'), { done, total });
}

function officeUiWorkText(t, currentWork) {
  const work = officeUiClip(currentWork, OFFICE_LABEL_DETAIL_MAX);
  return work ? officeUiFormat(t('status.doing'), { work }) : '';
}

function officeUiWorkspaceSubline(t, data) {
  const parts = [];
  const sessions = Math.max(0, officeUiNumber(data.sessionCount, 0));
  if (sessions > 0) parts.push(officeUiFormat(t('workspace.sessions'), { n: sessions }));
  const running = Math.max(0, officeUiNumber(data.runningCount, 0));
  if (running > 0) parts.push(officeUiFormat(t('workspace.running'), { n: running }));
  else parts.push(t('workspace.idleAll'));
  const members = Math.max(0, officeUiNumber(data.memberCount, 0));
  if (members > 0) parts.push(officeUiFormat(t('workspace.members'), { n: members }));
  return officeUiJoin(parts);
}

/**
 * Turn one scene label into its localized content.
 * `alwaysSub` keeps the second line visible (signage); the other kinds expand it on
 * hover. Returns null when there is nothing worth rendering.
 */
function officeUiLabelContent(label, t) {
  if (!label || typeof label !== 'object') return null;
  const data = label.data && typeof label.data === 'object' ? label.data : {};
  const kind = typeof label.kind === 'string' ? label.kind : '';
  const running = data.running === true || officeUiNumber(data.runningCount, 0) > 0;
  const tone = typeof label.tone === 'string' && label.tone ? label.tone : (running ? 'on' : 'off');
  const status = officeUiStatusText(t, running);

  switch (kind) {
    case 'workspace': {
      const name = officeUiWorkspaceName(label.text, data.ungrouped === true, t);
      const floorNumber = Math.max(0, officeUiNumber(data.floorNumber, 0));
      const title = floorNumber > 0
        ? `${officeUiFormat(t('label.floor'), { n: floorNumber })} · ${name}`
        : name;
      return { title, sub: officeUiWorkspaceSubline(t, data), detail: '', tone, alwaysSub: false };
    }
    case 'tower-title': {
      const totals = data.totals && typeof data.totals === 'object' ? data.totals : {};
      const sub = officeUiFormat(t('tower.sub'), {
        workspaces: Math.max(0, officeUiNumber(totals.workspaces, 0)),
        sessions: Math.max(0, officeUiNumber(totals.sessions, 0)),
      });
      return {
        title: t('tower.title'),
        sub,
        detail: '',
        tone: officeUiNumber(totals.running, 0) > 0 ? 'on' : 'off',
        alwaysSub: true,
      };
    }
    case 'workspace-title': {
      const name = officeUiWorkspaceName(label.text, data.ungrouped === true, t);
      return { title: name, sub: officeUiWorkspaceSubline(t, data), detail: '', tone, alwaysSub: true };
    }
    case 'office': {
      const number = Math.max(0, officeUiNumber(data.officeNumber, 0));
      const name = officeUiClip(label.text, 22) || t('session.untitled');
      const title = number > 0 ? `${String(number).padStart(2, '0')} · ${name}` : name;
      const parts = [status];
      const teamSize = Math.max(1, officeUiNumber(data.teamSize, 1));
      if (teamSize > 1) parts.push(officeUiFormat(t('office.sub'), { team: teamSize }));
      const todos = officeUiTodoText(t, data.todos);
      if (todos) parts.push(todos);
      return {
        title,
        sub: officeUiJoin(parts),
        detail: officeUiWorkText(t, data.currentWork),
        tone,
        alwaysSub: false,
      };
    }
    case 'floor-more': {
      // Legacy painters used to draw an overflow chip here ("N more offices"); painting
      // replaced it with real scrolling (scene.scrollMax + pixel arrows on the canvas).
      return null;
    }
    case 'boss': {
      const name = officeUiClip(label.text, OFFICE_LABEL_TITLE_MAX);
      const parts = [t('role.lead'), status];
      const todos = officeUiTodoText(t, data.todos);
      if (todos) parts.push(todos);
      return {
        title: name || t('role.lead'),
        sub: officeUiJoin(parts),
        detail: officeUiWorkText(t, data.currentWork),
        tone,
        alwaysSub: false,
      };
    }
    case 'member': {
      const role = data.role === 'subagent' ? t('role.subagent') : t('role.teammate');
      const parts = [role, status];
      const todos = officeUiTodoText(t, data.todos);
      if (todos) parts.push(todos);
      return {
        title: officeUiMemberName(label.text, t),
        sub: officeUiJoin(parts),
        detail: officeUiWorkText(t, data.currentWork),
        tone,
        alwaysSub: false,
      };
    }
    case 'whiteboard': {
      const total = Math.max(0, officeUiNumber(data.total, 0));
      const done = Math.min(total, Math.max(0, officeUiNumber(data.done, 0)));
      const teamSize = Math.max(1, officeUiNumber(data.teamSize, 1));
      const hiddenStaff = Math.max(0, officeUiNumber(data.hiddenStaff, 0));
      const parts = [t('room.whiteboardHint')];
      if (teamSize > 1) parts.push(officeUiFormat(t('office.sub'), { team: teamSize }));
      return {
        title: total > 0 ? officeUiFormat(t('room.whiteboard'), { done, total }) : t('room.whiteboardEmpty'),
        sub: officeUiJoin(parts),
        detail: hiddenStaff > 0 ? officeUiFormat(t('label.hiddenStaff'), { n: hiddenStaff }) : '',
        tone: 'off',
        alwaysSub: false,
      };
    }
    default: {
      // Unknown kinds from future painters: render text/sub as data, never crash.
      const rawTitle = officeUiClip(label.text, OFFICE_LABEL_TITLE_MAX);
      const rawSub = officeUiClip(label.sub, OFFICE_LABEL_SUB_MAX);
      if (!rawTitle && !rawSub) return null;
      return {
        title: rawTitle || rawSub,
        sub: rawTitle ? rawSub : '',
        detail: '',
        tone,
        alwaysSub: true,
      };
    }
  }
}

/** Key used to match a scene label against the renderer's hover target. */
function officeUiLabelKey(label) {
  if (!label || typeof label !== 'object') return '';
  const data = label.data && typeof label.data === 'object' ? label.data : {};
  const workspaceId = typeof data.workspaceId === 'string' ? data.workspaceId : '';
  const sessionId = typeof data.sessionId === 'string' ? data.sessionId : '';
  if (label.kind === 'workspace' || label.kind === 'workspace-title') {
    return workspaceId ? `building:${workspaceId}` : '';
  }
  if (label.kind === 'office') return sessionId ? `floor:${sessionId}` : '';
  if (label.kind === 'boss' || label.kind === 'member') return sessionId ? `member:${sessionId}` : '';
  return '';
}

function officeUiHoverKey(target) {
  if (!target || typeof target !== 'object') return '';
  if (target.kind === 'building' && target.workspaceId) return `building:${target.workspaceId}`;
  if (target.kind === 'floor' && target.sessionId) return `floor:${target.sessionId}`;
  if (target.kind === 'member' && target.sessionId) return `member:${target.sessionId}`;
  return '';
}

/** Canvas-logical label position -> CSS position inside the stage. */
function officeUiLabelLayout(label, layout) {
  const scale = layout && layout.scale > 0 ? layout.scale : 1;
  const offsetX = layout && Number.isFinite(layout.offsetX) ? layout.offsetX : 0;
  const offsetY = layout && Number.isFinite(layout.offsetY) ? layout.offsetY : 0;
  const logicalX = officeUiNumber(label.x, 0);
  const logicalY = officeUiNumber(label.y, 0);
  const x = logicalX * scale + offsetX;
  const y = logicalY * scale + offsetY;
  const anchor = label.anchor === 'above' || label.anchor === 'below' || label.anchor === 'right'
    ? label.anchor
    : 'center';
  const transform = anchor === 'above'
    ? 'translate(-50%, -100%)'
    : anchor === 'below'
      ? 'translate(-50%, 0)'
      : anchor === 'right'
        ? 'translate(0, -50%)'
        : 'translate(-50%, -50%)';
  // Keep each label inside the drawn canvas: clip against the side it points away from.
  const logicalWidth = officeUiNumber(layout && layout.logicalWidth, 0) || OFFICE_DEFAULT_STAGE_WIDTH;
  const canvasWidth = logicalWidth * scale;
  const anchorX = logicalX * scale;
  let maxWidth;
  if (anchor === 'right') {
    maxWidth = canvasWidth - anchorX - 10;
  } else {
    const half = Math.min(anchorX, canvasWidth - anchorX);
    maxWidth = half * 2 - 12;
  }
  // Office nameplates sit side by side, so they get a tighter cap than signage.
  const isOffice = label.kind === 'office';
  const cap = isOffice
    ? 200
    : (label.kind === 'tower-title' || label.kind === 'workspace-title' ? 260 : 220);
  maxWidth = Math.max(96, Math.min(cap, maxWidth));
  let fontSize = Math.max(10, Math.min(13, Math.round(9.5 + scale * 1.1)));
  if (isOffice) fontSize = Math.max(9, fontSize - 1);
  return {
    left: `${Math.round(x * 10) / 10}px`,
    top: `${Math.round(y * 10) / 10}px`,
    transform,
    fontSize: `${fontSize}px`,
    maxWidth: `${Math.round(maxWidth)}px`,
  };
}

// ---------------------------------------------------------------------------
// Inline icons (no assets, no network)
// ---------------------------------------------------------------------------

function OfficeIconBack() {
  return h('svg', {
    viewBox: '0 0 16 16',
    width: 14,
    height: 14,
    'aria-hidden': true,
    focusable: false,
    style: { display: 'block' },
  }, [
    h('path', {
      key: 'arrow',
      d: 'M9.5 3.5 5 8l4.5 4.5',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.6,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
  ]);
}

function OfficeIconClose() {
  return h('svg', {
    viewBox: '0 0 16 16',
    width: 13,
    height: 13,
    'aria-hidden': true,
    focusable: false,
    style: { display: 'block' },
  }, [
    h('path', {
      key: 'cross',
      d: 'M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.5,
      strokeLinecap: 'round',
    }),
  ]);
}

function OfficeIconView(props) {
  const kind = props && props.kind;
  const common = {
    viewBox: '0 0 16 16',
    width: 13,
    height: 13,
    'aria-hidden': true,
    focusable: false,
    style: { display: 'block' },
  };
  if (kind === 'building') {
    return h('svg', common, [
      h('rect', { key: 'frame', x: 2.6, y: 3.6, width: 10.8, height: 8.8, fill: 'none', stroke: 'currentColor', strokeWidth: 1.2 }),
      h('path', { key: 'v', d: 'M8 3.6v8.8', fill: 'none', stroke: 'currentColor', strokeWidth: 1 }),
      h('path', { key: 'h', d: 'M2.6 8h10.8', fill: 'none', stroke: 'currentColor', strokeWidth: 1 }),
    ]);
  }
  if (kind === 'room') {
    return h('svg', common, [
      h('rect', { key: 'screen', x: 4.2, y: 3, width: 7.6, height: 5.2, fill: 'none', stroke: 'currentColor', strokeWidth: 1.2 }),
      h('path', { key: 'stand', d: 'M8 8.2v1.6', fill: 'none', stroke: 'currentColor', strokeWidth: 1.2 }),
      h('path', {
        key: 'desk',
        d: 'M2.6 10.4h10.8M4.2 10.4v2.6M11.8 10.4v2.6',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.2,
        strokeLinecap: 'round',
      }),
    ]);
  }
  return h('svg', common, [
    h('rect', { key: 'roof', x: 3.6, y: 2.4, width: 8.8, height: 1.8, fill: 'currentColor', opacity: 0.85 }),
    h('rect', { key: 'body', x: 4.2, y: 4.2, width: 7.6, height: 9.2, fill: 'none', stroke: 'currentColor', strokeWidth: 1.2 }),
    h('rect', { key: 'w1', x: 5.4, y: 6, width: 1.8, height: 1.8, fill: 'currentColor', opacity: 0.85 }),
    h('rect', { key: 'w2', x: 8.6, y: 6, width: 1.8, height: 1.8, fill: 'currentColor', opacity: 0.85 }),
    h('rect', { key: 'w3', x: 5.4, y: 9, width: 1.8, height: 1.8, fill: '#ffd36b' }),
    h('rect', { key: 'w4', x: 8.6, y: 9, width: 1.8, height: 1.8, fill: 'currentColor', opacity: 0.6 }),
    h('rect', { key: 'door', x: 7.2, y: 11.6, width: 1.6, height: 1.8, fill: 'currentColor', opacity: 0.7 }),
  ]);
}

function OfficeEmptyArt() {
  const windows = [[9, 11], [14, 11], [19, 11], [9, 16], [14, 16], [19, 16], [9, 21], [19, 21]];
  return h('svg', {
    className: 'po-empty-art',
    viewBox: '0 0 32 32',
    width: 52,
    height: 52,
    'aria-hidden': true,
    focusable: false,
    shapeRendering: 'crispEdges',
    style: { display: 'block' },
  }, [
    h('rect', { key: 'roof', x: 5, y: 5, width: 22, height: 3, fill: 'currentColor', opacity: 0.45 }),
    h('rect', { key: 'body', x: 6, y: 8, width: 20, height: 19, fill: 'currentColor', opacity: 0.22 }),
    h('rect', { key: 'base', x: 4, y: 27, width: 24, height: 2, fill: 'currentColor', opacity: 0.3 }),
    ...windows.map(([x, y], index) => h('rect', {
      key: `w-${index}`,
      x,
      y,
      width: 3,
      height: 3,
      fill: index % 3 === 0 ? '#ffd36b' : 'currentColor',
      opacity: index % 3 === 0 ? 0.9 : 0.42,
    })),
    h('rect', { key: 'door', x: 14, y: 23, width: 4, height: 4, fill: 'currentColor', opacity: 0.6 }),
  ]);
}

function OfficeIconHelp() {
  return h('svg', {
    viewBox: '0 0 16 16',
    width: 16,
    height: 16,
    'aria-hidden': true,
    focusable: false,
    style: { display: 'block' },
  }, [
    h('circle', { key: 'ring', cx: 8, cy: 8, r: 6, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 }),
    h('path', {
      key: 'stem',
      d: 'M8 7.2v4',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.5,
      strokeLinecap: 'round',
    }),
    h('circle', { key: 'dot', cx: 8, cy: 4.9, r: 0.95, fill: 'currentColor' }),
  ]);
}
/**
 * Build a host-styled button element: the real Button primitive when the host
 * provides it, otherwise our `.po-btn*` fallback. Returns an ELEMENT (not a
 * component) so Tooltip can clone it and inject its anchor handlers/ref.
 */
function officeButtonElement(props) {
  if (OFFICE_HOST_BUTTON) {
    return h(OFFICE_HOST_BUTTON, {
      variant: props.variant,
      size: props.size,
      icon: props.icon,
      className: props.className,
      id: props.id,
      type: 'button',
      title: props.title,
      'aria-label': props['aria-label'],
      'aria-haspopup': props['aria-haspopup'],
      'aria-expanded': props['aria-expanded'],
      disabled: props.disabled,
      onClick: props.onClick,
    }, props.children);
  }
  const classes = ['po-btn', props.size === 'sm' ? 'po-btn--sm' : 'po-btn--md'];
  if (props.variant === 'outline') classes.push('po-btn--outline');
  else if (props.variant === 'primary') classes.push('po-btn--primary');
  else classes.push('po-btn--ghost');
  if (props.className) classes.push(props.className);
  return h('button', {
    type: 'button',
    id: props.id,
    className: classes.join(' '),
    title: props.title,
    'aria-label': props['aria-label'],
    'aria-haspopup': props['aria-haspopup'],
    'aria-expanded': props['aria-expanded'],
    disabled: props.disabled,
    onClick: props.onClick,
  }, [
    props.icon ? h('span', { key: 'icon', className: 'po-btn-icon' }, props.icon) : null,
    props.children != null ? h('span', { key: 'label', className: 'po-btn-label' }, props.children) : null,
  ]);
}

/** Button component used by our render trees; delegates to officeButtonElement. */
function OfficeTextButton(props) {
  return officeButtonElement(props);
}

/** Back button: icon-only element wrapped in the host Tooltip when available. */
function OfficeBackButton(props) {
  const button = officeButtonElement({
    variant: 'ghost',
    icon: h(OfficeIconBack),
    title: props.label,
    'aria-label': props.label,
    onClick: props.onClick,
  });
  if (!OFFICE_HOST_TOOLTIP) return button;
  return h(OFFICE_HOST_TOOLTIP, { label: props.label, side: 'bottom' }, button);
}

/** Help body shared by the real host Modal and the fallback dialog. */
function officeHelpSections(t) {
  return [
    h('div', { key: 'sections', className: 'po-modal-sections' },
      OFFICE_VIEW_KINDS.map((kind) => h('section', { key: kind, className: 'po-modal-section' }, [
        h('h3', { key: 'title', className: 'po-modal-section-title' }, [
          h('span', { key: 'icon', className: 'po-modal-section-icon' }, h(OfficeIconView, { kind })),
          h('span', { key: 'text' }, t(`help.view.${kind}.title`)),
        ]),
        h('p', { key: 'text', className: 'po-modal-section-text' }, t(`help.view.${kind}.text`)),
      ]))),
    h('div', { key: 'tips', className: 'po-modal-tips' }, [
      h('strong', { key: 'title', className: 'po-modal-tips-title' }, t('help.tipsTitle')),
      h('p', { key: 'text', className: 'po-modal-tips-text' }, t('help.tips')),
    ]),
  ];
}
/**
 * Fallback help dialog: host Modal geometry copied into `.po-modal*` (mask, 16/24
 * title, 24px body padding, close button, footer action). Used only when the host
 * does not export Modal.
 */
function OfficeHelpModalFallback(props) {
  const t = props.t;
  const onClose = props.onClose;
  const cardRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!props.open) return;
    if (closeRef.current && typeof closeRef.current.focus === 'function') closeRef.current.focus();
  }, [props.open]);

  useEffect(() => {
    if (!props.open || typeof document === 'undefined' || typeof document.addEventListener !== 'function') {
      return undefined;
    }
    const onKeyDown = (event) => {
      if (!event) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const card = cardRef.current;
      if (!card || typeof card.querySelectorAll !== 'function') return;
      const focusable = card.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = typeof document.activeElement !== 'undefined' ? document.activeElement : null;
      const inside = card.contains && active ? card.contains(active) : true;
      if (event.shiftKey && (active === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [props.open, onClose]);

  if (!props.open) return null;
  return h('div', {
    className: 'po-modal',
    ref: props.layerRef,
    role: 'presentation',
    onClick: (event) => { if (event && event.target === event.currentTarget) onClose(); },
  }, h('div', {
    key: 'card',
    ref: cardRef,
    className: 'po-modal-card',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': t('help.title'),
  }, [
    h('div', { key: 'header', className: 'po-modal-header' }, [
      h('h2', { key: 'title', className: 'po-modal-title' }, t('help.title')),
      h('button', {
        key: 'close',
        ref: closeRef,
        type: 'button',
        className: 'po-modal-close',
        'aria-label': t('action.close'),
        title: t('action.close'),
        onClick: onClose,
      }, h(OfficeIconClose, {})),
    ]),
    h('div', { key: 'body', className: 'po-modal-body' }, [
      h('p', { key: 'subtitle', className: 'po-modal-subtitle' }, t('panel.subtitle')),
      ...officeHelpSections(t),
    ]),
    h('div', { key: 'footer', className: 'po-modal-footer' }, [
      h(OfficeTextButton, { key: 'done', variant: 'outline', onClick: onClose }, t('action.close')),
    ]),
  ]));
}

/** Real host Modal when available; the copied-geometry fallback otherwise. */
function OfficeHelpDialog(props) {
  const t = props.t;
  if (!OFFICE_HOST_MODAL) {
    return h(OfficeHelpModalFallback, { open: props.open, onClose: props.onClose, t, layerRef: props.layerRef });
  }
  return h(OFFICE_HOST_MODAL, {
    open: props.open,
    onClose: props.onClose,
    title: t('help.title'),
    closeLabel: t('action.close'),
    description: t('panel.subtitle'),
    footer: h(OfficeTextButton, { variant: 'outline', onClick: props.onClose }, t('action.close')),
  }, officeHelpSections(t));
}
/**
 * Fallback segmented control: the host SegmentedControl geometry (track + sliding
 * indicator) copied into `.po-seg*`, only used when the host export is unavailable.
 */
function OfficeSegmentedFallback(props) {
  const options = Array.isArray(props.options) ? props.options : [];
  const index = Math.max(0, options.findIndex((option) => option.value === props.value));
  return h('div', {
    className: 'po-seg-control',
    role: 'radiogroup',
    'aria-label': props.label,
    style: { '--po-seg-count': String(Math.max(1, options.length)), '--po-seg-index': String(index) },
  }, [
    h('span', { key: 'indicator', className: 'po-seg-indicator', 'aria-hidden': 'true' }),
    ...options.map((option) => h('button', {
      key: option.value,
      type: 'button',
      role: 'radio',
      'aria-checked': option.value === props.value ? 'true' : 'false',
      className: 'po-seg-tab',
      title: option.title || undefined,
      onClick: () => {
        if (typeof props.onChange === 'function' && option.value !== props.value) props.onChange(option.value);
      },
    }, option.label)),
  ]);
}

/** Real host SegmentedControl when available; the copied-geometry fallback otherwise. */
function OfficeSegmentedControl(props) {
  if (!OFFICE_HOST_SEGMENTED) {
    return h(OfficeSegmentedFallback, {
      label: props.label,
      value: props.value,
      options: props.options,
      onChange: props.onChange,
    });
  }
  return h(OFFICE_HOST_SEGMENTED, {
    id: props.id,
    className: props.className,
    label: props.label,
    value: props.value,
    options: props.options,
    onChange: props.onChange,
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function OfficePage(props) {
  const ctx = props && props.ctx;
  const t = useOfficeLocale(ctx);
  const { model, phase } = useOfficeModel(ctx);

  const [scope, setScope] = useState(() => ({ kind: 'city' }));
  const [layout, setLayout] = useState(null);
  const [viewport, setViewport] = useState({ w: OFFICE_DEFAULT_STAGE_WIDTH, h: OFFICE_DEFAULT_STAGE_HEIGHT });
  const [hoverTarget, setHoverTarget] = useState(null);
  const [displayMode, setDisplayMode] = useState(officeUiReadDisplayMode);
  const [clockTick, setClockTick] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [scroll, setScroll] = useState(0);

  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const helpLayerRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const activateRef = useRef(null);

  const night = useMemo(
    () => officeUiIsNight(displayMode),
    // clockTick re-evaluates "auto" once a minute so the canvas can cross noon/midnight.
    [displayMode, clockTick],
  );
  const nightRef = useRef(night);
  nightRef.current = night;

  // Keep the auto mode honest while the page stays open.
  useEffect(() => {
    const timer = window.setInterval(() => setClockTick((value) => value + 1), 60000);
    return () => window.clearInterval(timer);
  }, []);

  // Shared with the Settings row and with other windows.
  useEffect(() => officeUiSubscribeDisplay(() => setDisplayMode(officeUiReadDisplayMode())), []);

  // ---- scope -> model slices -------------------------------------------------
  const room = useMemo(
    () => (scope.kind === 'room' ? selectRoom(model, scope.sessionId) : null),
    [model, scope],
  );
  const activeWorkspaceId = scope.kind === 'building'
    ? scope.workspaceId
    : scope.kind === 'room'
      ? (scope.workspaceId || (room && room.workspaceId) || '')
      : '';
  const building = useMemo(
    () => (activeWorkspaceId ? selectBuilding(model, activeWorkspaceId) : null),
    [model, activeWorkspaceId],
  );

  // A workspace/session can disappear while it is open (archived, closed, reload).
  useEffect(() => {
    if (phase !== 'ready') return;
    if (scope.kind === 'building' && !building) {
      setScope({ kind: 'city' });
      return;
    }
    if (scope.kind === 'room' && !room) {
      const fallback = scope.workspaceId ? selectBuilding(model, scope.workspaceId) : null;
      setScope(fallback ? { kind: 'building', workspaceId: fallback.workspaceId } : { kind: 'city' });
    }
  }, [phase, scope, building, room, model]);

  // ---- scene (viewport-aware: the renderer's logical canvas fills the stage) --
  const scene = useMemo(() => {
    if (phase !== 'ready') return null;
    const view = { w: viewport.w, h: viewport.h };
    const options = { scroll };
    if (scope.kind === 'room' && room) return buildRoomScene(room, view, options);
    if (scope.kind === 'building' && building) return buildBuildingScene(building, view, options);
    return buildCityScene(selectCity(model), view, options);
  }, [phase, scope, room, building, model, viewport.w, viewport.h, scroll]);

  // Painters report how far the view can scroll (absent when everything fits).
  // Painters page by whole screens and draw the pixel arrows themselves; `scrollMax`
  // is the last page index (0 = everything fits). One delta is exactly one page and is
  // clamped to [0, scrollMax]. No DOM pager exists: the canvas arrows' hits
  // ({kind:'scroll',delta}), the wheel and ↑↓ all drive this single scroll state.
  const scrollMax = officeUiSceneScroll(scene).max;
  const scrollMaxRef = useRef(scrollMax);
  scrollMaxRef.current = scrollMax;

  // The card must stay inside the range after data/viewport changes…
  useEffect(() => {
    setScroll((value) => {
      const next = officeUiClampScroll(value, scrollMax);
      return next === value ? value : next;
    });
  }, [scrollMax, viewport.w, viewport.h]);

  // …and start from the top when switching views.
  useEffect(() => {
    setScroll(0);
  }, [scope.kind, scope.sessionId, scope.workspaceId]);

  const goUp = useCallback(() => {
    setScope((previous) => {
      if (previous.kind === 'room') {
        if (previous.workspaceId && selectBuilding(model, previous.workspaceId)) {
          return { kind: 'building', workspaceId: previous.workspaceId };
        }
        return { kind: 'city' };
      }
      if (previous.kind === 'building') return { kind: 'city' };
      return previous;
    });
  }, [model]);

  // Closing the help dialog returns focus to its trigger, like the host Modal.
  const closeHelp = useCallback(() => {
    setHelpOpen(false);
    if (typeof document !== 'undefined' && typeof document.getElementById === 'function') {
      const trigger = document.getElementById('pixel-office-help');
      if (trigger && typeof trigger.focus === 'function') trigger.focus();
    }
  }, []);

  const activate = useCallback((target) => {
    if (!target || typeof target !== 'object') return;
    if (target.kind === 'scroll') {
      const delta = officeUiNumber(target.delta, 0);
      if (delta !== 0) {
        setScroll((value) => officeUiClampScroll(value + delta, scrollMaxRef.current));
      }
      return;
    }
    if (target.kind === 'building' && target.workspaceId) {
      setScope({ kind: 'building', workspaceId: target.workspaceId });
      return;
    }
    if (target.kind === 'floor' && target.sessionId) {
      setScope({
        kind: 'room',
        sessionId: target.sessionId,
        workspaceId: building ? building.workspaceId : '',
      });
      return;
    }
    if (target.kind === 'member' && target.sessionId) {
      if (ctx && ctx.uiWorkspace && typeof ctx.uiWorkspace.openSession === 'function') {
        ctx.uiWorkspace.openSession(target.sessionId);
      }
    }
  }, [building, ctx]);
  activateRef.current = activate;

  // ---- renderer lifecycle ----------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return undefined;
    const renderer = createOfficeRenderer({
      canvas,
      stage,
      onActivate: (target) => { if (activateRef.current) activateRef.current(target); },
      onHover: (target) => setHoverTarget(target || null),
      onLayout: (transform) => {
        const logicalWidth = officeUiNumber(transform.logicalWidth, 0) || OFFICE_DEFAULT_STAGE_WIDTH;
        const logicalHeight = officeUiNumber(transform.logicalHeight, 0) || OFFICE_DEFAULT_STAGE_HEIGHT;
        setLayout((previous) => {
          if (previous
            && previous.scale === transform.scale
            && previous.offsetX === transform.offsetX
            && previous.offsetY === transform.offsetY
            && previous.logicalWidth === logicalWidth
            && previous.logicalHeight === logicalHeight) return previous;
          return {
            scale: transform.scale,
            offsetX: transform.offsetX,
            offsetY: transform.offsetY,
            logicalWidth,
            logicalHeight,
          };
        });
        setViewport((previous) => (
          previous.w === logicalWidth && previous.h === logicalHeight
            ? previous
            : { w: logicalWidth, h: logicalHeight }
        ));
      },
    });
    rendererRef.current = renderer;
    renderer.setNight(nightRef.current);

    const motionQuery = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
    const applyMotion = () => renderer.setReducedMotion(!!(motionQuery && motionQuery.matches));
    applyMotion();
    if (motionQuery) {
      if (typeof motionQuery.addEventListener === 'function') {
        motionQuery.addEventListener('change', applyMotion);
      } else if (typeof motionQuery.addListener === 'function') {
        motionQuery.addListener(applyMotion);
      }
    }
    if (sceneRef.current) renderer.setScene(sceneRef.current, { transition: false });

    return () => {
      if (motionQuery) {
        if (typeof motionQuery.removeEventListener === 'function') {
          motionQuery.removeEventListener('change', applyMotion);
        } else if (typeof motionQuery.removeListener === 'function') {
          motionQuery.removeListener(applyMotion);
        }
      }
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []);

  // Scene updates: repaint on data change without the black transition; only a real
  // view change (city <-> building <-> room) animates.
  useEffect(() => {
    const renderer = rendererRef.current;
    const previousScene = sceneRef.current;
    sceneRef.current = scene;
    if (!renderer) return;
    const viewChanged = !previousScene || !scene || previousScene.kind !== scene.kind;
    renderer.setScene(scene, { transition: viewChanged });
    if (viewChanged) setHoverTarget(null);
  }, [scene]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (renderer) renderer.setNight(night);
  }, [night]);

  // ---- keyboard --------------------------------------------------------------
  useEffect(() => {
    const onKeyDown = (event) => {
      if (!event || event.defaultPrevented || event.isComposing) return;
      const target = event.target;
      const typing = !!target && (
        target.tagName === 'INPUT'
        || target.tagName === 'TEXTAREA'
        || target.tagName === 'SELECT'
        || target.isContentEditable === true
      );
      if (event.key === 'Escape') {
        if (helpOpen) {
          event.preventDefault();
          closeHelp();
          return;
        }
        if (scope.kind !== 'city') {
          event.preventDefault();
          goUp();
        }
        return;
      }
      if (typing || scrollMaxRef.current <= 0) return;
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setScroll((value) => officeUiClampScroll(value + delta, scrollMaxRef.current));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [helpOpen, scope.kind, goUp, closeHelp]);

  // Wheel over the stage pages the tower/floor plan the same way the arrows do.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    let accumulated = 0;
    let lastStep = 0;
    const onWheel = (event) => {
      if (!event || scrollMaxRef.current <= 0) return;
      const delta = officeUiNumber(event.deltaY, 0);
      if (delta === 0) return;
      accumulated += delta;
      if (Math.abs(accumulated) < 30) return;
      const now = Date.now();
      if (now - lastStep < 150) return;
      lastStep = now;
      const step = accumulated > 0 ? 1 : -1;
      accumulated = 0;
      setScroll((value) => officeUiClampScroll(value + step, scrollMaxRef.current));
    };
    stage.addEventListener('wheel', onWheel, { passive: true });
    return () => stage.removeEventListener('wheel', onWheel);
  }, []);

  // The renderer listens on the stage; keep its pointer handling out of the help card.
  useEffect(() => {
    const node = helpLayerRef.current;
    if (!helpOpen || !node) return undefined;
    const stop = (event) => event.stopPropagation();
    node.addEventListener('pointerdown', stop);
    node.addEventListener('pointermove', stop);
    node.addEventListener('wheel', stop);
    return () => {
      node.removeEventListener('pointerdown', stop);
      node.removeEventListener('pointermove', stop);
      node.removeEventListener('wheel', stop);
    };
  }, [helpOpen]);

  // ---- derived view data -----------------------------------------------------
  const totals = model && model.totals ? model.totals : {};
  const sceneKind = officeUiSafeViewKind(scene && scene.kind ? scene.kind : scope.kind);
  const hoverKey = officeUiHoverKey(hoverTarget);
  const loading = phase !== 'ready';

  // Header subtitle: a plain host-style status line on the city view, breadcrumbs
  // deeper in. No self-made pills — the header keeps the host page rhythm.
  const statsLine = officeUiFormat(t('header.stats'), {
    workspaces: officeUiNumber(totals.workspaces, 0),
    sessions: officeUiNumber(totals.sessions, 0),
    running: officeUiNumber(totals.running, 0),
    teams: officeUiNumber(totals.teams, 0),
  });
  const roomTitle = room ? officeUiSessionName(room.title, t) : t('session.untitled');
  const workspaceTitleText = building
    ? officeUiWorkspaceName(building.title, building.ungrouped === true, t)
    : room && room.workspaceTitle
      ? officeUiClip(room.workspaceTitle, 30)
      : t('workspace.untitled');
  const breadcrumbs = [{
    key: 'city',
    label: t('nav.home'),
    current: scope.kind === 'city',
    onClick: scope.kind === 'city' ? null : () => setScope({ kind: 'city' }),
  }];
  if (scope.kind !== 'city') {
    breadcrumbs.push({
      key: 'building',
      label: workspaceTitleText,
      current: scope.kind === 'building',
      onClick: scope.kind === 'building'
        ? null
        : () => setScope(building ? { kind: 'building', workspaceId: building.workspaceId } : { kind: 'city' }),
    });
  }
  if (scope.kind === 'room') {
    breadcrumbs.push({ key: 'room', label: roomTitle, current: true, onClick: null });
  }

  const noSessions = officeUiNumber(totals.sessions, 0) === 0;
  const noWorkspaces = officeUiNumber(totals.workspaces, 0) === 0;
  const buildingSessionCount = building
    ? officeUiNumber(building.sessionCount, Array.isArray(building.floors) ? building.floors.length : 0)
    : 0;
  const showCityEmpty = !loading && sceneKind === 'city' && noSessions;
  const showBuildingEmpty = !loading && sceneKind === 'building' && !!building && buildingSessionCount === 0;
  const footerHint = t(`legend.click.${sceneKind}`);

  // ---- label layer -----------------------------------------------------------
  const labelNodes = [];
  if (scene && Array.isArray(scene.labels) && layout) {
    for (let index = 0; index < scene.labels.length; index += 1) {
      const label = scene.labels[index];
      if (!label || typeof label !== 'object') continue;
      const content = officeUiLabelContent(label, t);
      if (!content || (!content.title && !content.sub)) continue;
      const key = officeUiLabelKey(label);
      const hovered = key !== '' && key === hoverKey;
      const classes = ['po-label'];
      if (label.kind) classes.push(`po-label--${label.kind}`);
      if (label.anchor === 'right') classes.push('po-label--right-anchor');
      if (content.tone === 'on') classes.push('is-on');
      if (hovered) classes.push('is-hover');
      labelNodes.push(h('div', {
        key: `label-${index}-${label.kind || 'plain'}`,
        className: classes.join(' '),
        style: officeUiLabelLayout(label, layout),
        'aria-hidden': 'true',
      }, [
        content.title ? h('span', { key: 'title', className: 'po-label-title' }, [
          content.tone === 'on' ? h('i', { key: 'led', className: 'po-label-led' }) : null,
          h('span', { key: 'text', className: 'po-label-text' }, content.title),
        ]) : null,
        (content.alwaysSub || hovered) && content.sub
          ? h('span', { key: 'sub', className: 'po-label-sub' }, content.sub)
          : null,
        hovered && content.detail
          ? h('span', { key: 'detail', className: 'po-label-detail' }, content.detail)
          : null,
      ]));
    }
  }

  // ---- render ----------------------------------------------------------------
  return h('div', { className: 'po-page', 'data-plugin': OFFICE_PANEL_ID }, [
    h('header', { key: 'head', className: 'po-head' }, [
      h('div', { key: 'main', className: 'po-head-main' }, [
        h('h1', { key: 'title', className: 'po-title' }, t('panel.title')),
        scope.kind === 'city'
          ? h('p', { key: 'sub', className: 'po-subtitle' }, statsLine)
          : h('nav', { key: 'crumbs', className: 'po-crumbs', 'aria-label': t('nav.breadcrumb') },
            breadcrumbs.map((crumb, index) => h(React.Fragment, { key: crumb.key }, [
              index > 0
                ? h('span', { key: 'sep', className: 'po-crumb-sep', 'aria-hidden': 'true' }, '/')
                : null,
              crumb.current
                ? h('span', {
                  key: 'current',
                  className: 'po-crumb is-current',
                  'aria-current': 'page',
                  title: crumb.label,
                }, crumb.label)
                : h('button', {
                  key: 'link',
                  type: 'button',
                  className: 'po-crumb',
                  title: crumb.label,
                  onClick: crumb.onClick,
                }, crumb.label),
            ]))),
      ]),
      h('div', { key: 'actions', className: 'po-head-actions' }, [
        scope.kind !== 'city'
          ? h(OfficeBackButton, {
            key: 'back',
            label: t('action.back'),
            onClick: goUp,
          })
          : null,
        h(OfficeSegmentedControl, {
          key: 'display',
          id: 'pixel-office-display-header',
          className: 'po-head-seg',
          label: t('display.label'),
          value: displayMode,
          onChange: officeUiWriteDisplayMode,
          options: OFFICE_DISPLAY_MODES.map((mode) => ({
            value: mode,
            label: t(`display.${mode}`),
            title: t(`display.${mode}Hint`),
          })),
        }),
        h(OfficeTextButton, {
          key: 'help',
          id: 'pixel-office-help',
          variant: 'outline',
          icon: h(OfficeIconHelp),
          title: t('action.help'),
          'aria-haspopup': 'dialog',
          'aria-expanded': helpOpen ? 'true' : 'false',
          onClick: () => setHelpOpen((value) => !value),
        }, t('action.help')),
      ]),
    ]),
    h('div', { key: 'stage', className: 'po-stage', ref: stageRef, 'data-scene': sceneKind }, [
      h('canvas', {
        key: 'canvas',
        className: 'po-canvas',
        ref: canvasRef,
        role: 'img',
        'aria-label': t('canvas.label'),
      }),
      h('div', { key: 'labels', className: 'po-labels', 'aria-hidden': 'true' }, labelNodes),
      loading
        ? h('div', { key: 'loading', className: 'po-stage-state' }, h('div', { className: 'po-empty-card' }, [
          h('div', { key: 'spinner', className: 'po-spinner' }),
          h('h2', { key: 'title', className: 'po-empty-title' }, t('loading')),
          h('p', { key: 'hint', className: 'po-empty-text' }, t('loading.hint')),
        ]))
        : null,
      showCityEmpty
        ? h('div', { key: 'empty-city', className: 'po-stage-state' }, h('div', { className: 'po-empty-card' }, [
          h(OfficeEmptyArt, { key: 'art' }),
          h('h2', { key: 'title', className: 'po-empty-title' }, noWorkspaces ? t('city.empty.title') : t('city.empty.sessionsTitle')),
          h('p', { key: 'hint', className: 'po-empty-text' }, noWorkspaces ? t('city.empty.hint') : t('city.empty.sessionsHint')),
        ]))
        : null,
      showBuildingEmpty
        ? h('div', { key: 'empty-building', className: 'po-stage-state' }, h('div', { className: 'po-empty-card' }, [
          h(OfficeEmptyArt, { key: 'art' }),
          h('h2', { key: 'title', className: 'po-empty-title' }, t('building.empty.title')),
          h('p', { key: 'hint', className: 'po-empty-text' }, t('building.empty.hint')),
        ]))
        : null,
      h(OfficeHelpDialog, {
        key: 'help',
        open: helpOpen,
        layerRef: helpLayerRef,
        t,
        onClose: closeHelp,
      }),
    ]),
    h('footer', { key: 'status', className: 'po-status' }, [
      h('div', { key: 'left', className: 'po-status-left' }, [
        h('span', { key: 'view', className: 'po-status-view' }, t(`view.${sceneKind}`)),
        h('span', { key: 'working', className: 'po-status-item' }, [
          h('i', { key: 'dot', className: 'po-status-dot is-working' }),
          h('span', { key: 'text' }, t('legend.working')),
        ]),
        h('span', { key: 'idle', className: 'po-status-item' }, [
          h('i', { key: 'dot', className: 'po-status-dot' }),
          h('span', { key: 'text' }, t('legend.idle')),
        ]),
      ]),
      h('div', { key: 'right', className: 'po-status-right' }, [
        h('span', { key: 'hint', className: 'po-status-hint' }, footerHint),
        h('span', { key: 'esc', className: 'po-status-hint' }, t('legend.esc')),
      ]),
    ]),
  ]);
}

// ---------------------------------------------------------------------------
// Settings → General row
// ---------------------------------------------------------------------------

function OfficeSettingRow(props) {
  const ctx = props && props.ctx;
  const t = useOfficeLocale(ctx);
  const [mode, setMode] = useState(officeUiReadDisplayMode);

  useEffect(() => officeUiSubscribeDisplay(() => setMode(officeUiReadDisplayMode())), []);

  return h('div', { className: 'po-setting-row' }, [
    h('div', { key: 'text', className: 'po-setting-text' }, [
      h('span', { key: 'label', className: 'po-setting-label' }, t('setting.label')),
      h('span', { key: 'hint', className: 'po-setting-hint' }, t('setting.hint')),
    ]),
    h(OfficeSegmentedControl, {
      key: 'modes',
      id: 'pixel-office-display',
      label: t('setting.label'),
      value: mode,
      onChange: officeUiWriteDisplayMode,
      options: OFFICE_DISPLAY_MODES.map((value) => ({
        value,
        label: t(`display.${value}`),
        title: t(`display.${value}Hint`),
      })),
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Styles — page chrome only, always through --dsw-alias-* theme tokens
// ---------------------------------------------------------------------------

const OFFICE_CSS = `
.po-page{height:100%;min-height:0;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;overflow:hidden;box-sizing:border-box}

/* ---- Page header: host page rhythm (title + status line / breadcrumbs) ---- */
.po-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:14px 20px 10px;flex:none;flex-wrap:wrap;box-sizing:border-box}
.po-head-main{min-width:0;flex:1 1 auto}
.po-title{margin:0;font-size:16px;line-height:24px;font-weight:600;letter-spacing:.01em;color:var(--dsw-alias-label-primary)}
.po-subtitle{margin:2px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.po-crumbs{display:flex;align-items:center;gap:6px;margin-top:2px;min-width:0;overflow:hidden;font-size:12px;line-height:18px}
.po-crumb{max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:0;background:transparent;padding:0;font:inherit;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);cursor:pointer}
.po-crumb:hover{color:var(--dsw-alias-label-primary);text-decoration:underline;text-underline-offset:2px}
.po-crumb.is-current{color:var(--dsw-alias-label-primary);cursor:default;text-decoration:none}
.po-crumb-sep{flex:none;color:var(--dsw-alias-label-tertiary)}
.po-head-actions{display:flex;align-items:center;gap:8px;flex:none}

/* Host Button geometry — copied from the host Button primitive (36px md / 28px sm, 12px radius) */
.po-btn{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:4px;border:none;border-radius:var(--dsw-radius-md);cursor:pointer;font:inherit;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary);background:transparent;padding:0 14px;white-space:nowrap;transition:background-color .15s ease,color .15s ease,opacity .15s ease}
.po-btn--md{height:36px}
.po-btn--sm{height:28px;font-size:12px;line-height:18px;padding:0 10px;border-radius:var(--dsw-radius-sm)}
.po-btn--ghost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.po-btn--ghost:active:not(:disabled){background:var(--dsw-alias-interactive-bg-active)}
.po-btn--outline{border:.5px solid var(--dsw-alias-border-l3);background:transparent}
.po-btn--outline:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.po-btn:disabled{cursor:not-allowed;opacity:.4}
.po-btn-icon{display:inline-flex;width:16px;height:16px;flex:none;align-items:center;justify-content:center}
.po-btn-label{display:inline-block}

/* Header segmented control keeps its native size; only placement is ours. */
.po-head-seg{flex:none}
.po-page .po-btn:focus-visible,
.po-page .po-seg-tab:focus-visible,
.po-page .po-modal-close:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:2px}

/* Native padding/height stay with the primitives; fallbacks use the po-btn rules. */

/* Stage + canvas (dark display area; the renderer fills it edge to edge) */
.po-stage{position:relative;flex:1 1 0;min-height:0;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#10151f}
.po-canvas{display:block;image-rendering:pixelated;image-rendering:crisp-edges;background:#10151f}

/* DOM label layer over the pixel art (a HUD, so it keeps fixed dark-chip colours) */
.po-labels{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:3}
.po-label{position:absolute;display:flex;flex-direction:column;gap:1px;box-sizing:border-box;padding:2px 6px;border-radius:5px;background:rgba(13,19,28,.8);border:1px solid rgba(241,233,215,.16);color:#f2eee2;font-size:11px;line-height:1.3;font-weight:500;text-align:center;white-space:nowrap;text-shadow:0 1px 0 rgba(0,0,0,.35);box-shadow:0 1px 2px rgba(0,0,0,.35);overflow:hidden;animation:po-label-in .18s ease-out both;transition:background-color .12s ease,color .12s ease,border-color .12s ease,opacity .12s ease}
.po-label-title{display:flex;align-items:center;justify-content:center;gap:4px;min-width:0}
.po-label-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.po-label-led{width:4px;height:4px;flex:none;border-radius:1px;background:#ffd36b;box-shadow:0 0 4px rgba(255,211,107,.9)}
.po-label-sub{overflow:hidden;text-overflow:ellipsis;font-size:.86em;font-weight:400;line-height:1.3;color:rgba(242,238,226,.66)}
.po-label-detail{overflow:hidden;text-overflow:ellipsis;font-size:.82em;font-weight:400;line-height:1.3;color:rgba(255,211,107,.9)}
.po-label.is-hover{background:rgba(255,211,107,.95);border-color:rgba(18,23,32,.85);color:#161b24;text-shadow:none;box-shadow:0 4px 12px rgba(0,0,0,.4);z-index:9}
.po-label.is-hover .po-label-sub,.po-label.is-hover .po-label-detail{color:rgba(22,27,36,.72)}
.po-label.is-hover .po-label-led{background:#161b24;box-shadow:none}
.po-label--right-anchor{text-align:left}
.po-label--right-anchor .po-label-title{justify-content:flex-start}
.po-label--tower-title{z-index:4;padding:3px 9px;font-size:12px;font-weight:600;letter-spacing:.01em;background:rgba(13,19,28,.88);border-color:rgba(255,211,107,.42)}
.po-label--workspace{padding:2px 7px;background:rgba(13,19,28,.74);border-color:rgba(241,233,215,.13)}
.po-label--workspace-title{z-index:4;padding:3px 10px;font-size:12px;font-weight:600;background:rgba(13,19,28,.88);border-color:rgba(255,211,107,.35)}
.po-label--office{padding:2px 6px;background:rgba(13,19,28,.64)}
.po-label--office .po-label-sub{font-size:.8em}
.po-label--boss{padding:3px 8px;background:rgba(30,23,14,.88);border-color:rgba(255,211,107,.55)}
.po-label--member{padding:1px 6px;background:rgba(13,19,28,.58);border-color:rgba(241,233,215,.1);opacity:.94}
.po-label--whiteboard{padding:2px 8px;border-style:dashed;background:rgba(13,19,28,.55);opacity:.92}
@keyframes po-label-in{from{opacity:0}to{opacity:1}}

/* Loading / empty stage states (host card geometry above the canvas) */
.po-stage-state{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;padding:24px;pointer-events:none;background:rgba(8,12,19,.28);animation:po-fade-in .16s ease-out}
.po-empty-card{display:flex;flex-direction:column;align-items:center;gap:6px;max-width:340px;padding:24px;border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);text-align:center;box-shadow:0 12px 32px rgba(0,0,0,.24);box-sizing:border-box}
.po-empty-title{margin:0;font-size:16px;line-height:24px;font-weight:500}
.po-empty-text{margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.po-empty-art{color:var(--dsw-alias-label-secondary);margin-bottom:2px}
.po-spinner{width:18px;height:18px;margin-bottom:2px;border-radius:50%;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-brand-primary);animation:po-spin .8s linear infinite}
@keyframes po-spin{to{transform:rotate(360deg)}}
@keyframes po-fade-in{from{opacity:0}to{opacity:1}}

/* Help dialog — host Modal geometry (ui-primitives Modal.module.css) */
.po-modal{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--dsw-alias-bg-mask-1);animation:po-fade-in .16s ease-out;box-sizing:border-box}
.po-modal-card{position:relative;z-index:1;display:flex;flex-direction:column;width:min(440px,100%);max-height:100%;overflow:hidden;border-radius:var(--dsw-radius-panel,var(--dsw-radius-lg));background:var(--dsw-alias-bg-layer-2);box-shadow:0 24px 64px rgba(0,0,0,.28),0 2px 8px rgba(0,0,0,.16);animation:po-fade-in .16s ease-out}
.po-modal-header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:22px 14px 12px 24px;flex:none}
.po-modal-title{margin:0;font-size:16px;line-height:24px;font-weight:500;color:var(--dsw-alias-label-primary)}
.po-modal-close{flex:none;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:none;border-radius:var(--dsw-radius-sm);background:transparent;cursor:pointer;color:var(--dsw-alias-label-secondary);transition:background-color .12s ease,color .12s ease}
.po-modal-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.po-modal-body{display:flex;flex-direction:column;gap:16px;padding:0 24px 8px;min-height:0;overflow-y:auto}
.po-modal-subtitle{margin:0;font-size:14px;line-height:22px;color:var(--dsw-alias-label-secondary)}
.po-modal-sections{display:flex;flex-direction:column;gap:14px}
.po-modal-section{display:flex;flex-direction:column;gap:4px}
.po-modal-section-title{display:flex;align-items:center;gap:8px;margin:0;font-size:14px;line-height:22px;font-weight:500;color:var(--dsw-alias-label-primary)}
.po-modal-section-icon{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;flex:none;color:var(--dsw-alias-label-secondary)}
.po-modal-section-text{margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.po-modal-tips{margin:0;padding:10px 12px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1)}
.po-modal-tips-title{display:block;font-size:12px;line-height:18px;font-weight:600;color:var(--dsw-alias-label-primary)}
.po-modal-tips-text{margin:2px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.po-modal-footer{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:16px 24px 24px;flex:none}

/* Bottom status line: low-contrast host footer rhythm, no card background */
.po-status{display:flex;align-items:center;justify-content:space-between;gap:12px;height:28px;padding:0 20px;border-top:.5px solid var(--dsw-alias-border-l1);font-size:11.5px;line-height:18px;color:var(--dsw-alias-label-tertiary);flex:none;box-sizing:border-box;overflow:hidden}
.po-status-left{display:flex;align-items:center;gap:12px;min-width:0;overflow:hidden}
.po-status-view{font-weight:500;white-space:nowrap}
.po-status-item{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.po-status-dot{position:relative;display:inline-block;flex:none;width:10px;height:10px;color:var(--dsw-alias-state-idle-primary)}
.po-status-dot::after{content:'';position:absolute;inset:20%;border-radius:50%;background:currentColor}
.po-status-dot.is-working{color:var(--dsw-alias-state-warn-primary)}
.po-status-range{white-space:nowrap;font-variant-numeric:tabular-nums}
.po-status-right{display:flex;align-items:center;gap:12px;min-width:0;overflow:hidden}
.po-status-hint{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--dsw-alias-label-dimmed)}

/* Settings row — host settings list geometry (session-kanban .skb-settings-row) */
.po-setting-row{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:16px 0;border-bottom:.5px solid var(--dsw-alias-border-l2);box-sizing:border-box}
.po-setting-text{display:flex;flex:1;flex-direction:column;min-width:0}
.po-setting-label{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:20px}
.po-setting-hint{color:var(--dsw-alias-label-secondary);margin-top:4px;font-size:12px;line-height:18px}

/* Host SegmentedControl geometry (ui-primitives SegmentedControl.module.css) */
.po-seg-control{position:relative;display:inline-grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:2px;padding:4px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-interactive-bg-hover);flex:none}
.po-seg-indicator{position:absolute;top:4px;left:4px;width:calc((100% - 8px - 2px * (var(--po-seg-count) - 1)) / var(--po-seg-count));height:calc(100% - 8px);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);box-shadow:0 1px 2px rgba(0,0,0,.14);transform:translateX(calc(var(--po-seg-index) * (100% + 2px)));transition:transform 160ms ease;pointer-events:none}
.po-seg-tab{position:relative;z-index:1;box-sizing:border-box;height:28px;padding:0 16px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;line-height:20px;font-weight:500;white-space:nowrap;cursor:pointer;transition:color 120ms ease}
.po-seg-tab:hover,.po-seg-tab[aria-checked="true"]{color:var(--dsw-alias-label-primary)}
.po-seg-tab:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}

/* Narrow screens: keep the canvas first, shed chrome progressively */
@media (max-width: 1080px){.po-status-view{display:none}}
@media (max-width: 900px){
  .po-head{padding:12px 16px 8px}
  .po-btn--md{height:28px;font-size:12px;line-height:18px;padding:0 10px;border-radius:var(--dsw-radius-sm)}
  .po-status{padding:0 16px}
  .po-status-hint{display:none}
}
@media (max-width: 760px){
  .po-head{padding:10px 14px 8px;gap:10px}
  .po-status{padding:0 14px}
  .po-status-range{display:none}
  .po-modal{padding:16px}
  .po-modal-header{padding:18px 12px 10px 20px}
  .po-modal-body{padding:0 20px 8px}
  .po-modal-footer{padding:14px 20px 20px}
}
@media (max-width: 560px){
  .po-status{display:none}
  .po-title{font-size:15px;line-height:22px}
  .po-head{gap:8px}
  .po-modal-card{width:100%}
}
@media (prefers-reduced-motion: reduce){
  .po-label,.po-modal,.po-modal-card,.po-stage-state{animation:none}
  .po-spinner{animation-duration:2.4s}
  .po-seg-indicator{transition:none}
}`;
