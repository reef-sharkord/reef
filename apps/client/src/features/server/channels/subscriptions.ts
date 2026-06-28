import type { ServerSubscriptor } from '@/features/server/subscriptions';
import { runWithActiveStore } from '@/features/store';
import { logDebug } from '@/helpers/browser-logger';
import {
  addChannel,
  removeChannel,
  setChannelPermissions,
  setChannelReadState,
  updateChannel
} from './actions';

const subscribeToChannels: ServerSubscriptor = (trpc, store) => {
  const onChannelCreateSub = trpc.channels.onCreate.subscribe(undefined, {
    onData: (channel) =>
      runWithActiveStore(store, () => {
        logDebug('[EVENTS] channels.onCreate', { channel });
        addChannel(channel);
      }),
    onError: (err) => console.error('onChannelCreate subscription error:', err)
  });

  const onChannelDeleteSub = trpc.channels.onDelete.subscribe(undefined, {
    onData: (channelId) =>
      runWithActiveStore(store, () => {
        logDebug('[EVENTS] channels.onDelete', { channelId });
        removeChannel(channelId);
      }),
    onError: (err) => console.error('onChannelDelete subscription error:', err)
  });

  const onChannelUpdateSub = trpc.channels.onUpdate.subscribe(undefined, {
    onData: (channel) =>
      runWithActiveStore(store, () => {
        logDebug('[EVENTS] channels.onUpdate', { channel });
        updateChannel(channel.id, channel);
      }),
    onError: (err) => console.error('onChannelUpdate subscription error:', err)
  });

  const onChannelPermissionsUpdateSub =
    trpc.channels.onPermissionsUpdate.subscribe(undefined, {
      onData: (data) =>
        runWithActiveStore(store, () => {
          logDebug('[EVENTS] channels.onPermissionsUpdate', { data });
          setChannelPermissions(data);
        }),
      onError: (err) =>
        console.error('onChannelPermissionsUpdate subscription error:', err)
    });

  const onChannelReadStatesUpdateSub =
    trpc.channels.onReadStateUpdate.subscribe(undefined, {
      onData: (data) =>
        runWithActiveStore(store, () => {
          logDebug('[EVENTS] channels.onReadStateUpdate', { data });
          setChannelReadState(data.channelId, data);
        }),
      onError: (err) =>
        console.error('onChannelReadStatesUpdate subscription error:', err)
    });

  const onChannelReadStatesDeltaSub = trpc.channels.onReadStateDelta.subscribe(
    undefined,
    {
      onData: (data) =>
        runWithActiveStore(store, () => {
          logDebug('[EVENTS] channels.onReadStateDelta', { data });
          setChannelReadState(data.channelId, data);
        }),
      onError: (err) =>
        console.error('onChannelReadStatesDelta subscription error:', err)
    }
  );

  return () => {
    onChannelCreateSub.unsubscribe();
    onChannelDeleteSub.unsubscribe();
    onChannelUpdateSub.unsubscribe();
    onChannelPermissionsUpdateSub.unsubscribe();
    onChannelReadStatesUpdateSub.unsubscribe();
    onChannelReadStatesDeltaSub.unsubscribe();
  };
};

export { subscribeToChannels };
