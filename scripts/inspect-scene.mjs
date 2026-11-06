// Dev helper (Lead-only): dump the city scene's page fields for one viewport so the
// pagination contract can be checked without a browser.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = [
  'src/art-core.js', 'src/art-city.js', 'src/art-building.js', 'src/art-room.js',
  'src/model.js', 'src/strings.js', 'src/render.js', 'src/ui.js', 'src/app.js',
];
const body = SOURCES.map((relative) => readFileSync(resolve(ROOT, relative), 'utf8')).join('\n');
const mockReact = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  Fragment: 'Fragment',
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
  useRef: (value) => ({ current: value }),
  useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
  useEffect: () => {},
  useSyncExternalStore: (_s, getSnapshot) => getSnapshot(),
};
const modules = new Function('require', 'window', 'document', 'performance',
  `const React = require('react');
   const { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } = React;
   const h = React.createElement;
${body}
   return { buildOfficeModel, buildCityScene, selectCity, paintCityScene };`)(
  () => mockReact,
  { localStorage: { getItem: () => null, setItem: () => {} }, addEventListener: () => {}, removeEventListener: () => {} },
  { createElement: () => ({ style: {}, getContext: () => ({}) }) },
  { now: () => Date.now() },
);

const makeSession = (id, index) => ({
  id,
  title: `session-${index}`,
  running: index % 3 === 0,
  updatedAt: Date.now() - index * 1000,
});
const total = Number(process.argv[2] || 12);
const width = Number(process.argv[3] || 900);
const height = Number(process.argv[4] || 340);
const ids = Array.from({ length: total }, (_, index) => `s${index}`);
const byId = Object.fromEntries(ids.map((id, index) => [id, makeSession(id, index)]));
const workspaceSnapshot = {
  phase: 'ready',
  items: ids.map((id, index) => ({
    workspaceId: `ws-${index}`,
    title: `workspace-${index + 1}`,
    path: `D:/ws-${index}`,
    sessionIds: [id],
  })),
  archivedSessionIds: [],
  pinnedSessionIds: [],
};
const model = modules.buildOfficeModel({ phase: 'ready', ids, byId, projectionsBySession: {} }, workspaceSnapshot);
const city = modules.selectCity(model);
const viewport = { w: width, h: height };
const first = modules.buildCityScene(city, viewport, { scroll: 0 });
console.log('viewport', viewport, 'total', total);
console.log('p0:', {
  scrollMax: first.scrollMax,
  pageSize: first.scrollPageSize,
  scrollTotal: first.scrollTotal,
  scrollRange: first.scrollRange,
  scrollVisible: first.scrollVisible,
  scroll: first.scroll,
  tower: {
    atTop: first.tower.atTop,
    atBottom: first.tower.atBottom,
    rowH: first.tower.rowH,
    visibleRows: first.tower.visibleRows,
    rowsTop: first.tower.rowsTop,
    bodyBottom: first.tower.bodyBottom,
    streetY: first.tower.streetY,
    lobbyY: first.tower.lobbyY,
  },
  floorLabels: (first.labels || []).filter((label) => label.kind === 'workspace').map((label) => label.data.floorNumber),
});
const lastScroll = first.scrollMax || 0;
const last = modules.buildCityScene(city, viewport, { scroll: lastScroll });
console.log('last:', {
  scrollMax: last.scrollMax,
  pageSize: last.scrollPageSize,
  scrollRange: last.scrollRange,
  scrollVisible: last.scrollVisible,
  tower: {
    atTop: last.tower.atTop,
    atBottom: last.tower.atBottom,
    rowH: last.tower.rowH,
    visibleRows: last.tower.visibleRows,
    rowsTop: last.tower.rowsTop,
    bodyBottom: last.tower.bodyBottom,
    streetY: last.tower.streetY,
    lobbyY: last.tower.lobbyY,
  },
  floorLabels: (last.labels || []).filter((label) => label.kind === 'workspace').map((label) => label.data.floorNumber),
  floorHits: (last.hits || []).filter((hit) => hit.target && hit.target.kind === 'building').length,
});

// Row geometry + which rows actually got a dark number plate painted.
console.log('rows:', (last.tower.rows || []).map((row) => ({ floor: row.floorNumber, y: row.y, h: row.h })));
const calls = [];
const mock = {
  fillStyle: '#000',
  globalAlpha: 1,
  fillRect(x, y, width, height) { calls.push({ x, y, w: width, h: height, color: this.fillStyle }); },
  beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, ellipse() {}, fill() {}, stroke() {},
  save() {}, restore() {}, translate() {}, scale() {}, rotate() {}, clip() {},
  createLinearGradient() { return { addColorStop() {} }; },
  createRadialGradient() { return { addColorStop() {} }; },
  createPattern() { return null; },
  measureText(text) { return { width: String(text || '').length * 5 }; },
  drawImage() {}, setTransform() {}, clearRect() {}, fillText() {},
};
modules.paintCityScene(mock, last, { time: 0, night: false, hover: null, page: 0, reducedMotion: false });
const paint = last.floorPaint || {};
const plateCalls = calls.filter((call) => (
  call.color === '#2f3542'
  && call.x === Math.round(paint.plateX)
  && call.w === Math.round(paint.plateW)
));
console.log('plate paints:', plateCalls.map((call) => ({ x: call.x, y: call.y, w: call.w, h: call.h })));
console.log('plateX/plateW:', paint.plateX, paint.plateW);

