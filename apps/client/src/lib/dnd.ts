import {
  getLocalStorageItem,
  LocalStorageKey,
  setLocalStorageItem
} from '@/helpers/storage';

/**
 * Do-Not-Disturb + scheduled quiet hours. When active, notification popups and
 * ping sounds are suppressed everywhere (unread badges still accrue). Client-only.
 * Times are minutes-of-day in local time; a window where start > end wraps over
 * midnight. (M8)
 */

export type Dnd = {
  enabled: boolean;
  quietEnabled: boolean;
  start: number; // minutes of day
  end: number; // minutes of day
};

const DEFAULTS: Dnd = {
  enabled: false,
  quietEnabled: false,
  start: 22 * 60, // 22:00
  end: 8 * 60 // 08:00
};

const read = (): Dnd => {
  const raw = getLocalStorageItem(LocalStorageKey.DND_SETTINGS);

  if (!raw) {
    return { ...DEFAULTS };
  }

  try {
    const parsed = JSON.parse(raw);

    return { ...DEFAULTS, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  } catch {
    return { ...DEFAULTS };
  }
};

const getDnd = (): Dnd => read();

const setDnd = (patch: Partial<Dnd>): Dnd => {
  const next = { ...read(), ...patch };
  setLocalStorageItem(LocalStorageKey.DND_SETTINGS, JSON.stringify(next));

  return next;
};

const withinQuietHours = (dnd: Dnd): boolean => {
  if (!dnd.quietEnabled) {
    return false;
  }

  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();

  // Same-day window (e.g. 09:00-17:00).
  if (dnd.start <= dnd.end) {
    return minutes >= dnd.start && minutes < dnd.end;
  }

  // Overnight window (e.g. 22:00-08:00).
  return minutes >= dnd.start || minutes < dnd.end;
};

/** Whether notifications should currently be suppressed by DND/quiet hours. */
const isDndActive = (): boolean => {
  const dnd = read();

  return dnd.enabled || withinQuietHours(dnd);
};

const minutesToLabel = (minutes: number): string => {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');

  return `${h}:${m}`;
};

const labelToMinutes = (label: string): number => {
  const [h, m] = label.split(':').map((n) => parseInt(n, 10));

  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

export { getDnd, isDndActive, labelToMinutes, minutesToLabel, setDnd };
