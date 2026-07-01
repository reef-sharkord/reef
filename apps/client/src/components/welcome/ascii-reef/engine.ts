/**
 * Renders and animates a generated `Scene` onto a 2D canvas.
 *
 * The static layers (seabed, rocks, coral) are rasterized once to an offscreen
 * canvas (`renderStatic`) and blitted each frame; only the moving layers (water
 * surface, particles, bubbles, fish, swaying seaweed) are drawn per frame. All
 * glyphs share one foreground colour and vary only by `globalAlpha`.
 */

import { FONT_STACK, PALETTE } from './config';
import { chance, range, type Rng } from './rng';
import type { Scene } from './types';

export type Metrics = {
  charW: number;
  cellH: number;
  fontSize: number;
  dpr: number;
};

export const measureCharWidth = (
  ctx: CanvasRenderingContext2D,
  fontSize: number
): number => {
  ctx.font = `${fontSize}px ${FONT_STACK}`;
  // Monospace: any glyph is the advance width; 'M' is a safe probe.
  return ctx.measureText('M').width;
};

/** Rasterize the static grid to an offscreen canvas at device resolution. */
export const renderStatic = (
  scene: Scene,
  metrics: Metrics,
  cssWidth: number,
  cssHeight: number
): HTMLCanvasElement => {
  const off = document.createElement('canvas');
  off.width = Math.max(1, Math.ceil(cssWidth * metrics.dpr));
  off.height = Math.max(1, Math.ceil(cssHeight * metrics.dpr));

  const ctx = off.getContext('2d');
  if (!ctx) {
    return off;
  }

  ctx.scale(metrics.dpr, metrics.dpr);
  ctx.font = `${metrics.fontSize}px ${FONT_STACK}`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = PALETTE.foreground;

  for (const cell of scene.staticCells) {
    ctx.globalAlpha = cell.opacity;
    ctx.fillText(cell.char, cell.col * metrics.charW, cell.row * metrics.cellH);
  }

  ctx.globalAlpha = 1;

  return off;
};

/** Advance all dynamic entities by `dt` seconds. */
export const updateScene = (scene: Scene, dt: number, rng: Rng): void => {
  scene.waterOffset += dt * 1.2;

  for (const p of scene.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    if (p.x < 0) {
      p.x += scene.cols;
    } else if (p.x >= scene.cols) {
      p.x -= scene.cols;
    }

    const span = Math.max(1, scene.seabedTop);
    if (p.y < 0) {
      p.y += span;
    } else if (p.y >= span) {
      p.y -= span;
    }
  }

  for (const b of scene.bubbles) {
    b.y -= b.vy * dt;
    if (b.y < 0) {
      b.y = b.baseRow;
    }
  }

  for (const f of scene.fish) {
    f.x += f.vx * dt;
    f.reverseIn -= dt;

    if (f.reverseIn <= 0) {
      if (chance(rng, 0.5)) {
        f.vx = -f.vx;
      }
      f.reverseIn = range(rng, 5, 16);
    }

    const width = f.glyph.length;
    if (f.vx > 0 && f.x > scene.cols + 2) {
      f.x = -width - 2;
    } else if (f.vx < 0 && f.x < -width - 2) {
      f.x = scene.cols + 2;
    }
  }
};

const drawWater = (
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  metrics: Metrics
): void => {
  const shift = Math.floor(scene.waterOffset);
  ctx.globalAlpha = 0.1;

  for (let r = 0; r < scene.waterPattern.length; r++) {
    const rowStr = scene.waterPattern[r];
    for (let c = 0; c < scene.cols; c++) {
      const srcIndex = (((c - shift) % scene.cols) + scene.cols) % scene.cols;
      const ch = rowStr[srcIndex];
      if (ch && ch !== ' ') {
        ctx.fillText(ch, c * metrics.charW, r * metrics.cellH);
      }
    }
  }
};

const drawParticles = (
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  metrics: Metrics
): void => {
  for (const p of scene.particles) {
    ctx.globalAlpha = p.opacity;
    ctx.fillText(p.char, p.x * metrics.charW, p.y * metrics.cellH);
  }
};

const drawBubbles = (
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  metrics: Metrics
): void => {
  for (const b of scene.bubbles) {
    ctx.globalAlpha = b.opacity;
    ctx.fillText(b.char, b.x * metrics.charW, b.y * metrics.cellH);
  }
};

const drawFish = (
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  metrics: Metrics
): void => {
  for (const f of scene.fish) {
    ctx.globalAlpha = f.opacity;
    const px = f.x * metrics.charW;
    const py = f.y * metrics.cellH;

    if (f.vx < 0) {
      // Face left: mirror horizontally about the fish's own box.
      ctx.save();
      ctx.translate(px + f.glyph.length * metrics.charW, py);
      ctx.scale(-1, 1);
      ctx.fillText(f.glyph, 0, 0);
      ctx.restore();
    } else {
      ctx.fillText(f.glyph, px, py);
    }
  }
};

const drawSeaweed = (
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  metrics: Metrics,
  time: number
): void => {
  for (const w of scene.seaweed) {
    ctx.globalAlpha = w.opacity;

    for (let i = 0; i < w.height; i++) {
      const row = w.baseRow - i;
      if (row < 0) {
        break;
      }

      const ch = i % 2 === 0 ? ')' : '(';
      const sway =
        Math.sin(time * w.swaySpeed + w.phase + i * 0.35) *
        w.swayAmp *
        (i / Math.max(1, w.height));

      ctx.fillText(ch, (w.col + sway) * metrics.charW, row * metrics.cellH);
    }
  }
};

/** Draw one frame. `time` (seconds) drives seaweed sway; `staticCache` is blitted. */
export const drawScene = (
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  metrics: Metrics,
  staticCache: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
  time: number
): void => {
  ctx.fillStyle = PALETTE.background;
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  ctx.font = `${metrics.fontSize}px ${FONT_STACK}`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = PALETTE.foreground;

  drawWater(ctx, scene, metrics);
  drawParticles(ctx, scene, metrics);
  drawBubbles(ctx, scene, metrics);
  drawFish(ctx, scene, metrics);

  // Static terrain sits in front of open-water elements (the reef floor).
  ctx.globalAlpha = 1;
  ctx.drawImage(staticCache, 0, 0, cssWidth, cssHeight);

  drawSeaweed(ctx, scene, metrics, time);

  ctx.globalAlpha = 1;
};
