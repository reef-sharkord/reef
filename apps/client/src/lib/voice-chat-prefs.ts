import {
  getLocalStorageItem,
  LocalStorageKey,
  setLocalStorageItem
} from '@/helpers/storage';

/**
 * Per-host voice-chat sidebar state.
 *
 * The voice-chat sidebar shows the text chat of a *voice channel*, keyed by
 * that channel's id. Channel ids are per-server, so this state cannot be shared
 * across servers: previously it lived in a single global localStorage key, which
 * seeded every server's store with the same id and made the sidebar bleed
 * between servers (opening the wrong — or a non-existent — channel when you
 * switched). We persist it per-host instead and seed each server's store from
 * its own entry on connect, mirroring the per-host notification prefs.
 */
export type TVoiceChatSidebarPref = {
  open: boolean;
  channelId?: number;
};

type PrefMap = Record<string, TVoiceChatSidebarPref>;

const readMap = (): PrefMap => {
  const raw = getLocalStorageItem(LocalStorageKey.VOICE_CHAT_SIDEBAR);

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
  setLocalStorageItem(LocalStorageKey.VOICE_CHAT_SIDEBAR, JSON.stringify(map));
};

/** The persisted sidebar state for `host`, or null if it has none. */
const getVoiceChatSidebarPref = (
  host: string
): TVoiceChatSidebarPref | null => {
  const entry = readMap()[host];

  return entry && entry.channelId !== undefined ? entry : null;
};

const setVoiceChatSidebarPref = (
  host: string,
  pref: TVoiceChatSidebarPref
): void => {
  const map = readMap();

  map[host] = pref;
  writeMap(map);
};

export { getVoiceChatSidebarPref, setVoiceChatSidebarPref };
