import { assertNotificationsPermission } from '@/helpers/assert-notifications-permission';
import { getFileUrl, getUrlFromServer } from '@/helpers/get-file-url';
import { isStandalone } from '@/helpers/standalone';
import { LocalStorageKey, setLocalStorageItemBool } from '@/helpers/storage';
import { getActiveHost } from '@/lib/connections';
import {
  getNotifPrefsOverride,
  setNotifPref,
  type TNotifPrefKey
} from '@/lib/notification-prefs';
import {
  getVoiceChatSidebarPref,
  setVoiceChatSidebarPref,
  type TVoiceChatSidebarPref
} from '@/lib/voice-chat-prefs';
import type { TMessageJumpToTarget } from '@/types';
import type { TServerInfo } from '@sharkord/shared';
import { toast } from 'sonner';
import { markChannelAsRead, setInfo } from '../server/actions';
import { store, type ServerStore } from '../store';
import {
  pluginSlotDebugSelector,
  voiceChatChannelIdSelector,
  voiceChatSidebarDataSelector
} from './selectors';
import { appSliceActions } from './slice';

export const setAppLoading = (loading: boolean) =>
  store.dispatch(appSliceActions.setAppLoading(loading));

export const setIsAutoConnecting = (isAutoConnecting: boolean) =>
  store.dispatch(appSliceActions.setIsAutoConnecting(isAutoConnecting));

export const setPluginsLoading = (loading: boolean) =>
  store.dispatch(appSliceActions.setLoadingPlugins(loading));

const setOrCreateMeta = (name: string, content: string) => {
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);

  if (!el) {
    el = document.createElement('meta');
    el.name = name;
    document.head.appendChild(el);
  }

  el.content = content;
};

const setOrCreateLink = (rel: string, href: string) => {
  let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);

  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    document.head.appendChild(el);
  }

  el.href = href;
};

const applyServerBranding = (info: TServerInfo) => {
  document.title = info.name;

  const logoUrl = info.logo
    ? getFileUrl(info.logo)
    : `${getUrlFromServer()}/favicon.ico`;

  setOrCreateLink('icon', logoUrl);
  setOrCreateLink('apple-touch-icon', logoUrl);
  setOrCreateMeta('apple-mobile-web-app-title', info.name);
};

export const fetchServerInfo = async (): Promise<TServerInfo | undefined> => {
  try {
    const url = getUrlFromServer();
    const response = await fetch(`${url}/info`);

    if (!response.ok) {
      throw new Error('Failed to fetch server info');
    }

    const data = await response.json();

    return data;
  } catch (error) {
    console.error('Error fetching server info:', error);
  }
};

export const loadApp = async () => {
  if (isStandalone()) {
    // Native shells have no primary server — boot straight to the rail and let
    // the user add/restore servers. (UNCORD_PLAN.md M6/M7)
    setAppLoading(false);
    return;
  }

  const info = await fetchServerInfo();

  if (!info) {
    console.error('Failed to load server info during app load');
    toast.error('Failed to load server info');
    return;
  }

  setInfo(info);
  applyServerBranding(info);
  setAppLoading(false);
};

export const setModViewOpen = (isOpen: boolean, userId?: number) =>
  store.dispatch(
    appSliceActions.setModViewOpen({
      modViewOpen: isOpen,
      userId
    })
  );

export const openThreadSidebar = (parentMessageId: number, channelId: number) =>
  store.dispatch(
    appSliceActions.setThreadSidebarOpen({
      open: true,
      parentMessageId,
      channelId
    })
  );

export const closeThreadSidebar = () =>
  store.dispatch(
    appSliceActions.setThreadSidebarOpen({
      open: false,
      parentMessageId: undefined,
      channelId: undefined
    })
  );

export const resetApp = () => {
  store.dispatch(
    appSliceActions.setModViewOpen({
      modViewOpen: false,
      userId: undefined
    })
  );
  store.dispatch(
    appSliceActions.setThreadSidebarOpen({
      open: false,
      parentMessageId: undefined,
      channelId: undefined
    })
  );
};

export const setAutoJoinLastChannel = (autoJoin: boolean) => {
  store.dispatch(appSliceActions.setAutoJoinLastChannel(autoJoin));

  setLocalStorageItemBool(LocalStorageKey.AUTO_JOIN_LAST_CHANNEL, autoJoin);
};

export const setSelectedDmChannelId = (channelId: number | undefined) =>
  store.dispatch(appSliceActions.setSelectedDmChannelId(channelId));

// Persist a notification pref as a per-host override for the active server, so
// each server's notification settings are independent. Falls back to the legacy
// global key when there's no active host. (UNCORD_PLAN.md §3.5, M4)
const persistNotifPref = (
  key: TNotifPrefKey,
  legacyKey: LocalStorageKey,
  enabled: boolean
) => {
  const host = getActiveHost();

  if (host) {
    setNotifPref(host, key, enabled);
  } else {
    setLocalStorageItemBool(legacyKey, enabled);
  }
};

/**
 * Apply a host's per-server notification override into its store on connect.
 * Hosts without an override keep the global defaults the slice already seeded.
 */
