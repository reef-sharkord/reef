/**
 * Procedural reef generation. Given a grid size and a seeded RNG, produce a
 * `Scene`: a static glyph grid (seabed, rocks, coral) plus the dynamic entity
 * lists (seaweed, fish, particles, bubbles) and the drifting water surface.
 *
 * Pipeline (per spec): seabed -> rocks -> coral -> seaweed -> fish -> particles
 * -> bubbles. Pure and deterministic for a given seed.
 */

import { GLYPHS, OPACITY } from './config';
import { chance, intRange, pick, range, type Rng } from './rng';
import type { Bubble, Cell, Fish, Particle, Scene, Seaweed } from './types';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const addCell = (
  cells: Cell[],
  cols: number,
  rows: number,
  col: number,
  row: number,
  char: string,
  opacity: number
): void => {
  const c = Math.round(col);
  const r = Math.round(row);

  if (c < 0 || c >= cols || r < 0 || r >= rows) {
    return;
  }

  cells.push({ col: c, row: r, char, opacity });
};

/** Uneven seabed top edge via a bounded random walk; returns per-column tops. */
const generateSeabed = (
  cells: Cell[],
  cols: number,
  rows: number,
  rng: Rng
): number[] => {
  const floor = rows - intRange(rng, 3, 5);
  const heights: number[] = [];
  let h = floor;

  for (let c = 0; c < cols; c++) {
    h += intRange(rng, -1, 1);
    h = clamp(h, rows - 6, rows - 2);
    heights[c] = h;

    for (let r = h; r < rows; r++) {
      const depth = (r - h) / Math.max(1, rows - h);
      const glyph =
        depth > 0.6
          ? pick(rng, [GLYPHS.rocks[2], GLYPHS.rocks[3]])
          : pick(rng, [GLYPHS.rocks[0], GLYPHS.rocks[1]]);
      const opacity = depth > 0.6 ? OPACITY.midground : OPACITY.background;

      addCell(cells, cols, rows, c, r, glyph, opacity);
    }
  }

  return heights;
};

/** Scattered boulders sitting on the seabed. */
const generateRocks = (
  cells: Cell[],
  cols: number,
  rows: number,
  heights: number[],
  rng: Rng
): void => {
  const count = clamp(Math.round(cols / 22), 1, 8);

  for (let i = 0; i < count; i++) {
    const col = intRange(rng, 1, cols - 2);
    const baseRow = heights[col] - 1;
    const width = intRange(rng, 1, 3);

    for (let dx = -width; dx <= width; dx++) {
      const height = intRange(rng, 0, 1);
      for (let dy = 0; dy <= height; dy++) {
        addCell(
          cells,
          cols,
          rows,
          col + dx,
          baseRow - dy,
          pick(rng, [GLYPHS.rocks[1], GLYPHS.rocks[2]]),
          OPACITY.midground
        );
      }
    }
  }
};

/** A coral branch that recursively forks upward, tipped with a bud glyph. */
const drawBranch = (
  cells: Cell[],
  cols: number,
  rows: number,
  rng: Rng,
  startCol: number,
  startRow: number,
  dir: -1 | 0 | 1,
  length: number,
  opacity: number
): void => {
  let c = startCol;
  let r = startRow;

  for (let i = 0; i < length; i++) {
    r -= 1;

    if (dir < 0) {
      c -= 1;
      addCell(cells, cols, rows, c, r, '\\', opacity);
    } else if (dir > 0) {
      c += 1;
      addCell(cells, cols, rows, c, r, '/', opacity);
    } else {
      addCell(cells, cols, rows, c, r, chance(rng, 0.15) ? 'Y' : '|', opacity);
    }

    if (i > 0 && i < length - 1 && chance(rng, 0.4)) {
      const subDir = pick(rng, [-1, 1] as const);
      drawBranch(
        cells,
        cols,
        rows,
        rng,
        c,
        r,
        subDir,
        intRange(rng, 1, Math.max(1, length - i - 1)),
        opacity
      );
    }
  }

  addCell(cells, cols, rows, c, r - 1, pick(rng, GLYPHS.coralTips), opacity);
};

const generateCoral = (
  cells: Cell[],
  cols: number,
  rows: number,
  heights: number[],
  rng: Rng
): void => {
  // Background coral: more numerous, shorter, fainter.
  const bgCount = clamp(Math.round(cols / 14), 2, 16);
  for (let i = 0; i < bgCount; i++) {
    const col = intRange(rng, 1, cols - 2);
    drawBranch(
      cells,
      cols,
      rows,
      rng,
      col,
      heights[col],
      0,
      intRange(rng, 3, 7),
      OPACITY.background
    );
  }

  // Foreground coral: fewer, taller, stronger — drawn over the background.
  const fgCount = clamp(Math.round(cols / 26), 1, 10);
  for (let i = 0; i < fgCount; i++) {
    const col = intRange(rng, 2, cols - 3);
    drawBranch(
      cells,
      cols,
      rows,
      rng,
      col,
      heights[col],
      0,
      intRange(rng, 5, 11),
      OPACITY.foreground
    );
  }
};

