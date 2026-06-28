import { Dialog } from '@/components/dialogs/dialogs';
import { logDebug } from '@/helpers/browser-logger';
import {
  getFileUrl,
  getHostFromServer,
  getUrlForHost
} from '@/helpers/get-file-url';
import {
  closeConnection,
  getConnection,
  openConnection,
  setActiveHost,
  setConnectionMeta
} from '@/lib/connections';
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
import { store } from '../store';
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

let unsubscribeFromServer: (() => void) | null = null;

export const setConnected = (status: boolean) => {
  store.dispatch(serverSliceActions.setConnected(status));
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

  const { showWelcomeDialog } = await joinServer(handshakeHash);

  if (showWelcomeDialog) {
    openDialog(Dialog.WELCOME_PROFILE_SETUP);
  }
};

export const joinServer = async (handshakeHash: string, password?: string) => {
  const trpc = getTRPCClient();
  const data = await trpc.others.joinServer.query({ handshakeHash, password });

  logDebug('joinServer', data);

  const { initSubscriptions } = await import('./subscriptions');

  unsubscribeFromServer = initSubscriptions();

  store.dispatch(serverSliceActions.setInitialData(data));

  setPluginCommands(data.commands);

  const components = await processPluginComponents(
    data.pluginIdsWithComponents
  );

  setPluginComponents(components);

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

  const { showWelcomeDialog } = await joinServer(handshakeHash);

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
  if (getConnection(saved.host)) {
    return;
  }

  try {
    const url = getUrlForHost(saved.host);
    const infoResponse = await fetch(`${url}/info`);

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
 * Restore all saved secondary servers, sequentially, then return focus to the
 * primary. Runs once. Called after the primary's auto-login attempt settles so
 * the primary claims the bootstrap store first and we never interleave joins.
 * (M3)
 */
export const restoreSavedServers = async () => {
  if (savedServersRestored) {
    return;
  }

  savedServersRestored = true;

  const primaryHost = getHostFromServer();
  const saved = getSavedServers().filter((s) => s.host !== primaryHost);

  for (const server of saved) {
    await reconnectSavedServer(server);
  }

  // land the user on the primary server if it is connected, rather than on
  // whichever secondary happened to be restored last.
  if (getConnection(primaryHost)) {
    setActiveHost(primaryHost);
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
  cleanup();
  unsubscribeFromServer?.();
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
