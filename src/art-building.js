// ===== art-building.js =====
// BUILDING SCENE — one Workspace FLOOR PLAN. Every glass office is one Session (one
// agent team): the lead's big desk at the back-right, the team's workstations around it.
// Few sessions = big offices; many = a 4-column grid; anything that does not fit scrolls
// instead of hiding behind a "more offices" chip. Responsive: all geometry comes from
// scene.w / scene.h. Owner: T2 (scene). Painting only.

const FLOOR_OFFICE_W = 210;
const FLOOR_OFFICE_H = 150;
const FLOOR_OFFICE_GAP = 14;
const FLOOR_WALL_H = 44;
const FLOOR_CORRIDOR_H = 64;
const FLOOR_MARGIN = 16;
const FLOOR_FOREGROUND_H = 16;
const FLOOR_AISLE = 8;

function floorReadViewport(viewport) {
  const w = viewport && Number(viewport.w);
  const h = viewport && Number(viewport.h);
  return {
    w: Number.isFinite(w) && w >= 200 ? Math.round(w) : 640,
    h: Number.isFinite(h) && h >= 160 ? Math.round(h) : 360,
  };
}

/**
 * Fixed pixel world for the floor plan: offices, the back wall and the corridor never
 * stretch. A wider window only shows more offices per row / more side decor; a taller
 * one shows more rows. When the fixed grid cannot fit, the rows paginate instead.
 */
function floorBuildLayout(W, H, count) {
  const margin = FLOOR_MARGIN;
  const wallH = FLOOR_WALL_H;
  const corridorH = FLOOR_CORRIDOR_H;
  const foregroundH = FLOOR_FOREGROUND_H;
  const corridorTop = Math.max(wallH + FLOOR_OFFICE_H, H - foregroundH - corridorH);
  const available = Math.max(FLOOR_OFFICE_H, corridorTop - wallH - FLOOR_AISLE * 2);
  const cellW = FLOOR_OFFICE_W;
  const cellH = FLOOR_OFFICE_H;
  const gap = FLOOR_OFFICE_GAP;

  const cols = cityClamp(
    Math.floor((W - margin * 2 + gap) / (cellW + gap)),
    1,
    6,
  );
  const rows = count <= 0 ? 1 : Math.max(1, Math.ceil(count / cols));
  const capacityRows = Math.max(1, Math.floor((available + gap) / (cellH + gap)));
  const pageSizeRows = rows <= capacityRows ? rows : capacityRows;
  const pageCount = rows <= capacityRows ? 1 : Math.max(1, Math.ceil(rows / pageSizeRows));
  const scrollMax = Math.max(0, pageCount - 1);
  const visibleRows = pageCount > 1 ? pageSizeRows : rows;
  const gridW = cols * cellW + (cols - 1) * gap;
  const gridH = visibleRows * cellH + (visibleRows - 1) * gap;
  const gridTop = wallH + FLOOR_AISLE + Math.max(0, Math.round((available - gridH) / 2));
  const gridBottom = gridTop + gridH;
  const startX = Math.round((W - gridW) / 2);

  // Row window of a page; the last page is anchored to the bottom row so the final
  // offices and the corridor are always on screen together.
  const rowWindow = (page) => {
    const size = Math.max(1, Math.min(pageSizeRows, rows));
    const first = page <= 0 ? 0 : Math.min(page * size, Math.max(0, rows - size));
    return { first, size, last: Math.min(rows, first + size) };
  };

  return {
    W,
    H,
    margin,
    wallH,
    corridorH,
    foregroundH,
    corridorTop,
    aisle: FLOOR_AISLE,
    gridTop,
    gridBottom,
    gridH,
    gridX: startX,
    gridW,
    gap,
    cols,
    rows,
    cellW,
    cellH,
    startX,
    scroll: 0,
    scrollMax,
    pageCount,
    pageSizeRows,
    rowWindow,
    visibleRows,
    count,
  };
}

function buildBuildingScene(buildingModel, viewport, options) {
  const vp = floorReadViewport(viewport);
  const W = vp.w;
  const H = vp.h;
  const building = buildingModel && typeof buildingModel === 'object' ? buildingModel : {};
  const sessions = Array.isArray(building.floors) ? building.floors : [];
  const total = sessions.length;
  const opts = options && typeof options === 'object' ? options : {};
  const requested = Math.max(0, Math.round(Number(opts.scroll) || 0));

  const layout = floorBuildLayout(W, H, total);
  const scroll = cityClamp(requested, 0, layout.scrollMax);
  const rowWin = layout.rowWindow(scroll);
  layout.scroll = scroll;
  layout.firstRow = rowWin.first;
  layout.lastRow = rowWin.last;

  const scene = {
    kind: 'building',
    w: W,
    h: H,
    building,
    layout,
    offices: [],
    total,
    scroll,
    scrollMax: layout.scrollMax,
    scrollPageSize: layout.pageSizeRows * layout.cols,
    scrollTotal: total,
    scrollVisible: 0,
    scrollRange: { from: 0, to: 0 },
    hits: [],
    labels: [],
  };

  const title = typeof building.title === 'string' ? building.title : '';
  scene.labels.push({
    x: Math.round(W / 2),
    y: 8,
    anchor: 'below',
    kind: 'workspace-title',
    text: title,
    data: {
      workspaceId: building.workspaceId,
      ungrouped: building.ungrouped === true,
      runningCount: building.runningCount || 0,
      sessionCount: building.sessionCount || total,
      memberCount: building.memberCount || 0,
    },
  });

  // ---- offices of the current page -----------------------------------------
  const firstRow = rowWin.first;
  const lastRow = rowWin.last;
  for (let row = firstRow; row < lastRow; row += 1) {
    for (let col = 0; col < layout.cols; col += 1) {
      const index = row * layout.cols + col;
      if (index >= total) break;
      const session = sessions[index];
      if (!session) continue;
      const x = layout.startX + col * (layout.cellW + layout.gap);
      const y = layout.gridTop + (row - firstRow) * (layout.cellH + layout.gap);
      const workers = Array.isArray(session.workers) ? session.workers : [];
      const entry = {
        index,
        col,
        row,
        sessionId: session.sessionId,
        title: session.title,
        running: session.running === true,
        teamSize: session.teamSize || 1,
        workers,
        workerCount: Math.min(4, workers.length),
        hiddenWorkers: Math.max(0, workers.length - 4),
        currentWork: session.currentWork || '',
        todos: session.todos || { done: 0, total: 0 },
        accentSeed: session.accentSeed || 1,
        officeNumber: index + 1,
        x,
        y,
        w: layout.cellW,
        h: layout.cellH,
      };
      scene.offices.push(entry);
      scene.hits.push({
        x,
        y,
        w: layout.cellW,
        h: layout.cellH,
        target: { kind: 'floor', sessionId: session.sessionId },
      });
      scene.labels.push({
        x: x + Math.round(layout.cellW / 2),
        y: y + 3,
        anchor: 'below',
        kind: 'office',
        text: session.title || '',
        data: {
          sessionId: session.sessionId,
          officeNumber: entry.officeNumber,
          floorNumber: entry.officeNumber,
          running: entry.running,
          teamSize: entry.teamSize,
          workers: entry.workerCount,
          currentWork: entry.currentWork,
          todos: entry.todos,
        },
      });
    }
  }
  scene.scrollVisible = scene.offices.length;
  if (scene.offices.length > 0) {
    const first = scene.offices[0].officeNumber;
    const last = scene.offices[scene.offices.length - 1].officeNumber;
    scene.scrollRange = { from: Math.min(first, last), to: Math.max(first, last) };
  }

  // ---- in-canvas pixel pager parked in the right end of the corridor ---------
  if (layout.scrollMax > 0) {
    const geo = cityPagerLayout({
      pageCount: layout.pageCount,
      sizeHint: 16,
      height: layout.corridorH,
      compact: true,
    });
    const panelX = W - layout.margin - geo.w;
    const panelY = layout.corridorTop + Math.round((layout.corridorH - geo.h) / 2);
    scene.pager = {
      visible: true,
      x: panelX,
      y: panelY,
      w: geo.w,
      h: geo.h,
      size: geo.size,
      upY: panelY + geo.upY,
      downY: panelY + geo.downY,
      trackTop: panelY + geo.trackTop,
      trackBottom: panelY + geo.trackBottom,
      digitY: null,
      digitScale: 0,
    };
    const bx = panelX + Math.round((geo.w - geo.size) / 2);
    if (scroll > 0) {
      scene.hits.push({
        x: bx - 2,
        y: scene.pager.upY - 2,
        w: geo.size + 4,
        h: geo.size + 4,
        target: { kind: 'scroll', delta: -1 },
      });
    }
    if (scroll < layout.scrollMax) {
      scene.hits.push({
        x: bx - 2,
        y: scene.pager.downY - 2,
        w: geo.size + 4,
        h: geo.size + 4,
        target: { kind: 'scroll', delta: 1 },
      });
    }
  } else {
    scene.pager = { visible: false };
  }

  return scene;
}

