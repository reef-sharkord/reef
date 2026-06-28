import { runWithActiveStore, type ServerStore } from '@/features/store';
import { logDebug } from '@/helpers/browser-logger';
import { getActiveConnection, type TRPCClient } from '@/lib/connections';
import { type TPublicServerSettings } from '@sharkord/shared';
import { setPublicServerSettings } from './actions';
import { subscribeToCategories } from './categories/subscriptions';
import { subscribeToChannels } from './channels/subscriptions';
import { subscribeToEmojis } from './emojis/subscriptions';
import { subscribeToMessages } from './messages/subscriptions';
import { subscribeToPlugins } from './plugins/subscriptions';
import { subscribeToRoles } from './roles/subscriptions';
import { subscribeToUsers } from './users/subscriptions';
import { subscribeToVoice } from './voice/subscriptions';

/**
 * Each subscriptor is bound to a specific server's tRPC client + store. Event
 * handlers run via `runWithActiveStore(store, ...)` so their dispatches land in
 * the originating server's store even when another server is active in the UI.
 * See UNCORD_PLAN.md §3.2.
 */
export type ServerSubscriptor = (
  trpc: TRPCClient,
  store: ServerStore
) => () => void;

const subscribeToServer: ServerSubscriptor = (trpc, store) => {
  const onSettingsUpdateSub = trpc.others.onServerSettingsUpdate.subscribe(
    undefined,
    {
      onData: (settings: TPublicServerSettings) =>
        runWithActiveStore(store, () => {
          logDebug('[EVENTS] others.onServerSettingsUpdate', { settings });
          setPublicServerSettings(settings);
        }),
      onError: (err) =>
        console.error('onSettingsUpdate subscription error:', err)
    }
  );

  return () => {
    onSettingsUpdateSub.unsubscribe();
  };
};

const initSubscriptions = (
  // The connection to bind subscriptions to. Pass it explicitly (not the active
  // one) so a join that resolves after the active server changed still binds to
  // the server it was joining. (review fix)
  connection?: { trpc: TRPCClient; store: ServerStore }
) => {
  const target = connection ?? getActiveConnection();

  if (!target) {
    throw new Error('Cannot init subscriptions without an active connection');
  }

  const { trpc, store } = target;

  const subscriptors: ServerSubscriptor[] = [
    subscribeToChannels,
    subscribeToServer,
    subscribeToEmojis,
    subscribeToRoles,
    subscribeToUsers,
    subscribeToMessages,
    subscribeToVoice,
    subscribeToCategories,
    subscribeToPlugins
  ];

  const unsubscribes = subscriptors.map((subscriptor) =>
    subscriptor(trpc, store)
  );

  return () => {
    unsubscribes.forEach((unsubscribe) => unsubscribe());
  };
};

export { initSubscriptions };
