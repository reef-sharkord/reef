/**
 * Access to the Electron desktop shell bridge (exposed as `window.uncordDesktop`
 * by desktop/src/preload.ts). Returns null in the browser / mobile, so callers
 * can feature-detect "are we running in the desktop app". (UNCORD_PLAN.md M6)
 */
const getDesktopApi = (): UncordDesktopApi | null =>
  typeof window !== 'undefined' ? (window.uncordDesktop ?? null) : null;

const isDesktop = (): boolean => !!getDesktopApi();

export { getDesktopApi, isDesktop };
