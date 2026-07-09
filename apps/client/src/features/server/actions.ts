import { Dialog } from '@/components/dialogs/dialogs';
import { logDebug } from '@/helpers/browser-logger';
import {
  getFileUrl,
  getHostFromServer,
  getUrlForHost
} from '@/helpers/get-file-url';
import { isStandalone } from '@/helpers/standalone';
import { setRestoringSavedServers } from '@/lib/boot-state';
import {
  closeConnection,
  getActiveConnection,
  getActiveHost,
  getConnection,
  openConnection,
  setActiveHost,
  setConnectionMeta
} from '@/lib/connections';
import { getRailOrder, sortHostsByOrder } from '@/lib/rail-prefs';
import { fetchReefFeatures } from '@/lib/reef-features';
import { setupMutePrefsSync } from '@/lib/reef-prefs-sync';
import {
  fetchPresences,
  PRESENCE_POLL_MS,
  setOwnPresence
} from '@/lib/reef-presence';
import {
  getSavedServers,
  removeSavedServer,
  upsertSavedServer,
  type SavedServer
} from '@/lib/saved-servers';
import { cleanup, connectToTRPC, getTRPCClient } from '@/lib/trpc';
import type { TMessageJumpToTarget } from '@/types';
import { type TPublicServerSettings, type TServerInfo } from '@sharkord/shared';
import { toast } from 'sonner';
import { appSliceActions } from '../app/slice';
import { openDialog } from '../dialogs/actions';
import { getActiveStore, runWithActiveStore, store } from '../store';
import {
  channelReadStateByIdSelector,
  isChannelTextVisibleByIdSelector
} from './channels/selectors';
import {
  processPluginComponents,
  setPluginCommands,
  setPluginComponents
} from './plugins/actions';
import { infoSelector } from './selectors';
import { serverSliceActions } from './slice';
import { type TDisconnectInfo } from './types';

export const setConnected = (status: boolean) => {
  store.dispatch(serverSliceActions.setConnected(status));
};

/**
 * Set (or clear, with empty text) your custom status on the ACTIVE server,
 * then refresh the presence map so the change shows immediately instead of
 * waiting for the next poll. (REEF)
 */
export const updateOwnPresence = async (text: string): Promise<boolean> => {
  const ok = await setOwnPresence(text);

  if (ok) {
    const presences = await fetchPresences(getTRPCClient());
    store.dispatch(serverSliceActions.setPresences(presences));
  }

  return ok;
};

export const resetServerState = () => {
  store.dispatch(serverSliceActions.resetState());
};

export const setDisconnectInfo = (info: TDisconnectInfo | undefined) => {
  store.dispatch(serverSliceActions.setDisconnectInfo(info));
};

export const setConnecting = (status: boolean) => {
  store.dispatch(serverSliceActions.setConnecting(status));
};

export const setServerId = (id: string) => {
  store.dispatch(serverSliceActions.setServerId(id));
};

export const setDmsOpen = (open: boolean) => {
  store.dispatch(serverSliceActions.setDmsOpen(open));
};

export const setPublicServerSettings = (
  settings: TPublicServerSettings | undefined
) => {
  store.dispatch(serverSliceActions.setPublicSettings(settings));
};

export const setInfo = (info: TServerInfo | undefined) => {
  store.dispatch(serverSliceActions.setInfo(info));
};

export const setActiveFullscreenPluginId = (pluginId: string | undefined) => {
  store.dispatch(serverSliceActions.setActiveFullscreenPluginId(pluginId));
};

export const connect = async () => {
  const state = store.getState();
  const info = infoSelector(state);

  if (!info) {
    throw new Error('Failed to fetch server info');
  }

  const { serverId } = info;

  const host = getHostFromServer();
  const trpc = await connectToTRPC(host);

  // record rail metadata for the primary server (name + icon from its info).
  setConnectionMeta(host, {
    name: info.name,
    iconUrl: info.logo ? getFileUrl(info.logo) : null
  });

  const { hasPassword, handshakeHash } = await trpc.others.handshake.query();

  if (hasPassword) {
    // show password prompt
    openDialog(Dialog.SERVER_PASSWORD, { handshakeHash, serverId });
    return;
  }

  const { showWelcomeDialog } = await joinServer(
    handshakeHash,
    undefined,
    host
  );

  if (showWelcomeDialog) {
    openDialog(Dialog.WELCOME_PROFILE_SETUP);
  }
};