/* ------------------------------------------------------------------ painter */

function paintBuildingScene(ctx, scene, anim) {
  if (!ctx || !scene) return;
  const night = anim && anim.night === true;
  const time = anim && Number.isFinite(anim.time) ? anim.time : 0;
  const reduced = !!(anim && anim.reducedMotion);
  const motion = reduced ? 0 : time;
  const hover = anim && anim.hover && anim.hover.kind === 'floor' ? anim.hover.sessionId : '';
  const layout = scene.layout;

  floorPaintBackWall(ctx, scene, night, motion);
  floorPaintTiles(ctx, scene, night);
  floorPaintLounge(ctx, scene, night, motion);
  for (let index = 0; index < scene.offices.length; index += 1) {
    const office = scene.offices[index];
    floorPaintOffice(ctx, scene, office, night, motion, reduced, hover === office.sessionId);
  }
  floorPaintCorridor(ctx, scene, night, motion);
  floorPaintForeground(ctx, scene, night, motion);

  if (night) floorPaintNightGlow(ctx, scene, motion);
  if (layout && layout.scrollMax > 0) floorPaintScrollEdges(ctx, scene, night);
  cityPaintPager(ctx, scene.pager, night, scene.scroll, layout.pageCount);
}

/* --------------------------------------------------------------- back wall */

function floorPaintBackWall(ctx, scene, night, time) {
  const W = scene.w;
  const layout = scene.layout;
  const wallH = layout.wallH;
  const wall = night ? '#263248' : PAL.wall;
  const wallAlt = night ? '#2c3850' : PAL.wallAlt;
  const trim = night ? '#39465c' : PAL.wallTrim;
  const dark = night ? '#131b28' : '#b0a897';

  artRect(ctx, 0, 0, W, wallH, wall);
  // ceiling band with light fixtures (fixed sizes; a wider window shows more fixtures)
  const ceilH = 10;
  artRect(ctx, 0, 0, W, ceilH, night ? '#161f2c' : '#e4ddcc');
  artRect(ctx, 0, ceilH, W, 1, night ? '#0f1622' : '#c9c0ac');
  const fixtureW = 72;
  const fixtures = Math.max(2, Math.floor(W / 220));
  for (let index = 0; index < fixtures; index += 1) {
    const fx = Math.round((W / fixtures) * (index + 0.5)) - Math.round(fixtureW / 2);
    artDrawCeilingFixture(ctx, fx, Math.max(1, Math.round(ceilH * 0.24)), fixtureW, { night });
    if (night) cityPixelGlow(ctx, fx + fixtureW / 2, ceilH + 8, Math.round(fixtureW * 0.9), PAL.lampLight, 0.16);
  }
  // wall panelling seams (fixed spacing)
  const seamGap = 120;
  for (let x = seamGap; x < W; x += seamGap) {
    artRect(ctx, x, ceilH, 1, wallH - ceilH, night ? '#26313f' : '#e9e3d7');
  }
  artRect(ctx, 0, wallH - 4, W, 4, trim);
  artRect(ctx, 0, wallH - 4, W, 1, night ? '#4a5a72' : '#e9e3d7');
  artRect(ctx, 0, wallH - 1, W, 1, dark);

  // central floor sign (the DOM workspace-title label sits above it)
  const signW = Math.min(300, W - layout.margin * 2 - 160);
  if (signW > 120) {
    const signX = Math.round((W - signW) / 2);
    const signY = Math.round(ceilH + (wallH - ceilH) * 0.16);
    const signH = Math.round((wallH - ceilH) * 0.60);
    artRect(ctx, signX, signY, signW, signH, night ? '#141d2b' : '#3a4150');
    artOutline(ctx, signX, signY, signW, signH, night ? '#0b1220' : '#1d212b');
    artRect(ctx, signX + 4, signY + 4, signW - 8, 1, night ? '#2b3a52' : '#5f6b78');
    const iconW = Math.max(8, Math.round(signH * 0.42));
    const iconX = signX + Math.round(signW * 0.10);
    const iconY = signY + Math.round((signH - iconW) / 2);
    artRect(ctx, iconX, iconY, iconW, iconW, night ? '#ffd97a' : '#e8e3d4');
    for (let row = 0; row < 2; row += 1) {
      for (let col = 0; col < 2; col += 1) {
        artRect(ctx, iconX + 2 + col * Math.round(iconW * 0.42), iconY + 2 + row * Math.round(iconW * 0.42), Math.max(1, Math.round(iconW * 0.2)), Math.max(1, Math.round(iconW * 0.2)), night ? '#1d212b' : '#4a5560');
      }
    }
    artRect(ctx, iconX + iconW + Math.round(signW * 0.06), signY + Math.round(signH * 0.28), Math.round(signW * 0.52), Math.max(2, Math.round(signH * 0.12)), night ? '#ffe08a' : '#efeadd');
    artRect(ctx, iconX + iconW + Math.round(signW * 0.06), signY + Math.round(signH * 0.52), Math.round(signW * 0.34), Math.max(1, Math.round(signH * 0.08)), night ? '#c9a45c' : '#b9b2a3');
    if (night) cityPixelGlow(ctx, signX + signW / 2, signY + signH / 2, Math.round(signW * 0.4), PAL.lampLight, 0.14);
  }

  // wall decorations on the flanks (fixed sizes)
  const clockSize = 26;
  artDrawWallClock(ctx, layout.margin + 8, ceilH + 10, clockSize, {});
  const ventW = 64;
  artDrawAirVent(ctx, W - layout.margin - ventW - 8, ceilH + 8, ventW, 14, { night });
  const posterW = 26;
  const posterH = 34;
  artDrawPoster(ctx, layout.margin + clockSize + 34, ceilH + 10, posterW, posterH, { seed: 5 });
  artDrawPoster(ctx, W - layout.margin - ventW - posterW - 26, ceilH + 10, posterW, posterH, { seed: 8 });
  // floor plants against the wall
  const plantBase = layout.wallH - 2;
  artDrawPlant(ctx, layout.margin + 22, plantBase, { variant: 'floor', seed: 4, t: time, night });
  artDrawPlant(ctx, W - layout.margin - 26, plantBase, { variant: 'floor', seed: 11, t: time, night });
}

