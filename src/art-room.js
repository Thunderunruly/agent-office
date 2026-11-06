// ===== art-room.js =====
// ROOM SCENE - the inside of one Session's office, as a FIXED PIXEL WORLD.
// The lead sits in the private glass office on the right; teammates and subagents work
// the open-office desks on the left.
//
// Owner: T1 (art). The user asked for a fixed-pixel world: every art element has a FIXED
// pixel size (wall 88, floor core 400, boss office 260x220, desks 132x64, characters
// 16x24, all wall decor / props are constant). The viewport never scales anything - it
// only decides how much of the world is visible:
//   * viewport >= world core -> the extra width/height extends the ceiling, wall, tiles
//     and gets extra fixed-size props (the room simply gets bigger around the core);
//   * viewport < world core  -> the core stays centered and the outer decorations are
//     cropped symmetrically; the boss office and every workstation keep their size.
// buildRoomScene(roomModel, viewport) computes a fixed world layout plus a camera offset;
// paintRoomScene(ctx, scene, anim) translates to world space and paints.
// Painter rules: integer pixels, fillRect (+ few pixel circles), no DOM, anim.time only.

/* ---------------------------------------------------------------- fixed metrics */

const ROOM_WALL_H = 88;              // back wall height (fixed)
const ROOM_FLOOR_CORE_H = 400;       // floor height of the core room (fixed)
const ROOM_CORE_W = 760;             // world core width  (fixed)
const ROOM_CORE_H = ROOM_WALL_H + ROOM_FLOOR_CORE_H; // 488 world core height (fixed)

const ROOM_STAFF_X = 28;             // left staff grid left edge
const ROOM_STAFF_Y = 140;            // first staff row top
const ROOM_DESK_W = 132;             // fixed workstation width
const ROOM_DESK_H = 64;              // fixed workstation height (person 16 + desk 48)
const ROOM_GAP_X = 16;               // fixed horizontal gap between workstations
const ROOM_GAP_Y = 22;               // fixed vertical gap between desk rows
const ROOM_STAFF_COLS = 3;
const ROOM_STAFF_ROWS = 2;
const ROOM_STAFF_W = ROOM_STAFF_COLS * ROOM_DESK_W + (ROOM_STAFF_COLS - 1) * ROOM_GAP_X; // 428
const ROOM_STAFF_H = ROOM_STAFF_ROWS * ROOM_DESK_H + (ROOM_STAFF_ROWS - 1) * ROOM_GAP_Y; // 150

const ROOM_OFFICE_X = 472;           // private office at the right of the core
const ROOM_OFFICE_Y = 96;
const ROOM_OFFICE_W = 260;
const ROOM_OFFICE_H = 220;
const ROOM_PARTITION_W = 8;          // glass partition thickness
const ROOM_PARTITION_X = ROOM_OFFICE_X - ROOM_PARTITION_W; // 464

const ROOM_CHAR_W = 16;              // fixed character sprite size
const ROOM_CHAR_H = 24;
const ROOM_PERSON_VISIBLE = 16;      // sprite rows visible above the desk surface
const ROOM_DESK_DEPTH = 31;          // desk surface depth; desk = depth + 17
const ROOM_DESK_FRAME = 17;          // apron + legs below the desk surface
const ROOM_MAX_STAFF = 6;

const ROOM_FLOOR_TILE = 40;          // fixed floor tile size
const ROOM_WINDOW_W = 150;           // fixed wall decor sizes
const ROOM_WINDOW_H = 64;
const ROOM_CLOCK_SIZE = 30;
const ROOM_BOARD_W = 190;
const ROOM_BOARD_H = 70;
const ROOM_POSTER_W = 40;
const ROOM_POSTER_H = 56;
const ROOM_SHELF_W = 90;
const ROOM_SHELF_H = 72;
const ROOM_BOSS_WINDOW_W = 110;
const ROOM_BOSS_WINDOW_H = 64;
const ROOM_DIPLOMA_W = 46;
const ROOM_DIPLOMA_H = 40;
const ROOM_FIXTURE_W = 28;           // ceiling light bars (fixed)
const ROOM_VENT_W = 44;
const ROOM_VENT_H = 10;

const ROOM_EXT_FLOOR_COL = 150;      // fixed prop cell when the floor is extended
const ROOM_EXT_FLOOR_ROW = 160;

/* ---------------------------------------------------------------- small helpers */

