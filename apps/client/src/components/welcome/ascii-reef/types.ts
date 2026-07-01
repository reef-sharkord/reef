/** A single placed glyph in the static grid (seabed, rocks, coral). */
export type Cell = {
  col: number;
  row: number;
  char: string;
  opacity: number;
};

/** A fish swimming across the water column. `x`/`y` are float cell coords. */
export type Fish = {
  x: number;
  y: number;
  vx: number; // cells/sec, signed (sign = facing direction)
  glyph: string;
  opacity: number;
  reverseIn: number; // seconds until it may reverse
};

/** A drifting speck of plankton. */
export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  char: string;
  opacity: number;
};

/** A single rising bubble. Bubbles belong to columns and respawn at the base. */
export type Bubble = {
  x: number;
  y: number;
  vy: number; // cells/sec, upward (positive = rising)
  baseRow: number;
  char: string;
  opacity: number;
};

/** A strand of kelp rooted at the seabed that sways horizontally. */
export type Seaweed = {
  col: number;
  baseRow: number;
  height: number;
  phase: number;
  swaySpeed: number;
  swayAmp: number; // cells
  opacity: number;
};

export type Scene = {
  cols: number;
  rows: number;
  seabedTop: number;
  staticCells: Cell[];
  seaweed: Seaweed[];
  fish: Fish[];
  particles: Particle[];
  bubbles: Bubble[];
  waterPattern: string[]; // one row-string per water-surface row (spaces = gaps)
  waterOffset: number; // horizontal drift, in cells
};