/* ------------------------------------------------------------------ tiles */

function floorPaintTiles(ctx, scene, night) {
  const W = scene.w;
  const H = scene.h;
  const layout = scene.layout;
  const top = layout.wallH;
  const bottom = layout.corridorTop;
  const tile = 36;
  const toneA = night ? '#1b2433' : PAL.floor;
  const toneB = night ? '#1e2838' : PAL.floorAlt;
  const line = night ? '#161e2b' : PAL.floorLine;
  for (let y = top; y < bottom; y += tile) {
    for (let x = 0; x < W; x += tile) {
      const alt = (Math.floor(x / tile) + Math.floor(y / tile)) % 2 === 0;
      artRect(ctx, x, y, tile, Math.min(tile, bottom - y), alt ? toneA : toneB);
      artRect(ctx, x, y, Math.min(tile, W - x), 1, line);
      artRect(ctx, x, y, 1, Math.min(tile, bottom - y), line);
    }
  }
  // corridor floor tone under the rug
  artRect(ctx, 0, bottom, W, scene.h - layout.foregroundH - bottom, night ? '#2a3142' : '#c3baa8');
  artRect(ctx, 0, bottom, W, 1, night ? '#141c29' : '#9c9484');
}

/* ----------------------------------------------------------------- lounge */

function floorPaintLounge(ctx, scene, night, time) {
  const layout = scene.layout;
  const W = scene.w;
  const empty = scene.total === 0;

  if (empty) {
    const cx = Math.round(W / 2);
    const cy = Math.round((layout.gridTop + layout.gridBottom) / 2);
    artDrawCarpet(ctx, cx - 90, cy - 50, 180, 100, ART_ACCENTS[5], { night });
    artDrawBoxes(ctx, cx - 40, cy - 10, { night });
    artDrawBoxes(ctx, cx + 4, cy - 24, { night });
    artDrawPlant(ctx, cx - 74, cy + 40, { variant: 'floor', seed: 2, t: time, night });
    artDrawPlant(ctx, cx + 82, cy + 40, { variant: 'floor', seed: 6, t: time, night });
    artDrawTrashBin(ctx, cx + 44, cy + 24, { night });
    return;
  }

  // Fixed office grid sits in the middle; the leftover bands above/below it are filled
  // with fixed-size props (never stretched offices). Wider windows get side props.
  const topBand = { top: layout.wallH, bottom: layout.gridTop };
  const bottomBand = { top: layout.gridBottom, bottom: layout.corridorTop };
  const topH = topBand.bottom - topBand.top;
  const bottomH = bottomBand.bottom - bottomBand.top;
  const loungeBand = bottomH >= topH ? bottomBand : topBand;
  const otherBand = bottomH >= topH ? topBand : bottomBand;
  if (loungeBand.bottom - loungeBand.top >= 64) floorPaintBandProps(ctx, scene, night, time, loungeBand.top, loungeBand.bottom);
  else floorPaintBandFill(ctx, scene, night, time, loungeBand.top, loungeBand.bottom);
  floorPaintBandFill(ctx, scene, night, time, otherBand.top, otherBand.bottom);

  const leftGap = layout.startX - layout.margin;
  const rightGap = W - layout.margin - (layout.startX + layout.gridW);
  if (leftGap >= 40) floorPaintSideProps(ctx, scene, night, time, layout.margin + Math.round(leftGap / 2));
  if (rightGap >= 40) floorPaintSideProps(ctx, scene, night, time, W - layout.margin - Math.round(rightGap / 2));

  // last row not full: a plant fills the empty column
  if (scene.total > 0 && scene.offices.length > 0) {
    const lastVisible = scene.offices[scene.offices.length - 1];
    if (lastVisible.row === layout.rows - 1 && lastVisible.col < layout.cols - 1) {
      const gapX = lastVisible.x + lastVisible.w + Math.round(layout.gap / 2);
      const gapW = W - layout.margin - gapX;
      if (gapW > 40) {
        artDrawPlant(ctx, gapX + Math.round(gapW / 2), lastVisible.y + lastVisible.h - 4, { variant: 'floor', seed: 13, t: time, night });
      }
    }
  }
}

/** Fixed-size lounge cluster (rug + sofa + table + coffee corner) inside a tall band. */
function floorPaintBandProps(ctx, scene, night, time, top, bottom) {
  const layout = scene.layout;
  const W = scene.w;
  const bandH = bottom - top;
  if (bandH < 64) return;
  const cy = top + Math.round(bandH / 2);
  const rugW = 300;
  const rugH = 56;
  const rugX = layout.margin + 8;
  artDrawCarpet(ctx, rugX, cy - Math.round(rugH / 2), rugW, rugH, ART_ACCENTS[3], { night });
  floorPaintSofa(ctx, rugX + 10, cy - 20, 96, 34, night);
  artDrawDesk(ctx, rugX + 150, cy - 6, 70, { depth: 22, night });
  artDrawMug(ctx, rugX + 160, cy - 2, { night, t: time });
  artDrawMug(ctx, rugX + 190, cy - 2, { night, t: time + 300 });
  artDrawPlant(ctx, rugX + rugW - 18, cy + Math.round(rugH / 2) - 2, { variant: 'floor', seed: 9, t: time, night });
  const coffeeX = W - layout.margin - 128;
  if (coffeeX > rugX + rugW + 24) {
    artDrawCounter(ctx, coffeeX, cy - 8, 110, 34, { night });
    artDrawCoffeeMachine(ctx, coffeeX + 12, cy - 30, { night, t: time });
  }
  for (let x = rugX + rugW + 40; x < W - layout.margin - 24; x += 160) {
    if (x > coffeeX - 40 && x < coffeeX + 150) continue;
    artDrawPlant(ctx, x, cy + 18, { variant: 'floor', seed: 20 + (x % 7), t: time, night });
  }
}

/** Fixed-size filler props in a thin leftover band (plants / boxes / bins). */
function floorPaintBandFill(ctx, scene, night, time, top, bottom) {
  const layout = scene.layout;
  const W = scene.w;
  const bandH = bottom - top;
  if (bandH < 24) return;
  const baseY = bottom - 4;
  const step = 120;
  let index = 0;
  for (let x = layout.margin + 24; x < W - layout.margin - 16; x += step) {
    if (index % 3 === 0) artDrawPlant(ctx, x, baseY, { variant: 'floor', seed: 50 + index, t: time, night });
    else if (index % 3 === 1) artDrawBoxes(ctx, x, baseY - 22, { night });
    else artDrawTrashBin(ctx, x, baseY - 14, { night });
    index += 1;
  }
}