export const joinServer = async (
  handshakeHash: string,
  password?: string,
  // The server being joined. Bind every dispatch/subscription/bundle-load to
  // THIS connection rather than whatever is active when an await resolves, so a
  // server switch mid-join (e.g. during launch restore) can't bind one server's
  // data into another's store. Defaults to the active server (the password-
  // dialog path, where the just-targeted server is active). (review fix)
  host?: string
) => {
  const targetHost = host ?? getActiveHost() ?? undefined;
  const connection = targetHost ? getConnection(targetHost) : undefined;
  const trpc = connection?.trpc ?? getTRPCClient();
  const targetStore = connection?.store ?? getActiveStore();

  const data = await trpc.others.joinServer.query({ handshakeHash, password });

  logDebug('joinServer', data);

  const { initSubscriptions } = await import('./subscriptions');

  // Bind the subscriptions to this connection and store their teardown ON the
  // connection entry, so closing a given server disposes exactly its own
  // subscriptions — not whichever server happened to join last (the previous
  // module-global behaviour misfired when active ≠ last-joined).
  const boundConnection = connection ?? getActiveConnection();
  const unsubscribe = initSubscriptions(connection ?? undefined);

  if (boundConnection) {
    boundConnection.subscriptionUnsub();
    boundConnection.subscriptionUnsub = unsubscribe;
  }

  runWithActiveStore(targetStore, () => {
    store.dispatch(serverSliceActions.setInitialData(data));
    setPluginCommands(data.commands);
  });

  const components = await processPluginComponents(
    data.pluginIdsWithComponents,
    targetHost
  );

  runWithActiveStore(targetStore, () => {
    setPluginComponents(components);
  });

  // Ask this server's reef plugin which REEF features it allows here
  // (fire-and-forget: the defaults apply until the answer lands, and the
  // dispatch is bound to THIS server's store like everything else above).
  void fetchReefFeatures(trpc, data.pluginsMetadata).then((features) => {
    runWithActiveStore(targetStore, () => {
      store.dispatch(serverSliceActions.setReefFeatures(features));
    });

    if (!features.presence) {
      return;
    }

    // Presence transport is a slow poll (plugins can't push to clients).
    // The interval's teardown is chained onto this connection's subscription
    // teardown so closing the server also stops its poll. Guard against the
    // connection having closed while the features fetch was in flight.
    const boundHost = targetHost ?? getActiveHost();
    const liveConnection = boundHost ? getConnection(boundHost) : undefined;

    if (!liveConnection) {
      return;
    }

    const refreshPresences = async () => {
      const presences = await fetchPresences(trpc);

      runWithActiveStore(targetStore, () => {
        store.dispatch(serverSliceActions.setPresences(presences));
      });
    };

    void refreshPresences();

    const presenceInterval = setInterval(() => {
      void refreshPresences();
    }, PRESENCE_POLL_MS);

    const previousUnsub = liveConnection.subscriptionUnsub;

    liveConnection.subscriptionUnsub = () => {
      clearInterval(presenceInterval);
      previousUnsub();
    };
  });

  // Mute sync (muted channels + server mute) through this server's reef
  // plugin, so one user's desktop and phone converge: reconcile on join, slow
  // pull afterwards, debounced push on local change (lib/reef-prefs-sync).
  const syncHost = targetHost ?? getActiveHost();

  if (syncHost && data.pluginsMetadata.some((p) => p.pluginId === 'reef')) {
    setupMutePrefsSync(trpc, syncHost);
  }

  return {
    showWelcomeDialog: data.showWelcomeDialog
  };
};

export type TAddServerParams = {
  host: string;
  identity: string;
  password: string;
  autoLogin?: boolean;
  invite?: string;
};

export type TAddServerResult =
  | { ok: true }
  | { ok: false; errors: Record<string, string> };

const iconUrlForHost = (url: string, info: TServerInfo): string | null =>
  info.logo ? `${url}/public/${info.logo.name}` : null;

/**
 * Open a connection to `host` with an already-obtained `token` and run the
 * normal handshake + join flow. Shared by `addServer` (after a fresh login) and
 * `reconnectSavedServer` (using a persisted token). openConnection makes the
 * host active and gives it its own store, so every dispatch below lands in that
 * server's store. (UNCORD_PLAN.md §3.1/§3.2)
 */