const generateSeaweed = (
  cols: number,
  heights: number[],
  rng: Rng
): Seaweed[] => {
  const count = clamp(Math.round(cols / 16), 2, 14);
  const seaweed: Seaweed[] = [];

  for (let i = 0; i < count; i++) {
    const col = intRange(rng, 1, cols - 2);
    seaweed.push({
      col,
      baseRow: heights[col],
      height: intRange(rng, 4, 12),
      phase: range(rng, 0, Math.PI * 2),
      swaySpeed: range(rng, 0.4, 0.9),
      swayAmp: range(rng, 0.5, 1.3),
      opacity: OPACITY.midground
    });
  }

  return seaweed;
};

const generateFish = (
  cols: number,
  seabedTop: number,
  waterRows: number,
  rng: Rng
): Fish[] => {
  const count = clamp(Math.round(cols / 26), 3, 10);
  const fish: Fish[] = [];
  const top = waterRows + 2;
  const bottom = Math.max(top + 1, seabedTop - 1);

  for (let i = 0; i < count; i++) {
    const dir = pick(rng, [-1, 1] as const);
    fish.push({
      x: range(rng, 0, cols),
      y: intRange(rng, top, bottom),
      vx: dir * range(rng, 1.4, 3.2),
      glyph: pick(rng, GLYPHS.fish),
      opacity: chance(rng, 0.4) ? OPACITY.fishHighlight : OPACITY.foreground,
      reverseIn: range(rng, 4, 14)
    });
  }

  return fish;
};

const generateParticles = (
  cols: number,
  rows: number,
  seabedTop: number,
  rng: Rng
): Particle[] => {
  const count = clamp(Math.round((cols * rows) / 280), 8, 120);
  const particles: Particle[] = [];

  for (let i = 0; i < count; i++) {
    particles.push({
      x: range(rng, 0, cols),
      y: range(rng, 0, seabedTop),
      vx: range(rng, -0.35, 0.35),
      vy: range(rng, -0.12, 0.12),
      char: pick(rng, GLYPHS.particles),
      opacity: chance(rng, 0.5) ? OPACITY.background : OPACITY.midground
    });
  }

  return particles;
};

const generateBubbles = (
  cols: number,
  heights: number[],
  rng: Rng
): Bubble[] => {
  const columns = clamp(Math.round(cols / 45), 2, 6);
  const bubbles: Bubble[] = [];

  for (let i = 0; i < columns; i++) {
    const col = intRange(rng, 1, cols - 2);
    const baseRow = heights[col] - 1;
    const perColumn = intRange(rng, 2, 4);

    for (let b = 0; b < perColumn; b++) {
      bubbles.push({
        x: col + range(rng, -0.4, 0.4),
        y: range(rng, 0, baseRow),
        vy: range(rng, 1.6, 3.0),
        baseRow,
        char: pick(rng, ['.', '·']),
        opacity: OPACITY.midground
      });
    }
  }

  return bubbles;
};

const generateWater = (cols: number, waterRows: number, rng: Rng): string[] => {
  const pattern: string[] = [];

  for (let r = 0; r < waterRows; r++) {
    let row = '';
    for (let c = 0; c < cols; c++) {
      row += chance(rng, 0.28) ? pick(rng, GLYPHS.water) : ' ';
    }
    pattern.push(row);
  }

  return pattern;
};

export const generateScene = (cols: number, rows: number, rng: Rng): Scene => {
  const staticCells: Cell[] = [];
  const waterRows = 2;

  const heights = generateSeabed(staticCells, cols, rows, rng);
  const seabedTop = Math.min(...heights);

  generateRocks(staticCells, cols, rows, heights, rng);
  generateCoral(staticCells, cols, rows, heights, rng);

  const seaweed = generateSeaweed(cols, heights, rng);
  const fish = generateFish(cols, seabedTop, waterRows, rng);
  const particles = generateParticles(cols, rows, seabedTop, rng);
  const bubbles = generateBubbles(cols, heights, rng);
  const waterPattern = generateWater(cols, waterRows, rng);

  return {
    cols,
    rows,
    seabedTop,
    staticCells,
    seaweed,
    fish,
    particles,
    bubbles,
    waterPattern,
    waterOffset: 0
  };
};