/** Fixed-size filler props in the side gaps next to the office grid. */
function floorPaintSideProps(ctx, scene, night, time, cx) {
  const layout = scene.layout;
  if (layout.gridH < 100) return;
  const baseY = layout.gridBottom - 8;
  artDrawPlant(ctx, cx, baseY, { variant: 'floor', seed: 31 + (cx % 5), t: time, night });
  if (layout.gridH >= 220) artDrawWaterCooler(ctx, cx - 8, baseY - 96, { night });
  if (layout.gridH >= 320) artDrawBoxes(ctx, cx - 16, baseY - 190, { night });
}


function floorPaintSofa(ctx, x, y, w, h, night) {
  const fabric = night ? '#3c4a58' : PAL.fabric;
  const dark = night ? '#2b3642' : PAL.fabricDark;
  const light = night ? '#4d5c6b' : '#8497a6';
  artShadow(ctx, x + 3, y + h - 2, w - 6, 6, night ? 0.36 : 0.2);
  artSteppedBox(ctx, x, y + Math.round(h * 0.34), w, Math.round(h * 0.66), fabric, PAL.outline, 2);
  artRect(ctx, x + 2, y + Math.round(h * 0.34) + 2, w - 4, 2, light);
  artRect(ctx, x, y, w, Math.round(h * 0.42), dark);
  artRect(ctx, x + 2, y + 2, w - 4, 2, fabric);
  const cushionW = Math.round((w - 10) / 2);
  artRect(ctx, x + 4, y + Math.round(h * 0.44), cushionW, Math.max(3, Math.round(h * 0.2)), fabric);
  artRect(ctx, x + 6 + cushionW, y + Math.round(h * 0.44), cushionW, Math.max(3, Math.round(h * 0.2)), fabric);
  artRect(ctx, x - 2, y + Math.round(h * 0.36), 2, Math.round(h * 0.6), dark);
  artRect(ctx, x + w, y + Math.round(h * 0.36), 2, Math.round(h * 0.6), dark);
}

/* ------------------------------------------------------------------ office */

function floorOfficeKit(office) {
  const x = office.x;
  const y = office.y;
  const w = office.w;
  const h = office.h;
  const frame = cityClamp(Math.round(Math.min(w, h) * 0.028), 2, 6);
  const railH = cityClamp(Math.round(h * 0.105), 16, 48);
  const wallH = cityClamp(Math.round(h * 0.155), 20, 80);
  const frontH = cityClamp(Math.round(h * 0.075), 8, 32);
  const innerX = x + frame;
  const innerW = w - frame * 2;
  const floorTop = y + frame + railH + wallH;
  const floorBottom = y + h - frame - frontH;
  const floorH = Math.max(24, floorBottom - floorTop);
  const floorW = Math.max(20, innerW);
  const leadW = cityClamp(Math.round(floorW * 0.38), Math.round(floorW * 0.30), Math.round(floorW * 0.46));
  const staffW = Math.max(40, floorW - leadW - 4);
  const leadX = innerX + floorW - leadW;
  const staffX = innerX;
  return {
    frame,
    railH,
    wallH,
    frontH,
    innerX,
    innerW,
    floorTop,
    floorBottom,
    floorH,
    floorW,
    leadX,
    leadW,
    staffX,
    staffW,
    railY: y + frame,
    wallY: y + frame + railH,
    wallH2: wallH,
  };
}

function floorPaintOffice(ctx, scene, office, night, time, reduced, hovered) {
  const kit = floorOfficeKit(office);
  const x = office.x;
  const y = office.y;
  const w = office.w;
  const h = office.h;
  const lit = office.running === true;
  const accent = ART_ACCENTS[((office.accentSeed || 1) - 1) % ART_ACCENTS.length];
  const frameColor = night ? '#39485c' : PAL.metalDark;
  const frameLight = night ? '#5d7189' : PAL.metal;
  const shell = night ? (lit ? '#28323f' : '#1e2836') : (lit ? '#efeadd' : '#e6e0d1');
  const wallColor = night ? (lit ? '#3a4450' : '#26313f') : (lit ? '#f3efe4' : '#e4ddcc');

  // room shell + glass side walls
  artRect(ctx, x, y, w, h, shell);
  artRect(ctx, x, y, w, kit.railH + kit.frame, night ? (lit ? '#39465c' : '#1d2735') : (lit ? '#c8d3d9' : '#d8d2c2'));
  artRect(ctx, x + kit.frame, y + kit.frame, w - kit.frame * 2, 1, night ? '#4a5a72' : '#f7f4ec');
  artRect(ctx, x, y, w, 1, PAL.outline);
  artRect(ctx, x, y + h - 1, w, 1, PAL.outline);
  artRect(ctx, x, y, 1, h, PAL.outline);
  artRect(ctx, x + w - 1, y, 1, h, PAL.outline);
  artRect(ctx, x + 1, y, Math.max(2, kit.frame), h, frameColor);
  artRect(ctx, x + w - 1 - Math.max(2, kit.frame), y, Math.max(2, kit.frame), h, frameColor);
  artRect(ctx, x + 1, y, 1, h, frameLight);

  // nameplate rail (the DOM office label floats above this band)
  artRect(ctx, x + kit.frame, y + kit.frame, w - kit.frame * 2, Math.max(6, kit.railH - 2), night ? '#202c3d' : '#3a4150');
  artRect(ctx, x + kit.frame, y + kit.frame + Math.max(6, kit.railH - 2) - 1, w - kit.frame * 2, 1, night ? '#0f1622' : '#1d212b');
  const badge = Math.max(8, Math.round(kit.railH * 0.62));
  const badgeX = x + kit.frame + Math.max(4, Math.round(w * 0.03));
  const badgeY = y + kit.frame + Math.round((Math.max(6, kit.railH - 2) - badge) / 2);
  artRect(ctx, badgeX, badgeY, badge, badge, night ? '#141d2b' : '#efeadd');
  artOutline(ctx, badgeX, badgeY, badge, badge, night ? '#0b1220' : '#1d212b');
  cityDrawDigits(ctx, badgeX + Math.round(badge * 0.14), badgeY + Math.round(badge * 0.2), String(office.officeNumber).padStart(2, '0'), Math.max(1, Math.floor((badge - 2) / 6)), night ? '#ffe08a' : '#2f3542');
  const led = Math.max(3, Math.round(kit.railH * 0.2));
  artRect(ctx, badgeX + badge + Math.max(4, Math.round(w * 0.02)), badgeY + Math.round((badge - led) / 2), led, led, lit ? PAL.ledGreen : (night ? '#2a3446' : '#a9a292'));
  if (lit) cityPixelGlow(ctx, badgeX + badge + Math.max(4, Math.round(w * 0.02)) + led / 2, badgeY + badge / 2, led * 4, PAL.ledGreen, night ? 0.3 : 0.1);

  // back wall
  const wallX = x + kit.frame;
  const wallY = kit.wallY;
  const wallW = w - kit.frame * 2;
  const wallH = kit.wallH2;
  artRect(ctx, wallX, wallY, wallW, wallH, wallColor);
  artRect(ctx, wallX, wallY, wallW, 1, night ? '#4a5a72' : '#f7f4ec');
  artRect(ctx, wallX, wallY + wallH - Math.max(2, Math.round(wallH * 0.12)), wallW, Math.max(2, Math.round(wallH * 0.12)), night ? '#1b2635' : PAL.wallTrim);

  const winH = cityClamp(Math.round(wallH * 0.62), 12, 58);
  const winW = cityClamp(Math.round(wallW * 0.24), 18, 130);
  const winY = wallY + Math.round((wallH - winH) / 2) - Math.max(1, Math.round(wallH * 0.06));
  const twoWindows = wallW >= 210;
  artDrawWindow(ctx, wallX + Math.round(wallW * 0.06), winY, winW, winH, { night, t: time, seed: office.index + 3 });
  if (twoWindows) {
    artDrawWindow(ctx, wallX + wallW - Math.round(wallW * 0.06) - winW, winY, winW, winH, { night, t: time, seed: office.index + 9 });
  }
  // whiteboard / poster between the windows
  const boardW = Math.min(Math.round(wallW * 0.30), 200);
  const boardH = cityClamp(Math.round(wallH * 0.56), 10, 54);
  if (boardW > 26) {
    const boardX = wallX + Math.round((wallW - boardW) / 2);
    const boardY = wallY + Math.round((wallH - boardH) / 2) - Math.max(1, Math.round(wallH * 0.04));
    if (office.todos && office.todos.total > 0) {
      artDrawWhiteboard(ctx, boardX, boardY, boardW, boardH, {
        done: office.todos.done,
        total: office.todos.total,
        accent,
        seed: office.index + 2,
        night,
      });
    } else {
      artDrawPoster(ctx, boardX, boardY, Math.min(boardW, 60), Math.min(boardH, 46), { seed: office.index + 4 });
    }
  }

  // floor + boss carpet (the lead desk cluster draws its own rug)
  artRect(ctx, kit.innerX, kit.floorTop, kit.floorW, kit.floorH, night ? '#222d40' : PAL.floor);
  floorOfficeTiles(ctx, kit, night);

  // lead desk
  floorPaintBossDesk(ctx, office, kit, night, time, reduced, accent);

  // team workstations
  floorPaintTeam(ctx, office, kit, night, time, reduced);

  // plants / cabinets / boxes scattered in the free corners
  floorPaintOfficeExtras(ctx, office, kit, night, time);

  // front glass wall + door gap
  floorPaintFrontWall(ctx, office, kit, night, lit, time);

  // status strip on the outer frame + hover highlight
  const stripW = Math.max(2, Math.round(kit.frame * 0.6));
  artRect(ctx, x + 2, y + kit.railH + 4, stripW, h - kit.railH - 8, lit ? PAL.ledGreen : (night ? '#2a3446' : '#c9c0ac'));
  if (lit) artRect(ctx, x + 2, y + kit.railH + 4, stripW, Math.max(3, Math.round((h - kit.railH - 8) * 0.3)), night ? '#9cf0a8' : '#8fe89a');

  if (lit) {
    ctx.globalAlpha = night ? 0.14 : 0.06;
    artRect(ctx, kit.innerX, kit.floorTop, kit.floorW, kit.floorH, PAL.lampLight);
    ctx.globalAlpha = 1;
  }
  if (hovered) {
    ctx.globalAlpha = 0.10;
    artRect(ctx, x, y, w, h, '#ffe9a8');
    ctx.globalAlpha = 1;
    artOutline(ctx, x - 1, y - 1, w + 2, h + 2, '#ffe9a8');
    artOutline(ctx, x, y, w, h, '#ffe9a8');
  }
}

