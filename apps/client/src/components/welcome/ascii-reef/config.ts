/**
 * Static configuration for the ASCII reef backdrop: the glyph library, palette,
 * per-depth opacities, responsive font sizing, and animation constants. All
 * values trace back to ASCII_Reef_Background_Spec.md.
 */

export const PALETTE = {
  background: '#2C2B2B',
  foreground: '#ED6500'
} as const;

/** Opacity by depth (0..1). Further-back layers are fainter. */
export const OPACITY = {
  background: 0.08,
  midground: 0.15,
  foreground: 0.25,
  fishHighlight: 0.35
} as const;

/** Only these glyphs may appear, grouped by scene element. */
export const GLYPHS = {
  water: ['~', '-', '`', '.'],
  particles: ['.', '·', ',', "'"],
  fish: ['><>', '><((°>', '><(((°>', '<>'],
  seaweed: ['(', ')', '}', '{'],
  coral: ['/', '\\', '|', 'Y', 'V', '<', '>', '*', '+', '#'],
  coralTips: ['*', '+', '#', 'Y', 'V'],
  rocks: ['░', '▒', '▓', '█']
} as const;

export const FONT_STACK =
  "'JetBrains Mono', 'IBM Plex Mono', 'Fira Code', 'Cascadia Mono', monospace";

/** Cell height as a multiple of font size (tight, per spec). */
export const LINE_HEIGHT = 0.9;

export const TARGET_FPS = 30;
export const FRAME_INTERVAL_MS = 1000 / TARGET_FPS;

/**
 * Font size by viewport width. The character grid is then derived from the
 * container size so the reef fills the screen at a consistent glyph density
 * (rather than stretching a fixed grid). Representative desktop result is the
 * spec's ~180x55 grid.
 */
export const fontSizeForWidth = (width: number): number => {
  if (width < 640) {
    return 8; // mobile
  }
  if (width < 1024) {
    return 10; // tablet
  }
  return 11; // desktop
};
