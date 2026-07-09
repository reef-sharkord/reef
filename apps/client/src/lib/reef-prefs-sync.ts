import { serverSliceActions } from '@/features/server/slice';
import {
  getLocalStorageItem,
  LocalStorageKey,
  setLocalStorageItem
} from '@/helpers/storage';
import { getConnection, type TRPCClient } from '@/lib/connections';
import {
  getMutedChannelIds,
  isServerMuted,
  setChannelMuted,
  setServerMuted,
  subscribeMutePrefs
} from '@/lib/notification-prefs';

/**
 * Mute sync between one user's own devices, through each server's reef plugin
 * (tester request, 2026-07-09). Mutes are per-server data anyway, so each
 * server stores its own user's mute blob — nothing crosses servers.
 *
 * Model: the whole per-server mute set (muted channels + server mute) is one
 * opaque blob with one updatedAt stamp, last-write-wins. The blob is pulled on
 * join and on a slow poll (so a mute made on the desktop shows up on the phone
 * within a minute), and pushed debounced whenever a mute changes locally. The
 * plugin rejects stale writes, in which case we pull instead — the newest
 * change always survives, and a simultaneous change on two devices loses the
 * older one (fine for a single person's mutes).
 *
 * Servers without the reef plugin (or with sync disabled / no USE_PLUGINS)
 * simply keep device-local mutes: every failure here is silent by design.
 */

type TSyncedBlob = {
  v: 1;
  mutedChannels: number[];
  serverMuted: boolean;
};

type TGetPrefsResponse = {
  ok?: boolean;
  blob?: string | null;
  updatedAt?: number | null;
};

type TSetPrefsResponse = {
  ok?: boolean;
  reason?: string;
};

const PUSH_DEBOUNCE_MS = 1_500;
export const PREFS_PULL_MS = 60_000;

// --- per-host updatedAt of the LOCAL state ----------------------------------
const readMeta = (): Record<string, number> => {
  const raw = getLocalStorageItem(LocalStorageKey.SYNCED_PREFS_META);

  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);

    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, number>)
      : {};
  } catch {
    return {};
  }
};

const getLocalUpdatedAt = (host: string): number => {
  const value = readMeta()[host];

  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
};

const setLocalUpdatedAt = (host: string, updatedAt: number) => {
  const meta = readMeta();

  meta[host] = updatedAt;
  setLocalStorageItem(LocalStorageKey.SYNCED_PREFS_META, JSON.stringify(meta));
};

// --- blob <-> local mute state ----------------------------------------------
const buildBlob = (host: string): string =>
  JSON.stringify({
    v: 1,
    mutedChannels: getMutedChannelIds(host),
    serverMuted: isServerMuted(host)
  } satisfies TSyncedBlob);

// True while WE are writing remote state into the local prefs, so the mute
// listener doesn't bounce the same change straight back to the server.
let applyingRemote = false;

const applyBlob = (host: string, raw: string) => {
  let parsed: TSyncedBlob;

  try {
    parsed = JSON.parse(raw) as TSyncedBlob;
  } catch {
    return;
  }

  if (!parsed || parsed.v !== 1) {
    return;
  }

  const remoteMuted = new Set(
    (Array.isArray(parsed.mutedChannels) ? parsed.mutedChannels : []).filter(
      (id): id is number => Number.isFinite(id)
    )
  );

  applyingRemote = true;

  try {
    for (const channelId of getMutedChannelIds(host)) {
      if (!remoteMuted.has(channelId)) {
        setChannelMuted(host, channelId, false);
      }
    }

    for (const channelId of remoteMuted) {
      setChannelMuted(host, channelId, true);
    }

    setServerMuted(host, !!parsed.serverMuted);
  } finally {
    applyingRemote = false;
  }

  // Refresh the host store's reactive muted list (badges, channel icons).
  getConnection(host)?.store.dispatch(
    serverSliceActions.setMutedChannelIds(getMutedChannelIds(host))
  );
};

// --- talking to the plugin ---------------------------------------------------
const executePrefsAction = async <T>(
  trpc: TRPCClient,
  actionName: string,
  payload?: Record<string, unknown>
): Promise<T | undefined> => {
  try {
    return (await trpc.plugins.executeAction.mutate({
      pluginId: 'reef',
      actionName,
      payload
    })) as T;
  } catch {
    return undefined; // no plugin / no permission / transport error — all fine
  }
};

const pushPrefs = async (host: string): Promise<void> => {
  const conn = getConnection(host);

  if (!conn || conn.status === 'closed') {
    return;
  }

  const res = await executePrefsAction<TSetPrefsResponse>(
    conn.trpc,
    'setSyncedPrefs',
    { blob: buildBlob(host), updatedAt: getLocalUpdatedAt(host) }
  );

  // Another device wrote something newer while we were offline-editing:
  // adopt it instead of fighting.
  if (res && !res.ok && res.reason === 'stale') {
    await pullPrefs(conn.trpc, host);
  }
};

const pullPrefs = async (trpc: TRPCClient, host: string): Promise<void> => {
  const res = await executePrefsAction<TGetPrefsResponse>(
    trpc,
    'getSyncedPrefs'
  );

  if (!res?.ok) {
    return;
  }

  const remoteAt = typeof res.updatedAt === 'number' ? res.updatedAt : 0;
  const localAt = getLocalUpdatedAt(host);

  if (res.blob && remoteAt > localAt) {
    applyBlob(host, res.blob);
    setLocalUpdatedAt(host, remoteAt);
    return;
  }

  if (localAt > remoteAt) {
    await pushPrefs(host);
    return;
  }

  // Server has nothing and this device never stamped its state, but it HAS
  // pre-sync local mutes: claim them as the baseline so they propagate.
  if (
    !res.blob &&
    localAt === 0 &&
    (getMutedChannelIds(host).length > 0 || isServerMuted(host))
  ) {
    setLocalUpdatedAt(host, Date.now());
    await pushPrefs(host);
  }
};

// --- wiring -------------------------------------------------------------------
let listenerInstalled = false;
const pushTimers = new Map<string, ReturnType<typeof setTimeout>>();

const installMuteListener = () => {
  if (listenerInstalled) {
    return;
  }

  listenerInstalled = true;

  subscribeMutePrefs((host) => {
    if (applyingRemote) {
      return;
    }

    setLocalUpdatedAt(host, Date.now());
    clearTimeout(pushTimers.get(host));
    pushTimers.set(
      host,
      setTimeout(() => {
        void pushPrefs(host);
      }, PUSH_DEBOUNCE_MS)
    );
  });
};

/**
 * Start mute sync for a just-joined server: reconcile now, keep pulling on a
 * slow tick (torn down with the connection's own subscriptions), and push
 * local changes debounced. Call only for servers that have the reef plugin.
 */
export const setupMutePrefsSync = (trpc: TRPCClient, host: string): void => {
  installMuteListener();

  void pullPrefs(trpc, host);

  const conn = getConnection(host);

  if (!conn) {
    return;
  }

  const pullInterval = setInterval(() => {
    void pullPrefs(trpc, host);
  }, PREFS_PULL_MS);

  const previousUnsub = conn.subscriptionUnsub;

  conn.subscriptionUnsub = () => {
    clearInterval(pullInterval);
    previousUnsub();
  };
};
