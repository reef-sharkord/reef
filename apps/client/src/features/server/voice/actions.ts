import type { TPinnedCard } from '@/components/channel-view/voice/hooks/use-pin-card-controller';
import { store } from '@/features/store';
import { logVoice } from '@/helpers/browser-logger';
import {
  LocalStorageKey,
  setLocalStorageItem,
  setLocalStorageItemBool
} from '@/helpers/storage';
import { getActiveConnection } from '@/lib/connections';
import {
  clearVoiceConnection,
  getVoiceConnection,
  getVoiceStore,
  getVoiceTRPCClient,
  pinVoiceConnection
} from '@/lib/voice-connection';
import {
  getTrpcError,
  type TExternalStream,
  type TVoiceUserState
} from '@sharkord/shared';
import type { RtpCapabilities } from 'mediasoup-client/types';
import { toast } from 'sonner';
import {
  currentVoiceChannelIdSelector,
  selectedChannelIdSelector
} from '../channels/selectors';
import { serverSliceActions } from '../slice';
import { playSound } from '../sounds/actions';
import { SoundType } from '../types';
import { ownUserIdSelector } from '../users/selectors';
import { ownVoiceStateSelector } from './selectors';

export const addUserToVoiceChannel = (
  userId: number,
  channelId: number,
  voiceState: TVoiceUserState
): void => {
  const state = store.getState();
  const ownUserId = ownUserIdSelector(state);
  const currentChannelId = currentVoiceChannelIdSelector(state);

  store.dispatch(
    serverSliceActions.addUserToVoiceChannel({
      userId,
      channelId,
      state: voiceState
    })
  );

  if (userId !== ownUserId && channelId === currentChannelId) {
    playSound(SoundType.REMOTE_USER_JOINED_VOICE_CHANNEL);
  }
};

export const removeUserFromVoiceChannel = (
  userId: number,
  channelId: number
): void => {
  const state = store.getState();
  const ownUserId = ownUserIdSelector(state);
  const currentChannelId = currentVoiceChannelIdSelector(state);

  store.dispatch(
    serverSliceActions.removeUserFromVoiceChannel({ userId, channelId })
  );

  if (userId !== ownUserId && channelId === currentChannelId) {
    playSound(SoundType.REMOTE_USER_LEFT_VOICE_CHANNEL);
  }
};

export const addExternalStreamToVoiceChannel = (
  channelId: number,
  streamId: number,
  stream: TExternalStream
): void => {
  store.dispatch(
    serverSliceActions.addExternalStreamToChannel({
      channelId,
      streamId,
      stream
    })
  );
};

export const updateExternalStreamInVoiceChannel = (
  channelId: number,
  streamId: number,
  stream: TExternalStream
): void => {
  store.dispatch(
    serverSliceActions.updateExternalStreamInChannel({
      channelId,
      streamId,
      stream
    })
  );
};

export const removeExternalStreamFromVoiceChannel = (
  channelId: number,
  streamId: number
): void => {
  store.dispatch(
    serverSliceActions.removeExternalStreamFromChannel({
      channelId,
      streamId
    })
  );
};

export const updateVoiceUserState = (
  userId: number,
  channelId: number,
  newState: Partial<TVoiceUserState>
): void => {
  const state = store.getState();
  const ownUserId = ownUserIdSelector(state);
  const currentChannelId = currentVoiceChannelIdSelector(state);

  if (userId !== ownUserId && channelId === currentChannelId) {
    const currentUserState = state.server.voiceMap[channelId]?.users[userId];

    if (newState.sharingScreen === true && !currentUserState?.sharingScreen) {
      playSound(SoundType.REMOTE_USER_STARTED_SCREENSHARE);
    } else if (
      newState.sharingScreen === false &&
      currentUserState?.sharingScreen
    ) {
      playSound(SoundType.REMOTE_USER_STOPPED_SCREENSHARE);
    }
  }

  store.dispatch(
    serverSliceActions.updateVoiceUserState({ userId, channelId, newState })
  );
};

export const updateOwnVoiceState = (
  newState: Partial<TVoiceUserState>
): void => {
  // own voice state belongs to the voice-hosting server, so dispatch into its
  // store (falls back to the active store when not in a call). (M2)
  getVoiceStore().dispatch(serverSliceActions.updateOwnVoiceState(newState));
};

