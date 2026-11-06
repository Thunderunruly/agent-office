// CITY SCENE — one office tower seen from the street. Every floor is a Workspace and the
// little lit windows on a floor are that workspace's Sessions. The canvas is responsive
// (viewport driven) and the tower scrolls when there are more floors than fit.
// Owner: T2 (scene). Painting only: no DOM / images / gradients. Integer pixels.

const CITY_FALLBACK_W = 640;
const CITY_FALLBACK_H = 360;
const CITY_FLOOR_HEIGHT = 32;

// ---- fixed pixel world -----------------------------------------------------
// The tower block never scales: resizing the window only reveals more/less of the
// fixed world around it. All of these are logical pixels and must stay constant.
const CITY_TOWER_W = 420;
const CITY_SHAFT_W = 24;
const CITY_BOARD_W = 208;
const CITY_MARGIN = 16;
const CITY_ROOF_H = 26;
const CITY_LOBBY_H = 32;
const CITY_SIDEWALK_H = 18;
const CITY_ROAD_H = 38;
const CITY_STREET_H = CITY_SIDEWALK_H + CITY_ROAD_H; // 56
const CITY_CUT_H = 3;
const CITY_BLOCK_W = CITY_TOWER_W + CITY_SHAFT_W + CITY_BOARD_W + CITY_MARGIN * 2; // 684
const CITY_WORLD_HALF = 1500;
// Fixed street-life sizes (never derived from the viewport).
const CITY_LAMP_H = 54;
const CITY_TREE_H = 46;
const CITY_KIOSK_W = 96;
const CITY_KIOSK_H = 40;
const CITY_CAR_H = 18;
const CITY_VAN_H = 20;
const CITY_BUS_H = 18;

const CITY_ACCENT_COLORS = [
  '#5d7f9a', '#a9715a', '#6d8f6a', '#b08a52',
  '#8a6d92', '#7d8494', '#a35d68', '#5f8f8a',
];

const CITY_DIGITS = {
  0: '111101101101111',
  1: '010110010010111',
  2: '111001111100111',
  3: '111001111001111',
  4: '101101111001001',
  5: '111100111001111',
  6: '111100111101111',
  7: '111001001001001',
  8: '111101111101111',
  9: '111101111001111',
};

function cityClamp(value, min, max) {
  const n = Number(value);
  const v = Number.isFinite(n) ? n : min;
  return Math.max(min, Math.min(max, v));
}

function cityReadViewport(viewport) {
  const w = viewport && Number(viewport.w);
  const h = viewport && Number(viewport.h);
  return {
    w: Number.isFinite(w) && w >= 200 ? Math.round(w) : CITY_FALLBACK_W,
    h: Number.isFinite(h) && h >= 160 ? Math.round(h) : CITY_FALLBACK_H,
  };
}

/* ------------------------------------------------------------------ primitives */

function cityDrawDigits(ctx, x, y, text, scale, color) {
  const value = String(text == null ? '' : text);
  const unit = Math.max(1, Math.round(scale || 1));
  let cursor = Math.round(x);
  let drawn = 0;
  for (let index = 0; index < value.length; index += 1) {
    const bits = CITY_DIGITS[value[index]];
    if (!bits) {
      cursor += unit * 4;
      continue;
    }
    drawn += 1;
    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        if (bits[row * 3 + col] !== '1') continue;
        artRect(ctx, cursor + col * unit, Math.round(y) + row * unit, unit, unit, color);
      }
    }
    cursor += unit * 4;
  }
  return Math.max(0, cursor - Math.round(x) - unit * (drawn > 0 ? 1 : 0));
}

/** Small blocky chevron: dir = 'up' | 'down'. */
function cityChevron(ctx, x, y, size, dir, color) {
  const s = Math.max(3, Math.round(size));
  const rows = Math.max(2, Math.floor(s / 2));
  for (let i = 0; i < rows; i += 1) {
    const width = s - i * 2;
    if (width <= 0) break;
    const row = dir === 'up' ? rows - i - 1 : i;
    artRect(ctx, x + i, y + row, width, 1, color);
  }
}

/* ------------------------------------------------------------ pixel lighting */

/**
 * Hard-edged pixel glow: three stepped diamond bands plus corner dither pixels.
 * Replaces artGlow (smooth canvas ellipse) so night lights stay chunky pixel art.
 */
function cityPixelGlow(ctx, cx, cy, radius, color, strength) {
  // Clamp hard: a pixel glow is a small prop light, never a soft screen-sized blob.
  const r = Math.max(2, Math.min(30, Math.round(radius)));
  const base = cityClamp(Number(strength) || 0.18, 0.02, 0.6);
  const bands = [
    [r, 0.5],
    [Math.max(1, Math.round(r * 0.62)), 0.8],
    [Math.max(1, Math.round(r * 0.3)), 1],
  ];
  for (let index = 0; index < bands.length; index += 1) {
    const rr = bands[index][0];
    const mul = bands[index][1];
    const h = Math.max(1, Math.round(rr * 0.5));
    ctx.globalAlpha = base * 0.55 * mul;
    artRect(ctx, cx - rr, cy - Math.round(h / 2), rr * 2, h, color);
    artRect(ctx, cx - Math.round(rr / 2), cy - rr, Math.max(1, rr), rr * 2, color);
  }
  // 1px dithered rim keeps the edge from reading as a soft blob
  ctx.globalAlpha = base * 0.6;
  artRect(ctx, cx - r, cy - Math.round(r * 0.5), 1, 1, color);
  artRect(ctx, cx + r - 1, cy - Math.round(r * 0.5), 1, 1, color);
  artRect(ctx, cx - r, cy + Math.round(r * 0.5) - 1, 1, 1, color);
  artRect(ctx, cx + r - 1, cy + Math.round(r * 0.5) - 1, 1, 1, color);
  artRect(ctx, cx - Math.round(r * 0.5), cy - r, 1, 1, color);
  artRect(ctx, cx + Math.round(r * 0.5), cy + r - 1, 1, 1, color);
  ctx.globalAlpha = 1;
}

/** Hard-banded light pool on the ground (street lamps, lit doors). */
function cityLightPool(ctx, cx, top, width, height, color, strength) {
  const rows = Math.max(3, Math.round(height / 6));
  const rowH = Math.max(2, Math.round(height / rows));
  const base = cityClamp(Number(strength) || 0.14, 0.02, 0.4);
  for (let index = 0; index < rows; index += 1) {
    const t = index / Math.max(1, rows - 1);
    const w = Math.round(width * (0.32 + t * 0.68));
    ctx.globalAlpha = base * (1 - t * 0.72);
    artRect(ctx, cx - Math.round(w / 2), top + index * rowH, w, rowH, color);
    // dithered top edge of each band
    ctx.globalAlpha = base * 1.2 * (1 - t * 0.72);
    const edge = Math.max(1, Math.round(w * 0.18));
    artRect(ctx, cx - Math.round(w / 2), top + index * rowH, edge, 1, color);
    artRect(ctx, cx + Math.round(w / 2) - edge, top + index * rowH, edge, 1, color);
  }
  ctx.globalAlpha = 1;
}

/** Hard stepped headlight cone in front of a moving car. */
function cityHeadlight(ctx, x, y, width, height, dir, color) {
  const steps = 3;
  for (let index = 0; index < steps; index += 1) {
    const t = index / steps;
    const w = Math.round(width * (0.55 + t * 0.45));
    const h = Math.max(1, Math.round(height * 0.22));
    const oy = y - Math.round(h / 2) + index * Math.max(1, Math.round(height * 0.18));
    ctx.globalAlpha = 0.22 * (1 - t * 0.5);
    if (dir > 0) artRect(ctx, x, oy, w, h, color);
    else artRect(ctx, x - w, oy, w, h, color);
  }
  ctx.globalAlpha = 1;
}

/* ----------------------------------------------------------------- pixel pager */

/**
 * In-canvas pixel pager: ▲ button, a vertical track with page ticks + a little car,
 * ▼ button and an optional pixel page-number window. Deliberately glow-free: this is
 * scene furniture (a physical control panel), not a light source.
 */
function cityPaintPager(ctx, panel, night, page, pageCount) {
  if (!panel || panel.visible !== true) return;
  const x = panel.x;
  const y = panel.y;
  const w = panel.w;
  const h = panel.h;
  const size = panel.size;
  const plate = night ? '#1b2534' : '#efeadd';
  const plateEdge = night ? '#0b1422' : '#8b8272';
  const plateLight = night ? '#2b3a52' : '#f7f4ec';
  const buttonFace = night ? '#2b3a52' : '#c9c0ac';
  const buttonFaceOff = night ? '#182230' : '#d3ccbb';
  const buttonEdge = night ? '#0f1826' : '#6f6354';
  const buttonLight = night ? '#3d5273' : '#f7f4ec';
  const inkOn = night ? '#ffe08a' : '#2f3542';
  const inkOff = night ? '#3a4a64' : '#b9b2a3';

  // plate + 1px hard shadow so it reads as a mounted panel
  artRect(ctx, x + 2, y + 3, w, h, night ? 'rgba(4,8,14,0.32)' : 'rgba(60,52,40,0.14)');
  artRect(ctx, x, y, w, h, plate);
  artOutline(ctx, x, y, w, h, plateEdge);
  artRect(ctx, x + 2, y + 2, w - 4, 1, plateLight);
  artRect(ctx, x + 2, y + h - 3, w - 4, 1, plateEdge);

  const bx = x + Math.round((w - size) / 2);
  const buttons = [
    { by: panel.upY, dir: 'up', enabled: page > 0 },
    { by: panel.downY, dir: 'down', enabled: page < pageCount - 1 },
  ];
  for (let index = 0; index < buttons.length; index += 1) {
    const button = buttons[index];
    artRect(ctx, bx, button.by, size, size, button.enabled ? buttonFace : buttonFaceOff);
    artOutline(ctx, bx, button.by, size, size, buttonEdge);
    artRect(ctx, bx + 1, button.by + 1, size - 2, 1, button.enabled ? buttonLight : plateEdge);
    artRect(ctx, bx + 1, button.by + size - 2, size - 2, 1, buttonEdge);
    const chev = Math.max(3, Math.round(size * 0.42));
    cityChevron(
      ctx,
      bx + Math.round((size - chev) / 2),
      button.by + Math.round((size - chev * 0.55) / 2),
      chev,
      button.dir,
      button.enabled ? inkOn : inkOff,
    );
  }

  // track, page ticks and the car
  const tx = x + Math.round(w / 2);
  const trackTop = panel.trackTop;
  const trackBottom = panel.trackBottom;
  if (trackBottom > trackTop) {
    artRect(ctx, tx - 1, trackTop, 1, trackBottom - trackTop, night ? '#101a28' : '#9c9484');
    artRect(ctx, tx, trackTop, 1, trackBottom - trackTop, night ? '#22304a' : '#d3ccbb');
    for (let index = 0; index < pageCount; index += 1) {
      const ratio = pageCount > 1 ? index / (pageCount - 1) : 0;
      const ty = Math.round(trackTop + (trackBottom - trackTop) * ratio);
      const tickW = index === page ? 5 : 3;
      artRect(ctx, tx - Math.floor(tickW / 2), ty, tickW, 1, index === page ? inkOn : (night ? '#2b3a52' : '#b9b2a3'));
    }
    const ratio = pageCount > 1 ? page / (pageCount - 1) : 0;
    const carY = Math.round(trackTop + (trackBottom - trackTop) * ratio);
    artRect(ctx, tx - 3, carY - 2, 7, 5, inkOn);
    artRect(ctx, tx - 2, carY - 1, 5, 3, night ? '#fff3c6' : '#f7f4ec');
    artRect(ctx, tx - 1, carY + 2, 3, 1, night ? '#c9a45c' : '#8b8272');
  }

  // page number window: pixel digits only, no words
  if (panel.digitY != null && panel.digitScale > 0) {
    const label = String(cityClamp(page + 1, 1, 99));
    const scale = panel.digitScale;
    const digitsW = label.length * 4 * scale - scale;
    const digitsH = 5 * scale;
    const winW = w - 8;
    artRect(ctx, x + 4, panel.digitY - 2, winW, digitsH + 4, night ? '#0f1826' : '#3a4150');
    artOutline(ctx, x + 4, panel.digitY - 2, winW, digitsH + 4, plateEdge);
    artRect(ctx, x + 5, panel.digitY - 1, winW - 2, 1, night ? '#2b3a52' : '#5f6b78');
    cityDrawDigits(ctx, x + Math.round((w - digitsW) / 2), panel.digitY, label, scale, night ? '#ffe08a' : '#ffd97a');
  }
}

/**
 * Pager geometry shared by the tower and the floor plan. Buttons + track always fit
 * inside the given band; `compact` (the corridor panel) only squeezes in the pixel
 * page-number window when the band is tall enough.
 * Returns panel-relative offsets, the caller translates them to canvas coordinates.
 */
function cityPagerLayout(box) {
  const compact = box && box.compact === true;
  const pageCount = Math.max(1, Math.round(Number(box && box.pageCount) || 1));
  const bandHeight = Math.max(24, Math.round(Number(box && box.height) || 120));
  const pad = compact ? 3 : 6;
  const gap = compact ? 2 : 5;
  let size = cityClamp(Math.round(Number(box && box.sizeHint) || 24), compact ? 12 : 20, compact ? 34 : 38);
  const trackFor = (s) => cityClamp(Math.round(s * 0.7), compact ? 8 : 14, compact ? 30 : 64);
  if (compact) {
    while (size > 11 && size * 2 + trackFor(size) + pad * 2 + gap * 2 > bandHeight) size -= 1;
  }
  const trackLen = trackFor(size);
  const labelLen = String(pageCount).length;
  const baseH = pad + size + gap + trackLen + gap + size + pad;
  let digitScale = 0;
  if (compact) {
    digitScale = baseH + gap + 9 <= bandHeight ? 1 : 0;
  } else {
    digitScale = Math.max(1, Math.min(3, Math.floor((size + 10) / (4 * labelLen))));
  }
  const digitBlock = digitScale > 0 ? 5 * digitScale + 4 : 0;
  const w = size + (compact ? 10 : 12);
  const h = baseH + (digitBlock > 0 ? gap + digitBlock : 0);
  return {
    size,
    w,
    h,
    upY: pad,
    downY: pad + size + gap + trackLen + gap,
    trackTop: pad + size + gap,
    trackBottom: pad + size + gap + trackLen,
    digitY: digitBlock > 0 ? pad + size + gap + trackLen + gap + size + gap + 2 : null,
    digitScale,
  };
}

