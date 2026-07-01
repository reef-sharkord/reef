/**
 * Tiny seeded PRNG (mulberry32). A random seed per page load makes every reef
 * unique; a fixed seed makes a reef reproducible, which keeps `scene.ts`
 * deterministic and unit-testable.
 */

export type Rng = () => number;

export const createRng = (seed: number): Rng => {
  let a = seed >>> 0;

  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const randomSeed = (): number =>
  Math.floor(Math.random() * 0xffffffff) >>> 0;

/** Float in [min, max). */
export const range = (rng: Rng, min: number, max: number): number =>
  min + rng() * (max - min);

/** Integer in [min, max] (inclusive). */
export const intRange = (rng: Rng, min: number, max: number): number =>
  Math.floor(min + rng() * (max - min + 1));

export const pick = <T>(rng: Rng, items: readonly T[]): T =>
  items[Math.floor(rng() * items.length)];

export const chance = (rng: Rng, probability: number): boolean =>
  rng() < probability;