function floorOfficeTiles(ctx, kit, night) {
  const tile = cityClamp(Math.round(Math.min(kit.floorW, kit.floorH) / 5), 12, 34);
  const toneA = night ? '#212c3d' : '#d9d4c7';
  const toneB = night ? '#26324a' : '#cbc4b4';
  const line = night ? '#1d2634' : '#b4ad9d';
  for (let y = kit.floorTop; y < kit.floorBottom; y += tile) {
    for (let x = kit.innerX; x < kit.innerX + kit.floorW; x += tile) {
      const alt = (Math.floor((x - kit.innerX) / tile) + Math.floor((y - kit.floorTop) / tile)) % 2 === 0;
      const cw = Math.min(tile, kit.innerX + kit.floorW - x);
      const ch = Math.min(tile, kit.floorBottom - y);
      artRect(ctx, x, y, cw, ch, alt ? toneA : toneB);
      artRect(ctx, x, y, cw, 1, line);
      artRect(ctx, x, y, 1, ch, line);
    }
  }
  artRect(ctx, kit.innerX, kit.floorBottom - 1, kit.floorW, 1, night ? '#141c27' : PAL.floorLine);
  // soft shadow under the back wall
  artRect(ctx, kit.innerX, kit.floorTop, kit.floorW, 1, night ? 'rgba(0,0,0,0.35)' : 'rgba(60,52,40,0.14)');
}

function floorPaintFrontWall(ctx, office, kit, night, lit, time) {
  const x = office.x + kit.frame;
  const y = kit.floorBottom;
  const w = office.w - kit.frame * 2;
  const h = Math.max(4, kit.frontH);
  const doorW = Math.max(18, Math.round(w * 0.16));
  const doorX = x + Math.round(w * 0.12);
  artDrawGlassWall(ctx, x, y, w, h, {
    night,
    gapFrom: doorX - x,
    gapTo: doorX - x + doorW,
    accent: lit ? PAL.lampLight : PAL.screenGlow,
  });
  // door threshold + light spill
  artRect(ctx, doorX, y + Math.max(1, Math.round(h * 0.3)), doorW, Math.max(1, Math.round(h * 0.5)), night ? (lit ? '#ffd97a' : '#0f1724') : '#8fa0aa');
  artRect(ctx, doorX, y, doorW, 1, night ? '#0b1220' : '#6f7883');
  // nameplate beside the door
  const plateW = Math.max(10, Math.round(w * 0.1));
  artDrawNameplate(ctx, doorX + doorW + Math.max(2, Math.round(w * 0.02)), y - Math.max(6, Math.round(h * 0.36)), plateW, { accent: lit ? PAL.ledGreen : PAL.metal });
  if (lit) {
    cityPixelGlow(ctx, doorX + doorW / 2, y + h / 2, Math.round(w * 0.16), PAL.lampLight, night ? 0.26 : 0.08);
  }
}