/**
 * Split `total` pixels between chrome bands. Each band owns a hard minimum and a
 * comfortable preference; spare pixels are shared by weight, and if there is not even
 * room for the minimums they are scaled down together. The result always sums to
 * `total`, so a page never has a blank strip left over.
 */
function cityDistributeChrome(total, bands) {
  const target = Math.max(0, Math.round(Number(total) || 0));
  const count = bands.length;
  const mins = bands.map((band) => Math.max(0, Math.round(Number(band.min) || 0)));
  const prefs = bands.map((band, index) => Math.max(mins[index], Math.round(Number(band.pref) || 0)));
  const minSum = mins.reduce((sum, value) => sum + value, 0);
  const sizes = mins.slice();

  if (minSum > target) {
    // Not even the minimums fit: scale them proportionally.
    const scale = target / Math.max(1, minSum);
    let used = 0;
    for (let index = 0; index < count; index += 1) {
      sizes[index] = Math.floor(mins[index] * scale);
      used += sizes[index];
    }
    sizes[0] += target - used;
    return sizes;
  }

  const prefSum = prefs.reduce((sum, value) => sum + value, 0);
  if (prefSum > target) {
    // Squeeze preferences down towards the minimums.
    const flex = target - minSum;
    const prefFlex = prefs.reduce((sum, value, index) => sum + Math.max(0, value - mins[index]), 0);
    let used = 0;
    for (let index = 0; index < count; index += 1) {
      const room = Math.max(0, prefs[index] - mins[index]);
      sizes[index] = mins[index] + (prefFlex > 0 ? Math.round((room * flex) / prefFlex) : 0);
      used += sizes[index];
    }
    sizes[0] = Math.max(0, sizes[0] + (target - used));
    return sizes;
  }

  // Comfortable sizes fit: share the surplus by weight.
  for (let index = 0; index < count; index += 1) sizes[index] = prefs[index];
  const weights = bands.map((band) => Math.max(0, Number(band.weight == null ? 1 : band.weight) || 0));
  const weightSum = weights.reduce((sum, value) => sum + value, 0) || 1;
  const extra = target - prefSum;
  let used = 0;
  for (let index = 0; index < count; index += 1) {
    sizes[index] += Math.floor((extra * weights[index]) / weightSum);
    used += sizes[index];
  }
  sizes[0] += target - used;
  return sizes;
}


/* ------------------------------------------------------------------- scenery */

function cityBuildSkyline(near) {
  const blocks = [];
  const rng = artRng(near ? 9181 : 1337);
  const minW = near ? 74 : 44;
  const maxW = near ? 150 : 92;
  const minH = near ? 46 : 68;
  const maxH = near ? 132 : 178;
  let x = -CITY_WORLD_HALF;
  let guard = 0;
  while (x < CITY_WORLD_HALF && guard < 140) {
    const bw = Math.max(18, minW + Math.floor(rng() * Math.max(1, maxW - minW)));
    const bh = Math.max(24, minH + Math.floor(rng() * Math.max(1, maxH - minH)));
    blocks.push({
      x,
      w: bw,
      h: bh,
      seed: 1 + Math.floor(rng() * 997),
      roof: Math.floor(rng() * 3),
      antenna: rng() > 0.55,
      stair: rng() > 0.5,
    });
    x += bw + 6 + Math.floor(rng() * 10);
    guard += 1;
  }
  return blocks;
}

function cityBuildStars() {
  const stars = [];
  const rng = artRng(4242);
  for (let index = 0; index < 96; index += 1) {
    stars.push({
      x: Math.round(-CITY_WORLD_HALF + rng() * CITY_WORLD_HALF * 2),
      y: Math.round(rng() * 300),
      phase: Math.floor(rng() * 7),
      big: rng() > 0.9,
    });
  }
  return stars;
}

function cityBuildClouds() {
  const clouds = [];
  const rng = artRng(777);
  for (let index = 0; index < 12; index += 1) {
    clouds.push({
      offset: Math.round(-CITY_WORLD_HALF + rng() * CITY_WORLD_HALF * 2),
      y: 16 + Math.round(rng() * 110),
      w: 78 + Math.round(rng() * 66),
      speed: (0.0022 + rng() * 0.0032) * (rng() > 0.5 ? 1 : -1),
      depth: rng() > 0.5 ? 1 : 0,
    });
  }
  return clouds;
}

function cityBuildBirds() {
  const birds = [];
  const rng = artRng(2024);
  for (let index = 0; index < 7; index += 1) {
    birds.push({
      offset: Math.round(-CITY_WORLD_HALF + rng() * CITY_WORLD_HALF * 2),
      y: 34 + Math.round(rng() * 96),
      speed: 0.006 + rng() * 0.006,
      flap: 0.4 + rng(),
    });
  }
  return birds;
}

function cityBuildCars(W, H, roadTop, roadH) {
  const lane0 = roadTop + 4;
  const lane1 = roadTop + 16;
  return [
    { kind: 'car', lane: lane0, h: CITY_CAR_H, w: Math.round(CITY_CAR_H * 2.7), speed: 0.026, base: -380, dir: 1, day: '#c96a5f', night: '#7c4744' },
    { kind: 'van', lane: lane0, h: CITY_VAN_H, w: Math.round(CITY_VAN_H * 3.4), speed: 0.019, base: 180, dir: 1, day: '#5d7f9a', night: '#3a4d63' },
    { kind: 'bus', lane: lane1, h: CITY_BUS_H, w: Math.round(CITY_BUS_H * 5.2), speed: -0.013, base: -120, dir: -1, day: '#c9a45c', night: '#7a6438' },
    { kind: 'car', lane: lane1, h: CITY_CAR_H, w: Math.round(CITY_CAR_H * 2.6), speed: -0.031, base: 320, dir: -1, day: '#6d8f6a', night: '#44604a' },
  ];
}

/* ---------------------------------------------------------------- scene build */

function buildCityScene(cityModel, viewport, options) {
  const vp = cityReadViewport(viewport);
  const W = vp.w;
  const H = vp.h;
  const model = cityModel && typeof cityModel === 'object' ? cityModel : {};
  const workspaces = Array.isArray(model.buildings) ? model.buildings : [];
  const totals = model.totals && typeof model.totals === 'object' ? model.totals : {};
  const total = workspaces.length;
  const empty = total === 0;
  const opts = options && typeof options === 'object' ? options : {};
  const requestedScroll = Math.max(0, Math.round(Number(opts.scroll) || 0));

  const margin = CITY_MARGIN;
  const unit = 1;
  const cutH = CITY_CUT_H;
  const floorH = CITY_FLOOR_HEIGHT;

  // ---- fixed pixel world -----------------------------------------------------
  // Horizontal: the tower block always keeps its size and is centred. A wider viewport
  // reveals more world on both sides; a narrower one first drops the directory board,
  // then crops the side scenery symmetrically. The tower itself never scales.
  const showBoard = W >= CITY_BLOCK_W;
  const towerGroupW = CITY_TOWER_W + CITY_MARGIN + CITY_SHAFT_W; // 460
  const tierW = showBoard ? CITY_BLOCK_W : (W >= towerGroupW ? towerGroupW : CITY_TOWER_W);
  const towerW = CITY_TOWER_W;
  const shaftW = CITY_SHAFT_W;
  const towerX = Math.round((W - tierW) / 2);
  const shaftX = towerX + towerW + CITY_MARGIN;
  const boardX = shaftX + shaftW + CITY_MARGIN;
  const boardW = showBoard ? CITY_BOARD_W : 0;
  const blockRight = showBoard
    ? boardX + CITY_BOARD_W
    : (tierW > CITY_TOWER_W ? shaftX + shaftW : towerX + towerW);
  const leftW = Math.max(0, towerX);
  const sideW = Math.max(0, W - blockRight);
  const worldCenter = Math.round(W / 2);

  // Vertical: fixed chrome. A taller window only adds sky above the block (street stays
  // glued to the bottom edge); a shorter one paginates with the pixel pager.
  const roofH = CITY_ROOF_H;
  const lobbyH = CITY_LOBBY_H;
  const sidewalkH = CITY_SIDEWALK_H;
  const roadH = CITY_ROAD_H;
  const streetH = CITY_STREET_H;
  const singleNeed = total * floorH + roofH + lobbyH + streetH;

  const pages = [];
  if (empty) {
    pages.push({ start: 0, count: 0, atTop: true, atBottom: true });
  } else if (singleNeed <= H) {
    pages.push({ start: 0, count: total, atTop: true, atBottom: true });
  } else {
    const capFirst = Math.max(1, Math.floor((H - roofH - cutH) / floorH));
    const capMiddle = Math.max(1, Math.floor((H - 2 * cutH) / floorH));
    const capLast = Math.max(1, Math.floor((H - lobbyH - streetH - cutH) / floorH));
    const lastStart = Math.max(1, total - capLast);
    let start = 0;
    let first = true;
    while (start < lastStart) {
      const cap = first ? capFirst : capMiddle;
      // Floor 1 only ever shows on the page that carries the ground.
      const count = Math.max(1, Math.min(cap, total - 1 - start));
      pages.push({ start, count, atTop: first, atBottom: false });
      start += count;
      first = false;
    }
    pages.push({
      start: lastStart,
      count: Math.min(capLast, total - lastStart),
      atTop: false,
      atBottom: true,
    });
  }
  const pageCount = pages.length;
  const scrollMax = Math.max(0, pageCount - 1);
  const scroll = cityClamp(requestedScroll, 0, scrollMax);
  const plan = pages[scroll];
  const atTop = plan.atTop;
  const atBottom = plan.atBottom;
  const pageOffset = plan.start;
  const pageRows = plan.count;
  const pageFirstFloor = empty ? 0 : total - pageOffset;
  const pageLastFloor = empty ? 0 : total - (pageOffset + pageRows - 1);
  const pageSize = pages.reduce((best, page) => Math.max(best, page.count), 0);
  const bodyH = empty ? 0 : pageRows * floorH;

  // Page chrome: first page owns sky + roof, last page owns lobby + street; middle pages
  // only carry the dark cut slabs. Every size above is a constant, so paging never
  // stretches the art — it just reveals another fixed slice of the tower.
  let skyH = 0;
  let topBand = 0;
  let bottomBand = 0;
  if (empty) {
    skyH = Math.max(0, H - roofH - lobbyH - streetH - 220);
  } else if (atTop && atBottom) {
    skyH = Math.max(0, H - singleNeed);
  } else if (atTop) {
    skyH = Math.max(0, H - roofH - bodyH - cutH);
    bottomBand = cutH;
  } else if (atBottom) {
    topBand = Math.max(cutH, H - bodyH - lobbyH - streetH);
  } else {
    const extra = Math.max(0, H - bodyH - 2 * cutH);
    topBand = cutH + Math.floor(extra / 2);
    bottomBand = cutH + extra - Math.floor(extra / 2);
  }
  const streetY = atBottom ? H - streetH : H;
  const curbY = atBottom ? streetY + sidewalkH : H;
  const skyTop = atTop ? skyH : 0;
  const roofTop = skyTop;
  const towerY = roofTop;
  const towerRoofH = atTop ? roofH : 0;
  const rowsTop = skyTop + towerRoofH + topBand;
  const rowsBottom = rowsTop + bodyH;

  const tower = {
    x: towerX,
    y: towerY,
    w: towerW,
    h: Math.max(0, streetY - towerY),
    skyTop,
    roofTop,
    roofH: towerRoofH,
    rowsTop,
    rowH: floorH,
    bodyH,
    rowsBottom,
    bodyBottom: rowsBottom,
    lobbyY: rowsBottom,
    lobbyH,
    streetY,
    topBand,
    bottomBand,
    page: scroll,
    pageSize,
    pageCount,
    pageOffset,
    pageRows,
    rows: [],
    atTop,
    atBottom,
    cutH,
    total,
  };

  const directoryTop = atTop ? roofTop : 0;
  const directoryBottom = atBottom ? streetY : H;
  const shaftTop = atTop ? roofTop : 0;
  const shaftBottom = atBottom ? streetY : H;

  const scene = {
    kind: 'city',
    w: W,
    h: H,
    seed: 7,
    totals,
    empty,
    total,
    scroll,
    scrollMax,
    scrollPageSize: empty ? 0 : pageSize,
    scrollTotal: total,
    scrollVisible: pageRows,
    scrollRange: { from: pageLastFloor, to: pageFirstFloor },
    workspaces,
    leftW,
    sideW,
    margin,
    unit,
    worldCenter,
    showBoard,
    blockRight,
    streetY,
    curbY,
    sidewalkH,
    roadH,
    tower,
    directory: {
      x: boardX,
      y: directoryTop,
      w: boardW,
      h: Math.max(0, directoryBottom - directoryTop),
      labelX: boardX + 17,
      headerH: showBoard && atTop ? roofH : 0,
    },
    shaft: { x: shaftX, w: shaftW, top: shaftTop, bottom: shaftBottom },
    skylineFar: cityBuildSkyline(false),
    skylineNear: cityBuildSkyline(true),
    stars: cityBuildStars(),
    clouds: cityBuildClouds(),
    birds: cityBuildBirds(),
    cars: cityBuildCars(W, H, curbY, roadH),
    hits: [],
    labels: [],
  };

  // ---- in-canvas pixel pager (mounted on the elevator shaft) -----------------
  if (!empty && pageCount > 1) {
    const geo = cityPagerLayout({
      pageCount,
      sizeHint: 24,
      height: bodyH,
      compact: false,
    });
    const panelX = cityClamp(Math.round(shaftX + (shaftW - geo.w) / 2), 2, Math.max(2, W - geo.w - 2));
    const panelY = cityClamp(
      Math.round(rowsTop + bodyH * 0.5 - geo.h / 2),
      6,
      Math.max(6, H - geo.h - 6),
    );
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
      digitY: geo.digitY == null ? null : panelY + geo.digitY,
      digitScale: geo.digitScale,
    };
  } else {
    scene.pager = { visible: false };
  }

  // ---- floors / labels ------------------------------------------------------
  if (!empty) {
    const plateW = cityClamp(Math.round(towerW * 0.085), 22, 64);
    const plateX = towerX + Math.max(4, Math.round(towerW * 0.026));
    const winGap = cityClamp(Math.round(towerW * 0.021), 7, 26);
    const winLeft = plateX + plateW + Math.round(towerW * 0.022);
    const winRight = towerX + towerW - Math.round(towerW * 0.035);
    const winW = Math.max(12, Math.floor((winRight - winLeft - winGap * 3) / 4));
    const winInsetY = Math.round(floorH * 0.17);
    const winH = Math.max(10, floorH - winInsetY * 2);
    scene.floorPaint = {
      plateW,
      plateH: cityClamp(Math.round(floorH * 0.64), 16, 56),
      plateX,
      winGap,
      winLeft,
      winRight,
      winW,
      winH,
      winY: winInsetY,
    };

    for (let slot = 0; slot < pageRows; slot += 1) {
      const index = pageOffset + slot;
      const workspace = workspaces[index];
      if (!workspace) continue;
      const sessions = Array.isArray(workspace.floors) ? workspace.floors : [];
      const y = rowsTop + slot * floorH;
      const floorNumber = total - index;
      const entry = {
        index,
        slot,
        workspaceId: workspace.workspaceId,
        ungrouped: workspace.ungrouped === true,
        title: workspace.title,
        accentSeed: workspace.accentSeed || 1,
        runningCount: workspace.runningCount || 0,
        sessionCount: workspace.sessionCount || sessions.length || 0,
        memberCount: workspace.memberCount || 0,
        sessions: sessions.slice(0, 4),
        hiddenOffices: Math.max(0, sessions.length - 4),
        floorNumber,
        y,
        h: floorH,
      };
      tower.rows.push(entry);
      scene.hits.push({
        x: towerX,
        y,
        w: towerW,
        h: floorH,
        target: { kind: 'building', workspaceId: workspace.workspaceId },
      });
      // DOM labels live on the directory board; when the board is hidden they are hidden
      // with it (a narrow window shows the bare tower, not floating text).
      if (showBoard) {
        scene.labels.push({
          x: scene.directory.labelX,
          y: Math.round(y + floorH / 2),
          anchor: 'right',
          kind: 'workspace',
          text: workspace.title || '',
          data: {
            workspaceId: workspace.workspaceId,
            ungrouped: workspace.ungrouped === true,
            runningCount: workspace.runningCount || 0,
            sessionCount: workspace.sessionCount || sessions.length || 0,
            memberCount: workspace.memberCount || 0,
            floorNumber,
          },
        });
      }
    }

    if (atTop && (skyH >= 40 || showBoard)) {
      // Above the roof when the sky band is tall enough, otherwise pinned to the
      // directory board header (a real building name plate).
      const titleAboveRoof = skyH >= 40;
      scene.labels.push({
        x: titleAboveRoof
          ? Math.round(towerX + towerW / 2)
          : Math.round(scene.directory.x + scene.directory.w / 2),
        y: titleAboveRoof
          ? Math.round(roofTop - 8)
          : Math.round(scene.directory.y + Math.min(Math.round(scene.directory.headerH / 2), 18)),
        anchor: titleAboveRoof ? 'above' : 'center',
        kind: 'tower-title',
        text: '',
        data: { totals, hiddenFloors: 0 },
      });
    }
  } else {
    tower.rows = [];
    tower.lotTop = Math.max(0, streetY - 230);
    tower.y = tower.lotTop;
    tower.roofTop = tower.lotTop;
    scene.directory.y = Math.max(0, tower.lotTop - 18);
    scene.directory.h = showBoard ? Math.max(0, streetY - scene.directory.y) : 0;
    scene.directory.headerH = showBoard ? 30 : 0;
    scene.labels.push({
      x: Math.round(towerX + towerW / 2),
      y: Math.round(Math.max(34, tower.lotTop - 10)),
      anchor: 'above',
      kind: 'tower-title',
      text: '',
      data: { totals, hiddenFloors: 0 },
    });
  }

  // Pager buttons are pushed LAST: hit testing walks the array backwards, and these
  // small rects sit on top of the full-width floor rows. No hit at either limit.
  if (scene.pager.visible === true) {
    const pager = scene.pager;
    const bx = pager.x + Math.round((pager.w - pager.size) / 2);
    if (scroll > 0) {
      scene.hits.push({
        x: bx - 2,
        y: pager.upY - 2,
        w: pager.size + 4,
        h: pager.size + 4,
        target: { kind: 'scroll', delta: -1 },
      });
    }
    if (scroll < scrollMax) {
      scene.hits.push({
        x: bx - 2,
        y: pager.downY - 2,
        w: pager.size + 4,
        h: pager.size + 4,
        target: { kind: 'scroll', delta: 1 },
      });
    }
  }

  return scene;
}

