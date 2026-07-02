import {
  getLocalStorageItem,
  LocalStorageKey,
  setLocalStorageItem
} from '@/helpers/storage';

/**
 * Client-only appearance personalization: an accent color (overrides the
 * --primary token used by buttons, active rings, badges) and a UI text scale.
 * Applied by writing to documentElement so it affects the whole app. Theme
 * (light/dark/system) stays in ThemeProvider. (M8)
 */

export type Appearance = {
  accent?: string; // CSS color; undefined = theme default
  textScale?: number; // percent, 100 = default
  // Top-bar button visibility; absent = shown. The features stay reachable
  // (Ctrl/Cmd+P for the quick switcher) when their buttons are hidden.
  showSavedMessages?: boolean;
  showQuickSwitch?: boolean;
};

export const ACCENT_PRESETS: { name: string; value: string }[] = [
  { name: 'Reef', value: '#ea580c' },
  { name: 'Coral', value: '#f43f5e' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Kelp', value: '#22c55e' },
  { name: 'Lagoon', value: '#06b6d4' },
  { name: 'Deep', value: '#3b82f6' },
  { name: 'Anemone', value: '#8b5cf6' },
  { name: 'Urchin', value: '#ec4899' }
];

export const TEXT_SCALE_MIN = 85;
export const TEXT_SCALE_MAX = 120;

const read = (): Appearance => {
  const raw = getLocalStorageItem(LocalStorageKey.APPEARANCE);

  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);

    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const getAppearance = (): Appearance => read();

/** Apply the current appearance to the document root. Idempotent. */
const applyAppearance = (): void => {
  const a = read();
  const root = document.documentElement;

  if (a.accent) {
    root.style.setProperty('--primary', a.accent);
  } else {
    root.style.removeProperty('--primary');
  }

  if (a.textScale && a.textScale !== 100) {
    root.style.fontSize = `${a.textScale}%`;
  } else {
    root.style.fontSize = '';
  }
};

// Components that render from these prefs (the top bar) subscribe here so a
// toggle in settings applies immediately, without a reload.
const listeners = new Set<() => void>();

const subscribeAppearance = (listener: () => void): (() => void) => {
  listeners.add(listener);

  return () => listeners.delete(listener);
};

/** Stable snapshot for useSyncExternalStore: the raw stored string. */
const getAppearanceRaw = (): string =>
  getLocalStorageItem(LocalStorageKey.APPEARANCE) ?? '';

const setAppearance = (patch: Appearance): void => {
  const next = { ...read(), ...patch };

  // Drop defaults so the stored object stays clean.
  if (!next.accent) {
    delete next.accent;
  }

  if (!next.textScale || next.textScale === 100) {
    delete next.textScale;
  }

  if (next.showSavedMessages !== false) {
    delete next.showSavedMessages;
  }

  if (next.showQuickSwitch !== false) {
    delete next.showQuickSwitch;
  }

  setLocalStorageItem(LocalStorageKey.APPEARANCE, JSON.stringify(next));
  applyAppearance();
  listeners.forEach((listener) => listener());
};

export {
  applyAppearance,
  getAppearance,
  getAppearanceRaw,
  setAppearance,
  subscribeAppearance
};