function floorPaintBossDesk(ctx, office, kit, night, time, reduced, accent) {
  const x = kit.leadX;
  const w = kit.leadW;
  const floorTop = kit.floorTop;
  const floorH = kit.floorH;
  const deskW = cityClamp(Math.round(w * 0.80), 46, 280);
  const depth = cityClamp(Math.round(Math.min(floorH * 0.24, deskW * 0.30)), 14, 58);
  const deskX = x + Math.round((w - deskW) / 2);
  const deskY = floorTop + Math.round(floorH * 0.40);
  const cx = deskX + Math.round(deskW / 2);
  const spec = artCharacterSpec(office.sessionId || office.index + 1);
  const bossRunning = office.running === true;
  const chairTop = deskY - Math.round(depth * 1.4) - 10;

  // lead carpet under the desk cluster (sits under chair + desk, never the wall)
  const rugAccent = {
    main: artShade(accent.main, 0.42),
    dark: accent.dark,
    light: artShade(accent.light, 0.25),
  };
  const rugW = Math.min(deskW + Math.round(w * 0.12), w - 4);
  const rugX = Math.max(x + 2, cx - Math.round(rugW / 2));
  const rugY = Math.max(floorTop + 1, chairTop - 16);
  const rugH = Math.max(44, Math.min(depth + Math.round(w * 0.5), floorTop + floorH - rugY - 2));
  artDrawCarpet(ctx, rugX, rugY, rugW, rugH, rugAccent, { night });

  // credenza against the lead wall when the room is tall enough
  if (chairTop - floorTop >= 52) {
    const credW = Math.min(Math.round(deskW * 0.66), Math.round(w * 0.7));
    const credH = Math.min(30, chairTop - floorTop - 20);
    if (credW >= 30 && credH >= 12) {
      artDrawCredenza(ctx, cx - Math.round(credW / 2), floorTop + 6, credW, credH, { night });
      if (deskW >= 140) artDrawPlant(ctx, cx - Math.round(credW / 2) + 8, floorTop + 6 + credH - 2, { variant: 'desk', seed: office.index + 2, t: time, night });
    }
  }

  // chair + boss (seen from behind, typing at the big desk)
  if (chairTop > floorTop) artDrawChairBack(ctx, cx - 10, chairTop, spec.chair, {});
  artPerson(ctx, cx - 8, deskY - 11, spec, {
    role: 'lead',
    running: bossRunning,
    t: time,
    reducedMotion: reduced,
    blink: Math.floor(time / 4200 + office.index) % 9 === 0,
  });
  artDrawDesk(ctx, deskX, deskY, deskW, { depth, night });
  const mw = cityClamp(Math.round(deskW * 0.30), 18, 44);
  const mh = cityClamp(Math.round(mw * 0.70), 12, 30);
  if (deskW >= 150) {
    artDrawMonitor(ctx, cx - mw - 8, deskY + 2, mw, mh, {
      running: bossRunning, night, t: time, reducedMotion: reduced, seed: office.index + 5,
    });
    artDrawMonitor(ctx, cx + 8, deskY + 2, mw, mh, {
      running: bossRunning, night, t: time, reducedMotion: reduced, seed: office.index + 8,
    });
  } else {
    artDrawMonitor(ctx, cx - Math.round(mw / 2), deskY + 2, mw, mh, {
      running: bossRunning, night, t: time, reducedMotion: reduced, seed: office.index + 5,
    });
  }
  const kbW = Math.min(Math.round(deskW * 0.44), 56);
  artDrawKeyboard(ctx, cx - Math.round(kbW / 2), deskY + depth - Math.max(6, Math.round(depth * 0.3)), kbW, { night });
  if (deskW >= 70) {
    artDrawDeskLamp(ctx, deskX + deskW - Math.max(18, Math.round(deskW * 0.14)), deskY - Math.max(12, Math.round(depth * 0.6)), { night, t: time });
    artDrawMug(ctx, deskX + Math.max(6, Math.round(deskW * 0.1)), deskY + depth - Math.max(7, Math.round(depth * 0.32)), { night, t: time });
  }
  artDrawNameplate(ctx, deskX + Math.max(4, Math.round(deskW * 0.16)), deskY + depth + 1, Math.max(10, Math.round(deskW * 0.32)), { accent: PAL.gold, gold: true });
  if (deskW >= 110) artDrawPapers(ctx, deskX + Math.round(deskW * 0.66), deskY + Math.max(2, Math.round(depth * 0.2)), { seed: office.index + 6 });
  artPersonHands(ctx, cx, deskY, spec, { running: bossRunning, t: time, reducedMotion: reduced });
  if (bossRunning) {
    cityPixelGlow(ctx, cx, deskY + Math.round(depth / 2), Math.round(deskW * 0.4), PAL.screenGlow, night ? 0.16 : 0.06);
  }
}

/** Team workstations: centred grid of desks, capped so big offices stay readable. */
function floorPaintTeam(ctx, office, kit, night, time, reduced) {
  const grid = floorStationGrid(kit);
  const workers = office.workers || [];
  const accent = ART_ACCENTS[((office.accentSeed || 1) - 1) % ART_ACCENTS.length];
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      const slot = row * grid.cols + col;
      if (slot >= 4) break;
      const sx = grid.originX + col * (grid.stationW + grid.sgap);
      const sy = grid.originY + row * (grid.stationH + grid.sgap);
      const member = workers[slot] || null;
      floorPaintStation(ctx, sx, sy, grid.stationW, grid.stationH, member, night, time, reduced, office.index * 7 + slot, kit.floorTop, accent);
    }
  }
}

function floorStationGrid(kit) {
  const floorH = kit.floorH;
  const sgap = cityClamp(Math.round(kit.floorW * 0.018), 6, 22);
  const minW = 48;
  const minH = 68;
  const cols = cityClamp(Math.floor((kit.staffW + sgap) / (minW + sgap)), 1, 2);
  const rows = cityClamp(Math.floor((floorH + sgap) / (minH + sgap)), 1, 2);
  const rawW = Math.floor((kit.staffW - (cols - 1) * sgap) / cols);
  const rawH = Math.floor((floorH - (rows - 1) * sgap) / rows);
  const stationW = cityClamp(rawW, 44, 172);
  const stationH = cityClamp(rawH, 54, 118);
  const gridW = cols * stationW + (cols - 1) * sgap;
  const gridH = rows * stationH + (rows - 1) * sgap;
  return {
    cols,
    rows,
    sgap,
    stationW,
    stationH,
    gridW,
    gridH,
    originX: kit.staffX + Math.round((kit.staffW - gridW) / 2),
    originY: kit.floorTop + Math.round((floorH - gridH) / 2),
    spareY: floorH - gridH,
    spareX: kit.staffW - gridW,
  };
}

/** Plants / cabinets / boxes to fill the corners no desk uses. */
function floorPaintOfficeExtras(ctx, office, kit, night, time) {
  const grid = floorStationGrid(kit);
  const innerRight = kit.innerX + kit.floorW;
  const bottom = kit.floorBottom - 3;
  // plant on the lead carpet corner
  if (kit.leadW >= 60 && kit.floorH >= 90) {
    artDrawPlant(ctx, kit.leadX + Math.max(10, Math.round(kit.leadW * 0.12)), bottom, {
      variant: 'floor', seed: office.index * 3 + 1, t: time, night,
    });
  }
  // trash bin near the door
  artDrawTrashBin(ctx, kit.innerX + Math.round(kit.floorW * 0.42), bottom - 14, { night });
  // spare room on top of the team grid: shelf + boxes
  if (grid.spareY >= 46) {
    const shelfW = Math.min(Math.round(kit.staffW * 0.46), 170);
    const shelfH = Math.min(36, grid.spareY - 14);
    if (shelfW > 26 && shelfH > 14) {
      artDrawBookshelf(ctx, kit.staffX + 4, kit.floorTop + 4, shelfW, shelfH, { night, seed: office.index + 4 });
    }
    artDrawPlant(ctx, kit.staffX + kit.staffW - 14, bottom, { variant: 'floor', seed: office.index + 9, t: time, night });
  } else if (grid.spareX >= 26) {
    artDrawPlant(ctx, kit.staffX + grid.spareX - 8, bottom, { variant: 'floor', seed: office.index + 6, t: time, night });
  }
  // tall offices: a little lounge under the boss desk (sofa + table)
  if (kit.floorH >= 220 && kit.leadW >= 150) {
    const loungeY = kit.floorBottom - Math.max(30, Math.round(kit.floorH * 0.18));
    const loungeW = Math.min(Math.round(kit.leadW * 0.5), 96);
    floorPaintSofa(ctx, kit.leadX + 6, loungeY - 18, loungeW, 24, night);
    artDrawDesk(ctx, kit.leadX + loungeW + 16, loungeY - 12, Math.max(18, Math.round(loungeW * 0.5)), { depth: 14, night });
    artDrawMug(ctx, kit.leadX + loungeW + 20, loungeY - 9, { night, t: time });
  }
  // wide offices get a water cooler tucked into the lead corner
  if (kit.leadW >= 130 && kit.floorH >= 140 && grid.spareY < 40) {
    artDrawWaterCooler(ctx, innerRight - 22, bottom - 36, { night });
  }
}