/* ------------------------------------------------------------------ painting */

function paintCityScene(ctx, scene, anim) {
  if (!ctx || !scene) return;
  const night = anim && anim.night === true;
  const time = anim && Number.isFinite(anim.time) ? anim.time : 0;
  const motion = anim && anim.reducedMotion === true ? 0 : time;
  const W = scene.w;
  const H = scene.h;

  cityPaintSky(ctx, scene, night);
  cityPaintStars(ctx, scene, night, motion);
  cityPaintCelestial(ctx, scene, night, motion);
  cityPaintClouds(ctx, scene, night, motion);
  cityPaintBirds(ctx, scene, night, motion);
  cityPaintSkyline(ctx, scene, night, motion);

  if (scene.empty) {
    cityPaintStreet(ctx, scene, night, motion);
    cityPaintEmptyLot(ctx, scene, night, motion);
    cityPaintStreetLife(ctx, scene, night, motion);
    cityPaintCars(ctx, scene, night, motion);
    cityPaintSunGlow(ctx, scene, night);
    return;
  }

  cityPaintTower(ctx, scene, night, motion, anim);
  if (scene.tower.atBottom) {
    cityPaintStreet(ctx, scene, night, motion);
  }
  cityPaintDirectory(ctx, scene, night, motion, anim);
  cityPaintElevator(ctx, scene, night, motion);
  // Street furniture sits between the tower and the viewer, but it is only ever placed
  // in the free bands left / right of the tower footprint, so it can never cover a floor
  // plate or a window.
  if (scene.tower.atBottom) {
    cityPaintStreetLife(ctx, scene, night, motion);
    cityPaintCars(ctx, scene, night, motion);
  }
  cityPaintSunGlow(ctx, scene, night);
  cityPaintPager(ctx, scene.pager, night, scene.scroll, scene.tower.pageCount);
}

function cityPaintSky(ctx, scene, night) {
  const W = scene.w;
  const H = scene.h;
  if (night) {
    const bands = ['#0d1a30', '#12243c', '#182c47', '#22385a'];
    const stops = [0, 0.26, 0.52, 0.75, 1];
    for (let index = 0; index < bands.length; index += 1) {
      const y0 = Math.round(H * stops[index]);
      const y1 = Math.round(H * stops[index + 1]);
      artRect(ctx, 0, y0, W, Math.max(1, y1 - y0), bands[index]);
    }
  } else {
    const bands = ['#8ec9e2', '#a4d2e6', '#bedde9', '#d8e9ea'];
    const stops = [0, 0.30, 0.58, 0.80, 1];
    for (let index = 0; index < bands.length; index += 1) {
      const y0 = Math.round(H * stops[index]);
      const y1 = Math.round(H * stops[index + 1]);
      artRect(ctx, 0, y0, W, Math.max(1, y1 - y0), bands[index]);
    }
  }
}

function cityPaintStars(ctx, scene, night, time) {
  if (!night) return;
  for (let index = 0; index < scene.stars.length; index += 1) {
    const star = scene.stars[index];
    const twinkle = (Math.floor(time / 620) + star.phase) % 6;
    const color = twinkle === 0 ? '#fff8d8' : twinkle < 3 ? '#c6d4ec' : '#8fa2c4';
    artRect(ctx, star.x, star.y, 1, 1, color);
    if (star.big && twinkle === 0) {
      artRect(ctx, star.x - 1, star.y, 3, 1, '#fff8d8');
      artRect(ctx, star.x, star.y - 1, 1, 3, '#fff8d8');
    }
  }
}

function cityPaintCelestial(ctx, scene, night, time) {
  const W = scene.w;
  const H = scene.h;
  // Fixed-size sun / moon: it never grows with the window. Position drifts a little so
  // the sky decoration stays on screen (position adapts, scale never does).
  const cx = Math.round(Math.min(96, Math.max(56, W * 0.1)));
  const cy = Math.round(Math.min(110, Math.max(44, H * 0.13)));
  const radius = 22;
  if (night) {
    cityPixelGlow(ctx, cx, cy, Math.round(radius * 1.7), '#cfd8e8', 0.2);
    artPixelCircle(ctx, cx, cy, radius, '#efe9d6');
    artPixelCircle(ctx, cx - 2, cy - 2, radius - 3, '#f7f2e3');
    artPixelCircle(ctx, cx + Math.round(radius * 0.28), cy + Math.round(radius * 0.2), Math.max(1, Math.round(radius * 0.2)), '#d8d2bf');
    artPixelCircle(ctx, cx - Math.round(radius * 0.4), cy + Math.round(radius * 0.35), Math.max(1, Math.round(radius * 0.13)), '#d8d2bf');
  } else {
    cityPixelGlow(ctx, cx, cy, Math.round(radius * 1.8), '#ffe9a8', 0.28);
    artPixelCircle(ctx, cx, cy, radius, '#ffe9a8');
    artPixelCircle(ctx, cx - 1, cy - 1, Math.max(2, radius - 4), '#fff6d4');
    const ray = Math.round(radius * 0.55);
    const gap = radius + 4;
    artRect(ctx, cx - 1, cy - gap - ray, 3, ray, '#ffe9a8');
    artRect(ctx, cx - 1, cy + gap, 3, ray, '#ffe9a8');
    artRect(ctx, cx - gap - ray, cy - 1, ray, 3, '#ffe9a8');
    artRect(ctx, cx + gap, cy - 1, ray, 3, '#ffe9a8');
    const diag = Math.round(gap * 0.72);
    const diagLen = Math.max(2, Math.round(ray * 0.6));
    artRect(ctx, cx + diag, cy + diag, diagLen, 2, '#ffeebb');
    artRect(ctx, cx - diag - diagLen, cy + diag, diagLen, 2, '#ffeebb');
    artRect(ctx, cx + diag, cy - diag, diagLen, 2, '#ffeebb');
    artRect(ctx, cx - diag - diagLen, cy - diag, diagLen, 2, '#ffeebb');
  }
}

function cityPaintClouds(ctx, scene, night, time) {
  const W = scene.w;
  const span = CITY_WORLD_HALF * 2;
  for (let index = 0; index < scene.clouds.length; index += 1) {
    const cloud = scene.clouds[index];
    let worldX = cloud.offset + time * cloud.speed;
    worldX = ((worldX + CITY_WORLD_HALF) % span + span) % span - CITY_WORLD_HALF;
    const x = Math.round(W / 2 + worldX);
    if (x < -cloud.w - 20 || x > W + 20) continue;
    cityPaintCloud(ctx, x, cloud.y, cloud.w, night);
  }
}

function cityPaintCloud(ctx, x, y, width, night) {
  const w = Math.max(30, Math.round(width));
  const body = night ? '#1e3049' : '#f6f9fa';
  const shade = night ? '#16243a' : '#dbe6ec';
  const rim = night ? '#2b415f' : '#ffffff';
  const lift = Math.round(w * 0.12);
  artRect(ctx, x + 8, y + lift, w - 16, Math.round(w * 0.16), shade);
  artRect(ctx, x + 2, y + lift + 3, w - 4, Math.round(w * 0.13), shade);
  artRect(ctx, x + Math.round(w * 0.20), y + 2, Math.round(w * 0.30), lift + 4, body);
  artRect(ctx, x + Math.round(w * 0.42), y, Math.round(w * 0.26), lift + 8, body);
  artRect(ctx, x + Math.round(w * 0.56), y + 4, Math.round(w * 0.24), lift + 4, body);
  artRect(ctx, x + 4, y + lift + 1, Math.round(w * 0.34), 4, body);
  artRect(ctx, x + Math.round(w * 0.46), y + 1, Math.round(w * 0.14), 2, rim);
}

function cityPaintBirds(ctx, scene, night, time) {
  const W = scene.w;
  const span = CITY_WORLD_HALF * 2;
  const color = night ? '#243650' : '#3f4a55';
  for (let index = 0; index < scene.birds.length; index += 1) {
    const bird = scene.birds[index];
    let worldX = bird.offset + time * bird.speed;
    worldX = ((worldX + CITY_WORLD_HALF) % span + span) % span - CITY_WORLD_HALF;
    const px = Math.round(W / 2 + worldX);
    if (px < -8 || px > W + 8) continue;
    const py = bird.y + Math.round(Math.sin(time / 1100 + index * 2) * 3);
    const flap = Math.floor(time / (190 * bird.flap) + index) % 2 === 0;
    artRect(ctx, px, py, 2, 1, color);
    if (flap) {
      artRect(ctx, px - 3, py - 1, 3, 1, color);
      artRect(ctx, px + 2, py - 1, 3, 1, color);
    } else {
      artRect(ctx, px - 3, py + 1, 3, 1, color);
      artRect(ctx, px + 2, py + 1, 3, 1, color);
    }
  }
}