const joinAddedHost = async (
  host: string,
  token: string,
  info: TServerInfo,
  url: string
): Promise<TAddServerResult> => {
  openConnection(host, { token });

  // a freshly-created server store starts with appLoading/loadingPlugins=true
  // (the boot loadApp flow only runs for the primary). Clear them so routing
  // shows this server instead of a stuck loading screen.
  store.dispatch(appSliceActions.setAppLoading(false));
  store.dispatch(appSliceActions.setLoadingPlugins(false));

  setConnectionMeta(host, {
    name: info.name,
    iconUrl: iconUrlForHost(url, info)
  });

  setInfo(info);

  const trpc = getTRPCClient();
  const { hasPassword, handshakeHash } = await trpc.others.handshake.query();

  if (hasPassword) {
    openDialog(Dialog.SERVER_PASSWORD, {
      handshakeHash,
      serverId: info.serverId
    });

    return { ok: true };
  }

  const { showWelcomeDialog } = await joinServer(
    handshakeHash,
    undefined,
    host
  );

  if (showWelcomeDialog) {
    openDialog(Dialog.WELCOME_PROFILE_SETUP);
  }

  return { ok: true };
};

/**
 * Add (connect to) an arbitrary server host for the multi-server rail: fetch its
 * /info, log in for a per-host token, then connect + join. On success the server
 * is persisted so the rail restores it on the next launch. (M1 step 4 / M3)
 */
