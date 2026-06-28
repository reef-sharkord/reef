import type { ServerSubscriptor } from '@/features/server/subscriptions';
import { runWithActiveStore } from '@/features/store';
import { logDebug } from '@/helpers/browser-logger';
import {
  processPluginComponents,
  setPluginCommands,
  setPluginComponents,
  setPluginsMetadata
} from './actions';

const subscribeToPlugins: ServerSubscriptor = (trpc, store) => {
  const onCommandsChangeSub = trpc.plugins.onCommandsChange.subscribe(
    undefined,
    {
      onData: (data) =>
        runWithActiveStore(store, () => {
          logDebug('[EVENTS] plugins.onCommandsChange', { data });
          setPluginCommands(data);
        }),
      onError: (err) =>
        console.error('onCommandsChange subscription error:', err)
    }
  );

  const onComponentsChangeSub = trpc.plugins.onComponentsChange.subscribe(
    undefined,
    {
      onData: async (data) => {
        const components = await processPluginComponents(data);

        runWithActiveStore(store, () => {
          logDebug('[EVENTS] plugins.onComponentsChange', { data, components });
          setPluginComponents(components);
        });
      },
      onError: (err) =>
        console.error('onComponentsChange subscription error:', err)
    }
  );

  const onMetadataChangeSub = trpc.plugins.onMetadataChange.subscribe(
    undefined,
    {
      onData: (data) =>
        runWithActiveStore(store, () => {
          logDebug('[EVENTS] plugins.onMetadataChange', { data });
          setPluginsMetadata(data);
        }),
      onError: (err) =>
        console.error('onMetadataChange subscription error:', err)
    }
  );

  return () => {
    onCommandsChangeSub.unsubscribe();
    onComponentsChangeSub.unsubscribe();
    onMetadataChangeSub.unsubscribe();
  };
};

export { subscribeToPlugins };