function cityPaintSkyline(ctx, scene, night, time) {
  // Fixed world coordinates: blocks are placed relative to the window centre, so a
  // wider window just reveals more of the same skyline (same block sizes).
  const baseline = scene.tower && scene.tower.atBottom === false ? scene.h + 70 : scene.streetY;
  cityPaintSkylineLayer(ctx, scene, scene.skylineFar, baseline, night, time, false);
  cityPaintSkylineLayer(ctx, scene, scene.skylineNear, baseline, night, time, true);
}

function cityPaintSkylineLayer(ctx, scene, blocks, baseline, night, time, near) {
  const tower = scene.tower;
  const W = scene.w;
  const step = 10;
  const winW = 4;
  const winH = 4;
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const bx = Math.round(W / 2 + block.x);
    if (bx + block.w < 0 || bx > W) continue;
    if (near && tower && !scene.empty) {
      const coversTower = bx + block.w > tower.x - 10
        && bx < tower.x + tower.w + 10
        && !(tower.atBottom === false);
      if (coversTower) continue;
    }
    const top = baseline - block.h;
    if (top > scene.h) continue;
    const body = near
      ? (night ? '#1a2739' : '#b5c6c6')
      : (night ? '#13202f' : '#c3d2d2');
    const edge = near
      ? (night ? '#26374d' : '#a5b8b8')
      : (night ? '#1d2c40' : '#d2dede');
    const glass = near
      ? (night ? '#22334e' : '#9fb2b3')
      : (night ? '#1b2c41' : '#b3c4c5');
    const litGlass = night ? '#ffd97a' : '#eef4f4';
    artRect(ctx, bx, top, block.w, scene.h - top, body);
    artRect(ctx, bx, top, block.w, 3, edge);
    if (block.roof === 1) {
      artRect(ctx, bx + Math.round(block.w * 0.2), top - 4, Math.round(block.w * 0.34), 4, body);
    }
    if (block.stair) {
      artRect(ctx, bx + Math.round(block.w * 0.6), top - 7, Math.round(block.w * 0.2), 7, edge);
    }
    if (block.antenna) {
      artRect(ctx, bx + Math.round(block.w * 0.72), top - 11, 1, 11, edge);
    }
    const cols = Math.max(1, Math.floor((block.w - 6) / step));
    const rows = Math.max(1, Math.ceil(block.h / step));
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const wy = top + 5 + row * step;
        if (wy > scene.h) break;
        const wx = bx + 4 + col * step;
        const mixed = block.seed + row * 13 + col * 7;
        let color = glass;
        if (night) {
          if (mixed % 7 === 0 || mixed % 11 === 3) {
            color = (Math.floor(time / 900) + mixed) % 9 === 0 ? '#ffe9a8' : litGlass;
          }
        }
        artRect(ctx, wx, wy, winW, winH, color);
      }
    }
  }
}

function cityPaintStreet(ctx, scene, night, time) {
  const W = scene.w;
  const { streetY, curbY, sidewalkH, roadH } = scene;
  // Sidewalk: fixed tile size, tiles simply repeat across whatever width is visible.
  artRect(ctx, 0, streetY, W, sidewalkH, night ? '#404a5b' : '#d3ccbb');
  artRect(ctx, 0, streetY, W, 2, night ? '#303947' : '#c3bbaa');
  const tileW = 26;
  const tileH = 9;
  for (let y = streetY + tileH; y < curbY; y += tileH) {
    artRect(ctx, 0, y, W, 1, night ? '#313846' : '#c5beac');
    const offset = (((y - streetY) / tileH) | 0) % 2 === 0 ? 0 : Math.round(tileW / 2);
    for (let x = offset; x < W; x += tileW) artRect(ctx, x, y - tileH, 1, tileH, night ? '#333a48' : '#c8c1b0');
  }
  // curb
  artRect(ctx, 0, curbY, W, 2, night ? '#525d70' : '#efeadd');
  artRect(ctx, 0, curbY + 2, W, 1, night ? '#1e242e' : '#8b8272');
  // road
  const roadTop = curbY + 4;
  artRect(ctx, 0, roadTop, W, scene.h - roadTop, night ? '#262d3a' : '#5b616b');
  artRect(ctx, 0, roadTop, W, 1, night ? '#2b3240' : '#6d747e');
  for (let index = 0; index < 60; index += 1) {
    const x = (index * 137 + 11) % Math.max(1, W);
    const y = roadTop + 4 + ((index * 53) % Math.max(1, scene.h - roadTop - 6));
    artRect(ctx, x, y, 3, 1, night ? '#262c37' : '#646a74');
  }
  // centre dashes: fixed size + fixed spacing
  const dashY = roadTop + 16;
  const dashW = 22;
  const dashGap = 28;
  for (let x = 10; x < W; x += dashW + dashGap) {
    artRect(ctx, x, dashY, dashW, 3, night ? '#4a5160' : '#e6ddc6');
  }
  // crosswalk pinned near the right edge (fixed stripe size)
  const crossX = Math.max(16, W - 96);
  for (let index = 0; index < 5; index += 1) {
    artRect(ctx, crossX + index * 10, roadTop + 2, 5, Math.max(8, scene.h - roadTop - 6), night ? '#8a8f98' : '#e9e2d0');
  }
}

function H_UNIT(scene) {
  return Math.max(1, Math.round(scene.unit));
}

/* --------------------------------------------------------------------- tower */

function cityPaintTower(ctx, scene, night, time, anim) {
  const tower = scene.tower;
  const W = scene.w;
  const H = scene.h;
  const x = tower.x;
  const w = tower.w;
  const right = x + w;
  const hover = anim && anim.hover && anim.hover.kind === 'building' ? anim.hover.workspaceId : '';
  const facade = night ? '#2f3a4d' : '#d8d2c2';
  const facadeLight = night ? '#3f4d63' : '#e9e3d4';
  const facadeShade = night ? '#242f40' : '#c2bbaa';
  const facadeDeep = night ? '#1b2534' : '#aba493';
  const trim = night ? '#3d4b63' : '#efeadd';
  const dark = night ? '#141d2b' : '#a9a292';
  const facadeTop = tower.atTop ? tower.rowsTop : 0;
  const facadeBottom = tower.atBottom ? tower.streetY : H;

  // facade slab plus the 1px concrete speckle
  artRect(ctx, x, facadeTop, w, facadeBottom - facadeTop, facade);
  artRect(ctx, x, facadeTop, 6, facadeBottom - facadeTop, facadeLight);
  artRect(ctx, right - 8, facadeTop, 8, facadeBottom - facadeTop, facadeShade);
  artRect(ctx, right - 2, facadeTop, 2, facadeBottom - facadeTop, facadeDeep);
  const speckles = Math.round((w * (facadeBottom - facadeTop)) / 900);
  for (let index = 0; index < speckles; index += 1) {
    const sx = x + 8 + ((index * 37) % Math.max(1, w - 14));
    const sy = facadeTop + ((index * 61) % Math.max(1, facadeBottom - facadeTop));
    artRect(ctx, sx, sy, 2, 1, night ? '#39465c' : '#cec7b5');
  }

  // Page cut edges: a 2-4px slab plus a hard darkening band, never windows / numbers /
  // people. Rows fill the rest of the page, so no blank wall strip can appear.
  const cutFill = night ? '#1b2534' : '#b0a897';
  const cutLine = night ? '#0b1422' : '#7d7568';
  const cutShade = night ? 'rgba(4,8,16,0.5)' : 'rgba(38,32,24,0.34)';
  const slabH = Math.min(tower.cutH, 4);
  if (!tower.atTop) {
    const band = Math.max(0, tower.rowsTop);
    artRect(ctx, x, 0, w, Math.max(0, band - slabH), cutShade);
    artRect(ctx, x - 3, band - slabH, w + 6, slabH, cutFill);
    artRect(ctx, x - 3, band - 1, w + 6, 1, cutLine);
  }
  if (!tower.atBottom) {
    const band = Math.max(0, facadeBottom - tower.rowsBottom);
    artRect(ctx, x - 3, tower.rowsBottom, w + 6, slabH, cutFill);
    artRect(ctx, x - 3, tower.rowsBottom + slabH - 1, w + 6, 1, cutLine);
    artRect(ctx, x, tower.rowsBottom + slabH, w, Math.max(0, band - slabH), cutShade);
  }

  // Rows are strictly clipped to the page body: no row may bleed into the lobby or the
  // street strip (that was the "1F visible but no ground" bug).
  const paint = scene.floorPaint;
  const rows = tower.rows || [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    cityPaintFloorRow(ctx, scene, scene.workspaces ? scene.workspaces[row.index] : null, row.index, row.y, night, time, hover, paint, row);
  }

  // roof only on the first page; a cut edge stands in for it on later pages
  if (tower.atTop) {
    cityPaintRoof(ctx, scene, night, time);
  }

  // lobby + entrance only on the LAST page (floor 1 is always on the same page)
  if (tower.atBottom) {
    cityPaintLobby(ctx, scene, night, time);
    artRect(ctx, x - 4, tower.streetY - 2, w + 8, 2, night ? '#0d1522' : '#8b8272');
  }
}

function cityPaintFloorRow(ctx, scene, workspace, index, y, night, time, hover, paint, entry) {
  const tower = scene.tower;
  const x = tower.x;
  const w = tower.w;
  const rowH = tower.rowH;
  const running = !!(workspace && (workspace.runningCount || 0) > 0);
  const sessions = entry && entry.sessions
    ? entry.sessions
    : (workspace && Array.isArray(workspace.floors) ? workspace.floors.slice(0, 4) : []);
  const workspaceId = workspace ? workspace.workspaceId : '';
  const hovered = hover !== '' && hover === workspaceId;
  const accent = CITY_ACCENT_COLORS[((workspace && workspace.accentSeed) || 1) % CITY_ACCENT_COLORS.length];
  const slabH = Math.max(2, Math.round(rowH * 0.07));

  // floor slab lip
  artRect(ctx, x - 3, y, w + 6, slabH, night ? '#243044' : '#e6e0d1');
  artRect(ctx, x - 3, y + slabH, w + 6, Math.max(1, Math.round(rowH * 0.035)), night ? '#131b28' : '#a9a292');

  // left status strip
  const stripW = cityClamp(Math.round(w * 0.012), 2, 6);
  const stripY = y + slabH + Math.max(2, Math.round(rowH * 0.08));
  const stripH = Math.max(4, rowH - slabH - Math.round(rowH * 0.18));
  artRect(ctx, x + 2, stripY, stripW, stripH, running ? PAL.ledGreen : (night ? '#2b374b' : '#b9b2a3'));
  if (running) artRect(ctx, x + 2, stripY, stripW, Math.max(2, Math.round(stripH * 0.22)), night ? '#9cf0a8' : '#8fe89a');

  // floor number plate
  if (paint) {
    const plateH = paint.plateH;
    const plateY = y + Math.round((rowH - plateH) / 2);
    artRect(ctx, paint.plateX, plateY, paint.plateW, plateH, night ? '#1a2434' : '#2f3542');
    artOutline(ctx, paint.plateX, plateY, paint.plateW, plateH, night ? '#0b1220' : '#1d212b');
    const floorNumber = entry ? entry.floorNumber : Math.max(1, tower.total - index);
    const label = String(cityClamp(floorNumber, 1, 99)).padStart(2, '0');
    const digitScale = Math.max(1, Math.floor((plateH - 4) / 5));
    const digitW = label.length * 4 * digitScale - digitScale;
    const digitH = 5 * digitScale;
    cityDrawDigits(
      ctx,
      paint.plateX + Math.round((paint.plateW - digitW) / 2),
      plateY + Math.round((plateH - digitH) / 2),
      label,
      digitScale,
      running ? (night ? '#ffe9a8' : '#ffd97a') : (night ? '#7d8ea6' : '#e8e3d4'),
    );
  }

  // storefront windows: one per session, up to four
  if (paint) {
    const winY = y + paint.winY;
    const winH = paint.winH;
    for (let slot = 0; slot < 4; slot += 1) {
      const winX = paint.winLeft + slot * (paint.winW + paint.winGap);
      const session = sessions[slot] || null;
      cityPaintOfficeWindow(ctx, winX, winY, paint.winW, winH, session, night, time, index * 7 + slot);
    }
  }

  // hover highlight: hug the floor row only (the directory board draws its own highlight).
  // Stretching this outline across the empty area left when the board is hidden read as a
  // floating "wrong frame" in narrow windows.
  if (hovered) {
    const hlX = x - 3;
    const hlW = w + 6;
    ctx.globalAlpha = 0.12;
    artRect(ctx, hlX, y, hlW, rowH, '#ffe9a8');
    ctx.globalAlpha = 1;
    artOutline(ctx, hlX, y, hlW, rowH, '#ffe9a8');
  }
}

