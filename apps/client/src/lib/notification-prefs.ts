import {
  getLocalStorageItem,
  LocalStorageKey,
  setLocalStorageItem
} from '@/helpers/storage';

/**
 * Per-host notification preference overrides.
 *
 * The app slice seeds notification prefs from the legacy *global* localStorage
 * keys at load, so every server store starts identical. To make each server's
 * notifications independent (M4: "toggling one server's notifications does not
 * affect another's"), we persist per-host overrides here. On connect the
 * registry applies a host's override into that server's store; the settings UI
 * writes the override for the active host. Servers without an override keep the
 * global default. (UNCORD_PLAN.md §3.5)
 */
export type TNotifPrefs = {
  browserNotifications: boolean;
  browserNotificationsForMentions: boolean;
  browserNotificationsForDms: boolean;
  browserNotificationsForReplies: boolean;
};

export type TNotifPrefKey = keyof TNotifPrefs;

type PrefMap = Record<string, Partial<TNotifPrefs>>;

const readMap = (): PrefMap => {
  const raw = getLocalStorageItem(LocalStorageKey.NOTIFICATION_PREFS);

  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);

    return parsed && typeof parsed === 'object' ? (parsed as PrefMap) : {};
  } catch {
    return {};
  }
};

const writeMap = (map: PrefMap) => {
  setLocalStorageItem(LocalStorageKey.NOTIFICATION_PREFS, JSON.stringify(map));
};

/** The per-host override for `host`, or null if it has none (use global). */
const getNotifPrefsOverride = (host: string): Partial<TNotifPrefs> | null => {
  const entry = readMap()[host];

  return entry && Object.keys(entry).length > 0 ? entry : null;
};

const setNotifPref = (host: string, key: TNotifPrefKey, value: boolean) => {
  const map = readMap();

  map[host] = { ...(map[host] ?? {}), [key]: value };
  writeMap(map);
};

// --- mute change listeners -------------------------------------------------
// reef-prefs-sync pushes mute changes to the host's reef plugin (device sync);
// the rail re-renders its mute badge. Listeners get the host that changed.
type MuteListener = (host: string) => void;

const muteListeners = new Set<MuteListener>();

const subscribeMutePrefs = (listener: MuteListener): (() => void) => {
  muteListeners.add(listener);

  return () => {
    muteListeners.delete(listener);
  };
};

const notifyMuteChanged = (host: string) => {
  muteListeners.forEach((listener) => listener(host));
};

// --- per-server mute -----------------------------------------------------------
// A muted server suppresses notification popups + ping sounds for that server,
// independent of the granular notification prefs. Stored as a host list.
const MUTED_KEY = LocalStorageKey.MUTED_SERVERS;

const readMuted = (): string[] => {
  const raw = getLocalStorageItem(MUTED_KEY);

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

const isServerMuted = (host: string): boolean => readMuted().includes(host);

const setServerMuted = (host: string, muted: boolean) => {
  const current = readMuted().filter((h) => h !== host);

  if (muted) {
    current.push(host);
  }

  setLocalStorageItem(MUTED_KEY, JSON.stringify(current));
  notifyMuteChanged(host);
};

// --- per-channel mute ----------------------------------------------------------
// Same idea, keyed by "host:channelId" so a single noisy channel can be silenced
// without muting its whole server.
const MUTED_CHANNELS_KEY = LocalStorageKey.MUTED_CHANNELS;

const channelKey = (host: string, channelId: number) => `${host}:${channelId}`;

const readMutedChannels = (): string[] => {
  const raw = getLocalStorageItem(MUTED_CHANNELS_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed.filter((k) => typeof k === 'string')
      : [];
  } catch {
    return [];
  }
};

const isChannelMuted = (host: string, channelId: number): boolean =>
  readMutedChannels().includes(channelKey(host, channelId));

/** All muted channel ids for `host` — seeds the host store's muted list. */
const getMutedChannelIds = (host: string): number[] =>
  readMutedChannels()
    .filter((k) => k.startsWith(`${host}:`))
    .map((k) => Number(k.slice(host.length + 1)))
    .filter((id) => Number.isFinite(id));

const setChannelMuted = (host: string, channelId: number, muted: boolean) => {
  const key = channelKey(host, channelId);
  const current = readMutedChannels().filter((k) => k !== key);

  if (muted) {
    current.push(key);
  }

  setLocalStorageItem(MUTED_CHANNELS_KEY, JSON.stringify(current));
  notifyMuteChanged(host);
};

export {
  getMutedChannelIds,
  getNotifPrefsOverride,
  isChannelMuted,
  isServerMuted,
  setChannelMuted,
  setNotifPref,
  setServerMuted,
  subscribeMutePrefs
};
