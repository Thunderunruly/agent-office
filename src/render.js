// ===== render.js =====
// Canvas lifecycle for the pixel office: responsive logical canvas, integer scaling
// that fills the whole stage (no letterbox), animation clock, hit testing, hover/click
// dispatch, day/night, and the short black transition between scenes.
// The painters live in src/art-*.js and never touch DOM.

const OFFICE_DEVICE_PIXEL_SCALE = 2; // fixed: 2 device pixels per art pixel at every window size
const OFFICE_TRANSITION_MS = 280;
const OFFICE_FRAME_MS = 33; // ~30fps is plenty for this scene and keeps the GUI cheap

/**
 * Fixed-pixel camera: every art pixel is exactly OFFICE_DEVICE_PIXEL_SCALE device pixels,
 * independent of the window size. Resizing the window therefore reveals more or less of
 * the office instead of rescaling the artwork, which is what the user asked for
 * ("楼层高度固定像素，这样我能调整视窗大小看看效果").
 */
function officeComputeViewport(stageWidth, stageHeight, devicePixelRatio) {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const width = Math.max(1, stageWidth);
  const height = Math.max(1, stageHeight);
  const pixelScale = OFFICE_DEVICE_PIXEL_SCALE;
  const logicalWidth = Math.max(1, Math.round((width * dpr) / pixelScale));
  const logicalHeight = Math.max(1, Math.round((height * dpr) / pixelScale));
  const scale = pixelScale / dpr; // CSS px per logical pixel
  return {
    dpr,
    pixelScale,
    logicalWidth,
    logicalHeight,
    scale,
    cssWidth: logicalWidth * scale,
    cssHeight: logicalHeight * scale,
  };
}

function officeTargetKey(target) {
  if (!target || typeof target !== 'object') return '';
  return `${target.kind}:${target.workspaceId || ''}:${target.sessionId || ''}:${target.role || ''}`;
}

/**
 * Stable identity of the current view (not of its data). Data refreshes of the same
 * view must repaint without the black transition, otherwise a running session's live
 * snapshot makes the page flash continuously.
 */
function officeSceneKey(scene) {
  if (!scene) return '';
  if (scene.kind === 'city') return 'city';
  if (scene.kind === 'building') {
    const building = scene.building || {};
    return `building:${building.workspaceId || ''}`;
  }
  if (scene.kind === 'room') {
    const room = scene.room || {};
    return `room:${room.sessionId || ''}`;
  }
  return String(scene.kind || '');
}

function officePaintScene(ctx, scene, anim, canvasWidth, canvasHeight) {
  if (!scene) {
    ctx.fillStyle = '#10151f';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    return;
  }
  if (scene.kind === 'building') paintBuildingScene(ctx, scene, anim);
  else if (scene.kind === 'room') paintRoomScene(ctx, scene, anim);
  else paintCityScene(ctx, scene, anim);
}