function cityPaintOfficeWindow(ctx, x, y, w, h, session, night, time, seed) {
  const running = !!(session && session.running);
  const occupied = !!session;
  const frame = night ? '#0d1524' : '#6f7883';
  const inset = Math.max(1, Math.round(h * 0.06));

  if (!occupied) {
    artRect(ctx, x, y, w, h, night ? '#1a2739' : '#8c9aa3');
    artRect(ctx, x, y, w, Math.max(2, Math.round(h * 0.12)), night ? '#1d2b3d' : '#a5b1b6');
    const slat = Math.max(2, Math.round(h * 0.16));
    for (let i = 0; i < 3; i += 1) artRect(ctx, x, y + inset + i * slat, w, 1, night ? '#1b2a3e' : '#7b8992');
    const dw = Math.max(4, Math.round(w * 0.16));
    artRect(ctx, x + Math.round(w / 2) - Math.round(dw / 2), y + h - Math.max(3, Math.round(h * 0.22)), dw, Math.max(2, Math.round(h * 0.14)), night ? '#22304a' : '#9fadb3');
  } else if (!running) {
    artRect(ctx, x, y, w, h, night ? '#1c2c46' : '#93a3ad');
    artRect(ctx, x, y, w, Math.max(2, Math.round(h * 0.12)), night ? '#22304a' : '#b6c3c9');
    const step = Math.max(3, Math.round(h * 0.18));
    for (let i = 0; i < h; i += step) {
      artRect(ctx, x + Math.max(2, Math.round(w * 0.10)) + (i % (step * 2)), y + inset + i, Math.max(2, Math.round(w * 0.05)), 1, night ? '#22304a' : '#aab8bf');
    }
    artRect(ctx, x + Math.round(w * 0.18), y + h - Math.max(3, Math.round(h * 0.24)), Math.max(3, Math.round(w * 0.10)), Math.max(2, Math.round(h * 0.12)), night ? '#1b2940' : '#7f8f99');
    artRect(ctx, x + Math.round(w * 0.36), y + h - Math.max(3, Math.round(h * 0.20)), Math.max(5, Math.round(w * 0.14)), Math.max(2, Math.round(h * 0.10)), night ? '#1b2940' : '#7f8f99');
  } else {
    // working: warm shop window with tiny silhouettes and screen light
    artRect(ctx, x, y, w, h, '#ffe6a1');
    artRect(ctx, x, y, w, Math.max(3, Math.round(h * 0.34)), '#fff5cc');
    artRect(ctx, x, y + h - Math.max(2, Math.round(h * 0.16)), w, Math.max(2, Math.round(h * 0.16)), '#f0c074');
    const blinds = Math.max(2, Math.round(h * 0.07));
    for (let i = 0; i < 3; i += 1) artRect(ctx, x, y + Math.round(h * 0.04) + i * blinds, w, 1, '#ffeec2');
    // wall board
    const bw = Math.max(4, Math.round(w * 0.16));
    const bh = Math.max(3, Math.round(h * 0.22));
    artRect(ctx, x + Math.max(2, Math.round(w * 0.05)), y + Math.max(2, Math.round(h * 0.10)), bw, bh, '#f7f4ec');
    artRect(ctx, x + Math.max(2, Math.round(w * 0.05)) + 1, y + Math.max(2, Math.round(h * 0.10)) + 1, Math.max(1, Math.round(bw * 0.5)), 1, PAL.screenGlow);
    // desk line
    const deskY = y + h - Math.max(4, Math.round(h * 0.24));
    artRect(ctx, x + Math.max(2, Math.round(w * 0.04)), deskY, w - Math.max(4, Math.round(w * 0.10)), Math.max(2, Math.round(h * 0.08)), '#c99a63');
    // monitor glow
    const mw = Math.max(3, Math.round(w * 0.10));
    const mh = Math.max(3, Math.round(h * 0.24));
    const mx = x + Math.round(w * 0.44);
    const my = deskY - mh + 1;
    const phase = (Math.floor(time / 220) + seed) % 3;
    artRect(ctx, mx, my, mw, mh, '#2b3a4a');
    artRect(ctx, mx + 1, my + 1, mw - 2, mh - 2, phase === 0 ? '#8ff0dc' : phase === 1 ? '#62d9c6' : '#4cc6b4');
    // tiny workers
    const workerH = Math.max(4, Math.round(h * 0.34));
    cityWindowWorker(ctx, x + Math.round(w * 0.13), deskY - workerH, Math.max(3, Math.round(w * 0.10)), workerH, Math.floor(time / 320 + seed) % 2);
    cityWindowWorker(ctx, x + Math.round(w * 0.27), deskY - workerH + 1, Math.max(3, Math.round(w * 0.10)), workerH, Math.floor(time / 260 + seed * 2) % 2);
    // plant in the corner
    const potW = Math.max(3, Math.round(w * 0.09));
    artRect(ctx, x + w - potW - 2, deskY - Math.max(2, Math.round(h * 0.10)), potW, Math.max(2, Math.round(h * 0.15)), '#4f7d4a');
    artRect(ctx, x + w - potW - 2, deskY, potW, Math.max(2, Math.round(h * 0.08)), '#b0745e');
  }

  // frame, mullion and sill
  artOutline(ctx, x - 1, y - 1, w + 2, h + 2, frame);
  artRect(ctx, x + Math.round(w / 2), y, 1, h, night ? '#24344f' : '#c9c0ac');
  artRect(ctx, x + 1, y, w - 2, 1, night ? '#2b3a52' : '#b0a897');
  artRect(ctx, x - 2, y + h + 1, w + 4, 2, night ? '#3a4a64' : '#efeadd');
  artRect(ctx, x - 2, y + h + 3, w + 4, 1, night ? '#131c2a' : '#aba493');

  if (running) {
    cityPixelGlow(ctx, x + Math.round(w / 2), y + Math.round(h / 2), Math.round(Math.max(w, h) * 0.3), PAL.lampLight, night ? 0.2 : 0.09);
    if (night) {
      ctx.globalAlpha = 0.12;
      artRect(ctx, x - Math.round(w * 0.06), y + h + 4, w + Math.round(w * 0.12), Math.max(4, Math.round(h * 0.2)), PAL.lampLight);
      ctx.globalAlpha = 1;
    }
  }
}

function cityWindowWorker(ctx, x, y, width, height, frame) {
  const headH = Math.max(2, Math.round(height * 0.36));
  const headW = Math.max(2, Math.round(width * 0.7));
  const bodyH = Math.max(2, height - headH);
  const bob = frame ? 1 : 0;
  artRect(ctx, x + Math.round((width - headW) / 2), y + bob, headW, headH, '#4a3b2e');
  artRect(ctx, x + Math.round((width - headW) / 2) + 1, y + headH - 1 + bob, Math.max(1, headW - 2), 1, '#e0b089');
  artRect(ctx, x, y + headH + bob, width, bodyH, '#46505f');
  artRect(ctx, x + width - Math.max(1, Math.round(width * 0.25)), y + headH + bob, Math.max(1, Math.round(width * 0.25)), max2(1, Math.round(bodyH * 0.5)), '#d9a97f');
}

function max2(a, b) {
  return a > b ? a : b;
}

function cityPaintRoof(ctx, scene, night, time) {
  const tower = scene.tower;
  const x = tower.x;
  const w = tower.w;
  const right = x + w;
  const roofTop = tower.roofTop;
  const roofH = tower.roofH;
  const capH = Math.max(4, Math.round(roofH * 0.34));

  // facade band behind the parapet so no sky shows through the roof strip
  artRect(ctx, x, roofTop, w, roofH, night ? '#2b3444' : '#d8d2c2');
  artRect(ctx, x, roofTop, 6, roofH, night ? '#3b4759' : '#e9e3d4');
  artRect(ctx, right - 8, roofTop, 8, roofH, night ? '#222b39' : '#c2bbaa');

  // parapet + cap slab
  artRect(ctx, x - 7, roofTop, w + 14, capH, night ? '#2a3448' : '#c9c0ac');
  artRect(ctx, x - 7, roofTop, w + 14, Math.max(2, Math.round(capH * 0.34)), night ? '#42526e' : '#efeadd');
  artRect(ctx, x - 7, roofTop + capH, w + 14, Math.max(1, Math.round(roofH * 0.05)), night ? '#131b28' : '#a9a292');

  // railing posts
  const postGap = Math.max(10, Math.round(w * 0.035));
  for (let px = x - 5; px < right + 6; px += postGap) {
    artRect(ctx, px, roofTop - Math.max(3, Math.round(roofH * 0.10)), 1, Math.max(3, Math.round(roofH * 0.10)), night ? '#3f4f6a' : '#a9a292');
  }
  artRect(ctx, x - 7, roofTop - Math.max(3, Math.round(roofH * 0.10)) - 1, w + 14, 1, night ? '#4a5c78' : '#c9c0ac');

  // sign band on the roof's front face
  const signX = x + Math.round(w * 0.10);
  const signW = w - Math.round(w * 0.20);
  const signY = roofTop + capH + Math.max(1, Math.round(roofH * 0.04));
  const signH = Math.max(6, roofTop + roofH - signY - Math.max(1, Math.round(roofH * 0.05)));
  artRect(ctx, signX, signY, signW, signH, night ? '#0f1826' : '#2f3542');
  artOutline(ctx, signX, signY, signW, signH, night ? '#0b1220' : '#1d212b');
  const icon = Math.max(4, Math.round(signH * 0.7));
  artRect(ctx, signX + Math.round(signH * 0.4), signY + Math.round((signH - icon) / 2), icon, icon, night ? '#ffd97a' : '#e8e3d4');
  artRect(ctx, signX + Math.round(signH * 0.4) + 1, signY + Math.round((signH - icon) / 2) + 1, Math.max(1, icon - 3), Math.max(1, icon - 3), night ? '#1d212b' : '#4a5560');
  artRect(ctx, signX + Math.round(w * 0.10), signY + Math.max(1, Math.round(signH * 0.28)), Math.round(w * 0.24), Math.max(1, Math.round(signH * 0.22)), night ? '#ffe08a' : '#efeadd');
  artRect(ctx, signX + Math.round(w * 0.10), signY + Math.max(1, Math.round(signH * 0.62)), Math.round(w * 0.15), 1, night ? '#c9a45c' : '#b9b2a3');

  // water tower (left side, above the parapet) — fixed size, cropped by the window top
  const above = Math.max(0, roofTop - 4);
  const propScale = 1;
  void above;
  const tankW = cityClamp(Math.round(w * 0.16), 24, 96);
  const tankH = Math.max(6, Math.round(roofH * 0.52 * propScale));
  const tankX = x + Math.round(w * 0.03);
  const legH = Math.max(4, Math.round(roofH * 0.30 * propScale));
  if (propScale >= 0.45) {
    const legTop = roofTop - legH;
    const tankTop = legTop - tankH;
    artRect(ctx, tankX + Math.round(tankW * 0.16), tankTop, 2, legTop - tankTop + Math.max(2, Math.round(roofH * 0.2)), PAL.woodDeep);
    artRect(ctx, tankX + Math.round(tankW * 0.74), tankTop, 2, legTop - tankTop + Math.max(2, Math.round(roofH * 0.2)), PAL.woodDeep);
    artRect(ctx, tankX, tankTop, tankW, tankH, night ? '#4a3b2e' : '#b98a5a');
    artRect(ctx, tankX, tankTop, tankW, Math.max(1, Math.round(tankH * 0.22)), night ? '#5a4633' : '#cfa572');
    artRect(ctx, tankX, tankTop + tankH - Math.max(1, Math.round(tankH * 0.22)), tankW, Math.max(1, Math.round(tankH * 0.22)), night ? '#382c22' : '#9c6f45');
    const capW = Math.round(tankW * 0.42);
    const capH = Math.max(2, Math.round(tankH * 0.24));
    artRect(ctx, tankX + Math.round((tankW - capW) / 2), tankTop - capH, capW, capH, night ? '#382c22' : '#8f6238');
    artRect(ctx, tankX + Math.round(tankW * 0.4), tankTop - Math.max(2, Math.round(tankH * 0.4)), Math.max(2, Math.round(tankW * 0.2)), Math.max(1, Math.round(tankH * 0.18)), PAL.woodDeep);
    artRect(ctx, tankX + tankW - 3, tankTop + 1, 1, tankH - 1, night ? '#6f7883' : '#7d5735');
  }

  // AC units on the roof
  const unitCount = cityClamp(Math.round(w / 140), 1, 3);
  const unitW = Math.max(10, Math.round(w * 0.075));
  const unitH = Math.max(5, Math.round(roofH * 0.22 * Math.max(0.6, propScale)));
  for (let index = 0; index < unitCount; index += 1) {
    const ux = x + Math.round(w * 0.28) + index * Math.round(unitW * 1.4);
    const uy = roofTop - unitH;
    artRect(ctx, ux, uy, unitW, unitH, night ? '#2b3a52' : '#9aa3ad');
    artRect(ctx, ux, uy, unitW, 1, night ? '#3d5273' : '#b9c2c9');
    artRect(ctx, ux + 2, uy + 2, Math.max(2, Math.round(unitW * 0.24)), Math.max(2, unitH - 4), night ? '#1b2940' : '#7f8b96');
    artRect(ctx, ux + Math.round(unitW * 0.56), uy + 2, Math.max(2, Math.round(unitW * 0.24)), Math.max(2, unitH - 4), night ? '#1b2940' : '#7f8b96');
  }

  // antenna with a blinking red lamp
  const mastX = right - Math.round(w * 0.06);
  const mastH = Math.max(8, Math.round(roofH * 1.15 * propScale));
  if (propScale >= 0.45 && roofTop - mastH >= 4) {
    artRect(ctx, mastX, roofTop - mastH, 2, mastH, night ? '#3d4b63' : '#6f7883');
    artRect(ctx, mastX - Math.round(w * 0.02), roofTop - Math.round(mastH * 0.66), Math.round(w * 0.045), 1, night ? '#3d4b63' : '#6f7883');
    const blink = Math.floor(time / 620) % 2 === 0;
    artRect(ctx, mastX, roofTop - mastH - 2, 2, 2, blink ? '#ff6b5f' : '#5c2b2b');
    if (night && blink) cityPixelGlow(ctx, mastX + 1, roofTop - mastH, Math.round(H_UNIT(scene) * 5), '#ff6b5f', 0.4);
  }

  // clouds hugging the roof when the top is on screen
  const cloudY = roofTop - Math.round(roofH * 1.8);
  if (cloudY > 3) {
    cityPaintCloud(ctx, x - Math.round(w * 0.16), cloudY + Math.round(roofH * 0.5), Math.round(w * 0.30), night);
    cityPaintCloud(ctx, right - Math.round(w * 0.10), cloudY, Math.round(w * 0.26), night);
  }

  if (night) {
    cityPixelGlow(ctx, signX + Math.round(signW / 2), signY + Math.round(signH / 2), Math.round(cityClamp(signH * 1.8, 6, 22)), PAL.lampLight, 0.1);
  }
}

