/**
 * Offline integration check for the pixel office.
 *
 * Loads the real src/*.js (the same concatenation scripts/build.mjs emits), runs the
 * pure model over recorded fixtures, then builds and paints every scene for a spread of
 * viewports, scroll positions and day/night states against a recording canvas mock.
 *
 * This is a geometry/contract test, not visual verification: it catches undefined
 * references, NaN coordinates, out-of-canvas hits, label crashes and runaway painters
 * before the bundle reaches the browser.
 *
 *   node scripts/verify.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = [
  'src/art-core.js',
  'src/art-city.js',
  'src/art-building.js',
  'src/art-room.js',
  'src/model.js',
  'src/strings.js',
  'src/render.js',
  'src/ui.js',
  'src/app.js',
];

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

// ---------------------------------------------------------------- canvas mock
function createCanvasMock() {
  const ops = { fillRect: 0, fillText: 0, ellipse: 0 };
  const bad = [];
  const ctx = {
    fillStyle: '#000',
    strokeStyle: '#000',
    globalAlpha: 1,
    font: '8px monospace',
    textBaseline: 'top',
    textAlign: 'left',
    lineWidth: 1,
    imageSmoothingEnabled: false,
    fillRect(x, y, width, height) {
      ops.fillRect += 1;
      if (![x, y, width, height].every((value) => Number.isFinite(value))) bad.push(`fillRect(${x},${y},${width},${height})`);
      if (width < 0 || height < 0) bad.push(`negative fillRect ${width}x${height}`);
    },
    fillText(text, x, y) {
      ops.fillText += 1;
      if (![x, y].every((value) => Number.isFinite(value))) bad.push(`fillText(${x},${y})`);
    },
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    ellipse(x, y, rx, ry) {
      ops.ellipse += 1;
      if (![x, y, rx, ry].every((value) => Number.isFinite(value))) bad.push(`ellipse(${x},${y},${rx},${ry})`);
    },
    fill() {},
    stroke() {},
    save() {},
    restore() {},
    translate() {},
    scale() {},
    rotate() {},
    clip() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    createPattern() { return null; },
    measureText(text) { return { width: String(text == null ? '' : text).length * 5 }; },
    drawImage() {},
    setTransform() {},
    clearRect() {},
  };
  return { ctx, ops, bad };
}

// ---------------------------------------------------------------- load sources
const body = SOURCES.map((relative) => {
  const absolute = resolve(ROOT, relative);
  if (!existsSync(absolute)) throw new Error(`missing source ${relative}`);
  return readFileSync(absolute, 'utf8').replace(/^\uFEFF/, '');
}).join('\n');

const mockReact = {
  createElement(type, props, ...children) {
    return { type, props: props || {}, children };
  },
  Fragment: 'Fragment',
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
  useRef: (value) => ({ current: value }),
  useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
  useEffect: () => {},
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
};

const modules = new Function(
  'require',
  'window',
  'document',
  'performance',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'CustomEvent',
  `const React = require('react');
   const { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } = React;
   const h = React.createElement;
${body}
   return { inject, apply, buildOfficeModel, selectCity, selectBuilding, selectRoom,
     buildCityScene, paintCityScene, buildBuildingScene, paintBuildingScene,
     buildRoomScene, paintRoomScene, OFFICE_STRINGS, OFFICE_CSS, officeComputeViewport };`,
)(
  (name) => {
    if (name !== 'react') throw new Error(`unexpected require(${name})`);
    return mockReact;
  },
  {
    localStorage: {
      getItem: () => null,
      setItem: () => {},
    },
    dispatchEvent: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    innerHeight: 800,
  },
  {
    createElement: () => ({ style: {}, getContext: () => createCanvasMock().ctx, appendChild() {}, head: { appendChild() {} }, dataset: {} }),
    head: { appendChild() {} },
  },
  { now: () => Date.now() },
  () => 0,
  () => {},
  function CustomEvent() {},
);

// ---------------------------------------------------------------- fixtures
const NOW = Date.now();
const todo = (content, status) => ({ content, status });
const sessionsById = {
  boss: {
    id: 'boss',
    title: '重构登录流程并接入新网关',
    running: true,
    updatedAt: NOW,
    origin: 'main',
    projectionValues: {
      agentTeam: {
        members: [
          { id: 'boss', name: 'Marvis', role: 'lead' },
          { id: 'dev_fe', name: '前端林', role: 'teammate' },
          { id: 'dev_be', name: '后端周', role: 'teammate' },
          { id: 'rev', name: '评审喵', role: 'teammate' },
        ],
      },
      sessionKanban: {
        request: '重构登录流程并接入新网关',
        reply: '登录页已经接上新接口，正在跑回归测试。',
        todos: [todo('重写登录页', 'completed'), todo('接入网关', 'completed'), todo('回归测试', 'in_progress')],
        done: 2,
        total: 3,
        turn: 4,
        endKind: '',
      },
    },
  },
  dev_fe: { id: 'dev-fe', title: '前端实现', running: true, updatedAt: NOW - 1000, parentId: 'boss', origin: 'subagent' },
  dev_be: { id: 'dev-be', title: '后端实现', running: false, updatedAt: NOW - 2000, parentId: 'boss', origin: 'subagent' },
  rev: { id: 'rev', title: '独立评审', running: false, updatedAt: NOW - 3000, parentId: 'boss', origin: 'subagent' },
  sub1: { id: 'sub1', title: '跑测试的子代理', running: true, updatedAt: NOW - 4000, parentId: 'boss', origin: 'subagent' },
  idle: {
    id: 'idle',
    title: '写周报',
    running: false,
    updatedAt: NOW - 60000,
    projectionValues: { sessionKanban: { request: '帮我写周报', reply: '好的，已经写好。', todos: [], done: 0, total: 0, turn: 1 } },
  },
  small: { id: 'small', title: '查个资料', running: false, updatedAt: NOW - 90000 },
  orphan: { id: 'orphan', title: '没有工作区的会话', running: false, updatedAt: NOW - 120000 },
  archived: { id: 'archived', title: '已归档', running: false, updatedAt: NOW - 900000 },
};
// A second workspace with many sessions to exercise building scroll.
const manyIds = [];
for (let index = 0; index < 11; index += 1) {
  const id = `many-${index}`;
  manyIds.push(id);
  sessionsById[id] = {
    id,
    title: `批量任务 #${index + 1}`,
    running: index % 4 === 0,
    updatedAt: NOW - index * 10000,
    projectionValues: index === 0
      ? {
        agentTeam: {
          members: [
            { id, name: '班长', role: 'lead' },
            { id: 'many-help', name: '帮手', role: 'teammate' },
          ],
        },
      }
      : undefined,
  };
}
const sessionSnapshot = {
  phase: 'ready',
  ids: Object.keys(sessionsById),
  byId: sessionsById,
  projectionsBySession: {},
};
const workspaceSnapshot = {
  phase: 'ready',
  items: [
    { workspaceId: 'ws-office', title: 'agent-office', path: 'D:/Program/agent-office', sessionIds: ['boss', 'idle', 'small'] },
    { workspaceId: 'ws-many', title: '批处理工作区', path: 'D:/Program/batch', sessionIds: manyIds },
    { workspaceId: 'ws-empty', title: '空工作区', path: 'D:/Program/empty', sessionIds: [] },
  ],
  archivedSessionIds: ['archived'],
  pinnedSessionIds: [],
};

const model = modules.buildOfficeModel(sessionSnapshot, workspaceSnapshot);

// ---------------------------------------------------------------- model assertions
check(modules.inject.length > 0, 'inject list is empty');
check(typeof modules.apply === 'function', 'apply is not a function');
check(typeof modules.OFFICE_CSS === 'string' && modules.OFFICE_CSS.length > 500, 'OFFICE_CSS missing');
const zhKeys = Object.keys(modules.OFFICE_STRINGS.zh).sort();
const enKeys = Object.keys(modules.OFFICE_STRINGS.en).sort();
check(zhKeys.length === enKeys.length && zhKeys.every((key, index) => key === enKeys[index]), 'zh/en locale keys differ');
const allKeys = new Set(Object.keys(modules.OFFICE_STRINGS.zh));
check(allKeys.has('panel.title') && allKeys.has('office.sub') && allKeys.has('help.title'), 'locale core keys missing');

check(model.buildings.length === 4, `expected 4 buildings (3 workspaces + ungrouped), got ${model.buildings.length}`);
const office = modules.selectBuilding(model, 'ws-office');
check(!!office, 'selectBuilding(ws-office) returned null');
check(office && office.floors.length === 3, `ws-office floors: expected 3, got ${office && office.floors.length}`);
const bossFloor = office && office.floors.find((floor) => floor.sessionId === 'boss');
check(!!bossFloor, 'boss floor missing');
check(bossFloor && bossFloor.workers.length === 4, `boss floor workers: expected 4, got ${bossFloor && bossFloor.workers.length}`);
check(!!model.buildings.find((building) => building.ungrouped), 'ungrouped building missing');
const cityModel = modules.selectCity(model);
check(cityModel.buildings.length === model.buildings.length, 'selectCity building count mismatch');

const roomBoss = modules.selectRoom(model, 'boss');
check(!!roomBoss && roomBoss.boss && roomBoss.staff.length === 4, 'boss room shape mismatch');
const roomIdle = modules.selectRoom(model, 'idle');
check(!!roomIdle && roomIdle.staff.length === 0, 'idle room should have no staff');
check(modules.selectRoom(model, 'missing') === null, 'selectRoom(missing) should be null');

// ---------------------------------------------------------------- scene assertions
const viewports = [
  { w: 480, h: 320 },
  { w: 640, h: 360 },
  { w: 700, h: 800 },
  { w: 900, h: 500 },
  { w: 900, h: 800 },
  { w: 1200, h: 700 },
];
const anim = (night) => ({ time: 123456, night, hover: null, page: 0, reducedMotion: false });

function assertScene(scene, viewport, label, allowEmptyHits) {
  check(!!scene, `${label}: scene is null`);
  if (!scene) return;
  check(scene.w === viewport.w && scene.h === viewport.h, `${label}: scene ${scene.w}x${scene.h} != viewport ${viewport.w}x${viewport.h}`);
  check(Array.isArray(scene.hits), `${label}: hits must be an array`);
  if (!allowEmptyHits) check((scene.hits || []).length > 0, `${label}: no hits`);
  for (const hit of scene.hits || []) {
    check([hit.x, hit.y, hit.w, hit.h].every((value) => Number.isFinite(value)), `${label}: non-finite hit`);
    check(hit.w > 0 && hit.h > 0, `${label}: non-positive hit`);
    check(hit.x >= -2 && hit.y >= -2 && hit.x + hit.w <= viewport.w + 2 && hit.y + hit.h <= viewport.h + 2,
      `${label}: hit out of canvas (${hit.x},${hit.y},${hit.w},${hit.h})`);
    check(!!hit.target && typeof hit.target.kind === 'string', `${label}: hit without target`);
  }
  for (const item of scene.labels || []) {
    check([item.x, item.y].every((value) => Number.isFinite(value)), `${label}: non-finite label coordinate`);
    check(typeof item.kind === 'string', `${label}: label without kind`);
    check(typeof item.text === 'string', `${label}: label text must be a string`);
  }
  if (scene.scrollMax != null) {
    check(Number.isInteger(scene.scrollMax) && scene.scrollMax >= 0, `${label}: bad scrollMax ${scene.scrollMax}`);
  }
}

function exerciseScene(build, paint, viewport, label, allowEmptyHits) {
  const scene = build();
  assertScene(scene, viewport, label, allowEmptyHits);
  if (!scene) return null;
  const maxScroll = scene.scrollMax || 0;
  const scrolls = new Set([0, maxScroll, Math.floor(maxScroll / 2)]);
  for (const scroll of scrolls) {
    if (scroll < 0 || scroll > maxScroll) continue;
    const scrolled = build();
    assertScene(scrolled, viewport, `${label} scroll=${scroll}`, allowEmptyHits);
    for (const night of [false, true]) {
      const mock = createCanvasMock();
      try {
        paint(mock.ctx, scrolled, anim(night));
      } catch (error) {
        failures.push(`${label} scroll=${scroll} night=${night}: paint threw ${error.message}`);
        continue;
      }
      check(mock.ops.fillRect > 200, `${label}: suspiciously few fillRect (${mock.ops.fillRect})`);
      check(mock.ops.fillRect < 40000, `${label}: too many fillRect (${mock.ops.fillRect})`);
      for (const problem of mock.bad.slice(0, 3)) failures.push(`${label}: ${problem}`);
    }
    return scrolled;
  }
  return scene;
}

for (const viewport of viewports) {
  const labelPrefix = `${viewport.w}x${viewport.h}`;

  // city
  exerciseScene(
    () => modules.buildCityScene(cityModel, viewport, { scroll: 0 }),
    modules.paintCityScene,
    viewport,
    `city ${labelPrefix}`,
  );
  // city with zero workspaces
  const emptyCity = modules.selectCity(modules.buildOfficeModel(
    { phase: 'ready', ids: [], byId: {} },
    { phase: 'ready', items: [], archivedSessionIds: [], pinnedSessionIds: [] },
  ));
  exerciseScene(
    () => modules.buildCityScene(emptyCity, viewport, { scroll: 0 }),
    modules.paintCityScene,
    viewport,
    `city-empty ${labelPrefix}`,
    true,
  );
  // building: 3 offices, 11 offices, empty workspace
  for (const workspaceId of ['ws-office', 'ws-many', 'ws-empty']) {
    const building = modules.selectBuilding(model, workspaceId);
    check(!!building, `selectBuilding(${workspaceId}) returned null`);
    if (!building) continue;
    const scene = exerciseScene(
      () => modules.buildBuildingScene(building, viewport, { scroll: 0 }),
      modules.paintBuildingScene,
      viewport,
      `building-${workspaceId} ${labelPrefix}`,
      building.sessionCount === 0,
    );
    if (scene) {
      const maxScroll = scene.scrollMax || 0;
      // Rebuild at the bottom of the scroll range.
      const bottom = modules.buildBuildingScene(building, viewport, { scroll: maxScroll });
      assertScene(bottom, viewport, `building-${workspaceId} bottom ${labelPrefix}`, building.sessionCount === 0);
      const mock = createCanvasMock();
      try {
        modules.paintBuildingScene(mock.ctx, bottom, anim(true));
      } catch (error) {
        failures.push(`building-${workspaceId} bottom paint threw ${error.message}`);
      }
    }
  }
  // room: team, idle, empty
  for (const [roomModel, name] of [[roomBoss, 'team'], [roomIdle, 'idle'], [null, 'null']]) {
    const scene = modules.buildRoomScene(roomModel, viewport, { scroll: 0 });
    if (roomModel) assertScene(scene, viewport, `room-${name} ${labelPrefix}`);
    if (scene) {
      for (const night of [false, true]) {
        const mock = createCanvasMock();
        try {
          modules.paintRoomScene(mock.ctx, scene, anim(night));
        } catch (error) {
          failures.push(`room-${name} ${labelPrefix} night=${night}: paint threw ${error.message}`);
        }
        check(mock.ops.fillRect > 200, `room-${name}: few fillRect (${mock.ops.fillRect})`);
      }
    }
  }
}

// ---------------------------------------------------------------- pagination contract
// 12 workspaces with one session each: taller than a short viewport, so the tower must
// page. The last page must carry floor 1 together with the lobby/ground, and earlier
// pages must not paint floor 1 (the "saw 1F but no ground" bug).
function buildManyModel(count) {
  const manyById = {};
  const manyIds = [];
  const manyItems = [];
  for (let index = 0; index < count; index += 1) {
    const id = `page-s${index}`;
    manyIds.push(id);
    manyById[id] = { id, title: `p${index}`, running: index % 2 === 0, updatedAt: NOW - index * 1000 };
    manyItems.push({ workspaceId: `page-ws-${index}`, title: `ws-${index}`, path: `D:/ws-${index}`, sessionIds: [id] });
  }
  return modules.buildOfficeModel(
    { phase: 'ready', ids: manyIds, byId: manyById, projectionsBySession: {} },
    { phase: 'ready', items: manyItems, archivedSessionIds: [], pinnedSessionIds: [] },
  );
}

const manyCityModel = modules.selectCity(buildManyModel(12));
for (const viewport of [{ w: 900, h: 340 }, { w: 742, h: 314 }, { w: 900, h: 800 }]) {
  const label = `pagination ${viewport.w}x${viewport.h}`;
  const firstPage = modules.buildCityScene(manyCityModel, viewport, { scroll: 0 });
  assertScene(firstPage, viewport, `${label} p0`);
  const maxScroll = firstPage.scrollMax || 0;
  if (firstPage.scrollPageSize) {
    check(firstPage.scrollPageSize >= 1, `${label}: bad scrollPageSize`);
    check(Number.isInteger(firstPage.scrollMax), `${label}: scrollMax must be an integer page index`);
    if (maxScroll > 0) {
      check(firstPage.scrollRange && firstPage.scrollRange.from > 1,
        `${label}: first page must not show floor 1 (range ${JSON.stringify(firstPage.scrollRange)})`);
      check(!(firstPage.labels || []).some((item) => item.kind === 'workspace' && item.data && item.data.floorNumber === 1),
        `${label}: first page painted floor 1 without ground`);
      const lastPage = modules.buildCityScene(manyCityModel, viewport, { scroll: maxScroll });
      assertScene(lastPage, viewport, `${label} last`);
      check(lastPage.scrollRange && lastPage.scrollRange.from === 1,
        `${label}: last page scrollRange must start at floor 1 (got ${JSON.stringify(lastPage.scrollRange)})`);
      check(lastPage.labels.some((item) => item.kind === 'workspace' && item.data && item.data.floorNumber === 1),
        `${label}: last page must paint floor 1`);
      check(!!lastPage.tower && lastPage.tower.atBottom === true, `${label}: last page must touch the ground`);
      check(maxScroll + 1 >= Math.ceil(12 / firstPage.scrollPageSize), `${label}: page count too small`);
      // Ground must only be requested on the last page.
      check(!!firstPage.tower && firstPage.tower.atBottom === false, `${label}: first page must not touch the ground`);
      const mock = createCanvasMock();
      try {
        modules.paintCityScene(mock.ctx, lastPage, anim(true));
      } catch (error) {
        failures.push(`${label}: last page paint threw ${error.message}`);
      }
    } else {
      check(firstPage.scrollRange && firstPage.scrollRange.from === 1 && firstPage.scrollRange.to === 12,
        `${label}: a single page must cover all 12 floors (got ${JSON.stringify(firstPage.scrollRange)})`);
    }
  }
}

// ---------------------------------------------------------------- viewport scaling
// A fixed device-pixel scale (2) means window resizing reveals more/less of the office
// instead of rescaling it; the logical canvas is simply the stage in device pixels / 2.
const viewportCases = [
  { stage: [971, 800], dpr: 1.5, expect: { pixelScale: 2, logicalWidth: 728, logicalHeight: 600 } },
  { stage: [1456, 1000], dpr: 1, expect: { pixelScale: 2, logicalWidth: 728, logicalHeight: 500 } },
  { stage: [971, 800], dpr: 2, expect: { pixelScale: 2, logicalWidth: 971, logicalHeight: 800 } },
  { stage: [700, 600], dpr: 1, expect: { pixelScale: 2, logicalWidth: 350, logicalHeight: 300 } },
  { stage: [2400, 1200], dpr: 1, expect: { pixelScale: 2, logicalWidth: 1200, logicalHeight: 600 } },
];
const twelveModel = buildManyModel(12);
const twelveCity = modules.selectCity(twelveModel);
for (const testCase of viewportCases) {
  const view = modules.officeComputeViewport(testCase.stage[0], testCase.stage[1], testCase.dpr);
  const label = `viewport ${testCase.stage[0]}x${testCase.stage[1]}@${testCase.dpr}`;
  for (const [key, value] of Object.entries(testCase.expect)) {
    check(view[key] === value, `${label}: ${key} expected ${value}, got ${view[key]}`);
  }
  check(Math.abs(view.cssWidth - testCase.stage[0]) <= 1.5, `${label}: cssWidth ${view.cssWidth} should fill stage`);
  check(Math.abs(view.cssHeight - testCase.stage[1]) <= 1.5, `${label}: cssHeight ${view.cssHeight} should fill stage`);
  const scene = modules.buildCityScene(twelveCity, { w: view.logicalWidth, h: view.logicalHeight }, { scroll: 0 });
  // Floor height must be the fixed pixel value at every viewport (the user's request).
  check(scene.tower && scene.tower.rowH === 32, `${label}: floor height must be fixed 32 (got ${scene.tower && scene.tower.rowH})`);
  if (view.logicalHeight >= 520) {
    check(scene.scrollMax === 0, `${label}: 12 floors must fit one screen (scrollMax ${scene.scrollMax})`);
    check(!!scene.tower && scene.tower.atBottom === true, `${label}: the fitted tower must touch the ground`);
    const labels = (scene.labels || []).filter((item) => item.kind === 'workspace');
    check(labels.length === 12, `${label}: expected 12 floor labels, got ${labels.length}`);
    check(labels.some((item) => item.data && item.data.floorNumber === 1), `${label}: floor 1 label missing`);
  }
}

// ---------------------------------------------------------------- report
if (failures.length > 0) {
  console.error(`verify failed (${failures.length}):`);
  for (const message of failures.slice(0, 40)) console.error(`- ${message}`);
  if (failures.length > 40) console.error(`... and ${failures.length - 40} more`);
  process.exit(1);
}
console.log(`verify ok: ${viewports.length} viewports, ${model.buildings.length} buildings, ` +
  `${model.totals.sessions} sessions, ${model.totals.members} members, zh/en ${zhKeys.length} keys`);