export const applyNotificationPrefs = (host: string, target: ServerStore) => {
  const override = getNotifPrefsOverride(host);

  if (!override) {
    return;
  }

  if (override.browserNotifications !== undefined) {
    target.dispatch(
      appSliceActions.setBrowserNotifications(override.browserNotifications)
    );
  }
  if (override.browserNotificationsForMentions !== undefined) {
    target.dispatch(
      appSliceActions.setBrowserNotificationsForMentions(
        override.browserNotificationsForMentions
      )
    );
  }
  if (override.browserNotificationsForDms !== undefined) {
    target.dispatch(
      appSliceActions.setBrowserNotificationsForDms(
        override.browserNotificationsForDms
      )
    );
  }
  if (override.browserNotificationsForReplies !== undefined) {
    target.dispatch(
      appSliceActions.setBrowserNotificationsForReplies(
        override.browserNotificationsForReplies
      )
    );
  }
};

export const setBrowserNotifications = async (enabled: boolean) => {
  if (enabled) {
    await assertNotificationsPermission();
  }

  store.dispatch(appSliceActions.setBrowserNotifications(enabled));
  persistNotifPref(
    'browserNotifications',
    LocalStorageKey.BROWSER_NOTIFICATIONS,
    enabled
  );
};

export const setBrowserNotificationsForMentions = async (enabled: boolean) => {
  if (enabled) {
    await assertNotificationsPermission();
  }

  store.dispatch(appSliceActions.setBrowserNotificationsForMentions(enabled));
  persistNotifPref(
    'browserNotificationsForMentions',
    LocalStorageKey.BROWSER_NOTIFICATIONS_FOR_MENTIONS,
    enabled
  );
};

export const setBrowserNotificationsForDms = async (enabled: boolean) => {
  if (enabled) {
    await assertNotificationsPermission();
  }

  store.dispatch(appSliceActions.setBrowserNotificationsForDms(enabled));
  persistNotifPref(
    'browserNotificationsForDms',
    LocalStorageKey.BROWSER_NOTIFICATIONS_FOR_DMS,
    enabled
  );
};

export const setBrowserNotificationsForReplies = async (enabled: boolean) => {
  if (enabled) {
    await assertNotificationsPermission();
  }

  store.dispatch(appSliceActions.setBrowserNotificationsForReplies(enabled));
  persistNotifPref(
    'browserNotificationsForReplies',
    LocalStorageKey.BROWSER_NOTIFICATIONS_FOR_REPLIES,
    enabled
  );
};

export const setMessageJumpTarget = (
  payload: TMessageJumpToTarget | undefined
) => store.dispatch(appSliceActions.setMessageJumpTarget(payload));

// Persist the voice-chat sidebar state for the active host so it survives a
// reload without bleeding into other servers' stores.
const persistVoiceChatSidebar = (pref: TVoiceChatSidebarPref) => {
  const host = getActiveHost();

  if (host) {
    setVoiceChatSidebarPref(host, pref);
  }
};

/**
 * Apply a host's persisted voice-chat sidebar state into its store on connect,
 * so each server independently reopens (or not) its own voice channel's chat.
 * Hosts without a persisted entry keep the slice default (closed).
 */
export const applyVoiceChatSidebar = (host: string, target: ServerStore) => {
  const pref = getVoiceChatSidebarPref(host);

  if (!pref) {
    return;
  }

  target.dispatch(
    appSliceActions.setVoiceChatSidebar({
      open: pref.open,
      channelId: pref.channelId
    })
  );
};

export const openVoiceChatSidebar = (channelId: number) => {
  store.dispatch(
    appSliceActions.setVoiceChatSidebar({ open: true, channelId })
  );

  markChannelAsRead(channelId);
  persistVoiceChatSidebar({ open: true, channelId });
};

export const closeVoiceChatSidebar = () => {
  const state = store.getState();
  const voiceChatChannelId = voiceChatChannelIdSelector(state);

  store.dispatch(
    appSliceActions.setVoiceChatSidebar({
      open: false,
      channelId: voiceChatChannelId
    })
  );

  persistVoiceChatSidebar({ open: false, channelId: voiceChatChannelId });
};

export const toggleVoiceChatSidebar = (channelId: number) => {
  const state = store.getState();
  const { isOpen, channelId: voiceChatChannelId } =
    voiceChatSidebarDataSelector(state);

  const isSameChannel = voiceChatChannelId === channelId;

  if (isOpen && isSameChannel) {
    closeVoiceChatSidebar();
  } else {
    openVoiceChatSidebar(channelId);
  }
};

export const assertVoiceChatClose = (channelId: number) => {
  const state = store.getState();
  const { isOpen, channelId: voiceChatChannelId } =
    voiceChatSidebarDataSelector(state);

  if (isOpen && voiceChatChannelId === channelId) {
    closeVoiceChatSidebar();
  }
};

export const togglePluginSlotDebug = () => {
  const state = store.getState();
  const current = pluginSlotDebugSelector(state);
  const next = !current;

  store.dispatch(appSliceActions.setPluginSlotDebug(next));
  setLocalStorageItemBool(LocalStorageKey.PLUGIN_SLOT_DEBUG, next);
};

export const setModifierKeysHeldMap = (keysDown: Record<string, boolean>) => {
  store.dispatch(appSliceActions.setModifierKeysHeldMap(keysDown));
};