function roomNum(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roomClamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function roomRound(value) {
  return Math.round(Number(value) || 0);
}

/** Hex colour at a lower alpha (for light washes). */
function roomWash(hex, alpha) {
  return artAlpha(hex, alpha);
}

/** Read the viewport; the world never scales, so this only changes the camera window. */
function roomReadViewport(viewport) {
  const w = viewport && roomNum(viewport.w, 0);
  const h = viewport && roomNum(viewport.h, 0);
  return {
    w: w >= 200 ? roomRound(w) : ROOM_CORE_W,
    h: h >= 160 ? roomRound(h) : ROOM_CORE_H,
  };
}

/** Camera offset (world -> viewport): the fixed world core is centered. */
function roomCamera(view) {
  return {
    x: roomRound((view.w - ROOM_CORE_W) / 2),
    y: roomRound((view.h - ROOM_CORE_H) / 2),
  };
}

function roomVisibleWorld(view, camera) {
  return {
    x0: -camera.x,
    y0: -camera.y,
    x1: -camera.x + view.w,
    y1: -camera.y + view.h,
    w: view.w,
    h: view.h,
  };
}

/* ---------------------------------------------------------------- fixed world */

/** The fixed world description shared by build and paint (also handy for tests). */
function roomFixedWorld() {
  return {
    w: ROOM_CORE_W,
    h: ROOM_CORE_H,
    wallH: ROOM_WALL_H,
    floorH: ROOM_FLOOR_CORE_H,
    charW: ROOM_CHAR_W,
    charH: ROOM_CHAR_H,
    deskW: ROOM_DESK_W,
    deskH: ROOM_DESK_H,
    gapX: ROOM_GAP_X,
    gapY: ROOM_GAP_Y,
    deskDepth: ROOM_DESK_DEPTH,
    staff: {
      x: ROOM_STAFF_X,
      y: ROOM_STAFF_Y,
      w: ROOM_STAFF_W,
      h: ROOM_STAFF_H,
      cols: ROOM_STAFF_COLS,
      rows: ROOM_STAFF_ROWS,
    },
    office: {
      x: ROOM_OFFICE_X,
      y: ROOM_OFFICE_Y,
      w: ROOM_OFFICE_W,
      h: ROOM_OFFICE_H,
    },
    partition: {
      x: ROOM_PARTITION_X,
      y: ROOM_OFFICE_Y,
      w: ROOM_PARTITION_W,
      h: ROOM_OFFICE_H - 8,
    },
    // everything that must stay visible (boss office + all 6 workstations)
    content: {
      x: ROOM_STAFF_X,
      y: ROOM_OFFICE_Y,
      w: ROOM_OFFICE_X + ROOM_OFFICE_W - ROOM_STAFF_X,
      h: ROOM_OFFICE_H,
    },
  };
}

/** Fixed wall decorations (never scaled, never repositioned by the viewport). */
function roomFixedWall() {
  return {
    windowA: { x: 16, y: 16, w: ROOM_WINDOW_W, h: ROOM_WINDOW_H },
    clock: { x: 176, y: 20, size: ROOM_CLOCK_SIZE },
    whiteboard: { x: 216, y: 12, w: ROOM_BOARD_W, h: ROOM_BOARD_H },
    poster: { x: 414, y: 18, w: ROOM_POSTER_W, h: ROOM_POSTER_H },
    vent: { x: 8, y: 4, w: ROOM_VENT_W, h: ROOM_VENT_H },
    bookshelf: { x: 480, y: 12, w: ROOM_SHELF_W, h: ROOM_SHELF_H },
    windowB: { x: 582, y: 16, w: ROOM_BOSS_WINDOW_W, h: ROOM_BOSS_WINDOW_H },
    diploma: { x: 700, y: 20, w: ROOM_DIPLOMA_W, h: ROOM_DIPLOMA_H },
    fixtures: [
      { x: 70, y: 2, w: ROOM_FIXTURE_W },
      { x: 210, y: 2, w: ROOM_FIXTURE_W },
      { x: 350, y: 2, w: ROOM_FIXTURE_W },
      { x: 490, y: 2, w: ROOM_FIXTURE_W },
      { x: 630, y: 2, w: ROOM_FIXTURE_W },
    ],
    // label anchor below the whiteboard (world coords)
    boardLabel: { x: 216 + roomRound(ROOM_BOARD_W / 2), y: 12 + ROOM_BOARD_H + 4 },
  };
}

/** One fixed workstation layout (independent of viewport and of the assigned member). */
function roomFixedDesk(index) {
  const col = index % ROOM_STAFF_COLS;
  const row = Math.floor(index / ROOM_STAFF_COLS);
  const x = ROOM_STAFF_X + col * (ROOM_DESK_W + ROOM_GAP_X);
  const cellY = ROOM_STAFF_Y + row * (ROOM_DESK_H + ROOM_GAP_Y);
  const personTop = cellY;
  const deskTop = personTop + ROOM_PERSON_VISIBLE;
  const deskBottom = deskTop + ROOM_DESK_DEPTH + ROOM_DESK_FRAME;
  const personCx = x + 40;
  return {
    index,
    col,
    row,
    x,
    w: ROOM_DESK_W,
    cx: x + roomRound(ROOM_DESK_W / 2),
    deskTop,
    deskDepth: ROOM_DESK_DEPTH,
    deskBottom,
    personTop,
    personVisible: ROOM_PERSON_VISIBLE,
    personCx,
    personX: personCx - roomRound(ROOM_CHAR_W / 2),
    big: false,
    chairW: 22,
    chairH: 16,
    chairCx: personCx,
    chairTop: personTop - 5,
    monitorW: 42,
    monitorH: 26,
    monitorCx: x + 88,
    monitorX: x + 88 - 21,
    monitorY: deskTop - 24,
    keyboardW: 44,
    keyboardY: deskTop + 14,
    handsCx: personCx,
    handsY: deskTop + 12,
    mugX: x + 8,
    mugY: deskTop + 5,
    papersX: x + ROOM_DESK_W - 22,
    papersY: deskTop + 5,
    plateW: 34,
    plateX: x + 49,
    plateY: deskTop + ROOM_DESK_DEPTH + 1,
    labelY: personTop - 4,
    hit: { x: x - 2, y: personTop - 8, w: ROOM_DESK_W + 4, h: ROOM_DESK_H + 8 },
    // fixed sprite geometry (all characters use the 16x24 tier here)
    charW: ROOM_CHAR_W,
    charH: ROOM_CHAR_H,
  };
}

/** Fixed private-office layout (260x220 at the right of the core). */
function roomFixedOffice() {
  const glassTop = ROOM_OFFICE_Y;
  const glassBottom = ROOM_OFFICE_Y + ROOM_OFFICE_H;
  const deskX = ROOM_OFFICE_X + 48;      // 520
  const deskTop = ROOM_OFFICE_Y + 122;   // 218
  const personCx = deskX + 40;           // 560
  const monitorCx = deskX + 112;         // 632
  const station = {
    member: null,
    spec: null,
    big: false,
    personVisible: ROOM_PERSON_VISIBLE,
    personTop: deskTop - ROOM_PERSON_VISIBLE,
    personX: personCx - roomRound(ROOM_CHAR_W / 2),
    personCx,
    deskX,
    deskW: 170,
    deskTop,
    deskDepth: 34,
    deskBottom: deskTop + 34 + ROOM_DESK_FRAME,
    cx: deskX + 85,
    chairW: 24,
    chairH: 17,
    chairCx: personCx,
    chairTop: deskTop - ROOM_PERSON_VISIBLE - 5,
    monitorW: 46,
    monitorH: 28,
    monitorX: monitorCx - 23,
    monitorY: deskTop + 2 - 28,
    monitorCx,
    keyboardW: 46,
    keyboardY: deskTop + 15,
    handsCx: personCx,
    handsY: deskTop + 13,
    lampX: deskX + 138,
    lampY: deskTop - roomRound(16 * 1.25) + 1,
    lampScale: 1.25,
    plateX: personCx - 23,
    plateY: deskTop + 34 + 1,
    plateW: 46,
    mugX: deskX + 8,
    mugY: deskTop + 6,
    papersX: deskX + 170 - 24,
    papersY: deskTop + 6,
    monitorSeed: 731,
    running: false,
    labelY: deskTop - ROOM_PERSON_VISIBLE - 4,
    chairColor: PAL.chair,
  };
  return {
    x: ROOM_OFFICE_X,
    y: ROOM_OFFICE_Y,
    w: ROOM_OFFICE_W,
    h: ROOM_OFFICE_H,
    carpet: { x: ROOM_OFFICE_X + 14, y: ROOM_OFFICE_Y + 10, w: 232, h: 196 },
    partition: {
      x: ROOM_PARTITION_X,
      y: glassTop,
      w: ROOM_PARTITION_W,
      h: glassBottom - 8 - glassTop,
    },
    glassFront: { x: ROOM_PARTITION_X, y: glassBottom - 8, w: ROOM_OFFICE_W + ROOM_PARTITION_W, h: 8 },
    doorGap: { from: 150, to: 196 },
    station,
    visitor: { x: personCx - 11, y: station.deskBottom + 14, w: 22, h: 16 },
  };
}

/* ---------------------------------------------------------------- scene building */

function buildRoomScene(roomModel, viewport) {
  const room = roomModel && typeof roomModel === 'object' ? roomModel : null;
  const view = roomReadViewport(viewport);
  const camera = roomCamera(view);
  const visible = roomVisibleWorld(view, camera);
  const staff = room && Array.isArray(room.staff) ? room.staff.slice(0, ROOM_MAX_STAFF) : [];
  const bossMember = room && room.boss && typeof room.boss === 'object' ? room.boss : null;
  const todos = room && room.todos && typeof room.todos === 'object' ? room.todos : { done: 0, total: 0 };
  const sessionLabel = (room && (room.sessionId || room.title)) || 'room';
  const accentSeedRaw = roomNum(room && room.accentSeed, 1);
  const accentIndex = ((Math.round(accentSeedRaw) - 1) % ART_ACCENTS.length + ART_ACCENTS.length) % ART_ACCENTS.length;
  const accent = ART_ACCENTS[accentIndex];
  const carpetAccent = {
    main: artMix(accent.main, PAL.floor, 0.58),
    dark: artMix(accent.dark, PAL.floorLine, 0.48),
    light: artMix(accent.light, PAL.wall, 0.45),
  };

  const world = roomFixedWorld();
  const scene = {
    kind: 'room',
    w: view.w,
    h: view.h,
    room,
    accent,
    carpetAccent,
    accentSeed: accentIndex + 1,
    world,
    camera,
    visible,
    wall: roomFixedWall(),
    desks: [],
    deskRows: [[], []],
    office: null,
    props: { back: [], mid: [], fore: [], officeBack: [], officeFront: [] },
    extension: { wallItems: [], floorProps: [], fixtures: [] },
    tiles: [],
    hits: [],
    labels: [],
  };

  // ---- fixed staff workstations, in fixed slots; empty slots get an empty chair ----
  for (let index = 0; index < ROOM_STAFF_COLS * ROOM_STAFF_ROWS; index += 1) {
    const desk = roomFixedDesk(index);
    const member = staff[index] || null;
    const seed = member
      ? artHash(`${sessionLabel}|${member.sessionId || index}|${member.role || 'teammate'}`)
      : artHash(`${sessionLabel}|empty|${index}`);
    const chairBase = artPick(CHAIR_COLORS, seed + index * 7);
    desk.member = member;
    desk.empty = !member;
    desk.seed = seed;
    desk.spec = member ? artCharacterSpec(seed) : null;
    desk.running = !!(member && member.running);
    desk.monitorSeed = (seed % 977) + 11;
    desk.chairColor = artShade(chairBase, 0.18);
    desk.chairLight = artShade(chairBase, 0.44);
    desk.chairDark = artShade(chairBase, -0.2);
    scene.desks.push(desk);
    scene.deskRows[desk.row].push(desk);
    if (!member) continue;
    scene.hits.push({
      x: desk.hit.x,
      y: desk.hit.y,
      w: desk.hit.w,
      h: desk.hit.h,
      target: { kind: 'member', sessionId: member.sessionId, role: member.role },
    });
    scene.labels.push({
      x: desk.personCx,
      y: desk.labelY,
      anchor: 'above',
      kind: 'member',
      text: member.name || '',
      data: {
        sessionId: member.sessionId,
        role: member.role,
        running: member.running === true,
        currentWork: member.currentWork || '',
        todos: member.todos || { done: 0, total: 0 },
      },
    });
  }

  // ---- fixed private office for the lead ----
  const office = roomFixedOffice();
  const station = office.station;
  station.member = bossMember;
  station.spec = bossMember
    ? artCharacterSpec(artHash(`${sessionLabel}|boss|${bossMember.sessionId || 'lead'}`))
    : null;
  station.running = !!(bossMember && bossMember.running);
  office.station = station;
  scene.office = office;
  office.officeBack = [
    { kind: 'credenza', x: 486, y: 100, w: 110, h: 20 },
    { kind: 'printer', x: 494, y: 89 },
    { kind: 'plant', cx: 586, baseY: 100, scale: 0.7, seed: 2, variant: 'small' },
    { kind: 'armchair', x: 492, y: 126, w: 38, h: 32, color: scene.accent.main, cushion: PAL.goldLight },
    { kind: 'table', x: 540, y: 140, w: 50, h: 20 },
    { kind: 'plant', cx: 708, baseY: 196, scale: 1.2, seed: 4, variant: 'floor' },
    { kind: 'filing', x: 498, y: 170, w: 26, h: 32 },
  ];
  office.officeFront = [
    { kind: 'visitorChair', x: office.visitor.x, y: office.visitor.y, w: office.visitor.w, h: office.visitor.h, color: scene.accent.main },
    { kind: 'plant', cx: 492, baseY: 300, scale: 1.1, seed: 7, variant: 'floor' },
    { kind: 'lamp', x: 700, baseY: 302, scale: 1.2 },
  ];
  scene.props.officeBack = office.officeBack;
  scene.props.officeFront = office.officeFront;

  if (bossMember) {
    scene.hits.push({
      x: ROOM_PARTITION_X,
      y: ROOM_OFFICE_Y,
      w: ROOM_OFFICE_W + ROOM_PARTITION_W,
      h: ROOM_OFFICE_H,
      target: { kind: 'member', sessionId: bossMember.sessionId, role: 'lead' },
    });
    scene.labels.push({
      x: station.personCx,
      y: station.labelY,
      anchor: 'above',
      kind: 'boss',
      text: bossMember.name || '',
      data: {
        sessionId: bossMember.sessionId,
        running: bossMember.running === true,
        currentWork: bossMember.currentWork || '',
        todos: bossMember.todos || { done: 0, total: 0 },
        title: bossMember.title || (room && room.title) || '',
      },
    });
  }

  // fixed whiteboard progress label (below the fixed board)
  scene.labels.push({
    x: scene.wall.boardLabel.x,
    y: scene.wall.boardLabel.y,
    anchor: 'below',
    kind: 'whiteboard',
    text: '',
    data: {
      done: Math.max(0, roomRound(todos.done)),
      total: Math.max(0, roomRound(todos.total)),
      teamSize: Math.max(0, roomRound(room && room.teamSize)),
      hiddenStaff: Math.max(0, roomRound(room && room.hiddenStaff)),
    },
  });

  // ---- fixed core props (same positions at every viewport size) ----
  scene.props.back = [
    { kind: 'plant', cx: 16, baseY: 136, scale: 0.7, seed: 11, variant: 'floor' },
    { kind: 'plant', cx: 444, baseY: 136, scale: 0.7, seed: 12, variant: 'floor' },
  ];
  scene.props.fore = [
    { kind: 'rug', x: 64, y: 330, w: 300, h: 110, accent: carpetAccent },
    { kind: 'sofa', x: 84, y: 344, w: 120, h: 56, color: PAL.fabric, blanket: scene.accent.main },
    { kind: 'table', x: 224, y: 366, w: 72, h: 28 },
    { kind: 'armchair', x: 316, y: 348, w: 44, h: 38, color: scene.accent.main, cushion: PAL.goldLight },
    { kind: 'lamp', x: 338, baseY: 436, scale: 1.2 },
    { kind: 'plant', cx: 78, baseY: 436, scale: 1.1, seed: 6, variant: 'floor' },
    { kind: 'counter', x: 28, y: 446, w: 120, h: 30 },
    { kind: 'coffee', x: 40, y: 427 },
    { kind: 'cups', x: 104, y: 438 },
    { kind: 'cooler', x: 160, y: 440 },
    { kind: 'trash', x: 186, y: 462 },
    { kind: 'boxes', x: 300, y: 456 },
    // waiting corner outside the private office
    { kind: 'sofa', x: 500, y: 406, w: 100, h: 44, color: PAL.fabric, blanket: scene.accent.main },
    { kind: 'table', x: 612, y: 414, w: 54, h: 22 },
    { kind: 'cooler', x: 478, y: 436 },
    { kind: 'plant', cx: 690, baseY: 474, scale: 0.9, seed: 8, variant: 'floor' },
    { kind: 'trash', x: 714, y: 460 },
  ];

  // ---- viewport-dependent extras: extended ceiling/wall/floor decorations ----
  roomBuildExtension(scene, visible);

  // ---- fixed-size floor tiles for the visible world rect ----
  roomBuildTiles(scene, visible);

  // ---- hits/labels to viewport coordinates (fixed world coords + camera offset) ----
  roomProjectHits(scene);
  roomProjectLabels(scene);

  return scene;
}

/* ---------------------------------------------------------------- viewport extras */

/** Fixed decorative pieces for the parts of the world revealed beyond the core. */
function roomBuildExtension(scene, visible) {
  const extension = scene.extension;
  const world = scene.world;

  // Wall decor continues on both sides of the fixed core wall at FIXED world slots.
  // (Order is fixed; a slot is only emitted when it touches the revealed strip.)
  const wallSlots = [
    { kind: 'poster', x: -48, w: ROOM_POSTER_W, h: ROOM_POSTER_H, y: 18 },
    { kind: 'window', x: -200, w: ROOM_WINDOW_W, h: ROOM_WINDOW_H, y: 16 },
    { kind: 'shelf', x: -380, w: ROOM_SHELF_W, h: ROOM_SHELF_H, y: 12 },
    { kind: 'window', x: -600, w: ROOM_WINDOW_W, h: ROOM_WINDOW_H, y: 16 },
    { kind: 'poster', x: -810, w: ROOM_POSTER_W, h: ROOM_POSTER_H, y: 18 },
    { kind: 'window', x: -1010, w: ROOM_WINDOW_W, h: ROOM_WINDOW_H, y: 16 },
    { kind: 'shelf', x: world.w + 8, w: ROOM_SHELF_W, h: ROOM_SHELF_H, y: 12 },
    { kind: 'window', x: world.w + 150, w: ROOM_WINDOW_W, h: ROOM_WINDOW_H, y: 16 },
    { kind: 'poster', x: world.w + 360, w: ROOM_POSTER_W, h: ROOM_POSTER_H, y: 18 },
    { kind: 'window', x: world.w + 460, w: ROOM_WINDOW_W, h: ROOM_WINDOW_H, y: 16 },
    { kind: 'shelf', x: world.w + 670, w: ROOM_SHELF_W, h: ROOM_SHELF_H, y: 12 },
    { kind: 'window', x: world.w + 820, w: ROOM_WINDOW_W, h: ROOM_WINDOW_H, y: 16 },
  ];
  for (const slot of wallSlots) {
    if (slot.x + slot.w < visible.x0 || slot.x > visible.x1) continue;
    extension.wallItems.push({
      kind: slot.kind,
      x: slot.x,
      y: slot.y,
      w: slot.w,
      h: slot.h,
      seed: 30 + Math.abs(slot.x % 89),
    });
  }

  // extra ceiling light bars in the extended wall (fixed size, fixed pitch)
  const fixturePitch = 140;
  const fixtureStart = Math.floor(visible.x0 / fixturePitch) * fixturePitch + 60;
  for (let x = fixtureStart; x < visible.x1; x += fixturePitch) {
    if (x > -ROOM_FIXTURE_W && x + ROOM_FIXTURE_W < world.w) continue; // core fixtures already fixed
    extension.fixtures.push({ x, y: 2, w: ROOM_FIXTURE_W });
  }

  // Extra fixed furniture in the revealed floor:
  //  * narrow side strips -> a column of storage / greenery pieces
  //  * the floor below the core -> fixed lounge / coffee / shelf clusters
  const sideKinds = ['plant', 'shelf', 'cooler', 'boxes', 'trash', 'armchair'];
  const strips = [];
  if (visible.x0 < 0) {
    strips.push({ x0: visible.x0, x1: 0, y0: Math.max(world.wallH, visible.y0), y1: visible.y1 });
  }
  if (visible.x1 > world.w) {
    strips.push({ x0: world.w, x1: visible.x1, y0: Math.max(world.wallH, visible.y0), y1: visible.y1 });
  }
  for (const strip of strips) {
    const startX = Math.floor(strip.x0 / ROOM_EXT_FLOOR_COL) * ROOM_EXT_FLOOR_COL;
    const startY = Math.ceil(Math.max(strip.y0, world.wallH + 10) / ROOM_EXT_FLOOR_ROW) * ROOM_EXT_FLOOR_ROW;
    for (let cellX = startX; cellX < strip.x1; cellX += ROOM_EXT_FLOOR_COL) {
      for (let cellY = startY; cellY < strip.y1; cellY += ROOM_EXT_FLOOR_ROW) {
        roomPushExtensionProp(extension.floorProps, sideKinds, cellX, cellY);
      }
    }
  }

  // extra floor rows below the core: fixed clusters, never stretched
  const bottomTop = world.h;
  const bottomH = visible.y1 - bottomTop;
  if (bottomH >= 60) {
    const clusterH = 96;
    const bottomPad = Math.max(8, roomRound((bottomH - clusterH) / 2));
    const firstBase = bottomTop + bottomPad + clusterH;
    for (let rowIndex = 0; rowIndex < 4; rowIndex += 1) {
      const baseY = firstBase + rowIndex * 150;
      if (baseY - clusterH < bottomTop) break;
      if (baseY > visible.y1 + 6) break;
      const startX = Math.floor(visible.x0 / 220) * 220;
      for (let cellX = startX; cellX < visible.x1; cellX += 220) {
        const slot = Math.round(cellX / 220);
        roomPushExtensionCluster(extension.floorProps, cellX, baseY, scene.carpetAccent, slot, rowIndex);
      }
    }
  }
}

/** Push one fixed-size prop into one extension cell (deterministic kind + seed). */
function roomPushExtensionProp(list, propKinds, cellX, cellY) {
  const pickValue = artHash(`ext:${cellX}:${cellY}`) % propKinds.length;
  const kind = propKinds[pickValue];
  const seed = artHash(`extseed:${cellX}:${cellY}`) % 97;
  const baseX = cellX + 30;
  const baseY = cellY + 120;
  if (kind === 'plant') {
    list.push({ kind, cx: cellX + 75, baseY, scale: 0.85 + (seed % 3) * 0.15, seed: seed + 3, variant: 'floor' });
  } else if (kind === 'shelf') {
    list.push({ kind, x: baseX, y: baseY - 72, w: 60, h: 72, seed: seed + 5 });
  } else if (kind === 'cooler') {
    list.push({ kind, x: cellX + 68, y: baseY - 38 });
  } else if (kind === 'armchair') {
    list.push({ kind, x: cellX + 57, y: baseY - 30, w: 36, h: 30, color: PAL.fabricDark, cushion: PAL.goldLight });
  } else if (kind === 'trash') {
    list.push({ kind, x: cellX + 70, y: baseY - 16 });
  } else {
    list.push({ kind, x: cellX + 60, y: baseY - 20 });
  }
}

/** One fixed lounge / coffee / storage cluster for the revealed floor below the core. */
function roomPushExtensionCluster(list, cellX, baseY, accent, slot, rowIndex) {
  const kind = ((slot + rowIndex * 2) % 4 + 4) % 4;
  const seed = artHash(`extcs:${cellX}:${baseY}`) % 89;
  if (kind === 0) {
    // lounge group: rug + sofa + coffee table + plant + floor lamp
    list.push({ kind: 'rug', x: cellX + 20, y: baseY - 84, w: 170, h: 84, accent });
    list.push({ kind: 'sofa', x: cellX + 28, y: baseY - 74, w: 96, h: 42, color: PAL.fabric, blanket: accent.main });
    list.push({ kind: 'table', x: cellX + 76, y: baseY - 52, w: 50, h: 20 });
    list.push({ kind: 'plant', cx: cellX + 12, baseY, scale: 0.9, seed: seed + 2, variant: 'floor' });
    list.push({ kind: 'lamp', x: cellX + 196, baseY, scale: 1.1 });
  } else if (kind === 1) {
    // coffee nook: counter + machine + cups + cooler + trash
    list.push({ kind: 'counter', x: cellX + 26, y: baseY - 28, w: 100, h: 28 });
    list.push({ kind: 'coffee', x: cellX + 38, y: baseY - 47 });
    list.push({ kind: 'cups', x: cellX + 100, y: baseY - 34 });
    list.push({ kind: 'cooler', x: cellX + 138, y: baseY - 38 });
    list.push({ kind: 'trash', x: cellX + 164, y: baseY - 16 });
  } else if (kind === 2) {
    // shelf corner: two shelves + plant + boxes
    list.push({ kind: 'shelf', x: cellX + 24, y: baseY - 72, w: 60, h: 72, seed: seed + 4 });
    list.push({ kind: 'shelf', x: cellX + 96, y: baseY - 72, w: 60, h: 72, seed: seed + 9 });
    list.push({ kind: 'plant', cx: cellX + 12, baseY, scale: 0.95, seed: seed + 6, variant: 'floor' });
    list.push({ kind: 'boxes', x: cellX + 172, y: baseY - 20 });
  } else {
    // meeting corner: rug + table + two armchairs + plant
    list.push({ kind: 'rug', x: cellX + 24, y: baseY - 78, w: 160, h: 78, accent });
    list.push({ kind: 'table', x: cellX + 62, y: baseY - 52, w: 66, h: 24 });
    list.push({ kind: 'armchair', x: cellX + 30, y: baseY - 72, w: 34, h: 30, color: accent.main, cushion: PAL.goldLight });
    list.push({ kind: 'armchair', x: cellX + 148, y: baseY - 72, w: 34, h: 30, color: accent.main, cushion: PAL.goldLight });
    list.push({ kind: 'plant', cx: cellX + 206, baseY, scale: 0.85, seed: seed + 5, variant: 'floor' });
  }
}

/** Fixed-size floor tiles covering the visible floor area (40px grid in world space). */
function roomBuildTiles(scene, visible) {
  const floorTop = ROOM_WALL_H;
  const startX = Math.floor(visible.x0 / ROOM_FLOOR_TILE) * ROOM_FLOOR_TILE;
  const startY = floorTop + Math.floor(Math.max(0, visible.y0 - floorTop) / ROOM_FLOOR_TILE) * ROOM_FLOOR_TILE;
  const tones = [PAL.floor, PAL.floorAlt, PAL.floorLight, '#d3cdbf'];
  for (let y = startY; y < visible.y1; y += ROOM_FLOOR_TILE) {
    for (let x = startX; x < visible.x1; x += ROOM_FLOOR_TILE) {
      const pickValue = artHash(`tile:${x}:${y}`) % 100;
      const tone = pickValue < 58 ? 0 : pickValue < 84 ? 1 : pickValue < 95 ? 2 : 3;
      scene.tiles.push({ x, y, w: ROOM_FLOOR_TILE, h: ROOM_FLOOR_TILE, color: tones[tone] });
    }
  }
}

/* ---------------------------------------------------------------- hits / labels */

/** Clip a world-space rect to the viewport; returns null when nothing useful is visible. */
function roomClipRect(scene, rect) {
  const x0 = Math.max(0, Math.round(rect.x + scene.camera.x));
  const y0 = Math.max(0, Math.round(rect.y + scene.camera.y));
  const x1 = Math.min(scene.w, Math.round(rect.x + rect.w + scene.camera.x));
  const y1 = Math.min(scene.h, Math.round(rect.y + rect.h + scene.camera.y));
  if (x1 - x0 < 4 || y1 - y0 < 4) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Convert world-space hits to viewport coordinates, clipping them to the canvas. */
function roomProjectHits(scene) {
  const hits = [];
  for (const hit of scene.hits) {
    const rect = roomClipRect(scene, { x: hit.x, y: hit.y, w: hit.w, h: hit.h });
    if (!rect) continue;
    hits.push({ x: rect.x, y: rect.y, w: rect.w, h: rect.h, target: hit.target });
  }
  scene.hits = hits;
}

/** Convert world-space labels to viewport coordinates; drop labels whose anchor is off-screen. */
function roomProjectLabels(scene) {
  const labels = [];
  for (const label of scene.labels) {
    const x = Math.round(label.x + scene.camera.x);
    const y = Math.round(label.y + scene.camera.y);
    if (x < -24 || x > scene.w + 24 || y < -24 || y > scene.h + 24) continue;
    labels.push({
      x,
      y,
      anchor: label.anchor,
      kind: label.kind,
      text: label.text,
      data: label.data,
    });
  }
  scene.labels = labels;
}

/* ---------------------------------------------------------------- paint: scene */

function paintRoomScene(ctx, scene, anim) {
  if (!ctx || !scene || !scene.world) return;
  const night = !!(anim && anim.night === true);
  const reduced = !!(anim && anim.reducedMotion === true);
  const time = anim && Number.isFinite(anim.time) ? anim.time : 0;
  const t = reduced ? 0 : time;
  const camera = scene.camera;

  ctx.save();
  ctx.translate(camera.x, camera.y);
  paintRoomShell(ctx, scene, night);
  paintRoomWallDecor(ctx, scene, night, t, reduced);
  paintRoomProps(ctx, scene.extension.floorProps, night, t, reduced);
  paintRoomProps(ctx, scene.props.back, night, t, reduced);
  for (let row = 0; row < scene.deskRows.length; row += 1) {
    for (const desk of scene.deskRows[row]) paintRoomDesk(ctx, scene, desk, night, t, reduced);
  }
  paintRoomBossOffice(ctx, scene, night, t, reduced);
  paintRoomProps(ctx, scene.props.fore, night, t, reduced);
  ctx.restore();

  if (night) artNightOverlay(ctx, scene.w, scene.h, 0.40);

  ctx.save();
  ctx.translate(camera.x, camera.y);
  paintRoomLights(ctx, scene, night, t, reduced);
  paintRoomLife(ctx, scene, anim, night, t, reduced);
  ctx.restore();
}

/* ---------------------------------------------------------------- paint: shell */

function paintRoomShell(ctx, scene, night) {
  const visible = scene.visible;
  const world = scene.world;
  const x0 = visible.x0;
  const width = visible.x1 - visible.x0;
  // 1) ceiling above the back wall (only when the viewport is taller than the core)
  if (visible.y0 < 0) {
    const ceilingTop = visible.y0;
    const ceilingH = -ceilingTop;
    artRect(ctx, x0, ceilingTop, width, ceilingH, PAL.wallDeep);
    artRect(ctx, x0, ceilingTop, width, 2, PAL.wallTrim);
    for (let y = Math.ceil(ceilingTop / 48) * 48; y < 0; y += 48) {
      artRect(ctx, x0, y, width, 2, PAL.wallTrim);
      artRect(ctx, x0, y + 2, width, 1, PAL.wallAlt);
    }
    for (let x = Math.floor(x0 / 160) * 160; x < visible.x1; x += 160) {
      artRect(ctx, x, ceilingTop, 2, ceilingH, PAL.wallTrim);
      artRect(ctx, x + 2, ceilingTop, 1, ceilingH, PAL.wallAlt);
    }
    // coffered panel shading between the beams
    for (let y = Math.ceil(ceilingTop / 48) * 48; y < -10; y += 48) {
      for (let x = Math.floor(x0 / 160) * 160; x < visible.x1; x += 160) {
        artRect(ctx, x + 4, y + 4, 152, 1, roomWash(PAL.ink, 0.05));
      }
    }
    // hanging fluorescent rows for the deep ceiling
    if (ceilingH >= 44) {
      const rows = ceilingH >= 110 ? [-30, -96] : [-30];
      for (const rowY of rows) {
        if (rowY < ceilingTop + 12) continue;
        for (let x = Math.floor(x0 / 180) * 180 + 90; x < visible.x1; x += 180) {
          artRect(ctx, x - 28, rowY - 5, 56, 9, PAL.metalDark);
          artRect(ctx, x - 27, rowY - 4, 54, 2, night ? PAL.goldLight : PAL.white);
          artRect(ctx, x - 26, rowY - 2, 52, 4, night ? PAL.lampLight : PAL.paper);
          artRect(ctx, x - 26, rowY - 2, 52, 1, PAL.wallTrim);
          artRect(ctx, x - 1, rowY - 16, 2, 11, PAL.metalDark);
        }
      }
    }
    // cornice above the wall
    artRect(ctx, x0, -3, width, 3, PAL.wallTrim);
    artRect(ctx, x0, -1, width, 1, PAL.outline);
  }
  // 2) back wall
  const wallTop = Math.max(visible.y0, 0);
  if (wallTop < world.wallH) {
    artRect(ctx, x0, wallTop, width, world.wallH - wallTop, PAL.wall);
    if (wallTop < 6) {
      artRect(ctx, x0, wallTop, width, Math.min(6, 6 - wallTop), PAL.wallAlt);
      artRect(ctx, x0, 5, width, 1, PAL.wallTrim);
      artRect(ctx, x0, 6, width, 1, PAL.wallDeep);
    }
    // wall panel seams (fixed pitch, only where the wall is still visible)
    for (let x = Math.floor(x0 / 96) * 96; x < visible.x1; x += 96) {
      artRect(ctx, x, Math.max(wallTop, 7), 1, world.wallH - Math.max(wallTop, 7) - 8, PAL.wallAlt);
      artRect(ctx, x + 1, Math.max(wallTop, 7), 1, world.wallH - Math.max(wallTop, 7) - 8, PAL.wall);
    }
    // skirting
    if (visible.y1 > world.wallH - 8) {
      artRect(ctx, x0, world.wallH - 8, width, 8, PAL.wallTrim);
      artRect(ctx, x0, world.wallH - 8, width, 1, PAL.wallDeep);
      artRect(ctx, x0, world.wallH - 1, width, 1, PAL.outline);
    }
  }
  // 3) floor
  artRect(ctx, x0, world.wallH, width, Math.max(0, visible.y1 - world.wallH), PAL.floor);
  for (const tile of scene.tiles) {
    artRect(ctx, tile.x, tile.y, tile.w, tile.h, tile.color);
    artRect(ctx, tile.x, tile.y, 1, tile.h, PAL.floorLine);
    artRect(ctx, tile.x, tile.y, tile.w, 1, PAL.floorLine);
    artRect(ctx, tile.x + 1, tile.y + 1, tile.w - 2, 1, 'rgba(255,255,255,0.07)');
  }
  // shadow under the wall
  artRect(ctx, x0, world.wallH, width, 3, 'rgba(20,24,34,0.12)');
  artRect(ctx, x0, world.wallH + 3, width, 3, 'rgba(20,24,34,0.06)');
  // daylight pools under the windows (day only; night uses the lamp glows instead)
  if (!night) {
    const windows = [scene.wall.windowA, scene.wall.windowB];
    for (const item of scene.extension.wallItems) if (item.kind === 'window') windows.push(item);
    for (const win of windows) {
      artRect(ctx, win.x + 6, world.wallH + 2, win.w - 12, 12, 'rgba(255,248,222,0.10)');
      artRect(ctx, win.x + 12, world.wallH + 14, win.w - 24, 8, 'rgba(255,248,222,0.06)');
    }
  }
}

/* ---------------------------------------------------------------- paint: wall decor */

function paintRoomWallDecor(ctx, scene, night, t, reduced) {
  const wall = scene.wall;
  const fixtures = wall.fixtures.concat(scene.extension.fixtures);
  for (const fixture of fixtures) {
    if (fixture.x > scene.visible.x1 || fixture.x + fixture.w < scene.visible.x0) continue;
    artDrawCeilingFixture(ctx, fixture.x, fixture.y, fixture.w, { night });
  }
  artDrawAirVent(ctx, wall.vent.x, wall.vent.y, wall.vent.w, wall.vent.h, { night });
  artDrawWindow(ctx, wall.windowA.x, wall.windowA.y, wall.windowA.w, wall.windowA.h, {
    night,
    t,
    reducedMotion: reduced,
    seed: 11,
  });
  artDrawWallClock(ctx, wall.clock.x, wall.clock.y, wall.clock.size, { night });
  artDrawWhiteboard(
    ctx,
    wall.whiteboard.x,
    wall.whiteboard.y,
    wall.whiteboard.w,
    wall.whiteboard.h,
    {
      done: scene.room && scene.room.todos ? scene.room.todos.done : 0,
      total: scene.room && scene.room.todos ? scene.room.todos.total : 0,
      accent: scene.accent.main,
      seed: scene.accentSeed * 7 + 3,
    },
  );
  artDrawPoster(ctx, wall.poster.x, wall.poster.y, wall.poster.w, wall.poster.h, {
    seed: scene.accentSeed * 5 + 1,
    variant: 1,
  });
  artDrawBookshelf(ctx, wall.bookshelf.x, wall.bookshelf.y, wall.bookshelf.w, wall.bookshelf.h, {
    seed: scene.accentSeed * 3 + 5,
  });
  artDrawWindow(ctx, wall.windowB.x, wall.windowB.y, wall.windowB.w, wall.windowB.h, {
    night,
    t,
    reducedMotion: reduced,
    seed: 23,
    blinds: true,
  });
  artDrawPoster(ctx, wall.diploma.x, wall.diploma.y, wall.diploma.w, wall.diploma.h, {
    seed: 3,
    variant: 3,
  });
  // additional fixed decorations for the revealed wall beyond the core
  for (const item of scene.extension.wallItems) {
    if (item.x > scene.visible.x1 || item.x + item.w < scene.visible.x0) continue;
    if (item.kind === 'window') {
      artDrawWindow(ctx, item.x, item.y, item.w, item.h, {
        night,
        t,
        reducedMotion: reduced,
        seed: item.seed || 31,
      });
    } else if (item.kind === 'shelf') {
      artDrawBookshelf(ctx, item.x, item.y, item.w, item.h, { seed: item.seed || 41 });
    } else {
      artDrawPoster(ctx, item.x, item.y, item.w, item.h, { seed: item.seed || 51, variant: 2 });
    }
  }
  // warm lamp wash on the wall at night
  if (night) {
    for (const fixture of fixtures) {
      if (fixture.x > scene.visible.x1 || fixture.x + fixture.w < scene.visible.x0) continue;
      artRect(ctx, fixture.x - 16, 6, fixture.w + 32, ROOM_WALL_H - 15, roomWash(PAL.lampLight, 0.04));
    }
  }
  // glass partition corner shading
  artRect(ctx, ROOM_PARTITION_X - 2, 0, 2, ROOM_WALL_H - 1, roomWash(PAL.ink, 0.06));
}

/* ---------------------------------------------------------------- paint: desks */

function paintRoomDesk(ctx, scene, desk, night, t, reduced) {
  const member = desk.member;
  const running = desk.running;
  const blink = !reduced && !running
    && ((Math.floor((t + (desk.spec ? desk.spec.blinkPhase : 0)) / 2300) % 4) === 0);
  const opts = {
    role: member ? member.role : 'teammate',
    running,
    t,
    reducedMotion: reduced,
    blink,
  };

  // chair (behind the worker) + worker, desk hides the lap
  if (member) {
    artDrawChairBack(ctx, desk.chairCx - roomRound(desk.chairW / 2), desk.chairTop, desk.chairColor, {
      w: desk.chairW,
      h: desk.chairH,
      light: desk.chairLight,
      dark: desk.chairDark,
    });
    artPerson(ctx, desk.personX, desk.personTop, desk.spec, opts);
  } else {
    artDrawEmptyChair(ctx, desk.personCx, desk.deskTop, desk.chairColor, {
      w: desk.chairW,
      h: desk.chairH,
      light: desk.chairLight,
      dark: desk.chairDark,
    });
  }

  // desk, monitor beside the worker, keyboard in front of them
  artDrawDesk(ctx, desk.x, desk.deskTop, desk.w, { depth: desk.deskDepth, night });
  artDrawMonitor(ctx, desk.monitorX, desk.monitorY, desk.monitorW, desk.monitorH, {
    running,
    night,
    t,
    seed: desk.monitorSeed,
    reducedMotion: reduced,
  });
  artDrawKeyboard(ctx, desk.handsCx - roomRound(desk.keyboardW / 2), desk.keyboardY, desk.keyboardW, {});
  if (member) {
    artPersonHands(ctx, desk.handsCx, desk.deskTop, desk.spec, {
      running,
      t,
      reducedMotion: reduced,
      big: false,
      baseY: desk.handsY,
    });
    artDrawMug(ctx, desk.mugX, desk.mugY, {
      t,
      reducedMotion: reduced,
      accent: scene.accent.light,
    });
    artDrawNameplate(ctx, desk.plateX, desk.plateY, desk.plateW, { accent: scene.accent.light });
    artDrawPenCup(ctx, desk.monitorX - 12, desk.deskTop + 5, {});
    if (desk.index % 2 === 1) {
      artDrawPlant(ctx, desk.x + desk.w - 15, desk.deskTop + 16, {
        variant: 'desk',
        scale: 0.95,
        seed: desk.index + 3,
        t,
        reducedMotion: reduced,
      });
    } else {
      artDrawPapers(ctx, desk.papersX, desk.papersY, { accent: scene.accent.light, sticky: true });
    }
  } else {
    // empty desk: paper and a forgotten mug waiting for its owner
    artDrawPapers(ctx, desk.papersX, desk.papersY, { sticky: false });
    artDrawMug(ctx, desk.mugX, desk.mugY, { accent: scene.accent.light, steam: false });
    if (desk.index % 3 === 0) {
      artDrawPlant(ctx, desk.x + desk.w - 15, desk.deskTop + 16, {
        variant: 'desk',
        scale: 0.9,
        seed: desk.index + 5,
        t,
        reducedMotion: reduced,
      });
    }
  }
}

/* ---------------------------------------------------------------- paint: boss office */

function paintRoomBossOffice(ctx, scene, night, t, reduced) {
  const office = scene.office;
  if (!office) return;
  const station = office.station;

  artDrawCarpet(ctx, office.carpet.x, office.carpet.y, office.carpet.w, office.carpet.h, scene.carpetAccent, {
    night,
    seed: scene.accentSeed,
  });
  paintRoomProps(ctx, scene.props.officeBack, night, t, reduced);

  // boss chair + boss
  if (station.member) {
    artDrawChairBack(
      ctx,
      station.chairCx - roomRound(station.chairW / 2),
      station.chairTop,
      scene.accent.main,
      {
        w: station.chairW,
        h: station.chairH,
        light: artShade(scene.accent.main, 0.4),
        dark: artShade(scene.accent.main, -0.24),
      },
    );
    artPerson(ctx, station.personX, station.personTop, station.spec, {
      role: 'lead',
      running: station.running,
      t,
      reducedMotion: reduced,
      blink: !reduced && !station.running && ((Math.floor(t / 2400) % 5) === 0),
    });
  } else {
    artDrawEmptyChair(ctx, station.personCx, station.deskTop, scene.accent.main, {
      w: station.chairW,
      h: station.chairH,
      light: artShade(scene.accent.main, 0.4),
      dark: artShade(scene.accent.main, -0.24),
    });
  }

  // fixed big desk + big monitor + keyboard
  artDrawDesk(ctx, station.deskX, station.deskTop, station.deskW, {
    depth: station.deskDepth,
    night,
    top: PAL.deskTop,
  });
  artDrawMonitor(ctx, station.monitorX, station.monitorY, station.monitorW, station.monitorH, {
    running: station.running,
    night,
    t,
    seed: station.monitorSeed,
    reducedMotion: reduced,
  });
  artDrawKeyboard(ctx, station.handsCx - roomRound(station.keyboardW / 2), station.keyboardY, station.keyboardW, {});
  if (station.member) {
    artPersonHands(ctx, station.handsCx, station.deskTop, station.spec, {
      running: station.running,
      t,
      reducedMotion: reduced,
      big: false,
      baseY: station.handsY,
    });
  }
  artDrawMug(ctx, station.mugX, station.mugY, {
    t,
    reducedMotion: reduced,
    accent: scene.accent.light,
    steam: station.running,
    scale: 1.15,
  });
  artDrawPapers(ctx, station.papersX, station.papersY, {
    accent: PAL.goldLight,
    sticky: true,
    scale: 1.1,
  });
  artDrawPenCup(ctx, station.monitorX - 14, station.deskTop + 7, { scale: 1.1 });
  artDrawNameplate(ctx, station.plateX, station.plateY, station.plateW, {
    accent: scene.accent.light,
    gold: true,
  });
  artDrawDeskLamp(ctx, station.lampX, station.lampY, { night, scale: station.lampScale });

  paintRoomProps(ctx, scene.props.officeFront, night, t, reduced);

  // glass partition (left) + glass front wall
  artDrawGlassWall(ctx, office.partition.x, office.partition.y, office.partition.w, office.partition.h, {
    night,
    gapFrom: office.doorGap.from,
    gapTo: office.doorGap.to,
    accent: scene.accent.light,
  });
  artRect(ctx, office.partition.x - 1, office.partition.y + office.doorGap.from,
    office.partition.w + 2, 2, scene.accent.main);
  artDrawGlassWall(ctx, office.glassFront.x, office.glassFront.y, office.glassFront.w, office.glassFront.h, {
    night,
  });
  artRect(ctx, office.glassFront.x, office.glassFront.y + office.glassFront.h,
    office.glassFront.w, 2, 'rgba(20,24,34,0.10)');
}

/* ---------------------------------------------------------------- paint: props */

function paintRoomProps(ctx, props, night, t, reduced) {
  if (!props || props.length === 0) return;
  for (const prop of props) {
    switch (prop.kind) {
      case 'plant':
        artDrawPlant(ctx, prop.cx, prop.baseY, {
          variant: prop.variant || 'floor',
          scale: prop.scale || 1,
          seed: prop.seed,
          t,
          reducedMotion: reduced,
        });
        break;
      case 'trash':
        artDrawTrashBin(ctx, prop.x, prop.y, { night });
        break;
      case 'boxes':
        artDrawBoxes(ctx, prop.x, prop.y, {});
        break;
      case 'cooler':
        artDrawWaterCooler(ctx, prop.x, prop.y, { night });
        break;
      case 'shelf':
        artDrawBookshelf(ctx, prop.x, prop.y, prop.w, prop.h, { seed: prop.seed });
        break;
      case 'filing':
        artDrawFilingCabinet(ctx, prop.x, prop.y, prop.w, prop.h, { night });
        break;
      case 'credenza':
        artDrawCredenza(ctx, prop.x, prop.y, prop.w, prop.h, { night });
        break;
      case 'printer':
        artDrawPrinter(ctx, prop.x, prop.y, { t });
        break;
      case 'counter':
        artDrawCounter(ctx, prop.x, prop.y, prop.w, prop.h, { night });
        break;
      case 'coffee':
        artDrawCoffeeMachine(ctx, prop.x, prop.y, { t });
        break;
      case 'cups':
        artDrawCups(ctx, prop.x, prop.y, { accent: PAL.ledRed });
        break;
      case 'rug':
        artDrawCarpet(ctx, prop.x, prop.y, prop.w, prop.h, prop.accent, { night, seed: 21 });
        break;
      case 'sofa':
        artDrawSofa(ctx, prop.x, prop.y, prop.w, prop.h, {
          color: prop.color,
          night,
          blanket: prop.blanket || PAL.woodLight,
        });
        break;
      case 'armchair':
        artDrawArmchair(ctx, prop.x, prop.y, prop.w, prop.h, {
          color: prop.color,
          cushion: prop.cushion,
          night,
        });
        break;
      case 'table':
        artDrawCoffeeTable(ctx, prop.x, prop.y, prop.w, prop.h, { t, reducedMotion: reduced, night });
        break;
      case 'lamp':
        artDrawFloorLamp(ctx, prop.x, prop.baseY, { night, scale: prop.scale || 1 });
        break;
      case 'visitorChair':
        artDrawChairBack(ctx, prop.x, prop.y - roomRound(prop.h * 0.25), prop.color, {
          w: prop.w,
          h: prop.h,
          light: artShade(prop.color, 0.24),
          dark: artShade(prop.color, -0.3),
        });
        artRect(ctx, prop.x + 2, prop.y + roomRound(prop.h * 0.4), prop.w - 4, 5, prop.color);
        artRect(ctx, prop.x + 2, prop.y + roomRound(prop.h * 0.4), prop.w - 4, 1, artShade(prop.color, 0.24));
        break;
      default:
        break;
    }
  }
}

/* ---------------------------------------------------------------- paint: night lights */

function paintRoomLights(ctx, scene, night, t, reduced) {
  const visible = scene.visible;
  const fixtures = scene.wall.fixtures.concat(scene.extension.fixtures);
  if (!night) {
    for (const desk of scene.desks) {
      if (desk.running) {
        artGlow(ctx, desk.monitorCx, desk.monitorY + roomRound(desk.monitorH / 2), 14, PAL.screenGlow, 0.08);
      }
    }
    const station = scene.office && scene.office.station;
    if (station) artGlow(ctx, station.lampX + 8, station.lampY + 12, 18, PAL.lampLight, 0.07);
    return;
  }
  // ceiling fixtures (fixed positions; core + revealed wall)
  for (const fixture of fixtures) {
    if (fixture.x > visible.x1 || fixture.x + fixture.w < visible.x0) continue;
    const cx = fixture.x + roomRound(fixture.w / 2);
    artGlow(ctx, cx, ROOM_WALL_H - 5, 54, PAL.lampLight, 0.14);
    artGlow(ctx, cx, ROOM_WALL_H + 44, 64, PAL.lampLight, 0.13);
    artRect(ctx, cx - 26, ROOM_WALL_H + 2, 52, 26, roomWash(PAL.lampLight, 0.04));
  }
  // hanging fluorescent rows on the revealed ceiling
  if (visible.y0 < -44) {
    const rows = [-30];
    if (-visible.y0 >= 110) rows.push(-96);
    for (const rowY of rows) {
      if (rowY < visible.y0 + 12 || rowY > 0) continue;
      for (let x = Math.floor(visible.x0 / 180) * 180 + 90; x < visible.x1; x += 180) {
        artGlow(ctx, x, rowY + 4, 30, PAL.lampLight, 0.10);
      }
    }
  }
  // screens
  for (const desk of scene.desks) {
    const glowY = desk.monitorY + roomRound(desk.monitorH / 2);
    if (desk.running) {
      artGlow(ctx, desk.monitorCx, glowY, 26, PAL.screenGlow, 0.30);
      artRect(ctx, desk.monitorX, desk.deskTop + 1, desk.monitorW, 4, roomWash(PAL.screenGlow, 0.06));
    } else {
      artGlow(ctx, desk.monitorCx, glowY, 14, PAL.metal, 0.05);
    }
  }
  // boss office: fixed desk lamp + monitor + glass reflections
  const office = scene.office;
  if (office) {
    const station = office.station;
    const lampScale = station.lampScale || 1;
    artGlow(ctx, station.lampX + roomRound(8 * lampScale), station.lampY + roomRound(13 * lampScale),
      roomRound(40 * lampScale), PAL.lampLight, 0.38);
    artRect(ctx, office.carpet.x + 6, station.deskTop - 8, office.carpet.w - 12, 26,
      roomWash(PAL.lampLight, 0.05));
    if (station.running) {
      artGlow(ctx, station.monitorCx, station.monitorY + roomRound(station.monitorH / 2), 34,
        PAL.screenGlow, 0.22);
    }
    artRect(ctx, office.partition.x + 2, office.partition.y + 6, 3, office.partition.h - 14,
      roomWash(PAL.lampLight, 0.05));
  }
  // windows: cool moon spill
  const windows = [scene.wall.windowA, scene.wall.windowB];
  for (const item of scene.extension.wallItems) if (item.kind === 'window') windows.push(item);
  for (const win of windows) {
    artGlow(ctx, win.x + roomRound(win.w / 2), win.y + roomRound(win.h / 2), 30, '#9fb8dc', 0.10);
    artRect(ctx, win.x + 4, ROOM_WALL_H + 2, win.w - 8, 10, roomWash('#9fb8dc', 0.05));
  }
  // warm accents from the coffee machine / coolers / floor lamps (core + revealed floor)
  const warmGroups = [scene.props.fore, scene.props.officeBack, scene.extension.floorProps];
  for (const group of warmGroups) {
    for (const prop of group) {
      if (prop.kind === 'coffee') artGlow(ctx, prop.x + 12, prop.y + 10, 14, PAL.ledAmber, 0.16);
      else if (prop.kind === 'cooler') artGlow(ctx, prop.x + 7, prop.y + 10, 10, PAL.glassLine, 0.08);
      else if (prop.kind === 'lamp') {
        const scale = prop.scale || 1;
        artGlow(ctx, prop.x + roomRound(7 * scale), prop.baseY - roomRound(48 * scale),
          roomRound(36 * scale), PAL.lampLight, 0.30);
      }
    }
  }
  void t;
  void reduced;
}

/* ---------------------------------------------------------------- paint: live details */

function paintRoomLife(ctx, scene, anim, night, t, reduced) {
  const hover = anim && anim.hover && typeof anim.hover === 'object' ? anim.hover : null;
  const hoverId = hover && hover.kind === 'member' ? String(hover.sessionId || '') : '';
  const accentLight = scene.accent.light;

  for (const desk of scene.desks) {
    const member = desk.member;
    if (!member) continue;
    const running = desk.running;
    const bubbleX = desk.personX - 19;
    if (running) {
      artTypingDots(
        ctx,
        bubbleX,
        desk.personTop + 1,
        t,
        night ? '#2a3345' : PAL.white,
        night ? '#c9d3e0' : PAL.ink,
        scene.accent.light,
      );
      if (!reduced && Math.floor(t / 210) % 2 === 0) {
        artPix(ctx, desk.handsCx - 4, desk.handsY - 1, PAL.white);
      }
    } else {
      artZzz(ctx, bubbleX + 2, desk.personTop + 6, t + desk.index * 260,
        night ? '#cdd8e8' : PAL.inkSoft);
    }
    const ledX = desk.monitorX + desk.monitorW - 5;
    const ledY = desk.monitorY + desk.monitorH - 4;
    artRect(ctx, ledX, ledY, 2, 2, running ? PAL.ledGreen : PAL.ledAmber);
    if (running && !reduced && Math.floor(t / 500) % 2 === 0) {
      artRect(ctx, ledX, ledY, 2, 1, PAL.white);
    }
    if (hoverId && String(member.sessionId || '') === hoverId) {
      artGlow(ctx, desk.cx, desk.deskTop + roomRound(desk.deskDepth / 2), desk.w * 0.7, accentLight, 0.16);
      artOutline(
        ctx,
        desk.x - 3,
        desk.personTop - 7,
        desk.w + 6,
        desk.deskBottom - desk.personTop + 7,
        scene.accent.main,
      );
    }
  }

  const office = scene.office;
  if (office) {
    const station = office.station;
    if (station.member) {
      if (!station.running) {
        artZzz(ctx, station.personX - 17, station.personTop + 7, t + 900,
          night ? '#cdd8e8' : PAL.inkSoft);
      } else if (!reduced && Math.floor(t / 210) % 2 === 0) {
        artPix(ctx, station.handsCx - 4, station.handsY - 1, PAL.white);
      }
      if (!reduced && Math.floor(t / 700) % 2 === 0) {
        artPix(ctx, station.personCx + 4, station.personTop - 1, PAL.goldLight);
      }
      const bossHover = hover && hover.kind === 'member'
        && String(hover.sessionId || '') === String(station.member.sessionId || '');
      if (bossHover) {
        artOutline(ctx, office.x - 2, office.y - 2, office.w + 4, office.h + 4, scene.accent.main);
        artOutline(ctx, office.x - 1, office.y - 1, office.w + 2, office.h + 2, accentLight);
      }
    }
    if (!reduced && Math.floor(t / 900) % 2 === 0) {
      artPix(ctx, station.plateX + 2, station.plateY + 1, PAL.goldLight);
    }
  }
}
