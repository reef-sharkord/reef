import { describe, expect, it } from 'bun:test';
import { GLYPHS } from './config';
import { createRng } from './rng';
import { generateScene } from './scene';

const allowedStatic = new Set<string>([...GLYPHS.rocks, ...GLYPHS.coral]);

describe('generateScene', () => {
  it('produces a scene at the requested grid size', () => {
    const scene = generateScene(180, 55, createRng(1));
    expect(scene.cols).toBe(180);
    expect(scene.rows).toBe(55);
  });

  it('keeps the seabed near the bottom', () => {
    const scene = generateScene(180, 55, createRng(7));
    expect(scene.seabedTop).toBeGreaterThanOrEqual(55 - 12);
    expect(scene.seabedTop).toBeLessThanOrEqual(55 - 4);
  });

  it('places every static cell inside the grid', () => {
    const scene = generateScene(120, 45, createRng(3));
    for (const cell of scene.staticCells) {
      expect(cell.col).toBeGreaterThanOrEqual(0);
      expect(cell.col).toBeLessThan(scene.cols);
      expect(cell.row).toBeGreaterThanOrEqual(0);
      expect(cell.row).toBeLessThan(scene.rows);
    }
  });

  it('only uses allowed glyphs', () => {
    const scene = generateScene(180, 55, createRng(9));
    for (const cell of scene.staticCells) {
      expect(allowedStatic.has(cell.char)).toBe(true);
    }
    const fishGlyphs: readonly string[] = GLYPHS.fish;
    for (const fish of scene.fish) {
      expect(fishGlyphs.includes(fish.glyph)).toBe(true);
    }
  });

  it('spawns fish within the configured range', () => {
    const scene = generateScene(180, 55, createRng(11));
    expect(scene.fish.length).toBeGreaterThanOrEqual(4);
    expect(scene.fish.length).toBeLessThanOrEqual(14);
  });

  it('is deterministic for a given seed', () => {
    const a = generateScene(100, 40, createRng(42));
    const b = generateScene(100, 40, createRng(42));
    expect(a.staticCells.length).toBe(b.staticCells.length);
    expect(a.fish.length).toBe(b.fish.length);
    expect(a.seabedTop).toBe(b.seabedTop);
  });
});