function floorPaintStation(ctx, x, y, w, h, member, night, time, reduced, seed, floorTop, accent) {
  const deskW = cityClamp(w - Math.max(8, Math.round(w * 0.10)), 40, 172);
  const depth = cityClamp(Math.round(h * 0.28), 12, 38);
  const deskX = x + Math.round((w - deskW) / 2);
  const deskY = y + h - depth - Math.max(8, Math.round(h * 0.12));
  const cx = deskX + Math.round(deskW / 2);
  const spec = artCharacterSpec(member ? (member.sessionId || member.name || seed) : seed + 3);
  const running = !!(member && member.running);
  const chairTop = deskY - Math.round(depth * 1.4) - 8;

  if (member) {
    if (chairTop > floorTop - 6) artDrawChairBack(ctx, cx - 10, chairTop, spec.chair, {});
    artPerson(ctx, cx - 8, deskY - 11, spec, {
      role: member.role === 'lead' ? 'teammate' : (member.role || 'teammate'),
      running,
      t: time,
      reducedMotion: reduced,
      blink: Math.floor(time / 5000 + seed) % 7 === 0,
    });
  } else {
    floorPaintEmptyChair(ctx, cx, deskY, spec.chair, night);
  }
  artDrawDesk(ctx, deskX, deskY, deskW, { depth, night });
  const mw = cityClamp(Math.round(deskW * 0.34), 14, 40);
  const mh = cityClamp(Math.round(mw * 0.72), 10, 28);
  if (deskW >= 128) {
    artDrawMonitor(ctx, cx - mw - 6, deskY + 2, mw, mh, { running, night, t: time, reducedMotion: reduced, seed: seed + 4 });
    artDrawMonitor(ctx, cx + 6, deskY + 2, mw, mh, { running, night, t: time, reducedMotion: reduced, seed: seed + 9 });
  } else {
    artDrawMonitor(ctx, cx - Math.round(mw / 2), deskY + 2, mw, mh, { running, night, t: time, reducedMotion: reduced, seed: seed + 4 });
  }
  const kbW = Math.min(Math.round(deskW * 0.36), 44);
  if (deskW >= 46) artDrawKeyboard(ctx, cx - Math.round(kbW / 2), deskY + depth - Math.max(5, Math.round(depth * 0.28)), kbW, { night });
  if (deskW >= 52) artDrawMug(ctx, deskX + deskW - Math.max(8, Math.round(deskW * 0.14)), deskY + Math.max(2, Math.round(depth * 0.16)), { night, t: time, seed });
  if (deskW >= 110) artDrawPapers(ctx, deskX + Math.round(deskW * 0.1), deskY + Math.max(2, Math.round(depth * 0.2)), { seed: seed + 2 });
  if (member) artPersonHands(ctx, cx, deskY, spec, { running, t: time, reducedMotion: reduced });
  if (running) cityPixelGlow(ctx, cx, deskY + Math.round(depth / 2), Math.round(deskW * 0.34), PAL.screenGlow, night ? 0.14 : 0.05);
  if (!member && accent) artRect(ctx, x, y + h - 1, w, 1, 'rgba(16,20,30,0.10)');
}

function floorPaintEmptyChair(ctx, cx, deskY, color, night) {
  const c = color || PAL.chair;
  const light = artShade(c, 0.24);
  const dark = artShade(c, -0.3);
  artRect(ctx, cx - 7, deskY - 15, 14, 9, c);
  artRect(ctx, cx - 7, deskY - 15, 14, 1, light);
  artRect(ctx, cx - 7, deskY - 8, 14, 1, dark);
  artRect(ctx, cx - 8, deskY - 17, 2, 11, dark);
  artRect(ctx, cx + 7, deskY - 17, 2, 11, dark);
  if (!night) artRect(ctx, cx - 5, deskY - 12, 10, 2, light);
}

/* --------------------------------------------------------------- corridor */

function floorPaintCorridor(ctx, scene, night, time) {
  const W = scene.w;
  const layout = scene.layout;
  const top = layout.corridorTop;
  const bottom = scene.h - layout.foregroundH;
  const height = Math.max(20, bottom - top);
  const floor = night ? '#313d50' : '#c9c0aa';

  artRect(ctx, 0, top, W, height, floor);
  artRect(ctx, 0, top, W, 3, night ? '#131b28' : '#948b7c');
  // corridor planks: fixed spacing, more planks when the window is wider
  const plank = 80;
  for (let x = 0; x < W; x += plank) artRect(ctx, x, top, 1, height, night ? '#252e3d' : '#b9ae97');
  artRect(ctx, 0, top + Math.round(height * 0.5), W, 1, night ? '#232c3a' : '#bdb39d');
  // runner rug: fixed size, centred (clipped by narrow windows, never stretched)
  const rugW = 520;
  const rugX = Math.round((W - rugW) / 2);
  const rugH = Math.max(12, Math.round(height * 0.36));
  artDrawCarpet(ctx, rugX, top + Math.round(height * 0.32), rugW, rugH, {
    main: artShade(ART_ACCENTS[1].main, 0.3),
    dark: ART_ACCENTS[1].dark,
    light: artShade(ART_ACCENTS[1].light, 0.2),
  }, { night });

  // elevator (left end, fixed size)
  const elevW = 96;
  const elevH = Math.min(height - 8, 48);
  const elevX = layout.margin + 4;
  const elevY = top + Math.round((height - elevH) / 2);
  floorPaintElevator(ctx, elevX, elevY, elevW, elevH, night, time);

  // water cooler
  const coolerX = elevX + elevW + 16;
  artDrawWaterCooler(ctx, coolerX, top + Math.round(height * 0.18), { night });

  // fixed-size corridor props at a fixed spacing; a wider window simply shows more
  const baseY = top + Math.round(height * 0.74);
  const pagerReserved = scene.pager && scene.pager.visible ? scene.pager.x - 26 : W;
  const kinds = ['plant', 'bench', 'bulletin', 'coffee', 'printer', 'plant', 'boxes', 'trash'];
  const limit = Math.min(pagerReserved, W - layout.margin);
  let cursor = coolerX + 46;
  let kindIndex = 0;
  while (cursor + 90 < limit) {
    const kind = kinds[kindIndex % kinds.length];
    if (kind === 'plant') {
      artDrawPlant(ctx, cursor, baseY, { variant: 'floor', seed: 21 + kindIndex, t: time, night });
    } else if (kind === 'bench') {
      floorPaintBench(ctx, cursor, baseY, 90, night);
    } else if (kind === 'bulletin') {
      artDrawWhiteboard(ctx, cursor, top + Math.round(height * 0.14), 96, Math.max(16, Math.round(height * 0.5)), {
        done: 2, total: 7, accent: PAL.ledAmber, seed: 12, night,
      });
    } else if (kind === 'coffee') {
      artDrawCounter(ctx, cursor, top + Math.round(height * 0.34), 70, Math.max(18, Math.round(height * 0.42)), { night });
      artDrawCoffeeMachine(ctx, cursor + 14, top + Math.round(height * 0.16), { night, t: time });
    } else if (kind === 'printer') {
      artDrawPrinter(ctx, cursor, top + Math.round(height * 0.2), { night, t: time });
    } else if (kind === 'boxes') {
      artDrawBoxes(ctx, cursor, baseY - 20, { night });
    } else {
      artDrawTrashBin(ctx, cursor, baseY - 14, { night });
    }
    cursor += 108;
    kindIndex += 1;
  }

  // ceiling lights along the corridor: fixed size + fixed spacing
  for (let lx = 70; lx < W - 40; lx += 150) {
    const lightW = 26;
    artRect(ctx, lx - Math.round(lightW / 2), top + 2, lightW, 2, night ? '#ffd97a' : '#f7f4ec');
    if (night) cityLightPool(ctx, lx, top + 2, Math.round(lightW * 1.7), Math.max(6, Math.round(height * 0.2)), PAL.lampLight, 0.12);
  }
}