function cityPaintLobby(ctx, scene, night, time) {
  const tower = scene.tower;
  const x = tower.x;
  const w = tower.w;
  const right = x + w;
  const top = tower.lobbyY;
  const ground = tower.streetY;
  const height = Math.max(10, ground - top);
  const facade = night ? '#2b3444' : '#d8d2c2';
  const light = night ? '#3b4759' : '#e9e3d4';
  const shade = night ? '#222b39' : '#c2bbaa';

  artRect(ctx, x, top, w, height, facade);
  artRect(ctx, x, top, 6, height, light);
  artRect(ctx, right - 8, top, 8, height, shade);
  artRect(ctx, x, top, w, Math.max(1, Math.round(height * 0.06)), night ? '#42526e' : '#efeadd');

  const glassX = x + Math.round(w * 0.16);
  const glassW = w - Math.round(w * 0.32);
  const canopyH = Math.max(3, Math.round(height * 0.14));
  const glassY = top + canopyH;
  const glassH = Math.max(8, height - canopyH - Math.max(1, Math.round(height * 0.06)));

  // canopy
  artRect(ctx, glassX - Math.round(w * 0.02), top + Math.max(1, Math.round(height * 0.04)), glassW + Math.round(w * 0.04), canopyH, night ? '#1d2736' : '#8792a0');
  artRect(ctx, glassX - Math.round(w * 0.02), top + Math.max(1, Math.round(height * 0.04)), glassW + Math.round(w * 0.04), 1, night ? '#38475f' : '#c9c0ac');

  // glass wall + interior
  artRect(ctx, glassX, glassY, glassW, glassH, night ? '#101d2e' : '#9fb3ba');
  artRect(ctx, glassX, glassY, glassW, Math.max(2, Math.round(glassH * 0.22)), night ? '#1a2b40' : '#b6c6cb');
  const deskW = Math.round(glassW * 0.34);
  artRect(ctx, glassX + Math.round(glassW * 0.32), glassY + Math.round(glassH * 0.42), deskW, Math.max(2, Math.round(glassH * 0.26)), night ? '#3b2f22' : '#b98a5a');
  const recX = glassX + Math.round(glassW * 0.46);
  artRect(ctx, recX, glassY + Math.round(glassH * 0.16), Math.max(2, Math.round(glassW * 0.03)), Math.round(glassH * 0.3), night ? '#243044' : '#5a6474');
  artRect(ctx, recX, glassY + Math.round(glassH * 0.12), Math.max(2, Math.round(glassW * 0.022)), Math.max(2, Math.round(glassH * 0.12)), '#d9a97f');
  const lights = cityClamp(Math.round(glassW / 70), 2, 5);
  for (let index = 0; index < lights; index += 1) {
    const lx = glassX + Math.round((glassW / lights) * (index + 0.5)) - 4;
    artRect(ctx, lx, glassY + Math.max(1, Math.round(glassH * 0.06)), Math.max(3, Math.round(glassW * 0.03)), 2, night ? '#ffe08a' : '#f7f4ec');
  }
  // mullions
  const mullions = cityClamp(Math.round(glassW / 48), 2, 8);
  for (let index = 1; index < mullions; index += 1) {
    artRect(ctx, glassX + Math.round((glassW / mullions) * index), glassY, 1, glassH, night ? '#2b3a52' : '#8b98a0');
  }

  // revolving door
  cityPaintRevolvingDoor(ctx, x + Math.round(w / 2), glassY, glassH, night, time);

  // steps
  const stepW = Math.round(w * 0.36);
  const stepX = x + Math.round((w - stepW) / 2);
  artRect(ctx, stepX, ground, stepW, Math.max(2, Math.round(H_UNIT(scene) * 2)), night ? '#2a3448' : '#cfc8b8');
  artRect(ctx, stepX, ground + Math.max(2, Math.round(H_UNIT(scene) * 2)), stepW, 1, night ? '#141d2b' : '#a9a292');

  // planters
  const potW = Math.max(6, Math.round(w * 0.03));
  cityPaintPlanter(ctx, glassX - potW - Math.round(w * 0.04), ground, potW, night);
  cityPaintPlanter(ctx, glassX + glassW + Math.round(w * 0.02), ground, potW, night);

  if (night) {
    cityLightPool(ctx, x + w / 2, ground - Math.round(height * 0.2), Math.round(w * 0.34), Math.max(8, Math.round(height * 0.7)), PAL.lampLight, 0.16);
  }
}

function cityPaintRevolvingDoor(ctx, cx, y, height, night, time) {
  const cy = y + Math.round(height / 2);
  const radius = Math.max(5, Math.round(height * 0.42));
  artPixelCircle(ctx, cx, cy, radius, night ? '#16243a' : '#b9cdd2');
  artRect(ctx, cx - radius - 2, y, 2, Math.max(4, height), night ? '#243449' : '#7f8b96');
  artRect(ctx, cx + radius, y, 2, Math.max(4, height), night ? '#243449' : '#7f8b96');
  const phase = (time / 900) * Math.PI * 2;
  for (let index = 0; index < 3; index += 1) {
    const angle = phase + (index * Math.PI * 2) / 3;
    artLine(
      ctx,
      cx,
      cy,
      cx + Math.round(Math.cos(angle) * radius),
      cy + Math.round(Math.sin(angle) * radius),
      night ? '#4a5c78' : '#6f7883',
    );
  }
  artRect(ctx, cx - 1, cy - 1, 2, 2, night ? '#2b3a52' : '#5f6b78');
  if (night) cityPixelGlow(ctx, cx, cy, Math.round(radius * 1.5), PAL.lampLight, 0.24);
}

function cityPaintPlanter(ctx, x, baseY, width, night) {
  const w = Math.max(5, Math.round(width));
  const h = Math.max(4, Math.round(w * 0.7));
  artRect(ctx, x, baseY - h, w, h, night ? '#8a5b48' : PAL.pot);
  artRect(ctx, x, baseY - h, w, 1, night ? '#a5705a' : '#c98a6f');
  artRect(ctx, x + 1, baseY - h - Math.round(h * 1.6), w - 2, Math.round(h * 1.6), PAL.plant);
  artRect(ctx, x + Math.round(w * 0.2), baseY - h - Math.round(h * 2.2), Math.max(2, Math.round(w * 0.5)), Math.max(1, Math.round(h * 0.9)), PAL.plantLight);
}

/* ------------------------------------------------------------------ directory */

function cityPaintDirectory(ctx, scene, night, time, anim) {
  const dir = scene.directory;
  const tower = scene.tower;
  const W = scene.w;
  const x = dir.x;
  const y = dir.y;
  const w = dir.w;
  const h = dir.h;
  if (w <= 20 || h <= 20) return;
  const hover = anim && anim.hover && anim.hover.kind === 'building' ? anim.hover.workspaceId : '';

  // cast shadow + panel
  artRect(ctx, x + 3, y + 4, w, h, night ? 'rgba(4,8,14,0.45)' : 'rgba(60,52,40,0.16)');
  artRect(ctx, x, y, w, h, night ? '#1a2434' : '#efeadd');
  artOutline(ctx, x, y, w, h, night ? '#0c1420' : '#a9a292');

  // header band (only while the roof is on screen)
  if (dir.headerH > 0) {
    const headerH = Math.min(dir.headerH, Math.round(h * 0.4));
    artRect(ctx, x + 2, y + 2, w - 4, headerH, night ? '#24344f' : '#3a4150');
    artRect(ctx, x + 2, y + headerH + 1, w - 4, 1, night ? '#0c1420' : '#a9a292');
    const iconSize = Math.max(4, Math.round(headerH * 0.18));
    const ix = x + Math.round(w * 0.06);
    const iy = y + Math.max(3, Math.round(headerH * 0.5) - iconSize * 2);
    for (let index = 0; index < 4; index += 1) {
      const bw = Math.max(1, iconSize - 1 + index);
      artRect(ctx, ix, iy + index * Math.max(2, iconSize), bw, Math.max(1, Math.round(iconSize * 0.6)), night ? '#8fb8e0' : '#e6ddc6');
    }
    artRect(ctx, x + Math.round(w * 0.2), y + Math.max(3, Math.round(headerH * 0.34)), Math.round(w * 0.5), Math.max(2, Math.round(headerH * 0.1)), night ? '#6f8ab0' : '#cfc8b8');
    artRect(ctx, x + Math.round(w * 0.2), y + Math.max(4, Math.round(headerH * 0.56)), Math.round(w * 0.32), Math.max(1, Math.round(headerH * 0.07)), night ? '#4a5f80' : '#b9b2a3');
  }

  // floor rows follow the current page rows
  const rows = tower.rows || [];
  for (let index = 0; index < rows.length; index += 1) {
    const floor = rows[index];
    const rowY = floor.y + Math.max(1, Math.round(floor.h * 0.08));
    const rowH = floor.h - Math.max(2, Math.round(floor.h * 0.16));
    const running = (floor.runningCount || 0) > 0;
    const accent = CITY_ACCENT_COLORS[((floor.accentSeed || 1) - 1) % CITY_ACCENT_COLORS.length];
    const alt = floor.slot % 2 === 1;
    artRect(ctx, x + 4, rowY, w - 8, rowH, night ? (alt ? '#1d2a3e' : '#22304a') : (alt ? '#e4ddcc' : '#efeadd'));
    artRect(ctx, x + 4, rowY + rowH, w - 8, 1, night ? '#101a28' : '#c9c0ac');
    const chipW = Math.max(2, Math.round(w * 0.014));
    artRect(ctx, x + 2, rowY + Math.max(2, Math.round(rowH * 0.16)), chipW, Math.max(3, rowH - Math.round(rowH * 0.32)), accent);
    if (running) artRect(ctx, x + 2, rowY + Math.max(2, Math.round(rowH * 0.16)), chipW, Math.max(2, Math.round(rowH * 0.2)), PAL.ledGreen);
    const dot = Math.max(2, Math.round(w * 0.014));
    artRect(ctx, x + w - 6 - dot, rowY + Math.max(2, Math.round(rowH * 0.18)), dot, dot, running ? PAL.ledGreen : (night ? '#2a3446' : '#b9b2a3'));
    if (hover !== '' && hover === floor.workspaceId) {
      ctx.globalAlpha = 0.16;
      artRect(ctx, x + 4, rowY, w - 8, rowH, '#ffe9a8');
      ctx.globalAlpha = 1;
      artOutline(ctx, x + 3, rowY - 1, w - 6, rowH + 2, '#ffe9a8');
    }
  }

  // scrolled edges: chevrons hinting there is more above/below
  const chev = Math.max(4, Math.round(w * 0.03));
  if (!tower.atTop) {
    for (let index = 0; index < 2; index += 1) {
      cityChevron(ctx, x + w / 2 - chev + index * chev, y + 6 + index * 2, chev, 'up', night ? '#4a5f80' : '#b9b2a3');
    }
  }
  if (!tower.atBottom) {
    for (let index = 0; index < 2; index += 1) {
      cityChevron(ctx, x + w / 2 - chev + index * chev, y + h - 10 - index * 2, chev, 'down', night ? '#4a5f80' : '#b9b2a3');
    }
  }

  // legs down to the sidewalk
  if (tower.atBottom) {
    artRect(ctx, x + Math.round(w * 0.06), y + h, 4, Math.round(scene.sidewalkH * 0.5), night ? '#141d2b' : '#b0a897');
    artRect(ctx, x + w - Math.round(w * 0.08), y + h, 4, Math.round(scene.sidewalkH * 0.5), night ? '#141d2b' : '#b0a897');
    artRect(ctx, x + 4, y + h + Math.round(scene.sidewalkH * 0.4), w - 8, Math.max(2, Math.round(H_UNIT(scene) * 2)), night ? '#0e1622' : '#9aa3ad');
  }
  // unused horizontal accent rail keeps the panel from looking flat
  artRect(ctx, x + 2, y + Math.round(h * 0.5), 2, 1, night ? '#2b3a52' : '#c9c0ac');
  if (W > 0) artRect(ctx, x + w - 4, y + Math.round(h * 0.5), 2, 1, night ? '#2b3a52' : '#c9c0ac');
}

/* ------------------------------------------------------------------- elevator */

function cityPaintElevator(ctx, scene, night, time) {
  const shaft = scene.shaft;
  const tower = scene.tower;
  if (!shaft || shaft.w <= 8) return;
  const x = shaft.x;
  const w = shaft.w;
  const top = Math.max(0, shaft.top);
  const bottom = Math.min(scene.h, shaft.bottom);
  if (bottom - top < 20) return;
  const frame = night ? '#2b3a52' : '#7f8b96';
  const glass = night ? '#16243a' : '#b9cdd2';

  artRect(ctx, x, top, w, bottom - top, glass);
  artRect(ctx, x, top, Math.max(1, Math.round(w * 0.08)), bottom - top, frame);
  artRect(ctx, x + w - Math.max(1, Math.round(w * 0.08)), top, Math.max(1, Math.round(w * 0.08)), bottom - top, frame);
  for (let y = top; y < bottom; y += 16) {
    artRect(ctx, x, y, w, 1, night ? '#22304a' : '#93a6ab');
  }
  // guide rails
  artRect(ctx, x + Math.round(w * 0.24), top, 1, bottom - top, night ? '#1d2b3d' : '#8b98a0');
  artRect(ctx, x + Math.round(w * 0.74), top, 1, bottom - top, night ? '#1d2b3d' : '#8b98a0');

  // moving car
  const trackTop = tower.rowsTop + Math.round(tower.rowH * 0.3);
  const trackBottom = tower.bodyBottom - Math.round(tower.rowH * 0.3);
  const span = Math.max(10, trackBottom - trackTop);
  const carH = Math.max(10, Math.round(tower.rowH * 0.62));
  const carW = w - Math.max(4, Math.round(w * 0.22));
  const pos = tower.pageCount > 1
    ? tower.page / (tower.pageCount - 1)
    : 0.5 + 0.5 * Math.sin(time / 2400);
  const carY = Math.round(trackTop + span * cityClamp(pos, 0, 1)) - Math.round(carH / 2);
  const carX = x + Math.round((w - carW) / 2);
  artRect(ctx, carX, carY, carW, carH, night ? '#2b3a52' : '#c9c0ac');
  artRect(ctx, carX + 1, carY + 1, carW - 2, carH - 2, night ? '#3a4a64' : '#e6e0d1');
  artRect(ctx, carX + Math.round(carW * 0.2), carY + Math.round(carH * 0.24), carW - Math.round(carW * 0.4), Math.max(2, Math.round(carH * 0.5)), night ? '#ffd97a' : '#f7f4ec');
  if (night) cityPixelGlow(ctx, x + w / 2, carY + carH / 2, Math.round(w * 0.9), PAL.lampLight, 0.16);

  // floor indicator light on top of the shaft
  if (tower.atTop) {
    const lampW = Math.max(4, Math.round(w * 0.24));
    artRect(ctx, x + Math.round((w - lampW) / 2), tower.roofTop - Math.round(tower.roofH * 0.16), lampW, Math.max(2, Math.round(tower.roofH * 0.1)), night ? '#ffd97a' : '#e8e3d4');
  }
}