export const joinVoice = async (
  channelId: number
): Promise<RtpCapabilities | undefined> => {
  // The voice channel always lives on the server currently in view (the active
  // connection); that server becomes the voice-hosting server.
  const active = getActiveConnection();

  if (!active) {
    return undefined;
  }

  const existingVoice = getVoiceConnection();

  if (existingVoice) {
    const currentChannelId = currentVoiceChannelIdSelector(
      existingVoice.store.getState()
    );

    if (existingVoice.host === active.host && currentChannelId === channelId) {
      // already in this exact channel
      return undefined;
    }

    // global single-voice rule: leave whatever channel we're in first, even if
    // it is on a different server. (UNCORD_PLAN.md §3.4)
    await leaveVoice({ reason: 'switch_channel' });
  }

  // pin the voice session to this server so it keeps targeting it even after
  // the user switches the server they are viewing.
  pinVoiceConnection({
    host: active.host,
    trpc: active.trpc,
    store: active.store
  });

  active.store.dispatch(serverSliceActions.setCurrentVoiceChannelId(channelId));

  const { micMuted, soundMuted } = ownVoiceStateSelector(
    active.store.getState()
  );

  try {
    const { routerRtpCapabilities } = await active.trpc.voice.join.mutate({
      channelId,
      state: { micMuted, soundMuted }
    });

    return routerRtpCapabilities;
  } catch (error) {
    // roll back the optimistic pin + channel selection
    active.store.dispatch(
      serverSliceActions.setCurrentVoiceChannelId(undefined)
    );
    clearVoiceConnection();
    toast.error(getTrpcError(error, 'Failed to join voice channel'));
  }

  return undefined;
};

export type TLeaveVoiceReason =
  | 'user_disconnect_button'
  | 'switch_channel'
  | 'unknown';

export const leaveVoice = async (options?: {
  reason?: TLeaveVoiceReason;
}): Promise<void> => {
  // Operate on the voice-hosting server (which may not be the one in view).
  const voiceStore = getVoiceStore();
  const state = voiceStore.getState();
  const currentChannelId = currentVoiceChannelIdSelector(state);
  const selectedChannelId = selectedChannelIdSelector(state);
  const reason = options?.reason ?? 'unknown';

  if (!currentChannelId) {
    logVoice('Leave voice requested without active channel', { reason });
    clearVoiceConnection();
    return;
  }

  logVoice('Leave voice requested', {
    reason,
    channelId: currentChannelId,
    selectedChannelId
  });

  if (selectedChannelId === currentChannelId) {
    voiceStore.dispatch(serverSliceActions.setSelectedChannelId(undefined));
  }

  voiceStore.dispatch(serverSliceActions.setCurrentVoiceChannelId(undefined));
  voiceStore.dispatch(
    serverSliceActions.updateOwnVoiceState({
      webcamEnabled: false,
      sharingScreen: false
    })
  );
  voiceStore.dispatch(serverSliceActions.setPinnedCard(undefined));

  const client = getVoiceTRPCClient();

  try {
    await client.voice.leave.mutate();
    playSound(SoundType.OWN_USER_LEFT_VOICE_CHANNEL);
  } catch (error) {
    toast.error(getTrpcError(error, 'Failed to leave voice channel'));
  } finally {
    clearVoiceConnection();
  }
};

export const setPinnedCard = (pinnedCard: TPinnedCard | undefined): void => {
  store.dispatch(serverSliceActions.setPinnedCard(pinnedCard));
};

export const setHideNonVideoParticipants = (value: boolean): void => {
  store.dispatch(serverSliceActions.setHideNonVideoParticipants(value));

  try {
    setLocalStorageItem(
      LocalStorageKey.HIDE_NON_VIDEO_PARTICIPANTS,
      String(value)
    );
  } catch (error) {
    console.error('Failed to save voice options:', error);
  }
};

export const setShowUserBannersInVoice = (value: boolean): void => {
  store.dispatch(serverSliceActions.setShowUserBannersInVoice(value));

  try {
    setLocalStorageItemBool(
      LocalStorageKey.VOICE_CHAT_SHOW_USER_BANNERS,
      value
    );
  } catch (error) {
    console.error('Failed to save voice options:', error);
  }
};

export const setHideOwnScreenShare = (value: boolean): void => {
  store.dispatch(serverSliceActions.setHideOwnScreenShare(value));

  try {
    setLocalStorageItemBool(LocalStorageKey.HIDE_OWN_SCREEN_SHARE, value);
  } catch (error) {
    console.error('Failed to save voice options:', error);
  }
};