export const addServer = async (
  params: TAddServerParams
): Promise<TAddServerResult> => {
  const { host, identity, password, autoLogin, invite } = params;
  const url = getUrlForHost(host);

  const infoResponse = await fetch(`${url}/info`);

  if (!infoResponse.ok) {
    throw new Error('Failed to fetch server info');
  }

  const info = (await infoResponse.json()) as TServerInfo;

  const loginResponse = await fetch(`${url}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identity,
      password,
      invite,
      autoLogin: autoLogin || undefined
    })
  });

  if (!loginResponse.ok) {
    const data = await loginResponse.json();

    return { ok: false, errors: data.errors ?? {} };
  }

  const { token } = (await loginResponse.json()) as { token: string };

  const result = await joinAddedHost(host, token, info, url);

  if (result.ok) {
    upsertSavedServer({
      host,
      name: info.name,
      iconUrl: iconUrlForHost(url, info),
      token
    });
  }

  return result;
};

/**
 * Reconnect a previously-saved secondary server on launch using its persisted
 * token (no login round-trip). Failures are swallowed: an unreachable server or
 * an expired token simply leaves the entry saved so the user can retry later,
 * and never blocks the rest of the rail from loading. (M3)
 */
export const reconnectSavedServer = async (
  saved: SavedServer
): Promise<void> => {
  // A 'closed' entry is a soft-disconnected leftover (unclean drop) whose
  // socket can never reopen; openConnection rebuilds it, so only a live
  // connection short-circuits the reconnect.
  const existing = getConnection(saved.host);

  if (existing && existing.status !== 'closed') {
    return;
  }

  try {
    const url = getUrlForHost(saved.host);
    // Cap the probe so one dead/unreachable server can't hang the whole boot
    // restore for the OS's TCP timeout (~30s) while the boot screen waits.
    const infoResponse = await fetch(`${url}/info`, {
      signal: AbortSignal.timeout(8_000)
    });

    if (!infoResponse.ok) {
      return;
    }

    const info = (await infoResponse.json()) as TServerInfo;

    await joinAddedHost(saved.host, saved.token, info, url);
  } catch {
    // token expired / server down — keep it saved and move on.
  }
};

// Guards one-time restore across re-renders / React StrictMode remounts.
let savedServersRestored = false;

/**
 * Restore all saved secondary servers, sequentially in RAIL ORDER (top of the
 * rail first), then land the user on the primary (browser) or the topmost
 * connected server (standalone). Runs once. Called after the primary's
 * auto-login attempt settles so the primary claims the bootstrap store first
 * and we never interleave joins. The standalone boot landing screen covers
 * this whole phase and shows each server's progress. (M3, reworked M9)
 */
export const restoreSavedServers = async () => {
  if (savedServersRestored) {
    return;
  }

  savedServersRestored = true;

  const primaryHost = getHostFromServer();
  const saved = sortHostsByOrder(
    getSavedServers().filter((s) => s.host !== primaryHost),
    getRailOrder()
  );

  // Signal the boot phase so the standalone shells can show the boot landing
  // screen instead of flashing the empty Welcome while the rail reconnects.
  if (saved.length > 0) {
    setRestoringSavedServers(true);
  }

  try {
    for (const server of saved) {
      await reconnectSavedServer(server);
    }

    // Land the user deliberately: the primary server if it is connected
    // (browser), otherwise the topmost connected rail server (standalone) —
    // never whichever server happened to be restored last.
    if (getConnection(primaryHost)) {
      setActiveHost(primaryHost);
    } else {
      const topConnected = saved.find((server) => {
        const conn = getConnection(server.host);

        return conn && conn.status !== 'closed';
      });

      if (topConnected) {
        setActiveHost(topConnected.host);
      }
    }
  } finally {
    setRestoringSavedServers(false);
  }
};

/**
 * Reconnect every saved server whose connection dropped uncleanly (mobile 1006
 * on backgrounding, Wi-Fi flap) using its persisted token. Called by the
 * foreground-resume controller when the app returns to the foreground — in the
 * native shells there is no "primary" server (window.location is the app
 * itself), so this is THE resume path there. Keeps whichever server the user
 * was viewing active. (UNCORD_PLAN.md §3.6)
 */
export const resumeDroppedServers = async (): Promise<void> => {
  const viewedHost = getActiveHost();
  const dropped = getSavedServers().filter(
    (saved) => getConnection(saved.host)?.status === 'closed'
  );

  if (dropped.length === 0) {
    return;
  }

  // The rejoins steal active focus one by one (openConnection makes each host
  // active), which used to flash the plain loading screen when tabbing back in
  // after a long background stint (tester feedback, 2026-07-09). When the
  // server the user was viewing is itself dropped — the long-background case —
  // cover the whole resume with the same landing screen as boot. A quick tab
  // switch with live sockets never reaches this point (dropped is empty), and
  // a background-only flap keeps the veil away from an actively-used UI.
  const viewedDropped =
    !viewedHost || dropped.some((saved) => saved.host === viewedHost);
  const showVeil = isStandalone() && viewedDropped;

  if (showVeil) {
    setRestoringSavedServers(true);
  }

  try {
    for (const saved of sortHostsByOrder(dropped, getRailOrder())) {
      await reconnectSavedServer(saved);
    }

    // reconnectSavedServer activates each host as it joins; give focus back to
    // the server the user was actually looking at.
    if (viewedHost && getConnection(viewedHost)) {
      setActiveHost(viewedHost);
    }
  } finally {
    if (showVeil) {
      setRestoringSavedServers(false);
    }
  }
};

/**
 * Remove a server from the rail: tear down its connection and drop it from the
 * persisted list so it does not come back on the next launch. (M3)
 */
export const removeServer = (host: string) => {
  removeSavedServer(host);
  closeConnection(host);
};

export const disconnectFromServer = () => {
  // cleanup() closes the active connection; closeConnection disposes that
  // connection's own subscriptions (entry.subscriptionUnsub), so there is no
  // separate module-global unsubscribe to call.
  cleanup();
};

export const jumpToMessage = (target: TMessageJumpToTarget) => {
  store.dispatch(appSliceActions.setMessageJumpTarget(target));

  if (target.isDm) {
    setDmsOpen(true);
    store.dispatch(appSliceActions.setSelectedDmChannelId(target.channelId));

    return;
  }

  setDmsOpen(false);
  store.dispatch(appSliceActions.setSelectedDmChannelId(undefined));
  store.dispatch(serverSliceActions.setSelectedChannelId(target.channelId));

  const state = store.getState();

  if (isChannelTextVisibleByIdSelector(state, target.channelId)) {
    markChannelAsRead(target.channelId);
  }
};

export const markChannelAsRead = (
  channelId: number,
  force: boolean = false
) => {
  const state = store.getState();
  const unreadCount = channelReadStateByIdSelector(state, channelId);

  if (!force && unreadCount === 0) {
    return;
  }

  if (unreadCount > 0) {
    store.dispatch(
      serverSliceActions.setChannelReadState({ channelId, count: 0 })
    );
  }

  const trpc = getTRPCClient();

  try {
    trpc.channels.markAsRead.mutate({ channelId });
  } catch {
    // ignore errors
  }
};

window.useToken = async (token: string) => {
  const trpc = getTRPCClient();

  try {
    await trpc.others.useSecretToken.mutate({ token });

    toast.success('You are now an owner of this server');
  } catch {
    toast.error('Invalid access token');
  }
};

window.openSoundsModal = () => {
  openDialog(Dialog.SOUNDS);
};