/* --------------------------------------------------------------- street life */

function cityPaintStreetLife(ctx, scene, night, time) {
  const W = scene.w;
  const baseY = scene.curbY - 6;
  const tower = scene.tower && !scene.empty ? scene.tower : null;
  const halfBlock = tower ? Math.round((scene.blockRight - tower.x) / 2) : 0;
  const blockCenter = tower ? (tower.x + scene.blockRight) / 2 : W / 2;

  // The street furniture sits at fixed distances from the block and is mirrored on both
  // sides, so widening the window reveals more of the same street (never bigger props).
  if (tower) {
    const kioskX = Math.round(tower.x - CITY_KIOSK_W - 20);
    if (kioskX + CITY_KIOSK_W > -8) {
      cityPaintKiosk(ctx, kioskX, baseY, CITY_KIOSK_W, CITY_KIOSK_H, night, time);
    }
  } else {
    cityPaintKiosk(ctx, 24, baseY, CITY_KIOSK_W, CITY_KIOSK_H, night, time);
  }

  const kinds = ['lamp', 'tree', 'bench', 'bin', 'tree', 'mailbox', 'hydrant'];
  const slotW = 84;
  const slots = Math.ceil((W / 2) / slotW) + 1;
  for (let index = 0; index < slots; index += 1) {
    const distance = halfBlock + 22 + index * slotW;
    if (distance > W / 2 + slotW * 2) break;
    const kind = kinds[index % kinds.length];
    for (let side = -1; side <= 1; side += 2) {
      const slotX = Math.round(blockCenter + side * distance);
      if (slotX < -slotW || slotX > W + slotW) continue;
      if (kind === 'lamp') cityPaintLamp(ctx, slotX, baseY, CITY_LAMP_H, night, time);
      else if (kind === 'tree') cityPaintTree(ctx, slotX, baseY, CITY_TREE_H, night, time, index);
      else if (kind === 'bench') cityPaintBench(ctx, slotX - 15, baseY, night);
      else if (kind === 'bin') cityPaintBin(ctx, slotX - 6, baseY, night);
      else if (kind === 'mailbox') cityPaintMailbox(ctx, slotX - 6, baseY, night);
      else cityPaintHydrant(ctx, slotX - 4, baseY, night);
    }
  }
}

function cityPaintTree(ctx, x, baseY, height, night, time, seed) {
  const h = Math.max(24, Math.round(height));
  const sway = Math.floor(time / 900 + seed) % 2;
  const trunk = night ? '#3a2f26' : '#7d5735';
  const leaf = night ? '#2f4a34' : '#4f7d4a';
  const leafDark = night ? '#243c2a' : '#3c6139';
  const leafLight = night ? '#3a5a40' : '#6a9a5f';
  const trunkH = Math.round(h * 0.36);
  const canopy = Math.round(h * 0.62);
  artRect(ctx, x - 1, baseY - trunkH, Math.max(2, Math.round(h * 0.07)), trunkH, trunk);
  artRect(ctx, x - 3, baseY - 2, Math.max(4, Math.round(h * 0.11)), 2, night ? '#2a201a' : '#6b4a35');
  artPixelCircle(ctx, x + sway, baseY - trunkH - Math.round(canopy * 0.45), Math.round(canopy * 0.42), leafDark);
  artPixelCircle(ctx, x - Math.round(canopy * 0.28) + sway, baseY - trunkH - Math.round(canopy * 0.3), Math.round(canopy * 0.3), leaf);
  artPixelCircle(ctx, x + Math.round(canopy * 0.28) + sway, baseY - trunkH - Math.round(canopy * 0.32), Math.round(canopy * 0.28), leaf);
  artPixelCircle(ctx, x + sway, baseY - trunkH - Math.round(canopy * 0.72), Math.round(canopy * 0.24), leafLight);
}

function cityPaintLamp(ctx, x, baseY, height, night, time) {
  const h = Math.max(30, Math.round(height));
  const metal = night ? '#3d4b63' : '#6f7883';
  const top = baseY - h;
  artRect(ctx, x, top, Math.max(2, Math.round(h * 0.035)), h, metal);
  artRect(ctx, x - Math.round(h * 0.04), baseY - 3, Math.round(h * 0.1), 3, night ? '#222b39' : '#4a515c');
  artRect(ctx, x - Math.round(h * 0.06), top, Math.round(h * 0.16), Math.max(2, Math.round(h * 0.04)), metal);
  artRect(ctx, x + Math.round(h * 0.05), top + Math.round(h * 0.02), Math.round(h * 0.10), Math.round(h * 0.05), metal);
  if (night) {
    artRect(ctx, x + Math.round(h * 0.06), top + Math.round(h * 0.06), Math.round(h * 0.08), 2, '#dbe9ff');
    cityPixelGlow(ctx, x + Math.round(h * 0.1), top + Math.round(h * 0.12), Math.round(h * 0.2), '#cfe4ff', 0.26);
    // hard-banded cool light pool on the pavement
    cityLightPool(
      ctx,
      x + Math.round(h * 0.1),
      baseY - Math.round(h * 0.02),
      Math.round(h * 0.85),
      Math.round(h * 0.5),
      '#9fc4e8',
      0.16,
    );
  } else {
    artRect(ctx, x + Math.round(h * 0.06), top + Math.round(h * 0.06), Math.round(h * 0.08), 2, '#c9d2d8');
  }
}

function cityPaintBench(ctx, x, baseY, night) {
  const wood = night ? '#5a4a3a' : PAL.wood;
  const woodDark = night ? '#41342a' : PAL.woodDark;
  const metal = night ? '#2b3448' : '#6f7883';
  const w = 30;
  artRect(ctx, x, baseY - 14, w, 3, wood);
  artRect(ctx, x + 2, baseY - 11, w - 4, 2, woodDark);
  artRect(ctx, x, baseY - 8, w, 4, wood);
  artRect(ctx, x, baseY - 4, w, 2, woodDark);
  artRect(ctx, x + 2, baseY - 2, 3, 3, metal);
  artRect(ctx, x + w - 5, baseY - 2, 3, 3, metal);
  artRect(ctx, x - 1, baseY - 17, 2, 3, metal);
  artRect(ctx, x + w - 1, baseY - 17, 2, 3, metal);
}

function cityPaintMailbox(ctx, x, baseY, night) {
  const red = night ? '#7e3f3a' : '#c2554c';
  const metal = night ? '#2b3448' : '#6f7883';
  artRect(ctx, x + 4, baseY - 10, 2, 10, metal);
  artRect(ctx, x, baseY - 22, 13, 13, red);
  artRect(ctx, x, baseY - 22, 13, 2, night ? '#a5504a' : '#d9776d');
  artRect(ctx, x + 2, baseY - 16, 8, 2, night ? '#5c2b2b' : '#7d2f2a');
  artRect(ctx, x + 11, baseY - 20, 2, 4, night ? '#8a5b48' : '#e8e3d4');
}

function cityPaintHydrant(ctx, x, baseY, night) {
  const red = night ? '#6f3a36' : '#c2554c';
  artRect(ctx, x, baseY - 10, 8, 10, red);
  artRect(ctx, x - 2, baseY - 7, 12, 2, red);
  artRect(ctx, x - 1, baseY - 12, 10, 2, night ? '#8a5b48' : '#d9776d');
  artRect(ctx, x + 2, baseY - 13, 4, 2, night ? '#8a5b48' : '#e8e3d4');
}

function cityPaintBin(ctx, x, baseY, night) {
  const metal = night ? '#2f3c52' : '#7f8b96';
  artRect(ctx, x, baseY - 14, 12, 14, metal);
  artRect(ctx, x - 1, baseY - 16, 14, 3, night ? '#3d4b63' : '#9aa3ad');
  artRect(ctx, x + 3, baseY - 10, 6, 1, night ? '#1b2434' : '#5f6b78');
}

function cityPaintKiosk(ctx, x, baseY, width, height, night, time) {
  const w = Math.max(40, Math.round(width));
  const h = Math.max(30, Math.round(height));
  const top = baseY - h;
  const body = night ? '#4a3b2e' : '#b98a5a';
  const bodyDark = night ? '#382c22' : '#9c6f45';
  const cream = night ? '#6f6350' : '#f3eee2';
  const stripeA = night ? '#8a4038' : '#c96a5f';

  artRect(ctx, x, top + Math.round(h * 0.26), w, Math.round(h * 0.72), body);
  artRect(ctx, x, top + Math.round(h * 0.26), w, 2, bodyDark);
  artRect(ctx, x, baseY - Math.round(h * 0.1), w, Math.round(h * 0.1), bodyDark);
  // counter window with warm light
  artRect(ctx, x + Math.round(w * 0.1), top + Math.round(h * 0.36), w - Math.round(w * 0.2), Math.round(h * 0.3), night ? '#ffd97a' : '#e8dcc0');
  artRect(ctx, x + Math.round(w * 0.1) + 1, top + Math.round(h * 0.36) + 1, w - Math.round(w * 0.2) - 2, Math.round(h * 0.3) - 2, night ? '#ffe6a1' : '#f3eee2');
  artRect(ctx, x + Math.round(w * 0.18), top + Math.round(h * 0.44), Math.max(3, Math.round(w * 0.08)), Math.round(h * 0.18), night ? '#7a5a30' : '#5a6474');
  artRect(ctx, x + Math.round(w * 0.19), top + Math.round(h * 0.4), Math.max(2, Math.round(w * 0.06)), Math.round(h * 0.07), '#d9a97f');
  // menu board
  artRect(ctx, x + Math.round(w * 0.62), top + Math.round(h * 0.36), Math.round(w * 0.28), Math.round(h * 0.28), night ? '#f3eee2' : '#2f3542');
  artRect(ctx, x + Math.round(w * 0.64), top + Math.round(h * 0.4), Math.round(w * 0.16), 1, night ? '#2f3542' : '#efeadd');
  artRect(ctx, x + Math.round(w * 0.64), top + Math.round(h * 0.46), Math.round(w * 0.2), 1, night ? '#2f3542' : '#efeadd');
  // striped awning
  const stripes = Math.max(4, Math.round(w / 10));
  for (let index = 0; index < stripes; index += 1) {
    const sw = Math.round(w / stripes);
    artRect(ctx, x + index * sw, top, sw, Math.round(h * 0.26), index % 2 === 0 ? stripeA : cream);
  }
  artRect(ctx, x, top, w, 1, night ? '#2a2018' : '#7d5735');
  if (night) cityLightPool(ctx, x + w / 2, baseY - Math.round(h * 0.06), Math.round(w * 0.9), Math.max(8, Math.round(h * 0.2)), PAL.lampLight, 0.18);
}

/* ------------------------------------------------------------------- empty lot */