function floorPaintElevator(ctx, x, y, w, h, night, time) {
  const frame = night ? '#39485c' : PAL.metalDark;
  const frameLight = night ? '#5d7189' : PAL.metal;
  const door = night ? '#16243a' : '#9aa3ad';
  artRect(ctx, x, y, w, h, frame);
  artRect(ctx, x + 2, y + 2, w - 4, h - 4, door);
  artRect(ctx, x + 2, y + 2, w - 4, Math.max(1, Math.round(h * 0.12)), frameLight);
  artRect(ctx, x + Math.round(w / 2) - 1, y + 2, 2, h - 4, frame);
  artRect(ctx, x + 2, y + h - Math.max(2, Math.round(h * 0.14)), w - 4, Math.max(2, Math.round(h * 0.14)), frame);
  // indicator
  const indW = Math.max(8, Math.round(w * 0.24));
  const indH = Math.max(5, Math.round(h * 0.12));
  artRect(ctx, x + Math.round((w - indW) / 2), y - indH - 2, indW, indH, night ? '#0c1420' : '#2f3542');
  const arrowDir = Math.floor(time / 1600) % 2 === 0 ? 'up' : 'down';
  cityChevron(ctx, x + Math.round(w / 2) - 3, y - indH + 1, 6, arrowDir, night ? '#ffd97a' : '#e8b153');
  if (night) {
    cityPixelGlow(ctx, x + w / 2, y + Math.round(h * 0.5), Math.round(w * 0.8), PAL.lampLight, 0.12);
  }
}

function floorPaintBench(ctx, x, baseY, width, night) {
  const w = Math.max(30, Math.round(width));
  const wood = night ? '#5a4a3a' : PAL.wood;
  const dark = night ? '#41342a' : PAL.woodDark;
  const metal = night ? '#2b3448' : PAL.metalDark;
  artShadow(ctx, x + 2, baseY - 2, w - 4, 5, night ? 0.34 : 0.18);
  artRect(ctx, x, baseY - Math.round(w * 0.10), w, Math.max(2, Math.round(w * 0.05)), wood);
  artRect(ctx, x + Math.round(w * 0.06), baseY - Math.round(w * 0.12), Math.round(w * 0.88), 2, dark);
  artRect(ctx, x, baseY - Math.round(w * 0.12), w, Math.max(2, Math.round(w * 0.05)), wood);
  artRect(ctx, x + 2, baseY - 6, 3, 6, metal);
  artRect(ctx, x + w - 5, baseY - 6, 3, 6, metal);
}

/* ------------------------------------------------------------- foreground */

function floorPaintForeground(ctx, scene, night, time) {
  const W = scene.w;
  const layout = scene.layout;
  const top = scene.h - layout.foregroundH;
  const height = layout.foregroundH;
  artRect(ctx, 0, top, W, height, night ? '#141d2b' : '#b0a897');
  artRect(ctx, 0, top, W, 2, night ? '#39465c' : '#c9c0ac');
  // railing posts: fixed size + fixed spacing
  const postGap = 72;
  for (let x = 28; x < W; x += postGap) {
    artRect(ctx, x, top + 4, 2, Math.max(3, Math.round(height * 0.6)), night ? '#2b3a52' : '#8b8272');
  }
  artRect(ctx, 0, top + 7, W, 2, night ? '#2b3a52' : '#9aa3ad');
  artRect(ctx, 0, scene.h - 4, W, 4, night ? '#0d1520' : '#8b8272');
  // small vents on the cutaway lip: fixed size + fixed spacing
  const ventW = 52;
  for (let x = 66; x < W - ventW; x += 150) {
    artDrawAirVent(ctx, x, top + 5, ventW, 8, { night });
  }
}

/* --------------------------------------------------------------- scroll UI */

function floorPaintScrollEdges(ctx, scene, night) {
  const layout = scene.layout;
  const W = scene.w;
  const color = night ? 'rgba(10,18,32,0.55)' : 'rgba(70,62,50,0.16)';
  if (layout.scroll > 0) artRect(ctx, 0, layout.gridTop, W, Math.max(3, Math.round(layout.gap * 0.6)), color);
  if (layout.scroll < layout.scrollMax) {
    artRect(ctx, 0, layout.gridBottom - Math.max(3, Math.round(layout.gap * 0.6)), W, Math.max(3, Math.round(layout.gap * 0.6)), color);
  }
}

function floorPaintNightGlow(ctx, scene, time) {
  if (scene.total === 0) return;
  for (let index = 0; index < scene.offices.length; index += 1) {
    const office = scene.offices[index];
    if (!office.running) continue;
    const kit = floorOfficeKit(office);
    // Light falls from the back-wall windows onto the floor: hard bands, no blur.
    ctx.globalAlpha = 0.09;
    artRect(ctx, kit.innerX + Math.round(kit.floorW * 0.12), kit.floorTop, Math.round(kit.floorW * 0.32), Math.round(kit.floorH * 0.6), PAL.lampLight);
    artRect(ctx, kit.innerX + Math.round(kit.floorW * 0.5), kit.floorTop, Math.round(kit.floorW * 0.28), Math.round(kit.floorH * 0.5), PAL.lampLight);
    ctx.globalAlpha = 1;
    cityPixelGlow(ctx, kit.innerX + Math.round(kit.floorW / 2), kit.floorTop + Math.round(kit.floorH * 0.24), Math.round(Math.min(kit.floorW, kit.floorH) * 0.2), PAL.lampLight, 0.1);
  }
}
