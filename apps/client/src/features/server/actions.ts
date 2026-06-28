import { Dialog } from '@/components/dialogs/dialogs';
import { logDebug } from '@/helpers/browser-logger';
import {
  getFileUrl,
  getHostFromServer,
  getUrlForHost
} from '@/helpers/get-file-url';
import { openConnection, setConnectionMeta } from '@/lib/connections';
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

/**
 * Add (connect to) an arbitrary server host for the multi-server rail: fetch its
 * /info, log in for a per-host token, open a connection (which becomes active
 * and gives it its own store), then run the normal handshake + join flow. The
 * join dispatches land in the new server's store because openConnection made it
 * active. (UNCORD_PLAN.md §3.1/§3.2, M1 step 4)
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

  // open the connection (becomes active + seeds its token), then record its
  // display metadata and info into its now-active store.
  openConnection(host, { token });

  // a freshly-created server store starts with appLoading/loadingPlugins=true
  // (the boot loadApp flow only runs for the primary). Clear them so routing
  // shows this server instead of a stuck loading screen.
  store.dispatch(appSliceActions.setAppLoading(false));
  store.dispatch(appSliceActions.setLoadingPlugins(false));

  setConnectionMeta(host, {
    name: info.name,
    iconUrl: info.logo ? `${url}/public/${info.logo.name}` : null
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