function cityPaintEmptyLot(ctx, scene, night, time) {
  const tower = scene.tower;
  const x = tower.x;
  const w = tower.w;
  const right = x + w;
  const ground = scene.streetY;
  const lotTop = Math.max(0, tower.lotTop || Math.round(ground - scene.h * 0.44));
  const concrete = night ? '#39465c' : '#c9c0ac';
  const concreteLight = night ? '#4d5c74' : '#e6ddc6';
  const concreteDark = night ? '#202a3b' : '#a9a292';
  const steel = night ? '#5a6f8c' : '#8794a0';
  const steelDark = night ? '#3a4a64' : '#6b7682';
  const dirtH = Math.max(10, Math.round(scene.h * 0.055));

  // excavated dirt strip along the street
  artRect(ctx, x, ground - dirtH, w, dirtH, night ? '#3a3128' : '#a98c66');
  artRect(ctx, x, ground - dirtH, w, 2, night ? '#2b241d' : '#8f744f');
  for (let index = 0; index < 36; index += 1) {
    artRect(ctx, x + 6 + ((index * 53) % Math.max(1, w - 12)), ground - dirtH + 3 + ((index * 29) % Math.max(1, dirtH - 5)), 2, 1, night ? '#453a2e' : '#bda07a');
  }

  // half-built concrete skeleton
  const cols = cityClamp(Math.round(w / 62), 4, 7);
  const levels = cityClamp(Math.round(scene.h / 120), 3, 6);
  const frameBottom = ground - dirtH;
  const frameTop = Math.max(8, lotTop);
  const frameH = Math.max(30, frameBottom - frameTop);
  const levelH = Math.max(12, Math.round(frameH / levels));
  const frameX = x + Math.round(w * 0.04);
  const frameW = Math.round(w * 0.92);
  const slabH = Math.max(2, Math.round(scene.h * 0.008));
  const colW = Math.max(3, Math.round(w * 0.012));
  const colX = [];
  for (let index = 0; index < cols; index += 1) {
    colX.push(frameX + Math.round(((frameW - colW) / Math.max(1, cols - 1)) * index));
  }
  // slabs first (behind the columns)
  for (let level = 0; level <= levels; level += 1) {
    const sy = frameTop + level * levelH;
    artRect(ctx, frameX - 2, sy, frameW + 4, slabH, concrete);
    artRect(ctx, frameX - 2, sy, frameW + 4, 1, concreteLight);
    artRect(ctx, frameX - 2, sy + slabH, frameW + 4, 1, concreteDark);
  }
  // columns
  for (let index = 0; index < colX.length; index += 1) {
    artRect(ctx, colX[index], frameTop, colW, frameH, concrete);
    artRect(ctx, colX[index], frameTop, 1, frameH, concreteLight);
    artRect(ctx, colX[index] + colW - 1, frameTop, 1, frameH, concreteDark);
  }
  // partially finished brick infill on the two lowest levels
  for (let level = Math.max(0, levels - 2); level < levels; level += 1) {
    const sy = frameTop + level * levelH + slabH;
    const panelW = Math.round(frameW * 0.30);
    const panelH = Math.max(4, levelH - slabH - 1);
    for (let bank = 0; bank < 2; bank += 1) {
      const bx = frameX + 3 + bank * Math.round(frameW * 0.5);
      artRect(ctx, bx, sy, panelW, panelH, night ? '#5a4a3a' : '#c9a876');
      artRect(ctx, bx, sy, panelW, 1, night ? '#6b5a47' : '#dcc094');
      for (let row = 0; row < Math.floor(panelH / 8); row += 1) {
        for (let col = 0; col < 3; col += 1) {
          artRect(ctx, bx + 5 + col * Math.round(panelW * 0.26), sy + 4 + row * 8, Math.max(3, Math.round(panelW * 0.14)), 4, night ? '#ffd97a' : '#8fa6ab');
        }
      }
    }
  }
  // rebar poking out of the top slab
  for (let index = 0; index < colX.length; index += 1) {
    artRect(ctx, colX[index] + 1, frameTop - Math.max(4, Math.round(levelH * 0.35)), 1, Math.max(4, Math.round(levelH * 0.35)), steelDark);
  }

  // tower crane on the right edge of the plot
  cityPaintCrane(ctx, right - Math.round(w * 0.05), ground, night, time, w * 1.15);

  // materials, sand pile and the site hut on the dirt strip
  const stackX = x + Math.round(w * 0.05);
  const stackY = ground - dirtH - 2;
  for (let index = 0; index < 3; index += 1) {
    const bw = 18 + index * 5;
    const by = stackY - 8 - index * 8;
    artRect(ctx, stackX + index * 7, by, bw, 8, night ? '#4a4034' : '#c9a876');
    artRect(ctx, stackX + index * 7, by, bw, 2, night ? '#5c5040' : '#dcc094');
    artOutline(ctx, stackX + index * 7, by, bw, 8, night ? '#2b241d' : '#8f744f');
  }
  const sandX = x + Math.round(w * 0.60);
  const sandW = Math.round(w * 0.13);
  for (let row = 0; row < Math.max(4, Math.round(scene.h * 0.026)); row += 1) {
    const span = Math.round(sandW * (0.45 + row / 12));
    artRect(ctx, sandX - Math.round(span / 2), ground - dirtH - 1 - row * 2, span, 2, night ? '#5a4c3a' : '#e0c690');
  }
  const hutW = Math.round(w * 0.11);
  const hutH = Math.max(14, Math.round(scene.h * 0.055));
  const hutX = x + Math.round(w * 0.86);
  const hutY = ground - dirtH - hutH;
  artRect(ctx, hutX, hutY, hutW, hutH, night ? '#3a4658' : '#e6ddc6');
  artRect(ctx, hutX, hutY, hutW, 3, night ? '#2b3448' : '#9aa3ad');
  artRect(ctx, hutX + 3, hutY + 5, Math.max(4, Math.round(hutW * 0.30)), Math.max(4, hutH - 8), night ? '#1d2735' : '#b9cdd2');
  artOutline(ctx, hutX, hutY, hutW, hutH, night ? '#0d1420' : '#8b8272');
  if (night) cityPixelGlow(ctx, hutX + hutW / 2, hutY + hutH / 2, Math.round(hutW * 0.6), PAL.lampLight, 0.14);

  // construction fence along the street
  const fenceTop = ground - Math.round(scene.h * 0.035);
  artRect(ctx, x, fenceTop, w, 2, night ? '#4a3b2e' : '#b98a5a');
  artRect(ctx, x, fenceTop + Math.round(scene.h * 0.018), w, 1, night ? '#3a2f26' : '#a97d4f');
  const postGap = Math.max(14, Math.round(w * 0.055));
  for (let px = x; px < right; px += postGap) {
    artRect(ctx, px, fenceTop - 2, 3, Math.round(scene.h * 0.038), night ? '#4a3b2e' : '#b98a5a');
    artRect(ctx, px, fenceTop - 2, 1, Math.round(scene.h * 0.038), night ? '#6b563f' : '#d9b184');
  }

  // lease sign in front of the skeleton
  const signW = Math.round(w * 0.42);
  const signH = Math.round(scene.h * 0.115);
  const signX = x + Math.round((w - signW) / 2);
  const signY = ground - dirtH - signH - Math.max(24, Math.round(scene.h * 0.05));
  artRect(ctx, signX, signY, signW, signH, night ? '#e8e3d4' : '#f7f4ec');
  artOutline(ctx, signX, signY, signW, signH, night ? '#0b1220' : '#1d212b');
  artRect(ctx, signX + Math.round(signW * 0.08), signY + Math.round(signH * 0.18), Math.round(signW * 0.46), Math.max(2, Math.round(signH * 0.10)), night ? '#2f3542' : '#3a4150');
  artRect(ctx, signX + Math.round(signW * 0.08), signY + Math.round(signH * 0.38), Math.round(signW * 0.62), Math.max(1, Math.round(signH * 0.06)), night ? '#7d8a9a' : '#9aa3ad');
  artRect(ctx, signX + Math.round(signW * 0.08), signY + Math.round(signH * 0.54), Math.round(signW * 0.38), Math.max(1, Math.round(signH * 0.06)), night ? '#7d8a9a' : '#9aa3ad');
  artRect(ctx, signX + Math.round(signW * 0.08), signY + Math.round(signH * 0.70), Math.round(signW * 0.34), Math.max(2, Math.round(signH * 0.12)), night ? '#e8b153' : '#c9a45c');
  const postH = Math.max(8, ground - dirtH - (signY + signH));
  artRect(ctx, signX + Math.round(signW * 0.2), signY + signH, Math.max(2, Math.round(signW * 0.02)), postH, night ? '#3d4b63' : '#6f7883');
  artRect(ctx, signX + Math.round(signW * 0.76), signY + signH, Math.max(2, Math.round(signW * 0.02)), postH, night ? '#3d4b63' : '#6f7883');

  // right-hand billboard fills the directory space
  const dir = scene.directory;
  if (dir && dir.w > 60 && dir.h > 60) {
    const bh = Math.min(dir.h, Math.round(scene.h * 0.34));
    const by = dir.y + Math.round((dir.h - bh) / 2);
    artRect(ctx, dir.x, by, dir.w, bh, night ? '#e8e3d4' : '#f7f4ec');
    artOutline(ctx, dir.x - 2, by - 2, dir.w + 4, bh + 4, night ? '#0b1220' : '#1d212b');
    const iconX = dir.x + dir.w - Math.round(dir.w * 0.3);
    artRect(ctx, iconX, by + Math.round(bh * 0.16), Math.round(dir.w * 0.22), Math.round(bh * 0.64), night ? '#2f3542' : '#3a4150');
    artRect(ctx, iconX + Math.round(dir.w * 0.02), by + Math.round(bh * 0.24), Math.round(dir.w * 0.18), Math.round(bh * 0.5), night ? '#c9c0ac' : '#efeadd');
    artRect(ctx, dir.x + Math.round(dir.w * 0.08), by + Math.round(bh * 0.18), Math.round(dir.w * 0.44), Math.max(2, Math.round(bh * 0.08)), night ? '#2f3542' : '#3a4150');
    artRect(ctx, dir.x + Math.round(dir.w * 0.08), by + Math.round(bh * 0.34), Math.round(dir.w * 0.56), Math.max(1, Math.round(bh * 0.05)), night ? '#5f6b78' : '#9aa3ad');
    artRect(ctx, dir.x + Math.round(dir.w * 0.08), by + Math.round(bh * 0.46), Math.round(dir.w * 0.36), Math.max(1, Math.round(bh * 0.05)), night ? '#5f6b78' : '#9aa3ad');
    artRect(ctx, dir.x + Math.round(dir.w * 0.08), by + Math.round(bh * 0.62), Math.round(dir.w * 0.4), Math.max(2, Math.round(bh * 0.1)), night ? '#e8b153' : '#c9a45c');
    artRect(ctx, dir.x + Math.round(dir.w * 0.08), by + bh, 4, Math.max(6, ground - by - bh), night ? '#3d4b63' : '#b0a897');
    artRect(ctx, dir.x + dir.w - Math.round(dir.w * 0.1), by + bh, 4, Math.max(6, ground - by - bh), night ? '#3d4b63' : '#b0a897');
    if (night) cityPixelGlow(ctx, dir.x + dir.w / 2, by + bh / 2, Math.round(dir.w * 0.4), PAL.lampLight, 0.12);
  }
}
function cityPaintCrane(ctx, x, ground, night, time, towerWidth) {
  const metal = night ? '#5a6f8c' : '#8794a0';
  const dark = night ? '#3a4a64' : '#6b7682';
  const height = Math.max(60, Math.round((Number(towerWidth) || 200) * 0.42));
  artRect(ctx, x, ground - height, 7, height, metal);
  artRect(ctx, x, ground - height, 2, height, night ? '#7f96b6' : '#a9b6c0');
  for (let index = 0; index < height; index += 10) artRect(ctx, x + 1, ground - height + index, 5, 1, dark);
  const jib = Math.round(height * 0.62);
  artRect(ctx, x - jib, ground - height + 8, jib + 10, 4, metal);
  artRect(ctx, x - jib, ground - height + 8, jib + 10, 1, night ? '#7f96b6' : '#a9b6c0');
  artRect(ctx, x - jib, ground - height + 8, 3, Math.round(height * 0.14), metal);
  artRect(ctx, x + 8, ground - height + 8, Math.round(height * 0.22), 4, metal);
  artRect(ctx, x + 8 + Math.round(height * 0.16), ground - height + 12, Math.round(height * 0.09), Math.round(height * 0.08), dark);
  artRect(ctx, x - 8, ground - height + 8, 14, Math.round(height * 0.08), night ? '#3b2f22' : '#8f744f');
  artRect(ctx, x + 1, ground - height, 5, Math.round(height * 0.10), night ? '#3b2f22' : '#8f744f');
  const swing = Math.floor(time / 1300) % 2;
  artRect(ctx, x - jib + 8 + swing, ground - height + 9, 1, Math.round(height * 0.3), dark);
  artRect(ctx, x - jib + 6 + swing, ground - height + 9 + Math.round(height * 0.3), 5, 3, night ? '#3b2f22' : '#8f744f');
  if (night) {
    const blink = Math.floor(time / 700) % 2 === 0;
    artRect(ctx, x + 1, ground - height - 2, 3, 2, blink ? '#ff6b5f' : '#5c2b2b');
    if (blink) cityPixelGlow(ctx, x + 2, ground - height, 6, '#ff6b5f', 0.4);
  }
}

/* ----------------------------------------------------------------------- cars */

function cityPaintCars(ctx, scene, night, time) {
  const W = scene.w;
  const span = W + 240;
  for (let index = 0; index < scene.cars.length; index += 1) {
    const car = scene.cars[index];
    let x = (car.base + time * car.speed) % span;
    if (x < 0) x += span;
    cityPaintCar(ctx, Math.round(x) - 120, car.lane, car, night);
  }
}

function cityPaintCar(ctx, x, y, car, night) {
  const w = Math.max(14, car.w);
  const h = Math.max(8, car.h);
  const body = night ? car.night : car.day;
  const bodyLight = artShade(body, night ? 0.16 : 0.22);
  const bodyDark = artShade(body, -0.3);
  const glass = night ? '#334a63' : '#d6e9ee';
  artShadow(ctx, x + 2, y + h - 2, w - 4, 5, night ? 0.4 : 0.22);
  // wheels
  artRect(ctx, x + Math.round(w * 0.1), y + h - 3, Math.max(4, Math.round(w * 0.16)), 4, '#1a1e26');
  artRect(ctx, x + w - Math.round(w * 0.1) - Math.max(4, Math.round(w * 0.16)), y + h - 3, Math.max(4, Math.round(w * 0.16)), 4, '#1a1e26');
  // body
  artRect(ctx, x, y + Math.round(h * 0.3), w, Math.round(h * 0.62), body);
  artRect(ctx, x, y + Math.round(h * 0.3), w, 2, bodyLight);
  artRect(ctx, x, y + h - 2, w, 1, bodyDark);
  // cabin
  const cabinX = x + Math.round(w * 0.16);
  const cabinW = Math.round(w * 0.66);
  artRect(ctx, cabinX, y, cabinW, Math.round(h * 0.4), body);
  artRect(ctx, cabinX + 1, y + 1, cabinW - 2, Math.max(2, Math.round(h * 0.26)), glass);
  if (car.kind === 'bus') {
    artRect(ctx, x + Math.round(w * 0.04), y + Math.round(h * 0.36), Math.round(w * 0.4), Math.max(2, Math.round(h * 0.3)), glass);
    artRect(ctx, x + Math.round(w * 0.52), y + Math.round(h * 0.36), Math.round(w * 0.4), Math.max(2, Math.round(h * 0.3)), glass);
  }
  // head/tail lights
  const frontX = car.dir > 0 ? x + w - 3 : x;
  const backX = car.dir > 0 ? x : x + w - 3;
  artRect(ctx, frontX, y + Math.round(h * 0.42), 3, 2, night ? '#ffe08a' : '#f7f4ec');
  artRect(ctx, backX, y + Math.round(h * 0.42), 3, 2, night ? '#e06a5f' : '#c96a5f');
  if (night) {
    cityHeadlight(ctx, frontX + (car.dir > 0 ? 3 : -3), y + Math.round(h * 0.46), Math.round(w * 0.9), Math.max(4, Math.round(h * 0.5)), car.dir, '#ffe08a');
  }
}

/* -------------------------------------------------------------------- sun glow */

function cityPaintSunGlow(ctx, scene, night) {
  if (night) return;
  const W = scene.w;
  const H = scene.h;
  if (H <= 0 || W <= 0) return;
  ctx.globalAlpha = 0.06;
  artRect(ctx, 0, Math.round(H * 0.55), W, Math.round(H * 0.45), '#ffe9a8');
  ctx.globalAlpha = 1;
}