function createOfficeRenderer(options) {
  const canvas = options && options.canvas;
  const stage = options && options.stage;
  const onActivate = options && options.onActivate;
  const onHover = options && options.onHover;
  const onLayout = options && options.onLayout;
  const context = canvas ? canvas.getContext('2d', { alpha: false }) : null;

  let scene = null;
  let previousScene = null;
  let transitionStart = -1;
  let night = false;
  let reducedMotion = false;
  let disposed = false;
  let rafId = 0;
  let lastPaint = 0;
  let hover = null;
  let hoverKey = '';
  let canvasWidth = 640;
  let canvasHeight = 360;
  let transform = {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    cssWidth: 640,
    cssHeight: 360,
    logicalWidth: 640,
    logicalHeight: 360,
  };
  let resizeObserver = null;
  let visibilityBound = false;

  if (canvas) {
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    canvas.style.width = '640px';
    canvas.style.height = '360px';
  }
  if (context) context.imageSmoothingEnabled = false;

  /**
   * Fill the stage with a responsive logical canvas using integer DEVICE-pixel art
   * scaling (crisp on HiDPI), then derive the CSS size from the logical size.
   */
  function measure() {
    if (!stage || !canvas) return;
    const rect = stage.getBoundingClientRect();
    const stageWidth = Math.max(1, rect.width || 640);
    const stageHeight = Math.max(1, rect.height || 360);
    const dpr = (typeof window !== 'undefined' && Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0)
      ? window.devicePixelRatio
      : 1;
    const view = officeComputeViewport(stageWidth, stageHeight, dpr);
    canvasWidth = view.logicalWidth;
    canvasHeight = view.logicalHeight;
    if (canvas.width !== canvasWidth) canvas.width = canvasWidth;
    if (canvas.height !== canvasHeight) canvas.height = canvasHeight;
    canvas.style.width = `${view.cssWidth}px`;
    canvas.style.height = `${view.cssHeight}px`;
    transform = {
      scale: view.scale,
      cssWidth: view.cssWidth,
      cssHeight: view.cssHeight,
      offsetX: (stageWidth - view.cssWidth) / 2,
      offsetY: (stageHeight - view.cssHeight) / 2,
      logicalWidth: canvasWidth,
      logicalHeight: canvasHeight,
    };
    if (context) {
      context.imageSmoothingEnabled = false;
      context.fillStyle = '#10151f';
      context.fillRect(0, 0, canvasWidth, canvasHeight);
    }
    if (typeof onLayout === 'function') onLayout(transform);
    paint(performance.now());
  }

  function hitTest(logicalX, logicalY) {
    if (!scene || !Array.isArray(scene.hits)) return null;
    for (let index = scene.hits.length - 1; index >= 0; index -= 1) {
      const hit = scene.hits[index];
      if (!hit || typeof hit.x !== 'number') continue;
      if (logicalX >= hit.x && logicalX < hit.x + hit.w && logicalY >= hit.y && logicalY < hit.y + hit.h) {
        return hit;
      }
    }
    return null;
  }

  function toLogical(event) {
    if (!stage) return null;
    const rect = stage.getBoundingClientRect();
    const x = (event.clientX - rect.left - transform.offsetX) / transform.scale;
    const y = (event.clientY - rect.top - transform.offsetY) / transform.scale;
    if (x < 0 || y < 0 || x >= canvasWidth || y >= canvasHeight) return null;
    return { x, y };
  }

  function handlePointerMove(event) {
    const point = toLogical(event);
    const hit = point ? hitTest(point.x, point.y) : null;
    const target = hit ? hit.target || null : null;
    const key = officeTargetKey(target);
    if (key === hoverKey) return;
    hoverKey = key;
    hover = target;
    if (canvas) canvas.style.cursor = target ? 'pointer' : 'default';
    if (typeof onHover === 'function') onHover(target);
  }

  function handlePointerLeave() {
    if (hoverKey === '') return;
    hoverKey = '';
    hover = null;
    if (canvas) canvas.style.cursor = 'default';
    if (typeof onHover === 'function') onHover(null);
  }

  function handlePointerDown(event) {
    const point = toLogical(event);
    const hit = point ? hitTest(point.x, point.y) : null;
    if (hit && hit.target && typeof onActivate === 'function') onActivate(hit.target);
  }

  function paint(now) {
    if (!context) return;
    const anim = {
      time: now,
      night,
      hover,
      page: 0,
      reducedMotion,
    };
    context.imageSmoothingEnabled = false;
    if (transitionStart >= 0 && previousScene && previousScene !== scene) {
      const progress = (now - transitionStart) / OFFICE_TRANSITION_MS;
      if (progress >= 1) {
        transitionStart = -1;
        officePaintScene(context, scene, anim, canvasWidth, canvasHeight);
      } else if (progress < 0.5) {
        officePaintScene(context, previousScene, anim, canvasWidth, canvasHeight);
        context.fillStyle = `rgba(8,11,17,${Math.min(1, progress * 2)})`;
        context.fillRect(0, 0, canvasWidth, canvasHeight);
      } else {
        officePaintScene(context, scene, anim, canvasWidth, canvasHeight);
        context.fillStyle = `rgba(8,11,17,${Math.min(1, (1 - progress) * 2)})`;
        context.fillRect(0, 0, canvasWidth, canvasHeight);
      }
    } else {
      officePaintScene(context, scene, anim, canvasWidth, canvasHeight);
    }
  }

  function frame(now) {
    if (disposed) return;
    rafId = requestAnimationFrame(frame);
    if (typeof document !== 'undefined' && document.hidden) return;
    if (transitionStart < 0 && now - lastPaint < OFFICE_FRAME_MS) return;
    lastPaint = now;
    paint(now);
  }

  function handleVisibility() {
    lastPaint = 0;
  }

  stage && stage.addEventListener('pointermove', handlePointerMove);
  stage && stage.addEventListener('pointerleave', handlePointerLeave);
  stage && stage.addEventListener('pointerdown', handlePointerDown);

  if (typeof ResizeObserver !== 'undefined' && stage) {
    resizeObserver = new ResizeObserver(() => measure());
    resizeObserver.observe(stage);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', measure);
    document.addEventListener('visibilitychange', handleVisibility);
    visibilityBound = true;
  }
  measure();
  rafId = requestAnimationFrame(frame);

  return {
    setScene(nextScene, optionsArg) {
      const previousKey = officeSceneKey(scene);
      const nextKey = officeSceneKey(nextScene);
      const animate = optionsArg && optionsArg.transition === false
        ? false
        : previousKey !== nextKey;
      previousScene = scene;
      scene = nextScene || null;
      if (animate && previousScene && scene) {
        transitionStart = performance.now();
      } else {
        transitionStart = -1;
      }
      lastPaint = 0;
      paint(performance.now());
    },
    setNight(value) {
      const next = value === true;
      if (next === night) return;
      night = next;
      lastPaint = 0;
    },
    setReducedMotion(value) {
      reducedMotion = value === true;
    },
    relayout() {
      measure();
    },
    getTransform() {
      return transform;
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(rafId);
      stage && stage.removeEventListener('pointermove', handlePointerMove);
      stage && stage.removeEventListener('pointerleave', handlePointerLeave);
      stage && stage.removeEventListener('pointerdown', handlePointerDown);
      if (resizeObserver) resizeObserver.disconnect();
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', measure);
        if (visibilityBound) document.removeEventListener('visibilitychange', handleVisibility);
      }
    },
  };
}
