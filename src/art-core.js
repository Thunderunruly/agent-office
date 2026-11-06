// ===== art-core.js =====
// Shared pixel-art foundation: palette, integer primitives, sky/light helpers, one
// deterministic 16x24 cast of office people, and the furniture / prop kit that the room
// (and optionally the city & building) painters compose their scenes from.
//
// Owner: T1 (art). House rules:
//   * integer coordinates only - every primitive rounds before it paints;
//   * no images, no shadowBlur, no gradients (hard pixel bands + translucent washes only);
//   * deterministic: variation comes from artRng(artHash(seed)), never Math.random;
//   * painters never touch DOM/React - they receive a plain CanvasRenderingContext2D.
//
// Compatibility: PAL, HAIR_COLORS, SKIN_COLORS, SHIRT_COLORS, CHAIR_COLORS, artRect,
// artPix, artOutline, artLine, artRng, artPick, artCharacterSpec, artSkyBand,
// artNightOverlay, artGlow and artBubble keep their original names/signatures because the
// city/building painters were written against them. Everything below is additive.

const PAL = {
  // --- baseline shared palette (do not rename: every scene reads these) ---
  ink: '#1d212b',
  inkSoft: '#2f3542',
  outline: '#141822',
  shadow: 'rgba(16,20,30,0.28)',
  floor: '#d9d4c7',
  floorAlt: '#cfc9ba',
  floorLight: '#e2ddd0',
  floorLine: '#b9b2a3',
  wall: '#efeadd',
  wallAlt: '#e4ddcc',
  wallTrim: '#c9c0ac',
  wood: '#b98a5a',
  woodDark: '#9c6f45',
  woodDeep: '#7d5735',
  metal: '#9aa3ad',
  metalDark: '#6f7883',
  fabric: '#6d7f8f',
  fabricDark: '#56687a',
  chair: '#333b48',
  chairAlt: '#454f5e',
  screen: '#2b3a4a',
  screenGlow: '#62d9c6',
  screenCode: '#8ee8d8',
  ledGreen: '#63d471',
  ledAmber: '#e8b153',
  ledRed: '#e06a5f',
  lampLight: '#ffd97a',
  night: '#0e1626',
  nightMid: '#16243a',
  nightHigh: '#24344f',
  skyDay: '#a8d4e8',
  skyDayLow: '#d6e9ee',
  skyDusk: '#e8b48c',
  skyNight: '#0b1526',
  cloud: '#f4f7f8',
  cloudShade: '#dbe6ec',
  glass: 'rgba(180,214,224,0.18)',
  glassLine: 'rgba(214,236,240,0.55)',
  white: '#f7f4ec',
  paper: '#ece5d4',

  // --- extended by the T1 art pass (additive, same naming style) ---
  wallDeep: '#d7cfbb',
  wallSeam: '#e4ddcc',
  ceiling: '#e6e0d0',
  deskTop: '#e8e0cf',
  deskTopAlt: '#d8cfba',
  deskTopLight: '#f3ecdc',
  woodLight: '#cfa06e',
  gold: '#e8b153',
  goldLight: '#ffd97a',
  goldDark: '#a8782c',
  bezel: '#2f3a49',
  bezelLight: '#455262',
  bezelDeep: '#1e2732',
  screenBg: '#123336',
  screenCodeWarm: '#e8b153',
  screenCodeCool: '#8fa9b8',
  screenCodeSoft: '#7fd6c4',
  screenIdle: '#1b2530',
  ceramic: '#f2ede0',
  paperShade: '#c9c2b2',
  coffee: '#4a2f22',
  cardboard: '#c9a06a',
  cardboardDark: '#a37d4f',
  plant: '#4f7d4a',
  plantLight: '#6a9a5f',
  plantDark: '#3c6139',
  pot: '#b0745e',
  potLight: '#c98a72',
  terracottaDark: '#8c5a46',
  fabricLight: '#8395a5',
  nightGlass: 'rgba(138,172,196,0.14)',
  star: '#fff3c9',
  starDim: '#9fb4d4',
  moon: '#e8e4d0',
  sun: '#ffe9a8',
  rooftopDay: '#b9c9c9',
  rooftopNight: '#1a2739',
  windowLit: '#ffd97a',
};

// Stable character colour ranges. Deterministic picks only - never random.
const HAIR_COLORS = ['#2b2f3a', '#6b4a35', '#d8b25c', '#a34d3f', '#8a8f98', '#3c5a3f', '#7a4f7d'];
const SKIN_COLORS = ['#f0c9a6', '#d9a97f', '#b9825c', '#efdcc4'];
const SHIRT_COLORS = ['#5d7f9a', '#8a6d92', '#a9715a', '#6d8f6a', '#b08a52', '#7d8494', '#a35d68'];
const CHAIR_COLORS = ['#333b48', '#454f5e', '#4a3d52', '#3f4a44'];

// Room accent palettes, one per accentSeed (1..8). Carpet / chair / plate accents.
const ART_ACCENTS = [
  { main: '#3f7d78', dark: '#2c5a57', light: '#6ba79f' },
  { main: '#4a6d9c', dark: '#35507a', light: '#7d9cc4' },
  { main: '#7a5b8f', dark: '#5b426d', light: '#a284b8' },
  { main: '#9c5f4a', dark: '#774535', light: '#c98d74' },
  { main: '#5c7d4f', dark: '#435e39', light: '#8aa87b' },
  { main: '#a08a45', dark: '#7c6b31', light: '#c9b46e' },
  { main: '#5d7f8f', dark: '#44606d', light: '#87a7b5' },
  { main: '#8f5566', dark: '#6d3f4d', light: '#b88292' },
];
const ART_TIE_COLORS = ['#8f3a3a', '#2f4d7a', '#3c6b5a', '#6b3c6e', '#7a5a2f'];
const ART_PANTS_COLORS = ['#2b303c', '#3a3f4d', '#4a3d35', '#2f3a44', '#3d3348'];
const ART_BADGE_COLORS = ['#62d9c6', '#e8b153', '#7fb3d8', '#e06a5f', '#a8d86f'];

/* ------------------------------------------------------------------------------------
 * Small maths / determinism helpers
 * ---------------------------------------------------------------------------------- */

function artClamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** FNV-1a string hash - stable per session id, used to seed every art spec. */
function artHash(text) {
  const value = String(text == null ? '' : text);
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function artParseHex(hex) {
  const value = String(hex == null ? '' : hex).trim();
  if (value.charAt(0) !== '#') return [0, 0, 0];
  if (value.length === 7) {
    return [
      parseInt(value.slice(1, 3), 16) || 0,
      parseInt(value.slice(3, 5), 16) || 0,
      parseInt(value.slice(5, 7), 16) || 0,
    ];
  }
  if (value.length === 4) {
    const r = parseInt(value.charAt(1), 16) || 0;
    const g = parseInt(value.charAt(2), 16) || 0;
    const b = parseInt(value.charAt(3), 16) || 0;
    return [r * 17, g * 17, b * 17];
  }
  return [0, 0, 0];
}

/** Lighten (amount > 0) or darken (amount < 0) a hex colour; returns a hex colour. */
function artShade(hex, amount) {
  const rgb = artParseHex(hex);
  const amt = Math.max(-1, Math.min(1, Number(amount) || 0));
  const target = amt >= 0 ? 255 : 0;
  const k = Math.abs(amt);
  const mix = (channel) => {
    const value = Math.round(channel + (target - channel) * k);
    return (value < 0 ? 0 : value > 255 ? 255 : value).toString(16).padStart(2, '0');
  };
  return `#${mix(rgb[0])}${mix(rgb[1])}${mix(rgb[2])}`;
}

/** Translucent version of a hex colour. */
function artAlpha(hex, alpha) {
  const rgb = artParseHex(hex);
  const a = Math.max(0, Math.min(1, Number(alpha) || 0));
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
}

/** Deterministic PRNG (xorshift32) - stable little details between frames. */
function artRng(seed) {
  let state = (Number(seed) || 1) >>> 0 || 1;
  return function next() {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

function artPick(list, seed) {
  if (!Array.isArray(list) || list.length === 0) return '';
  return list[Math.abs(Math.floor(Number(seed) || 0)) % list.length];
}

/* ------------------------------------------------------------------------------------
 * Integer pixel primitives
 * ---------------------------------------------------------------------------------- */

/** Integer rectangle helper (never sub-pixel: this is pixel art). */
function artRect(ctx, x, y, width, height, color) {
  if (!ctx || width <= 0 || height <= 0) return;
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
}

/** One logical pixel block of the given size. */
function artPix(ctx, x, y, color, size) {
  const side = size == null ? 1 : size;
  artRect(ctx, x, y, side, side, color);
}

/** A 1px outline rectangle. */
function artOutline(ctx, x, y, width, height, color) {
  artRect(ctx, x, y, width, 1, color);
  artRect(ctx, x, y + height - 1, width, 1, color);
  artRect(ctx, x, y, 1, height, color);
  artRect(ctx, x + width - 1, y, 1, height, color);
}

/** Pixel line via Bresenham; horizontal/vertical lines stay crisp. */
function artLine(ctx, x0, y0, x1, y1, color) {
  let x = Math.round(x0);
  let y = Math.round(y0);
  const endX = Math.round(x1);
  const endY = Math.round(y1);
  const dx = Math.abs(endX - x);
  const dy = -Math.abs(endY - y);
  const sx = x < endX ? 1 : -1;
  const sy = y < endY ? 1 : -1;
  let error = dx + dy;
  ctx.fillStyle = color;
  for (;;) {
    ctx.fillRect(x, y, 1, 1);
    if (x === endX && y === endY) break;
    const twice = error * 2;
    if (twice >= dy) {
      error += dy;
      x += sx;
    }
    if (twice <= dx) {
      error += dx;
      y += sy;
    }
  }
}

/** Rounded pixel rectangle: corners are chamfered by `cut` px, optional 1px edge. */
function artSteppedBox(ctx, x, y, width, height, fill, edge, cut) {
  const c = cut == null ? 1 : Math.max(0, Math.min(3, Math.round(cut)));
  const w = Math.round(width);
  const h = Math.round(height);
  if (w <= 0 || h <= 0) return;
  if (c === 0 || w <= c * 2 || h <= c * 2) {
    artRect(ctx, x, y, w, h, fill);
    if (edge) artOutline(ctx, x, y, w, h, edge);
    return;
  }
  artRect(ctx, x + c, y, w - c * 2, c, fill);
  artRect(ctx, x + c, y + h - c, w - c * 2, c, fill);
  artRect(ctx, x, y + c, w, h - c * 2, fill);
  if (!edge) return;
  artRect(ctx, x + c, y, w - c * 2, 1, edge);
  artRect(ctx, x + c, y + h - 1, w - c * 2, 1, edge);
  artRect(ctx, x, y + c, 1, h - c * 2, edge);
  artRect(ctx, x + w - 1, y + c, 1, h - c * 2, edge);
  artPix(ctx, x + c - 1, y + c - 1, edge);
  artPix(ctx, x + w - c, y + c - 1, edge);
  artPix(ctx, x + c - 1, y + h - c, edge);
  artPix(ctx, x + w - c, y + h - c, edge);
}

/** Filled pixel circle (integer rows, no anti-aliasing). */
function artPixelCircle(ctx, cx, cy, radius, color) {
  const r = Math.max(1, Math.round(radius));
  for (let dy = -r; dy <= r; dy += 1) {
    const half = Math.floor(Math.sqrt(r * r - dy * dy));
    artRect(ctx, cx - half, cy + dy, half * 2 + 1, 1, color);
  }
}

/** Filled pixel diamond. */
function artDiamond(ctx, cx, cy, radius, color) {
  const r = Math.max(1, Math.round(radius));
  for (let dy = -r; dy <= r; dy += 1) {
    const half = r - Math.abs(dy);
    artRect(ctx, cx - half, cy + dy, half * 2 + 1, 1, color);
  }
}

/* ------------------------------------------------------------------------------------
 * Light / atmosphere helpers
 * ---------------------------------------------------------------------------------- */

/** Flat pixel shadow (three hard bands approximating an ellipse). */
function artShadow(ctx, x, y, width, height, alpha) {
  if (!ctx) return;
  const a = alpha == null ? 0.2 : alpha;
  const w = Math.round(width);
  const h = Math.round(height);
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = `rgba(17,21,30,${a})`;
  const band = Math.max(1, Math.round(h / 3));
  const inset0 = Math.round(w * 0.16);
  const inset2 = Math.round(w * 0.10);
  ctx.fillRect(Math.round(x + inset0), Math.round(y), Math.round(w - inset0 * 2), band);
  ctx.fillRect(Math.round(x), Math.round(y + band), w, band);
  ctx.fillRect(Math.round(x + inset2), Math.round(y + band * 2), Math.round(w - inset2 * 2), band);
}

/** Warm light pooling around a lamp/screen: stacked translucent ellipses. */
function artGlow(ctx, x, y, radius, color, strength) {
  if (!ctx) return;
  const layers = 4;
  const alpha = (strength == null ? 0.22 : strength) / layers;
  for (let index = layers; index >= 1; index -= 1) {
    const size = Math.max(1, Math.round((radius * index) / layers));
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.ellipse(x, y, size, size * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Whole-canvas night color wash (multiply-ish, cheap). */
function artNightOverlay(ctx, width, height, strength) {
  const alpha = Math.max(0, Math.min(0.72, strength == null ? 0.42 : strength));
  if (alpha <= 0) return;
  ctx.fillStyle = `rgba(10,18,34,${alpha})`;
  ctx.fillRect(0, 0, Math.round(width), Math.round(height));
}

/** Hard-banded sky for the city: returns the day band color for a y row. */
function artSkyBand(y, height, night) {
  const ratio = Math.max(0, Math.min(1, y / Math.max(1, height)));
  if (night) {
    if (ratio < 0.35) return PAL.skyNight;
    if (ratio < 0.7) return PAL.night;
    return PAL.nightMid;
  }
  if (ratio < 0.3) return PAL.skyDay;
  if (ratio < 0.62) return PAL.skyDayLow;
  if (ratio < 1) return '#e7ece6';
  return '#e7ece6';
}

/** Speech bubble with a tail, sized to a small label; n dots or one glyph. */
function artBubble(ctx, x, y, width, height, glyph, dark) {
  const fill = dark ? PAL.inkSoft : PAL.white;
  const line = dark ? PAL.outline : PAL.ink;
  artRect(ctx, x + 2, y, width - 4, height, fill);
  artRect(ctx, x, y + 2, width, height - 4, fill);
  artOutline(ctx, x, y, width, height, line);
  artRect(ctx, x + 3, y + height, 3, 2, fill);
  artRect(ctx, x + 3, y + height, 3, 1, line);
  artRect(ctx, x + 4, y + 3, 1, height - 6, line);
  artRect(ctx, x + width - 4, y + 3, 1, height - 6, line);
  if (glyph) {
    ctx.fillStyle = line;
    ctx.font = '8px monospace';
    ctx.textBaseline = 'top';
    ctx.fillText(glyph, x + width / 2 - 4, y + 2);
  }
}

/** A tiny rounded speech bubble (no text) - status blips beside a character. */
function artMiniBubble(ctx, x, y, width, height, fill, line) {
  artSteppedBox(ctx, x, y, width, height, fill, line, 1);
  artRect(ctx, x + 3, y + height - 1, 3, 2, fill);
  artRect(ctx, x + 3, y + height + 1, 3, 1, line);
}

/** Rising coffee/tea steam: a couple of drifting 1px wisps. */
function artSteam(ctx, x, y, t, color, strength) {
  const time = Math.floor((t || 0) / 210);
  ctx.fillStyle = color;
  for (let index = 0; index < 2; index += 1) {
    const phase = (time + index * 3) % 6;
    const px = x + index * 2 + ((phase % 3) === 0 ? -1 : 0);
    const py = y - phase;
    ctx.globalAlpha = (strength == null ? 0.5 : strength) * (1 - phase / 7);
    ctx.fillRect(px, py, 1, 1);
  }
  ctx.globalAlpha = 1;
}

/** Floating "Zzz" for an idle / dozing character. */
function artZzz(ctx, x, y, t, color) {
  const cycle = (t || 0) % 2400;
  const phase = cycle / 2400;
  if (phase > 0.72) return;
  const drift = Math.round(phase * 14);
  const alpha = 0.85 - phase;
  ctx.globalAlpha = Math.max(0.15, alpha);
  ctx.fillStyle = color;
  const zx = x + Math.round(phase * 4);
  const zy = y - drift;
  // z at 3x3, then a smaller z, then a dot - rising and fading.
  ctx.fillRect(zx, zy, 3, 1);
  ctx.fillRect(zx + 1, zy + 1, 1, 1);
  ctx.fillRect(zx, zy + 2, 3, 1);
  ctx.fillRect(zx + 3, zy + 3, 2, 1);
  ctx.fillRect(zx + 3, zy + 4, 2, 1);
  ctx.globalAlpha = 1;
}

/** Three typing dots in a mini bubble (screen busy). */
function artTypingDots(ctx, x, y, t, fill, line, dot) {
  artMiniBubble(ctx, x, y, 16, 9, fill, line);
  const phase = Math.floor((t || 0) / 220) % 3;
  for (let index = 0; index < 3; index += 1) {
    artRect(ctx, x + 3 + index * 4, y + 4, 2, 2, index === phase ? dot : line);
  }
}

/* ------------------------------------------------------------------------------------
 * Character cast
 * ---------------------------------------------------------------------------------- */

/**
 * Deterministic look for one person from a number/string seed.
 * Keeps the historical field names (hair/skin/shirt/chair/hairStyle/accessories/tall)
 * and adds pre-shaded variants so painting stays cheap.
 */
function artCharacterSpec(seed) {
  const numeric = typeof seed === 'string' ? artHash(seed) : Number(seed) || 1;
  const rng = artRng((numeric ^ 0x9e3779b9) >>> 0);
  const pick = (list) => list[Math.floor(rng() * list.length) % list.length];
  const hair = pick(HAIR_COLORS);
  const skin = pick(SKIN_COLORS);
  const shirt = pick(SHIRT_COLORS);
  const chair = pick(CHAIR_COLORS);
  const hairStyle = Math.floor(rng() * 6);
  const accessories = rng() > 0.72;
  const tall = rng() > 0.8;
  return {
    seed: numeric >>> 0,
    hair,
    hairLight: artShade(hair, 0.3),
    hairDark: artShade(hair, -0.35),
    skin,
    skinDark: artShade(skin, -0.24),
    shirt,
    shirtLight: artShade(shirt, 0.26),
    shirtDark: artShade(shirt, -0.3),
    chair,
    chairLight: artShade(chair, 0.22),
    chairDark: artShade(chair, -0.32),
    pants: pick(ART_PANTS_COLORS),
    pantsDark: artShade(pick(ART_PANTS_COLORS), -0.3),
    tie: pick(ART_TIE_COLORS),
    badge: pick(ART_BADGE_COLORS),
    hairStyle,
    accessories,
    glasses: accessories && rng() > 0.55,
    headset: rng() > 0.6,
    tall,
    blinkPhase: Math.floor(rng() * 1000),
  };
}

/**
 * Draw one 16x24 character. (x, y) is the top-left of the logical 16x24 cell; only the
 * head / torso are usually visible above a desk. opts = { role, running, t, blink,
 * sleepy, standing, reducedMotion, hatTip }.
 */
function artPerson(ctx, x, y, spec, opts) {
  if (!ctx || !spec) return;
  const o = opts || {};
  const role = o.role || 'teammate';
  const isBoss = role === 'lead';
  const isSub = role === 'subagent';
  const running = o.running === true;
  const t = o.t || 0;
  const reduced = o.reducedMotion === true;
  const standing = o.standing === true;

  let frame = 0;
  if (running && !reduced) frame = Math.floor(t / 210) % 2;
  let bob = 0;
  if (!reduced) {
    if (running) bob = frame;
    else bob = Math.sin(t / 820) > 0.62 ? 1 : 0;
  }

  const out = PAL.outline;
  const hair = spec.hair;
  const hairD = spec.hairDark || artShade(hair, -0.35);
  const hairL = spec.hairLight || artShade(hair, 0.3);
  const skin = spec.skin;
  const skinD = spec.skinDark || artShade(skin, -0.24);
  const shirt = spec.shirt;
  const shirtD = spec.shirtDark || artShade(shirt, -0.3);
  const shirtL = spec.shirtLight || artShade(shirt, 0.26);
  const pants = spec.pants || PAL.inkSoft;
  const pantsD = spec.pantsDark || artShade(pants, -0.3);

  const hx = x + 3;
  const hy = y + 1 + bob;
  const style = Math.abs(spec.hairStyle || 0) % 6;

  // Long hair falls behind the shoulders.
  if (style === 3) {
    artRect(ctx, hx - 1, hy + 2, 1, 8, hairD);
    artRect(ctx, hx + 10, hy + 2, 1, 8, hairD);
  }

  // Head silhouette: notched outline box, flat face fill.
  artRect(ctx, hx, hy - 1, 10, 1, out);
  artRect(ctx, hx - 1, hy, 1, 9, out);
  artRect(ctx, hx + 10, hy, 1, 9, out);
  artRect(ctx, hx + 1, hy + 9, 8, 1, out);
  artRect(ctx, hx, hy, 10, 9, skin);
  artPix(ctx, hx - 1, hy + 4, skinD);
  artPix(ctx, hx + 10, hy + 4, skinD);

  // Hair cap variants - all deterministic from hairStyle.
  if (style === 0) {
    artRect(ctx, hx, hy, 10, 3, hair);
    artRect(ctx, hx + 1, hy + 3, 3, 1, hair);
    artRect(ctx, hx + 8, hy + 2, 2, 2, hair);
    artRect(ctx, hx + 2, hy, 3, 1, hairL);
  } else if (style === 1) {
    artRect(ctx, hx, hy, 10, 2, hair);
    artRect(ctx, hx + 1, hy + 2, 4, 2, hair);
    artRect(ctx, hx + 6, hy + 2, 3, 1, hair);
    artRect(ctx, hx + 9, hy + 2, 1, 3, hair);
    artRect(ctx, hx + 2, hy, 3, 1, hairL);
  } else if (style === 2) {
    artRect(ctx, hx, hy, 10, 2, hair);
    artRect(ctx, hx + 1, hy + 2, 2, 2, hair);
    artRect(ctx, hx + 7, hy + 2, 2, 2, hair);
    artRect(ctx, hx + 6, hy - 2, 4, 2, hair);
    artRect(ctx, hx + 7, hy - 2, 2, 1, hairL);
  } else if (style === 3) {
    artRect(ctx, hx, hy, 10, 3, hair);
    artRect(ctx, hx - 1, hy + 1, 2, 8, hairD);
    artRect(ctx, hx + 9, hy + 1, 2, 8, hairD);
    artRect(ctx, hx, hy, 10, 1, hairL);
  } else if (style === 4) {
    artRect(ctx, hx + 1, hy, 8, 2, hair);
    artRect(ctx, hx, hy + 1, 2, 2, hair);
    artRect(ctx, hx + 8, hy + 1, 2, 2, hair);
    artRect(ctx, hx + 3, hy - 1, 2, 1, hair);
    artRect(ctx, hx + 6, hy - 1, 2, 1, hair);
    artRect(ctx, hx + 2, hy, 2, 1, hairL);
  } else {
    artRect(ctx, hx + 1, hy, 8, 1, hair);
    artRect(ctx, hx, hy + 1, 2, 2, hair);
    artRect(ctx, hx + 8, hy + 1, 2, 2, hair);
    artRect(ctx, hx + 2, hy, 2, 1, hairL);
  }
  // Sideburns always trim the outline.
  artRect(ctx, hx, hy + 1, 1, 2, hairD);
  artRect(ctx, hx + 9, hy + 1, 1, 2, hairD);

  // Face: big pixel eyes, blink is a 1px lid, mouth is a 2px dot.
  const eyeY = hy + 4;
  const blink = o.blink === true;
  const sleepy = o.sleepy === true;
  if (blink || sleepy) {
    artRect(ctx, hx + 2, eyeY + 1, 2, 1, out);
    artRect(ctx, hx + 6, eyeY + 1, 2, 1, out);
  } else {
    artRect(ctx, hx + 2, eyeY, 2, 2, out);
    artRect(ctx, hx + 6, eyeY, 2, 2, out);
  }
  artRect(ctx, hx + 4, hy + 7, 2, 1, skinD);
  if (spec.glasses) {
    artOutline(ctx, hx + 1, hy + 3, 4, 4, out);
    artOutline(ctx, hx + 6, hy + 3, 4, 4, out);
    artRect(ctx, hx + 5, hy + 4, 1, 1, out);
  }
  if (spec.headset) {
    artRect(ctx, hx + 11, hy + 2, 2, 3, PAL.metalDark);
    artRect(ctx, hx + 12, hy + 3, 1, 4, PAL.metal);
    artRect(ctx, hx + 10, hy + 6, 1, 2, PAL.metalDark);
  }

  // Neck + torso.
  artRect(ctx, x + 7, y + 10, 2, 1, skinD);
  const bodyY = y + 11;
  artRect(ctx, x + 3, bodyY, 10, 1, shirtL);
  artRect(ctx, x + 2, bodyY + 1, 12, 5, shirt);
  artRect(ctx, x + 2, bodyY + 5, 12, 1, shirtD);
  artRect(ctx, x + 1, bodyY + 2, 1, 4, shirtD);
  artRect(ctx, x + 14, bodyY + 2, 1, 4, shirtD);
  artRect(ctx, x + 1, bodyY + 6, 1, 1, out);
  artRect(ctx, x + 14, bodyY + 6, 1, 1, out);
  artRect(ctx, x + 6, bodyY + 1, 1, 1, shirtD);
  artRect(ctx, x + 9, bodyY + 1, 1, 1, shirtD);
  // Sleeve cuffs where hands attach.
  artRect(ctx, x + 1, bodyY + 4, 1, 2, shirtD);
  artRect(ctx, x + 14, bodyY + 4, 1, 2, shirtD);

  if (isBoss) {
    // Suit lapels + tie + a small gold crown resting on the hair.
    artRect(ctx, x + 2, bodyY + 1, 2, 4, shirtD);
    artRect(ctx, x + 12, bodyY + 1, 2, 4, shirtD);
    artRect(ctx, x + 7, bodyY + 1, 2, 1, PAL.white);
    artRect(ctx, x + 7, bodyY + 2, 2, 1, spec.tie || PAL.ledRed);
    artRect(ctx, x + 8, bodyY + 3, 1, 2, spec.tie || PAL.ledRed);
    const crownY = hy - 2;
    artRect(ctx, hx + 1, crownY, 1, 2, PAL.gold);
    artRect(ctx, hx + 4, crownY - 1, 1, 3, PAL.gold);
    artRect(ctx, hx + 7, crownY, 1, 2, PAL.gold);
    artRect(ctx, hx + 1, crownY + 1, 7, 1, PAL.goldDark);
    artPix(ctx, hx + 4, crownY + 1, PAL.goldLight);
  } else if (isSub) {
    // Subagent badge on the chest.
    artRect(ctx, x + 11, bodyY + 2, 2, 2, spec.badge || PAL.screenGlow);
    artPix(ctx, x + 11, bodyY + 2, PAL.white);
  } else {
    // Teammates get a little collar pin.
    artRect(ctx, x + 10, bodyY + 2, 1, 1, spec.badge || PAL.ledAmber);
  }

  if (standing) {
    artRect(ctx, x + 3, bodyY + 6, 4, 5, pants);
    artRect(ctx, x + 9, bodyY + 6, 4, 5, pantsD);
    artRect(ctx, x + 3, bodyY + 11, 4, 1, PAL.ink);
    artRect(ctx, x + 9, bodyY + 11, 4, 1, PAL.ink);
  }
}

/** Two hands tapping a keyboard in front of a seated character. */
function artPersonHands(ctx, cx, deskTop, spec, opts) {
  if (!ctx || !spec) return;
  const o = opts || {};
  const running = o.running === true;
  const t = o.t || 0;
  const reduced = o.reducedMotion === true;
  const big = o.big === true;
  const frame = running && !reduced ? Math.floor(t / 210) % 2 : 0;
  const skin = spec.skin;
  const skinD = spec.skinDark || artShade(skin, -0.24);
  const sleeve = spec.shirtDark || spec.shirt;
  const handW = big ? 4 : 3;
  const handH = big ? 3 : 2;
  const spread = big ? 9 : 8;
  const baseY = (o.baseY == null ? deskTop + 9 : o.baseY);
  const leftX = cx - spread - handW;
  const rightX = cx + spread;
  const leftDy = running ? (frame ? -1 : 0) : 0;
  const rightDy = running ? (frame ? 0 : -1) : 0;
  // short forearm stubs hint at arms reaching over the desk edge
  artRect(ctx, leftX + 1, baseY - 8 + leftDy, 1, 5, sleeve);
  artRect(ctx, rightX + 1, baseY - 8 + rightDy, 1, 5, sleeve);
  artRect(ctx, leftX + 1, baseY - 3 + leftDy, 1, 1, skinD);
  artRect(ctx, rightX + 1, baseY - 3 + rightDy, 1, 1, skinD);
  artRect(ctx, leftX, baseY - 2 + leftDy, handW, 1, sleeve);
  artRect(ctx, rightX, baseY - 2 + rightDy, handW, 1, sleeve);
  artRect(ctx, leftX, baseY + leftDy, handW, handH, skin);
  artRect(ctx, rightX, baseY + rightDy, handW, handH, skin);
  artRect(ctx, leftX + 1, baseY + leftDy, 1, 1, skinD);
  artRect(ctx, rightX + 1, baseY + rightDy, 1, 1, skinD);
}

/* ------------------------------------------------------------------------------------
 * Office furniture kit
 * ---------------------------------------------------------------------------------- */

/** Desk: cream desktop with a wood back band, front apron and two legs. */
function artDrawDesk(ctx, x, y, width, opts) {
  const o = opts || {};
  const night = o.night === true;
  const depth = Math.max(16, Math.round(o.depth == null ? 24 : o.depth));
  const w = Math.round(width);
  const tableTop = o.top || PAL.deskTop;
  artShadow(ctx, x + 3, y + depth + 7, w - 6, 10, night ? 0.32 : 0.16);
  // legs (behind the apron)
  artRect(ctx, x + 8, y + depth + 8, 4, 9, PAL.woodDeep);
  artRect(ctx, x + w - 12, y + depth + 8, 4, 9, PAL.woodDeep);
  artRect(ctx, x + 11, y + depth + 8, 1, 9, PAL.woodDark);
  artRect(ctx, x + w - 9, y + depth + 8, 1, 9, PAL.woodDark);
  // front apron
  artRect(ctx, x, y + depth, w, 9, PAL.woodDark);
  artRect(ctx, x + 6, y + depth + 2, w - 12, 1, PAL.woodDeep);
  artRect(ctx, x + 6, y + depth + 5, w - 12, 1, PAL.woodDeep);
  artRect(ctx, x + 2, y + depth + 7, w - 4, 1, PAL.wood);
  // desktop with wood back band
  artRect(ctx, x, y, w, depth, tableTop);
  artRect(ctx, x, y, w, 4, PAL.wood);
  artRect(ctx, x + 1, y, w - 2, 1, PAL.woodLight);
  artRect(ctx, x, y + 4, 2, depth - 4, PAL.wood);
  artRect(ctx, x + w - 2, y + 4, 2, depth - 4, PAL.wood);
  artRect(ctx, x + 2, y + 5, w - 4, 1, PAL.deskTopLight);
  artRect(ctx, x + 2, y + depth - 2, w - 4, 1, PAL.deskTopAlt);
  // faint grain
  artRect(ctx, x + 10, y + 9, 12, 1, PAL.deskTopAlt);
  artRect(ctx, x + w - 30, y + 15, 16, 1, PAL.deskTopAlt);
  artRect(ctx, x + 22, y + 19, 10, 1, PAL.deskTopAlt);
  // ink outline around the whole slab
  artOutline(ctx, x, y, w, depth + 9, PAL.outline);
}

/** Backrest of an office chair (drawn behind a seated character). */
function artDrawChairBack(ctx, x, y, color, opts) {
  const o = opts || {};
  const c = color || PAL.chair;
  const light = o.light || artShade(c, 0.24);
  const dark = o.dark || artShade(c, -0.3);
  const cw = Math.max(14, Math.round(o.w == null ? 20 : o.w));
  const ch = Math.max(10, Math.round(o.h == null ? 16 : o.h));
  const armY = y + Math.round(ch * 0.55);
  const armH = Math.max(4, ch - Math.round(ch * 0.3));
  artSteppedBox(ctx, x, y, cw, ch, c, PAL.outline, 1);
  artRect(ctx, x + 2, y + 1, cw - 4, 1, light);
  artRect(ctx, x + 2, y + 3, 1, ch - 5, dark);
  artRect(ctx, x + cw - 3, y + 3, 1, ch - 5, dark);
  artRect(ctx, x + Math.floor(cw / 2) - 1, y + 1, 2, ch - 4, dark);
  // armrests
  artRect(ctx, x - 2, armY, 2, armH, dark);
  artRect(ctx, x + cw, armY, 2, armH, dark);
  artRect(ctx, x - 2, armY, 2, 1, light);
  artRect(ctx, x + cw, armY, 2, 1, light);
}

/** Complete empty chair standing behind a desk (no person). */
function artDrawEmptyChair(ctx, cx, deskTop, color, opts) {
  const o = opts || {};
  const c = color || PAL.chair;
  const light = o.light || artShade(c, 0.24);
  const dark = o.dark || artShade(c, -0.3);
  const cw = Math.max(14, Math.round(o.w == null ? 20 : o.w));
  const ch = Math.max(10, Math.round(o.h == null ? 14 : o.h));
  const seatW = cw - 4;
  const seatH = Math.max(6, Math.round(ch * 0.55));
  const seatY = deskTop - seatH - 2;
  artRect(ctx, cx - Math.floor(seatW / 2), seatY, seatW, seatH, c);
  artRect(ctx, cx - Math.floor(seatW / 2), seatY, seatW, 1, light);
  artRect(ctx, cx - Math.floor(seatW / 2), seatY + seatH - 1, seatW, 1, dark);
  artRect(ctx, cx - Math.floor(seatW / 2) - 1, seatY, 2, seatH + 2, dark);
  artRect(ctx, cx + Math.ceil(seatW / 2) - 1, seatY, 2, seatH + 2, dark);
  artDrawChairBack(ctx, cx - Math.floor(cw / 2), deskTop - ch - seatH - 4, c, opts);
}

/** Computer monitor; running = lit screen with scrolling code + glow. */
function artDrawMonitor(ctx, x, y, width, height, opts) {
  const o = opts || {};
  const running = o.running === true;
  const night = o.night === true;
  const t = o.t || 0;
  const reduced = o.reducedMotion === true;
  const seed = o.seed || 7;
  const w = Math.round(width);
  const h = Math.round(height);
  const cx = x + Math.round(w / 2);
  // stand + foot
  artRect(ctx, cx - 3, y + h, 6, 2, PAL.bezelDeep);
  artRect(ctx, cx - 8, y + h + 2, 16, 2, PAL.bezel);
  artRect(ctx, cx - 8, y + h + 2, 16, 1, PAL.metalDark);
  // bezel
  artSteppedBox(ctx, x, y, w, h, PAL.bezel, PAL.outline, 1);
  artRect(ctx, x + 2, y + 1, w - 4, 1, PAL.bezelLight);
  const ix = x + 3;
  const iy = y + 3;
  const iw = w - 6;
  const ih = h - 6;
  if (running) {
    artRect(ctx, ix, iy, iw, ih, PAL.screenBg);
    const rows = 4;
    const lineH = 3;
    const rng = artRng(seed * 7 + 13);
    const lines = [];
    for (let row = 0; row < rows; row += 1) {
      const segments = [];
      let cursor = 1 + Math.floor(rng() * 3);
      const count = 2 + Math.floor(rng() * 2);
      for (let seg = 0; seg < count; seg += 1) {
        const segW = 2 + Math.floor(rng() * 4);
        const palette = [
          PAL.screenGlow,
          PAL.screenCodeSoft,
          PAL.screenCodeWarm,
          PAL.screenCodeCool,
        ];
        segments.push({ at: cursor, w: segW, color: palette[Math.floor(rng() * palette.length)] });
        cursor += segW + 1 + Math.floor(rng() * 2);
      }
      lines.push(segments);
    }
    const scroll = reduced ? 0 : Math.floor(t / 320) % rows;
    for (let row = 0; row < rows; row += 1) {
      const lineY = iy + 1 + row * lineH;
      if (lineY + 1 > iy + ih) break;
      const segments = lines[(row + scroll) % rows] || [];
      for (let seg = 0; seg < segments.length; seg += 1) {
        const segment = segments[seg];
        if (segment.at >= iw) continue;
        artRect(ctx, ix + segment.at, lineY, Math.min(segment.w, iw - segment.at), 1, segment.color);
      }
      // gutter line number
      artRect(ctx, ix + 1, lineY, 1, 1, PAL.screenCodeCool);
    }
    // taskbar + window header strips
    artRect(ctx, ix, iy, iw, 1, PAL.screenCodeSoft);
    artRect(ctx, ix, iy + ih - 2, iw, 2, PAL.bezelDeep);
    artRect(ctx, ix + 1, iy + ih - 1, 3, 1, PAL.screenGlow);
    artRect(ctx, ix + 5, iy + ih - 1, 3, 1, PAL.screenCodeWarm);
    // soft screen bloom
    artRect(ctx, ix, iy, iw, ih, night ? 'rgba(98,217,198,0.10)' : 'rgba(98,217,198,0.06)');
  } else {
    artRect(ctx, ix, iy, iw, ih, PAL.screenIdle);
    artRect(ctx, ix + 2, iy + 2, iw - 8, 1, 'rgba(140,170,190,0.14)');
    artRect(ctx, ix + 4, iy + 4, iw - 12, 1, 'rgba(140,170,190,0.10)');
    artRect(ctx, ix, iy + ih - 1, iw, 1, PAL.bezelDeep);
    artRect(ctx, ix + iw - 3, iy + ih - 1, 2, 1, PAL.ledRed);
  }
  // status LED on the bezel
  artRect(ctx, x + w - 5, y + h - 2, 2, 2, running ? PAL.ledGreen : PAL.ledAmber);
  if (running && !reduced && Math.floor(t / 500) % 2 === 0) {
    artRect(ctx, ix + iw - 3, iy + ih - 5, 2, 2, PAL.white);
  }
}

/** Low-profile keyboard with pixel key rows. */
function artDrawKeyboard(ctx, x, y, width, opts) {
  const o = opts || {};
  const w = Math.round(width);
  artSteppedBox(ctx, x, y, w, 7, PAL.inkSoft, PAL.outline, 1);
  artRect(ctx, x + 1, y + 1, w - 2, 1, PAL.metalDark);
  const keys = Math.floor((w - 4) / 4);
  for (let index = 0; index < keys; index += 1) {
    artRect(ctx, x + 2 + index * 4, y + 3, 2, 1, PAL.metal);
    if (index % 2 === 0) artRect(ctx, x + 2 + index * 4, y + 5, 2, 1, PAL.metal);
  }
  artRect(ctx, x + Math.floor(w / 2) - 4, y + 5, 8, 1, o.light ? PAL.metal : PAL.metalDark);
}

/** Mug with optional steam wisps and an accent band. opts.scale sizes it. */
function artDrawMug(ctx, x, y, opts) {
  const o = opts || {};
  const t = o.t || 0;
  const band = o.accent || PAL.ledRed;
  const s = Math.max(0.8, Math.min(2, o.scale == null ? 1 : o.scale));
  const r = (value) => Math.max(1, Math.round(value * s));
  const w = r(6);
  const h = r(6);
  artSteppedBox(ctx, x, y, w, h, PAL.ceramic, PAL.outline, 0);
  artRect(ctx, x, y + r(1), w, r(2), band);
  artRect(ctx, x + r(1), y, r(3), 1, PAL.white);
  artRect(ctx, x + w, y + r(1), r(2), r(2), PAL.outline);
  artRect(ctx, x + w, y + r(2), 1, 1, PAL.ceramic);
  artRect(ctx, x + r(1), y + h - r(1), r(4), 1, PAL.woodDeep);
  if (o.steam !== false && !o.reducedMotion) {
    artSteam(ctx, x + r(2), y - 1, t, 'rgba(226,234,240,0.6)', 0.55);
  }
}

/** Scattered paperwork with a sticky note. opts.scale sizes it. */
function artDrawPapers(ctx, x, y, opts) {
  const o = opts || {};
  const s = Math.max(0.8, Math.min(2, o.scale == null ? 1 : o.scale));
  const r = (value) => Math.max(1, Math.round(value * s));
  const w = r(14);
  const h = r(9);
  artRect(ctx, x + r(2), y + r(2), w, h, PAL.paperShade);
  artRect(ctx, x, y, w, h, PAL.white);
  artOutline(ctx, x, y, w, h, PAL.metalDark);
  artRect(ctx, x + r(2), y + r(2), r(8), 1, PAL.metalDark);
  artRect(ctx, x + r(2), y + r(4), r(10), 1, PAL.paperShade);
  artRect(ctx, x + r(2), y + r(6), r(6), 1, PAL.paperShade);
  const sticky = o.sticky === false ? null : (o.accent || PAL.goldLight);
  if (sticky) {
    artRect(ctx, x + r(10), y - r(3), r(6), r(6), sticky);
    artRect(ctx, x + r(11), y - r(2), r(4), 1, 'rgba(60,60,50,0.35)');
    artRect(ctx, x + r(11), y, r(3), 1, 'rgba(60,60,50,0.28)');
  }
}

/** Pen cup with a few coloured pens / pencils. */
function artDrawPenCup(ctx, x, y, opts) {
  const o = opts || {};
  const s = Math.max(0.8, Math.min(2, o.scale == null ? 1 : o.scale));
  const r = (value) => Math.max(1, Math.round(value * s));
  artRect(ctx, x + r(1), y, r(2), r(5), PAL.ledRed);
  artRect(ctx, x + r(4), y + r(1), r(2), r(4), PAL.fabric);
  artRect(ctx, x + r(7), y - r(1), 1, r(5), PAL.ledAmber);
  artSteppedBox(ctx, x, y + r(4), r(9), r(6), PAL.metal, PAL.outline, 1);
  artRect(ctx, x + r(1), y + r(5), r(7), r(1), PAL.metalDark);
  artRect(ctx, x + r(2), y + r(7), r(5), 1, PAL.inkSoft);
}

/** Tiny desk nameplate; gold variant for the boss. */
function artDrawNameplate(ctx, x, y, width, opts) {
  const o = opts || {};
  const w = Math.round(width);
  const accent = o.accent || PAL.screenGlow;
  const gold = o.gold === true;
  artRect(ctx, x + 1, y + 6, w - 2, 2, 'rgba(16,20,30,0.25)');
  artSteppedBox(ctx, x, y, w, 6, gold ? PAL.gold : PAL.woodDark, PAL.outline, 1);
  artRect(ctx, x + 2, y + 1, w - 4, 1, gold ? PAL.goldLight : PAL.wood);
  artRect(ctx, x + 3, y + 3, w - 6, 1, gold ? PAL.goldDark : accent);
  if (gold) {
    artPix(ctx, x + 2, y + 1, PAL.goldLight);
    artPix(ctx, x + w - 3, y + 1, PAL.goldLight);
  }
}

/** Angle-poise desk lamp with a warm shade. opts.scale sizes it for bigger desks. */
function artDrawDeskLamp(ctx, x, y, opts) {
  const o = opts || {};
  const night = o.night === true;
  const s = Math.max(0.8, Math.min(2.2, o.scale == null ? 1 : o.scale));
  const r = (value) => Math.round(value * s);
  // base + arm
  artRect(ctx, x + r(1), y + r(17), r(12), r(3), PAL.metalDark);
  artRect(ctx, x + r(2), y + r(17), r(10), r(1), PAL.metal);
  artRect(ctx, x + r(7), y + r(8), r(2), r(9), PAL.metalDark);
  artRect(ctx, x + r(7), y + r(8), r(1), r(9), PAL.metal);
  // shade (trapezoid via stacked rows)
  artRect(ctx, x + r(3), y + r(4), r(12), r(2), PAL.metalDark);
  artRect(ctx, x + r(2), y + r(6), r(14), r(3), PAL.lampLight);
  artRect(ctx, x + r(1), y + r(9), r(16), r(2), PAL.metalDark);
  artRect(ctx, x + r(2), y + r(6), r(14), r(1), PAL.goldLight);
  artRect(ctx, x + r(3), y + r(9), r(12), r(1), PAL.lampLight);
  artOutline(ctx, x + r(1), y + r(5), r(16), r(7), PAL.outline);
  if (night) {
    artRect(ctx, x + r(2), y + r(11), r(14), r(1), 'rgba(255,217,122,0.55)');
  }
}

/** Potted plant - floor / desk / cactus variants, gently swaying. opts.scale sizes it. */
function artDrawPlant(ctx, cx, baseY, opts) {
  const o = opts || {};
  const t = o.t || 0;
  const scale = Math.max(0.7, Math.min(2.8, o.scale == null ? 1 : o.scale));
  const r = (value) => Math.max(1, Math.round(value * scale));
  const rng = artRng((o.seed || 3) * 31 + 7);
  const variant = o.variant || 'floor';
  const sway = o.reducedMotion ? 0 : Math.round(Math.sin(t / 900 + (o.seed || 3)) * 1);
  const sway2 = Math.round(sway * 1.4);
  artShadow(ctx, cx - r(8), baseY - r(2), r(16), r(4), 0.2);
  if (variant === 'desk' || variant === 'small') {
    const small = variant === 'small';
    const potW = r(small ? 7 : 9);
    const potH = r(6);
    artRect(ctx, cx - Math.floor(potW / 2), baseY - potH, potW, potH, PAL.pot);
    artRect(ctx, cx - Math.floor(potW / 2) - 1, baseY - potH - r(1), potW + 2, r(2), PAL.potLight);
    artRect(ctx, cx - Math.floor(potW / 2), baseY - 1, potW, 1, PAL.terracottaDark);
    if (variant === 'desk' && (o.seed || 0) % 3 === 0) {
      // cactus
      artRect(ctx, cx - 1, baseY - potH - r(6), r(3), r(6), PAL.plant);
      artRect(ctx, cx - 1, baseY - potH - r(6), 1, r(6), PAL.plantDark);
      artRect(ctx, cx + r(2), baseY - potH - r(4), r(2), 1, PAL.plant);
      artRect(ctx, cx + r(3), baseY - potH - r(6), 1, r(2), PAL.plant);
      artRect(ctx, cx - r(3), baseY - potH - r(3), r(2), 1, PAL.plant);
      artRect(ctx, cx - r(3), baseY - potH - r(5), 1, r(2), PAL.plant);
      artPix(ctx, cx, baseY - potH - r(6), PAL.plantLight);
    } else {
      const leafH = r(small ? 6 : 9);
      artRect(ctx, cx + sway, baseY - potH - leafH, r(2), leafH, PAL.plantDark);
      artRect(ctx, cx - r(4) + sway, baseY - potH - leafH + r(3), r(4), r(3), PAL.plant);
      artRect(ctx, cx + r(2) + sway, baseY - potH - leafH + r(2), r(4), r(4), PAL.plant);
      artRect(ctx, cx - r(2) + sway, baseY - potH - leafH, r(5), r(2), PAL.plantLight);
      artPix(ctx, cx - r(3) + sway, baseY - potH - leafH + r(3), PAL.plantLight);
    }
    return;
  }
  // floor plant: terracotta pot, trunk, layered canopy
  const potW = r(14);
  const potH = r(12);
  const trunkH = r(14);
  const canopyBase = baseY - r(34);
  const canopyH = r(15);
  artRect(ctx, cx - Math.floor(potW / 2), baseY - potH, potW, potH, PAL.pot);
  artRect(ctx, cx - Math.floor(potW / 2) - 1, baseY - potH - r(1), potW + 2, r(3), PAL.potLight);
  artRect(ctx, cx - Math.floor(potW / 2), baseY - r(2), potW, r(2), PAL.terracottaDark);
  artRect(ctx, cx - Math.floor(potW / 2) + r(1), baseY - potH, r(2), potH - r(2), artShade(PAL.pot, 0.14));
  artRect(ctx, cx - r(1) + sway2, baseY - potH - trunkH, r(3), trunkH, PAL.woodDeep);
  artRect(ctx, cx - r(8) + sway, canopyBase + r(4), r(17), r(7), PAL.plantDark);
  artRect(ctx, cx - r(10) + sway, canopyBase + r(7), r(21), r(5), PAL.plant);
  artRect(ctx, cx - r(5) + sway, canopyBase, r(11), r(8), PAL.plant);
  artRect(ctx, cx - r(7) + sway, canopyBase + r(2), r(15), r(4), PAL.plantLight);
  for (let leaf = 0; leaf < 4; leaf += 1) {
    const lx = cx - r(8) + Math.floor(rng() * r(16)) + sway;
    const ly = canopyBase + r(2) + Math.floor(rng() * r(8));
    artPix(ctx, lx, ly, leaf % 2 === 0 ? PAL.plantLight : PAL.plantDark, r(2));
  }
  artRect(ctx, cx - r(1) + sway, canopyBase + r(5), r(3), r(3), PAL.plantDark);
  if (canopyH > 0) artRect(ctx, cx + sway - r(4), canopyBase + r(1), r(2), r(2), PAL.plantDark);
}

/** Wall-mounted bookshelf with deterministic, colourful spines. */
function artDrawBookshelf(ctx, x, y, width, height, opts) {
  const o = opts || {};
  const w = Math.round(width);
  const h = Math.round(height);
  const rng = artRng((o.seed || 5) * 131 + 17);
  artShadow(ctx, x + 2, y + h - 2, w - 4, 4, 0.18);
  artRect(ctx, x, y, w, h, PAL.woodDark);
  artRect(ctx, x + 1, y + 1, w - 2, h - 2, PAL.woodDeep);
  artOutline(ctx, x, y, w, h, PAL.outline);
  artRect(ctx, x + 1, y + 1, w - 2, 1, PAL.wood);
  const shelves = 3;
  const usable = h - 8;
  for (let shelf = 0; shelf < shelves; shelf += 1) {
    const shelfY = y + 5 + Math.floor(((shelf + 1) * usable) / shelves) - 2;
    // books on this shelf
    let cursor = x + 4;
    const limit = x + w - 4;
    while (cursor < limit - 1) {
      const bookW = 2 + Math.floor(rng() * 2);
      const bookH = 6 + Math.floor(rng() * 9);
      const color = artPick(SHIRT_COLORS, Math.floor(rng() * 97) + shelf * 13 + 3);
      artRect(ctx, cursor, shelfY - bookH, bookW, bookH, color);
      artRect(ctx, cursor, shelfY - bookH, 1, bookH, artShade(color, 0.28));
      if (rng() > 0.82) artRect(ctx, cursor, shelfY - bookH + 2, bookW, 1, PAL.goldLight);
      cursor += bookW + (rng() > 0.75 ? 2 : 1);
    }
    // plank
    artRect(ctx, x + 3, shelfY, w - 6, 2, PAL.wood);
    artRect(ctx, x + 3, shelfY + 2, w - 6, 1, PAL.woodDeep);
  }
  // little plant on top
  artRect(ctx, x + 3, y - 4, 5, 4, PAL.pot);
  artRect(ctx, x + 4, y - 8, 3, 4, PAL.plant);
  artRect(ctx, x + 2, y - 7, 3, 3, PAL.plantLight);
  artRect(ctx, x + 5, y - 6, 3, 2, PAL.plantDark);
}

/** Whiteboard: progress bar, task ticks, sticky notes, marker tray. */
function artDrawWhiteboard(ctx, x, y, width, height, opts) {
  const o = opts || {};
  const w = Math.round(width);
  const h = Math.round(height);
  const done = Math.max(0, Math.round(Number(o.done) || 0));
  const total = Math.max(0, Math.round(Number(o.total) || 0));
  const accent = o.accent || PAL.screenGlow;
  const seed = o.seed || 9;
  artShadow(ctx, x + 2, y + h - 1, w - 4, 3, 0.16);
  artRect(ctx, x, y, w, h, PAL.metal);
  artRect(ctx, x + 2, y + 2, w - 4, h - 4, PAL.white);
  artOutline(ctx, x, y, w, h, PAL.outline);
  artRect(ctx, x + 2, y + 2, w - 4, 1, PAL.wallTrim);
  // header + fake memo lines
  artRect(ctx, x + 6, y + 5, 26, 4, accent);
  artRect(ctx, x + 6, y + 5, 26, 1, artShade(accent, 0.3));
  artRect(ctx, x + 36, y + 5, 30, 2, PAL.metalDark);
  artRect(ctx, x + 36, y + 9, 22, 1, PAL.metal);
  // progress bar
  const barX = x + 6;
  const barY = y + 13;
  const barW = Math.max(20, Math.floor(w * 0.44));
  artRect(ctx, barX, barY, barW, 7, PAL.paperShade);
  artOutline(ctx, barX, barY, barW, 7, PAL.metalDark);
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  const fillW = Math.round((barW - 2) * ratio);
  if (fillW > 0) {
    artRect(ctx, barX + 1, barY + 1, fillW, 5, PAL.ledGreen);
    artRect(ctx, barX + 1, barY + 1, fillW, 1, artShade(PAL.ledGreen, 0.32));
    for (let notch = 6; notch < fillW; notch += 7) {
      artRect(ctx, barX + 1 + notch, barY + 1, 1, 5, PAL.plantDark);
    }
  }
  // checked tasks
  const tickCount = 4;
  for (let index = 0; index < tickCount; index += 1) {
    const tickY = barY + 11 + index * 7;
    if (tickY + 4 > y + h - 5) break;
    artOutline(ctx, barX, tickY, 4, 4, PAL.metalDark);
    const checked = total > 0 ? index < Math.max(0, Math.min(tickCount, Math.round(ratio * tickCount))) : false;
    if (checked) {
      artRect(ctx, barX + 1, tickY + 1, 2, 2, PAL.ledGreen);
    }
    artRect(ctx, barX + 7, tickY + 1, 18 + ((index * 11) % 14), 1, PAL.metal);
    if (index % 2 === 0) artRect(ctx, barX + 7, tickY + 3, 12 + ((index * 7) % 10), 1, PAL.paperShade);
  }
  // sticky notes
  const noteColors = [PAL.goldLight, '#efa8a0', '#a8d8e8'];
  const rng = artRng(seed * 53 + 11);
  for (let index = 0; index < 3; index += 1) {
    const noteW = 14 + Math.floor(rng() * 5);
    const noteH = 12 + Math.floor(rng() * 4);
    const nx = x + w - 20 - noteW - index * 2 + Math.floor(rng() * 4) - 4;
    const ny = y + 5 + index * (noteH - 1);
    if (ny + noteH > y + h - 6) break;
    if (nx < barX + barW + 6) continue;
    artRect(ctx, nx + 1, ny + 2, noteW, noteH, 'rgba(16,20,30,0.16)');
    artRect(ctx, nx, ny, noteW, noteH, noteColors[index % noteColors.length]);
    artRect(ctx, nx, ny, noteW, 1, artShade(noteColors[index % noteColors.length], 0.32));
    artRect(ctx, nx + 2, ny + 3, noteW - 5, 1, 'rgba(50,45,40,0.32)');
    artRect(ctx, nx + 2, ny + 5, noteW - 8, 1, 'rgba(50,45,40,0.26)');
    artPix(ctx, nx + Math.floor(noteW / 2), ny, PAL.ledRed);
  }
  // marker tray
  artRect(ctx, x + 4, y + h - 4, w - 8, 2, PAL.metalDark);
  artRect(ctx, x + 8, y + h - 5, 2, 3, PAL.ledRed);
  artRect(ctx, x + 13, y + h - 5, 2, 3, PAL.fabric);
  artRect(ctx, x + 18, y + h - 5, 2, 3, PAL.ledGreen);
  artRect(ctx, x + w - 16, y + h - 5, 6, 3, PAL.metal);
}

/** Real-time wall clock with hour / minute / ticking second hands. */
function artDrawWallClock(ctx, x, y, size, opts) {
  const o = opts || {};
  const s = Math.round(size);
  const cx = x + Math.floor(s / 2);
  const cy = y + Math.floor(s / 2);
  const r = Math.floor(s / 2) - 1;
  artShadow(ctx, x + 2, y + s - 2, s - 4, 3, 0.18);
  artPixelCircle(ctx, cx, cy, r, PAL.inkSoft);
  artPixelCircle(ctx, cx, cy, Math.max(1, r - 1), PAL.white);
  artPixelCircle(ctx, cx, cy, Math.max(1, r - 2), PAL.paper);
  // tick marks
  artRect(ctx, cx, cy - r + 2, 1, 2, PAL.metalDark);
  artRect(ctx, cx, cy + r - 3, 1, 2, PAL.metalDark);
  artRect(ctx, cx - r + 2, cy, 2, 1, PAL.metalDark);
  artRect(ctx, cx + r - 3, cy, 2, 1, PAL.metalDark);
  const now = new Date();
  const minutes = now.getMinutes();
  const hours = now.getHours() % 12;
  const seconds = now.getSeconds();
  const secondAngle = (seconds / 60) * Math.PI * 2 - Math.PI / 2;
  const minuteAngle = (minutes / 60) * Math.PI * 2 - Math.PI / 2;
  const hourAngle = ((hours + minutes / 60) / 12) * Math.PI * 2 - Math.PI / 2;
  artLine(ctx, cx, cy,
    cx + Math.cos(secondAngle) * (r - 2), cy + Math.sin(secondAngle) * (r - 2), PAL.ledRed);
  artLine(ctx, cx, cy,
    cx + Math.cos(minuteAngle) * (r - 3), cy + Math.sin(minuteAngle) * (r - 3), PAL.ink);
  artLine(ctx, cx, cy,
    cx + Math.cos(hourAngle) * (r - 6), cy + Math.sin(hourAngle) * (r - 6), PAL.ink);
  artRect(ctx, cx - 1, cy - 1, 2, 2, PAL.ink);
  if (o.night) artPixelCircle(ctx, cx, cy, r, 'rgba(255,217,122,0.05)');
}

/** Window with day/night view, drifting clouds, stars and a distant skyline. */
function artDrawWindow(ctx, x, y, width, height, opts) {
  const o = opts || {};
  const night = o.night === true;
  const t = o.t || 0;
  const reduced = o.reducedMotion === true;
  const seed = o.seed || 11;
  const w = Math.round(width);
  const h = Math.round(height);
  const gx = x + 5;
  const gy = y + 5;
  const gw = w - 10;
  const gh = h - 10;
  // frame
  artRect(ctx, x, y, w, h, PAL.wallTrim);
  artRect(ctx, x + 1, y + 1, w - 2, 1, PAL.white);
  artOutline(ctx, x, y, w, h, PAL.outline);
  // sky
  if (night) {
    artRect(ctx, gx, gy, gw, gh, PAL.skyNight);
    artRect(ctx, gx, gy + Math.floor(gh * 0.55), gw, gh - Math.floor(gh * 0.55), PAL.nightMid);
    const rng = artRng(seed * 977 + 13);
    for (let index = 0; index < 16; index += 1) {
      const sx = gx + 2 + Math.floor(rng() * Math.max(1, gw - 5));
      const sy = gy + 2 + Math.floor(rng() * Math.max(1, gh - 14));
      const twinkle = reduced ? 0 : (Math.floor(t / 640) + index) % 5;
      artPix(ctx, sx, sy, twinkle === 0 ? PAL.star : PAL.starDim);
    }
    const mx = gx + gw - 24;
    const my = gy + 6;
    artRect(ctx, mx + 2, my, 8, 1, PAL.moon);
    artRect(ctx, mx, my + 1, 12, 8, PAL.moon);
    artRect(ctx, mx + 2, my + 9, 8, 1, PAL.moon);
    artRect(ctx, mx + 3, my + 2, 2, 2, PAL.wallTrim);
    artRect(ctx, mx + 7, my + 5, 2, 1, PAL.wallTrim);
  } else {
    artRect(ctx, gx, gy, gw, gh, PAL.skyDay);
    artRect(ctx, gx, gy + Math.floor(gh * 0.6), gw, gh - Math.floor(gh * 0.6), PAL.skyDayLow);
    // sun
    artPixelCircle(ctx, gx + gw - 18, gy + 12, 5, PAL.sun);
    artPixelCircle(ctx, gx + gw - 18, gy + 12, 3, '#fff3c9');
    // drifting pixel clouds
    for (let index = 0; index < 2; index += 1) {
      const speed = reduced ? 0 : t / 160;
      const drift = ((speed + index * 90 + seed * 7) % (gw + 36)) - 18;
      const cx = gx + Math.round(drift);
      const cy = gy + 8 + index * 13;
      artRect(ctx, cx, cy + 2, 14, 3, night ? PAL.nightHigh : PAL.cloudShade);
      artRect(ctx, cx + 3, cy, 9, 3, night ? PAL.nightHigh : PAL.cloud);
      artRect(ctx, cx + 8, cy + 1, 8, 3, night ? PAL.nightHigh : PAL.cloudShade);
      artRect(ctx, cx + 2, cy - 1, 5, 2, night ? PAL.nightHigh : PAL.cloud);
    }
  }
  // distant rooftops at the bottom of the glass
  const skyline = artRng(seed * 29 + 5);
  const skylineY = gy + gh - 1;
  let sx = gx;
  while (sx < gx + gw - 2) {
    const bw = 6 + Math.floor(skyline() * 12);
    const bh = 3 + Math.floor(skyline() * Math.min(12, Math.max(3, gh - 12)));
    artRect(ctx, sx, skylineY - bh, Math.min(bw, gx + gw - sx), bh,
      night ? PAL.rooftopNight : PAL.rooftopDay);
    if (night) {
      for (let wy = 2; wy < bh - 1; wy += 3) {
        artRect(ctx, sx + 1, skylineY - bh + wy, 1, 1, skyline() > 0.55 ? PAL.windowLit : PAL.nightHigh);
      }
    } else {
      for (let wy = 2; wy < bh - 1; wy += 3) {
        artRect(ctx, sx + 1, skylineY - bh + wy, 1, 1, PAL.metal);
      }
    }
    sx += Math.min(bw, gx + gw - sx) + 1;
  }
  // blinds (boss window)
  if (o.blinds) {
    const blindH = Math.floor(gh * (night ? 0.32 : 0.42));
    for (let row = 0; row < blindH; row += 4) {
      artRect(ctx, gx, gy + row, gw, 2, PAL.wallTrim);
      artRect(ctx, gx, gy + row, gw, 1, PAL.white);
    }
    artRect(ctx, gx + gw - 3, gy + blindH, 2, 4, PAL.woodDark);
  }
  // mullions
  const midX = gx + Math.floor(gw / 2);
  const midY = gy + Math.floor(gh / 2);
  artRect(ctx, midX, gy, 2, gh, PAL.wallTrim);
  artRect(ctx, midX + 1, gy, 1, gh, PAL.white);
  artRect(ctx, gx, midY, gw, 2, PAL.wallTrim);
  artRect(ctx, gx, midY, gw, 1, PAL.white);
  // glass shine
  artLine(ctx, gx + 3, gy + gh - 4, gx + Math.floor(gw / 3), gy + 3, 'rgba(245,252,255,0.35)');
  artLine(ctx, gx + 5, gy + gh - 4, gx + Math.floor(gw / 3) + 2, gy + 3, 'rgba(245,252,255,0.22)');
  // inner trim + sill
  artOutline(ctx, gx - 1, gy - 1, gw + 2, gh + 2, night ? PAL.nightHigh : PAL.white);
  artRect(ctx, x - 2, y + h, w + 4, 3, PAL.wood);
  artRect(ctx, x - 2, y + h, w + 4, 1, PAL.woodLight);
  artRect(ctx, x - 2, y + h + 3, w + 4, 1, PAL.woodDeep);
}

/** Framed wall picture: poster / chart / diploma variants. */
function artDrawPoster(ctx, x, y, width, height, opts) {
  const o = opts || {};
  const w = Math.round(width);
  const h = Math.round(height);
  const seed = o.seed || 3;
  const variant = o.variant == null ? seed % 3 : o.variant % 4;
  artShadow(ctx, x + 2, y + h - 1, w - 4, 3, 0.18);
  artRect(ctx, x, y, w, h, variant === 3 ? PAL.gold : PAL.woodDark);
  artRect(ctx, x + 2, y + 2, w - 4, h - 4, PAL.paper);
  artOutline(ctx, x, y, w, h, PAL.outline);
  artRect(ctx, x + 2, y + 2, w - 4, 1, PAL.white);
  const ix = x + 4;
  const iy = y + 4;
  const iw = w - 8;
  const ih = h - 8;
  if (variant === 0) {
    // mountain + sun
    artRect(ctx, ix, iy + ih - 2, iw, 2, PAL.plant);
    for (let step = 0; step < 3; step += 1) {
      const peakH = 4 + step * 2;
      const peakX = ix + 2 + step * Math.floor(iw / 3);
      for (let row = 0; row < peakH; row += 1) {
        const half = Math.floor((row * (Math.floor(iw / 3) - 4)) / peakH);
        artRect(ctx, peakX + Math.floor(iw / 6) - half, iy + ih - 3 - row, half * 2 + 1, 1,
          step === 1 ? PAL.plantDark : PAL.plantLight);
      }
    }
    artPixelCircle(ctx, ix + iw - 5, iy + 4, 3, PAL.ledAmber);
  } else if (variant === 1) {
    // bar chart
    artRect(ctx, ix, iy + 2, iw, 1, PAL.metalDark);
    const barColors = [PAL.fabric, PAL.plant, PAL.woodDark, PAL.fabricDark];
    let barX = ix + 1;
    const barW = 3;
    while (barX + barW < ix + iw - 1) {
      const barH = 3 + ((barX * 7 + seed * 13) % Math.max(4, ih - 5));
      artRect(ctx, barX, iy + ih - barH - 1, barW, barH, barColors[Math.floor(barX / 5) % barColors.length]);
      barX += barW + 2;
    }
  } else if (variant === 2) {
    // abstract pixel art
    artRect(ctx, ix, iy, iw, ih, PAL.wallAlt);
    artDiamond(ctx, ix + Math.floor(iw / 2), iy + Math.floor(ih / 2), 4, PAL.ledRed);
    artRect(ctx, ix + 1, iy + 1, 3, 3, PAL.ledAmber);
    artRect(ctx, ix + iw - 4, iy + ih - 4, 3, 3, PAL.fabricDark);
  } else {
    // diploma / certificate
    artRect(ctx, ix + 1, iy + 1, iw - 2, 1, PAL.metalDark);
    artRect(ctx, ix + 2, iy + 4, iw - 8, 1, PAL.paperShade);
    artRect(ctx, ix + 2, iy + 7, iw - 6, 1, PAL.paperShade);
    artRect(ctx, ix + 2, iy + 10, iw - 10, 1, PAL.paperShade);
    artPixelCircle(ctx, ix + iw - 6, iy + ih - 5, 3, PAL.ledRed);
    artRect(ctx, ix + iw - 8, iy + ih - 3, 2, 3, PAL.ledRed);
  }
}

/** Wall-mounted air-conditioner vent. */
function artDrawAirVent(ctx, x, y, width, height, opts) {
  const o = opts || {};
  const w = Math.round(width);
  const h = Math.round(height);
  artRect(ctx, x, y, w, h, PAL.metal);
  artRect(ctx, x, y, w, 1, PAL.white);
  artOutline(ctx, x, y, w, h, PAL.metalDark);
  artOutline(ctx, x, y, w, h, PAL.outline);
  for (let row = 2; row < h - 2; row += 2) {
    artRect(ctx, x + 3, y + row, w - 6, 1, PAL.metalDark);
  }
  artPix(ctx, x + 2, y + 2, PAL.outline);
  artPix(ctx, x + w - 3, y + 2, PAL.outline);
  if (o.night) artRect(ctx, x + 2, y + h - 2, w - 4, 1, PAL.ledGreen);
}

/** Flush ceiling light fixture (drawn on the wall-top ceiling band). */
function artDrawCeilingFixture(ctx, x, y, width, opts) {
  const o = opts || {};
  const w = Math.round(width);
  artRect(ctx, x, y, w, 6, PAL.metal);
  artRect(ctx, x, y, w, 1, PAL.wallTrim);
  artRect(ctx, x + 1, y + 5, w - 2, 1, PAL.metalDark);
  artRect(ctx, x + 3, y + 2, w - 6, 3, o.night ? PAL.goldLight : PAL.white);
  artRect(ctx, x + 3, y + 2, w - 6, 1, o.night ? PAL.lampLight : PAL.white);
  artOutline(ctx, x, y, w, 6, PAL.metalDark);
}

/** Office carpet: accent border, inner field, subtle weave. */
function artDrawCarpet(ctx, x, y, width, height, accent, opts) {
  const o = opts || {};
  const w = Math.round(width);
  const h = Math.round(height);
  const colors = accent || ART_ACCENTS[0];
  const night = o.night === true;
  const main = night ? artShade(colors.main, -0.28) : colors.main;
  const dark = night ? artShade(colors.dark, -0.24) : colors.dark;
  const light = night ? artShade(colors.light, -0.18) : colors.light;
  artRect(ctx, x + 3, y + 4, w - 2, h - 2, 'rgba(16,20,30,0.16)');
  artSteppedBox(ctx, x, y, w, h, main, dark, 2);
  // border band
  artRect(ctx, x + 3, y + 3, w - 6, 1, dark);
  artRect(ctx, x + 3, y + h - 4, w - 6, 1, dark);
  artRect(ctx, x + 3, y + 3, 1, h - 6, dark);
  artRect(ctx, x + w - 4, y + 3, 1, h - 6, dark);
  artRect(ctx, x + 4, y + 4, w - 8, 1, light);
  // weave dots
  for (let row = y + 8; row < y + h - 6; row += 10) {
    for (let col = x + 8; col < x + w - 8; col += 10) {
      if (((col + row) / 10) % 2 === 0) artPix(ctx, col, row, dark);
    }
  }
  // corner accents
  const cw = 7;
  artRect(ctx, x + 6, y + 6, cw, 1, light);
  artRect(ctx, x + 6, y + 6, 1, cw, light);
  artRect(ctx, x + w - 7 - cw, y + 6, cw, 1, light);
  artRect(ctx, x + w - 7, y + 6, 1, cw, light);
  artRect(ctx, x + 6, y + h - 7, cw, 1, light);
  artRect(ctx, x + 6, y + h - 7 - cw, 1, cw, light);
  artRect(ctx, x + w - 7 - cw, y + h - 7, cw, 1, light);
  artRect(ctx, x + w - 7, y + h - 7 - cw, 1, cw, light);
}

/**
 * Glass partition. Vertical when height > width, horizontal otherwise.
 * opts = { night, gapFrom, gapTo, accent } - gapFrom/gapTo are offsets along the long
 * axis (px) that are left open as a doorway.
 */
function artDrawGlassWall(ctx, x, y, width, height, opts) {
  const o = opts || {};
  const night = o.night === true;
  const w = Math.round(width);
  const h = Math.round(height);
  const glass = night ? PAL.nightGlass : PAL.glass;
  const frame = night ? '#39485c' : PAL.metalDark;
  const frameLight = night ? '#5d7189' : PAL.metal;
  const shine = 'rgba(240,252,255,0.4)';
  const accent = o.accent || PAL.screenGlow;
  const vertical = h >= w;
  const gapFrom = Math.max(0, Math.round(o.gapFrom || 0));
  const gapTo = Math.max(0, Math.round(o.gapTo || 0));
  const hasGap = gapTo > gapFrom;
  if (vertical) {
    const gx = x + 2;
    const gw = w - 4;
    const segments = [];
    if (hasGap) {
      segments.push([0, gapFrom]);
      segments.push([gapTo, h]);
    } else {
      segments.push([0, h]);
    }
    for (let index = 0; index < segments.length; index += 1) {
      const from = segments[index][0];
      const to = segments[index][1];
      if (to - from <= 1) continue;
      artRect(ctx, gx, y + from, gw, to - from, glass);
    }
    artRect(ctx, x, y, 2, h, frame);
    artRect(ctx, x + w - 2, y, 2, h, frame);
    artRect(ctx, x, y, 1, h, frameLight);
    for (let py = 0; py < h; py += 52) {
      if (hasGap && py > gapFrom - 4 && py < gapTo) continue;
      artRect(ctx, x - 1, y + py, w + 2, 6, frame);
      artRect(ctx, x - 1, y + py, w + 2, 1, frameLight);
    }
    if (hasGap) {
      artRect(ctx, x - 2, y + gapFrom - 4, w + 4, 5, frame);
      artRect(ctx, x - 2, y + gapTo - 1, w + 4, 5, frame);
      artRect(ctx, x - 1, y + gapFrom - 4, w + 2, 1, frameLight);
      artRect(ctx, x - 1, y + gapTo - 1, w + 2, 1, frameLight);
      artRect(ctx, gx, y + gapTo - 2, gw, 2, PAL.woodDark);
      artRect(ctx, gx, y + gapFrom, gw, 2, PAL.woodDark);
    }
    // glass shine dashes
    for (let py = 6; py < h - 12; py += 44) {
      if (hasGap && py + 22 > gapFrom && py < gapTo) continue;
      artRect(ctx, gx, y + py, 1, 20, shine);
      artRect(ctx, gx + gw - 1, y + py + 6, 1, 12, 'rgba(240,252,255,0.24)');
    }
    // top / bottom cap rails
    artRect(ctx, x - 2, y - 1, w + 4, 3, frame);
    artRect(ctx, x - 2, y + h - 2, w + 4, 3, frame);
  } else {
    const gy = y + 2;
    const gh = h - 4;
    const segments = [];
    if (hasGap) {
      segments.push([0, gapFrom]);
      segments.push([gapTo, w]);
    } else {
      segments.push([0, w]);
    }
    for (let index = 0; index < segments.length; index += 1) {
      const from = segments[index][0];
      const to = segments[index][1];
      if (to - from <= 1) continue;
      artRect(ctx, x + from, gy, to - from, gh, glass);
    }
    artRect(ctx, x, y, w, 2, frame);
    artRect(ctx, x, y + h - 2, w, 2, frame);
    artRect(ctx, x, y, w, 1, frameLight);
    for (let px = 0; px < w; px += 52) {
      if (hasGap && px > gapFrom - 4 && px < gapTo) continue;
      artRect(ctx, x + px, y - 1, 6, h + 2, frame);
      artRect(ctx, x + px, y - 1, 1, h + 2, frameLight);
    }
    if (hasGap) {
      artRect(ctx, x + gapFrom - 4, y - 2, 5, h + 4, frame);
      artRect(ctx, x + gapTo - 1, y - 2, 5, h + 4, frame);
      artRect(ctx, x + gapFrom - 4, y - 1, 5, 1, frameLight);
      artRect(ctx, x + gapTo - 1, y - 1, 5, 1, frameLight);
      artRect(ctx, x + gapFrom, gy, gapTo - gapFrom, 2, accent);
      artRect(ctx, x + gapFrom, y + h - 2, gapTo - gapFrom, 2, accent);
      artRect(ctx, x + gapFrom, y + h - 2, gapTo - gapFrom, 1, PAL.woodDark);
    }
    for (let px = 8; px < w - 12; px += 44) {
      if (hasGap && px + 20 > gapFrom && px < gapTo) continue;
      artRect(ctx, x + px, gy, 20, 1, shine);
      artRect(ctx, x + px + 8, gy + gh - 1, 14, 1, 'rgba(240,252,255,0.24)');
    }
    artRect(ctx, x - 2, y - 1, w + 4, 2, frame);
  }
  artRect(ctx, x + 1, y + (vertical ? 2 : 1), vertical ? 1 : 6, vertical ? 6 : 1, frameLight);
}

/** Water cooler: bottle, cabinet, taps. */
function artDrawWaterCooler(ctx, x, y, opts) {
  const o = opts || {};
  const night = o.night === true;
  artShadow(ctx, x, y + 32, 14, 5, night ? 0.34 : 0.2);
  // bottle
  artRect(ctx, x + 2, y + 2, 10, 4, PAL.glassLine);
  artRect(ctx, x + 2, y + 6, 10, 12, 'rgba(168,216,232,0.9)');
  artRect(ctx, x + 3, y + 12, 8, 6, 'rgba(127,195,216,0.95)');
  artRect(ctx, x + 3, y + 2, 2, 14, 'rgba(240,252,255,0.7)');
  artOutline(ctx, x + 2, y + 2, 10, 16, PAL.metalDark);
  artRect(ctx, x + 5, y, 4, 2, PAL.metalDark);
  // cabinet
  artRect(ctx, x + 1, y + 18, 12, 18, PAL.white);
  artOutline(ctx, x + 1, y + 18, 12, 18, PAL.metalDark);
  artRect(ctx, x + 2, y + 19, 10, 1, PAL.paperShade);
  // taps
  artRect(ctx, x + 4, y + 21, 2, 2, PAL.ledRed);
  artRect(ctx, x + 8, y + 21, 2, 2, PAL.fabric);
  artRect(ctx, x + 3, y + 24, 8, 2, PAL.metal);
  artRect(ctx, x + 3, y + 26, 8, 1, PAL.metalDark);
  // cup shelf
  artRect(ctx, x + 3, y + 30, 8, 2, PAL.paperShade);
  if (night) artRect(ctx, x + 5, y + 21, 4, 1, PAL.lampLight);
}

/** Pottery / break-room counter (foreground object). */
function artDrawCounter(ctx, x, y, width, height, opts) {
  const o = opts || {};
  const w = Math.round(width);
  const h = Math.round(height);
  const night = o.night === true;
  artShadow(ctx, x + 2, y + h - 4, w - 4, 8, night ? 0.34 : 0.2);
  // top
  artRect(ctx, x, y, w, 10, PAL.wood);
  artRect(ctx, x, y, w, 2, PAL.woodLight);
  artRect(ctx, x + 1, y + 2, w - 2, 1, PAL.deskTopLight);
  artRect(ctx, x, y + 9, w, 1, PAL.woodDeep);
  // front panel
  artRect(ctx, x + 1, y + 10, w - 2, h - 10, PAL.woodDark);
  artRect(ctx, x + 2, y + 12, w - 4, 1, PAL.wood);
  artRect(ctx, x + 4, y + 14, Math.floor(w / 2) - 6, h - 18, PAL.woodDeep);
  artRect(ctx, x + Math.floor(w / 2) + 2, y + 14, Math.floor(w / 2) - 6, h - 18, PAL.woodDeep);
  artRect(ctx, x + Math.floor(w / 2) - 4, y + 18, 2, 3, PAL.metal);
  artRect(ctx, x + Math.floor(w / 2) + 2, y + 18, 2, 3, PAL.metal);
  artOutline(ctx, x, y, w, h, PAL.outline);
  // legs
  artRect(ctx, x + 3, y + h, 3, 3, PAL.woodDeep);
  artRect(ctx, x + w - 6, y + h, 3, 3, PAL.woodDeep);
}

/** Espresso machine for the counter top. */
function artDrawCoffeeMachine(ctx, x, y, opts) {
  const o = opts || {};
  const t = o.t || 0;
  artShadow(ctx, x + 1, y + 18, 16, 3, 0.2);
  artRect(ctx, x + 1, y, 16, 5, PAL.bezelLight);
  artRect(ctx, x + 2, y + 1, 14, 1, PAL.metal);
  artRect(ctx, x, y + 4, 18, 15, PAL.bezel);
  artOutline(ctx, x, y, 18, 19, PAL.outline);
  artRect(ctx, x + 11, y + 6, 5, 5, PAL.screenBg);
  artRect(ctx, x + 12, y + 7, 3, 1, PAL.screenGlow);
  artRect(ctx, x + 12, y + 9, 2, 1, PAL.screenCodeWarm);
  artRect(ctx, x + 4, y + 12, 4, 3, PAL.metalDark);
  artRect(ctx, x + 2, y + 15, 8, 3, PAL.metal);
  artRect(ctx, x + 4, y + 18, 5, 1, PAL.metalDark);
  // cup + steam
  artRect(ctx, x + 4, y + 20, 5, 3, PAL.ceramic);
  artRect(ctx, x + 5, y + 19, 3, 1, PAL.coffee);
  artSteam(ctx, x + 5, y + 17, t, 'rgba(226,234,240,0.5)', 0.4);
  artRect(ctx, x + 15, y + 15, 2, 2, PAL.ledAmber);
}

/** Filing cabinet / drawer unit. */
function artDrawFilingCabinet(ctx, x, y, width, height, opts) {
  const o = opts || {};
  const w = Math.round(width);
  const h = Math.round(height);
  const night = o.night === true;
  artShadow(ctx, x + 1, y + h - 2, w - 2, 5, night ? 0.32 : 0.18);
  artRect(ctx, x, y, w, h, PAL.metalDark);
  artRect(ctx, x + 1, y - 2, w - 2, 3, PAL.metal);
  artRect(ctx, x, y, w, 2, PAL.metal);
  artOutline(ctx, x, y, w, h, PAL.outline);
  const drawers = 3;
  for (let index = 0; index < drawers; index += 1) {
    const dy = y + 3 + index * Math.floor((h - 4) / drawers);
    const dh = Math.floor((h - 4) / drawers) - 2;
    artRect(ctx, x + 2, dy, w - 4, dh, PAL.metalDark);
    artRect(ctx, x + 2, dy, w - 4, 1, PAL.metal);
    artRect(ctx, x + Math.floor(w / 2) - 3, dy + Math.floor(dh / 2), 6, 2, PAL.inkSoft);
    artRect(ctx, x + 1, dy + dh, w - 2, 1, PAL.outline);
  }
}

/** Small office printer on a credenza. */
function artDrawPrinter(ctx, x, y, opts) {
  const o = opts || {};
  const t = o.t || 0;
  artRect(ctx, x, y + 3, 20, 10, PAL.metal);
  artRect(ctx, x, y + 3, 20, 1, PAL.white);
  artRect(ctx, x + 2, y, 16, 4, PAL.metalDark);
  artOutline(ctx, x, y + 3, 20, 10, PAL.outline);
  artRect(ctx, x + 4, y + 12, 12, 2, PAL.paper);
  artRect(ctx, x + 5, y + 12, 10, 1, PAL.metalDark);
  artRect(ctx, x + 14, y + 6, 2, 2, PAL.ledGreen);
  artRect(ctx, x + 5, y + 5, 10, 2, PAL.inkSoft);
  if (o.paper !== false) {
    artRect(ctx, x + 6, y - 4, 8, 4, PAL.white);
    artRect(ctx, x + 7, y - 3, 6, 1, PAL.paperShade);
    artRect(ctx, x + 7, y - 1, 5, 1, PAL.paperShade);
  }
  if (Math.floor(t / 900) % 2 === 0) artPix(ctx, x + 16, y + 6, PAL.white);
}

/** Low credenza / sideboard against the back wall. */
function artDrawCredenza(ctx, x, y, width, height, opts) {
  const o = opts || {};
  const w = Math.round(width);
  const h = Math.round(height);
  const night = o.night === true;
  artShadow(ctx, x + 2, y + h - 2, w - 4, 6, night ? 0.34 : 0.2);
  artRect(ctx, x, y, w, h, PAL.woodDark);
  artRect(ctx, x, y, w, 4, PAL.wood);
  artRect(ctx, x + 1, y, w - 2, 1, PAL.woodLight);
  artOutline(ctx, x, y, w, h, PAL.outline);
  // doors
  const doorW = Math.floor((w - 10) / 2);
  artRect(ctx, x + 3, y + 6, doorW, h - 10, PAL.woodDeep);
  artRect(ctx, x + 3, y + 6, doorW, 1, PAL.wood);
  artRect(ctx, x + 7 + doorW, y + 6, doorW, h - 10, PAL.woodDeep);
  artRect(ctx, x + 7 + doorW, y + 6, doorW, 1, PAL.wood);
  artRect(ctx, x + 2 + doorW, y + Math.floor(h / 2), 2, 3, PAL.metal);
  artRect(ctx, x + 6 + doorW, y + Math.floor(h / 2), 2, 3, PAL.metal);
  artRect(ctx, x + 3, y + h - 3, 4, 3, PAL.woodDeep);
  artRect(ctx, x + w - 7, y + h - 3, 4, 3, PAL.woodDeep);
}

/** Office waste bin with a crumpled paper. */
function artDrawTrashBin(ctx, x, y, opts) {
  const o = opts || {};
  const night = o.night === true;
  artShadow(ctx, x, y + 12, 10, 4, night ? 0.3 : 0.18);
  artRect(ctx, x + 1, y + 2, 8, 12, PAL.metalDark);
  artRect(ctx, x + 1, y + 2, 2, 12, PAL.metal);
  artRect(ctx, x, y, 10, 3, PAL.metal);
  artOutline(ctx, x, y, 10, 15, PAL.outline);
  artRect(ctx, x + 2, y + 5, 6, 1, PAL.metal);
  artRect(ctx, x + 2, y + 9, 6, 1, PAL.metal);
  artRect(ctx, x + 3, y - 2, 4, 3, PAL.white);
  artRect(ctx, x + 4, y - 1, 2, 1, PAL.paperShade);
}

/** Stack of moving boxes / parcel props. */
function artDrawBoxes(ctx, x, y, opts) {
  const o = opts || {};
  artShadow(ctx, x + 1, y + 18, 24, 5, 0.2);
  artRect(ctx, x, y + 8, 16, 12, PAL.cardboard);
  artRect(ctx, x, y + 8, 16, 1, artShade(PAL.cardboard, 0.24));
  artRect(ctx, x + 7, y + 8, 2, 12, PAL.cardboardDark);
  artRect(ctx, x + 10, y, 13, 10, PAL.cardboard);
  artRect(ctx, x + 10, y, 13, 1, artShade(PAL.cardboard, 0.24));
  artRect(ctx, x + 16, y, 2, 10, PAL.cardboardDark);
  artOutline(ctx, x, y + 8, 16, 12, PAL.woodDeep);
  artOutline(ctx, x + 10, y, 13, 10, PAL.woodDeep);
  artRect(ctx, x + 2, y + 14, 5, 2, PAL.paper);
}

/* ------------------------------------------------------------------------------------
 * Large-screen character tier: 20x28 (drawn when the viewport is wide enough that a
 * 16x24 sprite would look lost). Same silhouette language, chunkier pixel features.
 * ---------------------------------------------------------------------------------- */

/**
 * Draw one 20x28 character. (x, y) is the top-left of the logical 20x28 cell.
 * Same opts as artPerson.
 */
function artPersonBig(ctx, x, y, spec, opts) {
  if (!ctx || !spec) return;
  const o = opts || {};
  const role = o.role || 'teammate';
  const isBoss = role === 'lead';
  const isSub = role === 'subagent';
  const running = o.running === true;
  const t = o.t || 0;
  const reduced = o.reducedMotion === true;
  const standing = o.standing === true;

  let frame = 0;
  if (running && !reduced) frame = Math.floor(t / 210) % 2;
  let bob = 0;
  if (!reduced) {
    if (running) bob = frame;
    else bob = Math.sin(t / 820) > 0.62 ? 1 : 0;
  }

  const out = PAL.outline;
  const hair = spec.hair;
  const hairD = spec.hairDark || artShade(hair, -0.35);
  const hairL = spec.hairLight || artShade(hair, 0.3);
  const skin = spec.skin;
  const skinD = spec.skinDark || artShade(skin, -0.24);
  const shirt = spec.shirt;
  const shirtD = spec.shirtDark || artShade(shirt, -0.3);
  const shirtL = spec.shirtLight || artShade(shirt, 0.26);
  const pants = spec.pants || PAL.inkSoft;
  const pantsD = spec.pantsDark || artShade(pants, -0.3);

  const hx = x + 4;
  const hy = y + 1 + bob;
  const style = Math.abs(spec.hairStyle || 0) % 6;

  if (style === 3) {
    artRect(ctx, hx - 1, hy + 3, 1, 10, hairD);
    artRect(ctx, hx + 12, hy + 3, 1, 10, hairD);
  }

  // head silhouette
  artRect(ctx, hx, hy - 1, 12, 1, out);
  artRect(ctx, hx - 1, hy, 1, 11, out);
  artRect(ctx, hx + 12, hy, 1, 11, out);
  artRect(ctx, hx + 1, hy + 11, 10, 1, out);
  artRect(ctx, hx, hy, 12, 11, skin);
  artRect(ctx, hx - 1, hy + 5, 1, 2, skinD);
  artRect(ctx, hx + 12, hy + 5, 1, 2, skinD);

  if (style === 0) {
    artRect(ctx, hx, hy, 12, 4, hair);
    artRect(ctx, hx + 1, hy + 4, 4, 1, hair);
    artRect(ctx, hx + 9, hy + 4, 2, 2, hair);
    artRect(ctx, hx + 2, hy, 4, 2, hairL);
  } else if (style === 1) {
    artRect(ctx, hx, hy, 12, 3, hair);
    artRect(ctx, hx + 1, hy + 3, 5, 2, hair);
    artRect(ctx, hx + 7, hy + 3, 4, 1, hair);
    artRect(ctx, hx + 10, hy + 3, 2, 4, hair);
    artRect(ctx, hx + 2, hy, 4, 1, hairL);
  } else if (style === 2) {
    artRect(ctx, hx, hy, 12, 3, hair);
    artRect(ctx, hx + 1, hy + 3, 2, 2, hair);
    artRect(ctx, hx + 9, hy + 3, 2, 2, hair);
    artRect(ctx, hx + 7, hy - 3, 5, 3, hair);
    artRect(ctx, hx + 8, hy - 3, 3, 1, hairL);
  } else if (style === 3) {
    artRect(ctx, hx, hy, 12, 4, hair);
    artRect(ctx, hx - 1, hy + 2, 2, 10, hairD);
    artRect(ctx, hx + 11, hy + 2, 2, 10, hairD);
    artRect(ctx, hx, hy, 12, 1, hairL);
  } else if (style === 4) {
    artRect(ctx, hx + 1, hy, 10, 3, hair);
    artRect(ctx, hx, hy + 2, 2, 2, hair);
    artRect(ctx, hx + 10, hy + 2, 2, 2, hair);
    artRect(ctx, hx + 3, hy - 2, 3, 2, hair);
    artRect(ctx, hx + 7, hy - 2, 3, 2, hair);
    artRect(ctx, hx + 2, hy, 3, 1, hairL);
  } else {
    artRect(ctx, hx + 1, hy, 10, 2, hair);
    artRect(ctx, hx, hy + 2, 2, 2, hair);
    artRect(ctx, hx + 10, hy + 2, 2, 2, hair);
    artRect(ctx, hx + 2, hy, 3, 1, hairL);
  }
  artRect(ctx, hx, hy + 2, 1, 3, hairD);
  artRect(ctx, hx + 11, hy + 2, 1, 3, hairD);

  const eyeY = hy + 5;
  if (o.blink === true || o.sleepy === true) {
    artRect(ctx, hx + 2, eyeY + 1, 3, 1, out);
    artRect(ctx, hx + 7, eyeY + 1, 3, 1, out);
  } else {
    artRect(ctx, hx + 2, eyeY, 2, 3, out);
    artRect(ctx, hx + 8, eyeY, 2, 3, out);
  }
  artRect(ctx, hx + 5, hy + 9, 2, 1, skinD);
  if (spec.glasses) {
    artOutline(ctx, hx + 1, hy + 4, 5, 5, out);
    artOutline(ctx, hx + 7, hy + 4, 5, 5, out);
    artRect(ctx, hx + 6, hy + 7, 1, 1, out);
  }
  if (spec.headset) {
    artRect(ctx, hx + 13, hy + 3, 2, 4, PAL.metalDark);
    artRect(ctx, hx + 14, hy + 4, 2, 5, PAL.metal);
    artRect(ctx, hx + 12, hy + 8, 2, 2, PAL.metalDark);
  }

  artRect(ctx, x + 9, y + 13, 2, 1, skinD);
  const bodyY = y + 14;
  artRect(ctx, x + 3, bodyY, 14, 1, shirtL);
  artRect(ctx, x + 2, bodyY + 1, 16, 7, shirt);
  artRect(ctx, x + 2, bodyY + 7, 16, 1, shirtD);
  artRect(ctx, x + 1, bodyY + 2, 1, 6, shirtD);
  artRect(ctx, x + 18, bodyY + 2, 1, 6, shirtD);
  artRect(ctx, x + 1, bodyY + 8, 1, 1, out);
  artRect(ctx, x + 18, bodyY + 8, 1, 1, out);
  artRect(ctx, x + 7, bodyY + 1, 2, 2, shirtD);
  artRect(ctx, x + 11, bodyY + 1, 2, 2, shirtD);
  artRect(ctx, x + 1, bodyY + 6, 1, 2, shirtD);
  artRect(ctx, x + 18, bodyY + 6, 1, 2, shirtD);

  if (isBoss) {
    artRect(ctx, x + 2, bodyY + 1, 3, 6, shirtD);
    artRect(ctx, x + 15, bodyY + 1, 3, 6, shirtD);
    artRect(ctx, x + 9, bodyY + 1, 2, 1, PAL.white);
    artRect(ctx, x + 9, bodyY + 2, 2, 2, spec.tie || PAL.ledRed);
    artRect(ctx, x + 10, bodyY + 4, 1, 2, spec.tie || PAL.ledRed);
    const crownY = hy - 3;
    artRect(ctx, hx + 1, crownY, 2, 3, PAL.gold);
    artRect(ctx, hx + 5, crownY - 1, 2, 4, PAL.gold);
    artRect(ctx, hx + 9, crownY, 2, 3, PAL.gold);
    artRect(ctx, hx + 1, crownY + 2, 10, 2, PAL.goldDark);
    artPix(ctx, hx + 5, crownY + 1, PAL.goldLight);
  } else if (isSub) {
    artRect(ctx, x + 14, bodyY + 2, 3, 3, spec.badge || PAL.screenGlow);
    artPix(ctx, x + 14, bodyY + 2, PAL.white);
  } else {
    artRect(ctx, x + 13, bodyY + 2, 2, 2, spec.badge || PAL.ledAmber);
  }

  if (standing) {
    artRect(ctx, x + 4, bodyY + 8, 5, 6, pants);
    artRect(ctx, x + 11, bodyY + 8, 5, 6, pantsD);
    artRect(ctx, x + 4, bodyY + 13, 5, 1, PAL.ink);
    artRect(ctx, x + 11, bodyY + 13, 5, 1, PAL.ink);
  }
}

/* ------------------------------------------------------------------------------------
 * Lounge furniture (fills the extra floor space on larger viewports)
 * ---------------------------------------------------------------------------------- */

/** Two/three seat office sofa, facing the viewer. */
function artDrawSofa(ctx, x, y, width, height, opts) {
  const o = opts || {};
  const w = Math.max(40, Math.round(width));
  const h = Math.max(26, Math.round(height));
  const body = o.color || PAL.fabric;
  const bodyLight = artShade(body, 0.22);
  const bodyDark = artShade(body, -0.28);
  const frame = o.frame || PAL.woodDeep;
  artShadow(ctx, x + 2, y + h - 4, w - 4, 8, o.night ? 0.34 : 0.2);
  const backH = Math.round(h * 0.56);
  const seatY = y + backH - 2;
  const seatH = h - backH - 2;
  const armW = Math.max(5, Math.round(w * 0.09));
  // backrest
  artSteppedBox(ctx, x + armW - 2, y, w - (armW - 2) * 2, backH, body, PAL.outline, 2);
  artRect(ctx, x + armW, y + 2, w - armW * 2, 2, bodyLight);
  artRect(ctx, x + armW, y + Math.round(backH * 0.55), w - armW * 2, 1, bodyDark);
  // seat + cushions
  artRect(ctx, x + armW - 2, seatY, w - (armW - 2) * 2, seatH + 2, bodyDark);
  artRect(ctx, x + armW, seatY - 1, w - armW * 2, Math.max(2, seatH - 2), body);
  artRect(ctx, x + armW, seatY - 1, w - armW * 2, 1, bodyLight);
  const cushions = 2 + (w > 90 ? 1 : 0);
  const gap = Math.floor((w - armW * 2) / cushions);
  for (let index = 0; index < cushions; index += 1) {
    artRect(ctx, x + armW + index * gap + 1, seatY + 1, gap - 2, 1, bodyDark);
  }
  // armrests
  artSteppedBox(ctx, x, y + Math.round(backH * 0.4), armW, h - Math.round(backH * 0.4) - 2, body, PAL.outline, 1);
  artSteppedBox(ctx, x + w - armW, y + Math.round(backH * 0.4), armW, h - Math.round(backH * 0.4) - 2, body, PAL.outline, 1);
  artRect(ctx, x + 1, y + Math.round(backH * 0.4) + 1, armW - 2, 1, bodyLight);
  artRect(ctx, x + w - armW + 1, y + Math.round(backH * 0.4) + 1, armW - 2, 1, bodyLight);
  // legs
  artRect(ctx, x + 3, y + h, 3, 4, frame);
  artRect(ctx, x + w - 6, y + h, 3, 4, frame);
  // folded throw blanket
  artRect(ctx, x + armW + 4, y + backH + 1, 10, 3, o.blanket || PAL.wood);
  artRect(ctx, x + armW + 5, y + backH + 1, 8, 1, PAL.woodLight);
}

/** Low coffee table with a cup and a magazine. */
function artDrawCoffeeTable(ctx, x, y, width, height, opts) {
  const o = opts || {};
  const w = Math.max(20, Math.round(width));
  const h = Math.max(12, Math.round(height));
  artShadow(ctx, x + 1, y + h - 1, w - 2, 6, o.night ? 0.3 : 0.18);
  // legs
  artRect(ctx, x + 3, y + Math.round(h * 0.55), 3, h - Math.round(h * 0.55), PAL.woodDeep);
  artRect(ctx, x + w - 6, y + Math.round(h * 0.55), 3, h - Math.round(h * 0.55), PAL.woodDeep);
  // top
  artSteppedBox(ctx, x, y, w, Math.max(6, Math.round(h * 0.62)), o.color || PAL.woodLight, PAL.outline, 1);
  artRect(ctx, x + 1, y + 1, w - 2, 1, artShade(o.color || PAL.woodLight, 0.2));
  artRect(ctx, x + 1, y + Math.max(5, Math.round(h * 0.62)) - 2, w - 2, 1, PAL.wood);
  // props on the table
  if (w > 34) {
    artDrawMug(ctx, x + 4, y + 2, { t: o.t, reducedMotion: o.reducedMotion });
    artRect(ctx, x + w - 16, y + 3, 11, 4, PAL.white);
    artRect(ctx, x + w - 15, y + 4, 9, 1, PAL.ledRed);
    artRect(ctx, x + w - 15, y + 5, 6, 1, PAL.paperShade);
  }
}

/** Tall floor lamp for the lounge corner. opts.scale sizes it for bigger rooms. */
function artDrawFloorLamp(ctx, x, baseY, opts) {
  const o = opts || {};
  const night = o.night === true;
  const s = Math.max(0.85, Math.min(2.2, o.scale == null ? 1 : o.scale));
  const r = (value) => Math.round(value * s);
  const poleH = r(38);
  artShadow(ctx, x + r(1), baseY - r(3), r(12), r(4), 0.2);
  artRect(ctx, x + r(2), baseY - r(3), r(10), r(3), PAL.metalDark);
  artRect(ctx, x + r(3), baseY - r(3), r(8), r(1), PAL.metal);
  artRect(ctx, x + r(6), baseY - poleH - r(2), r(2), poleH, PAL.metalDark);
  artRect(ctx, x + r(6), baseY - poleH - r(2), r(1), poleH, PAL.metal);
  // shade
  artRect(ctx, x + r(1), baseY - poleH - r(12), r(12), r(2), PAL.metalDark);
  artRect(ctx, x, baseY - poleH - r(10), r(14), r(4), PAL.lampLight);
  artRect(ctx, x + r(1), baseY - poleH - r(6), r(12), r(3), PAL.metalDark);
  artRect(ctx, x + r(2), baseY - poleH - r(10), r(10), r(1), PAL.goldLight);
  artOutline(ctx, x, baseY - poleH - r(11), r(14), r(8), PAL.outline);
  if (night) artRect(ctx, x + r(1), baseY - poleH - r(8), r(12), r(1), 'rgba(255,217,122,0.5)');
}

/** Single armchair (lounge accent piece). */
function artDrawArmchair(ctx, x, y, width, height, opts) {
  const o = opts || {};
  const w = Math.max(22, Math.round(width));
  const h = Math.max(20, Math.round(height));
  const body = o.color || PAL.fabric;
  const bodyLight = artShade(body, 0.24);
  const bodyDark = artShade(body, -0.3);
  artShadow(ctx, x + 1, y + h - 3, w - 2, 6, o.night ? 0.32 : 0.19);
  const backH = Math.round(h * 0.58);
  const seatH = h - backH;
  artSteppedBox(ctx, x + 3, y, w - 6, backH, body, PAL.outline, 2);
  artRect(ctx, x + 4, y + 1, w - 8, 2, bodyLight);
  artRect(ctx, x + Math.floor(w / 2) - 1, y + backH - 4, 2, 3, bodyDark);
  artRect(ctx, x + 3, y + backH - 1, w - 6, seatH + 1, bodyDark);
  artRect(ctx, x + 4, y + backH - 1, w - 8, Math.max(3, seatH - 2), body);
  artRect(ctx, x + 4, y + backH - 1, w - 8, 1, bodyLight);
  artSteppedBox(ctx, x, y + Math.round(backH * 0.45), 4, h - Math.round(backH * 0.45) - 2, body, PAL.outline, 1);
  artSteppedBox(ctx, x + w - 4, y + Math.round(backH * 0.45), 4, h - Math.round(backH * 0.45) - 2, body, PAL.outline, 1);
  artRect(ctx, x + 1, y + Math.round(backH * 0.45) + 1, 2, 1, bodyLight);
  artRect(ctx, x + w - 3, y + Math.round(backH * 0.45) + 1, 2, 1, bodyLight);
  artRect(ctx, x + 5, y + backH + 1, w - 10, 3, o.cushion || PAL.goldLight);
  artRect(ctx, x + 5, y + backH + 1, w - 10, 1, artShade(o.cushion || PAL.goldLight, 0.2));
  artRect(ctx, x + 3, y + h, 2, 3, PAL.woodDeep);
  artRect(ctx, x + w - 5, y + h, 2, 3, PAL.woodDeep);
}

/** Stack of paper cups for the coffee corner. */
function artDrawCups(ctx, x, y, opts) {
  const o = opts || {};
  const accent = o.accent || PAL.ledRed;
  artRect(ctx, x + 1, y + 8, 9, 1, PAL.metalDark);
  for (let index = 0; index < 3; index += 1) {
    artRect(ctx, x, y + index * 3, 8, 3, PAL.white);
    artRect(ctx, x, y + index * 3, 8, 1, PAL.paperShade);
    artRect(ctx, x, y + index * 3 + 1, 8, 1, accent);
  }
  artRect(ctx, x + 2, y - 2, 4, 2, PAL.ceramic);
}

/** Blend two hex colours: t = 0 -> a, t = 1 -> b. Useful for muted carpet tints. */
function artMix(hexA, hexB, t) {
  const a = artParseHex(hexA);
  const b = artParseHex(hexB);
  const amount = Math.max(0, Math.min(1, Number(t) || 0));
  const out = (index) => Math.round(a[index] + (b[index] - a[index]) * amount);
  return `#${out(0).toString(16).padStart(2, '0')}${out(1).toString(16).padStart(2, '0')}${out(2).toString(16).padStart(2, '0')}`;
}
