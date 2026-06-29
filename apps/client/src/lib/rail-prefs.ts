import {
  getLocalStorageItem,
  LocalStorageKey,
  setLocalStorageItem
} from '@/helpers/storage';

/**
 * Client-only rail personalization: the order servers appear in, and per-server
 * local overrides (display name + accent color). Purely cosmetic and local to
 * this device — never sent to any server. (M8)
 */

export type RailCustom = {
  name?: string;
  color?: string;
};

// --- order ---------------------------------------------------------------------

const readOrder = (): string[] => {
  const raw = getLocalStorageItem(LocalStorageKey.RAIL_ORDER);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed.filter((h) => typeof h === 'string')
      : [];
  } catch {
    return [];
  }
};

const getRailOrder = (): string[] => readOrder();

const setRailOrder = (hosts: string[]): void => {
  setLocalStorageItem(LocalStorageKey.RAIL_ORDER, JSON.stringify(hosts));
};

/** Sort a set of hosts by the saved order; unknown hosts keep their input order. */
const sortHostsByOrder = <T extends { host: string }>(
  items: T[],
  order: string[]
): T[] => {
  const index = new Map(order.map((host, i) => [host, i]));

  return [...items].sort((a, b) => {
    const ia = index.has(a.host) ? (index.get(a.host) as number) : Infinity;
    const ib = index.has(b.host) ? (index.get(b.host) as number) : Infinity;

    return ia - ib;
  });
};

// --- per-server custom name / color --------------------------------------------

const readCustom = (): Record<string, RailCustom> => {
  const raw = getLocalStorageItem(LocalStorageKey.RAIL_CUSTOM);

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

const writeCustom = (map: Record<string, RailCustom>): void => {
  setLocalStorageItem(LocalStorageKey.RAIL_CUSTOM, JSON.stringify(map));
};

const getAllRailCustom = (): Record<string, RailCustom> => readCustom();

const getRailCustom = (host: string): RailCustom => readCustom()[host] ?? {};

const setRailCustom = (host: string, custom: RailCustom): void => {
  const map = readCustom();
  const next: RailCustom = {};

  if (custom.name && custom.name.trim()) {
    next.name = custom.name.trim();
  }

  if (custom.color) {
    next.color = custom.color;
  }

  if (Object.keys(next).length === 0) {
    delete map[host];
  } else {
    map[host] = next;
  }

  writeCustom(map);
};

export {
  getAllRailCustom,
  getRailCustom,
  getRailOrder,
  setRailCustom,
  setRailOrder,
  sortHostsByOrder
};
