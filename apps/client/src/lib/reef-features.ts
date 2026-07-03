import type { TRPCClient } from '@/lib/connections';
import type { TPluginMetadata } from '@sharkord/shared';

/**
 * REEF feature switchboard (client side).
 *
 * Each connected server's `reef` plugin decides which REEF features are allowed
 * there — one admin toggle per feature (see plugins/reef). After joining a
 * server we ask its plugin via the `getFeatures` action and store the answer in
 * that server's own store, so the same client can e.g. show the GIF button on
 * one server and hide it on another. A server without the plugin has expressed
 * no policy: client-only features default on (they work fine without server
 * support), server-backed ones default off (they can't work).
 */
export type TReefFeatures = {
  // server-backed: without the plugin (and its API keys) these cannot work
  gifs: boolean;
  reports: boolean;
  presence: boolean;
  push: boolean;
  // client-only: work everywhere, the toggle is a server policy signal
  soundboard: boolean;
  savedMessages: boolean;
};

export const DEFAULT_REEF_FEATURES: TReefFeatures = {
  gifs: false,
  reports: false,
  presence: false,
  push: false,
  soundboard: true,
  savedMessages: true
};

type GetFeaturesResponse = {
  ok?: boolean;
  features?: Partial<TReefFeatures>;
};

export const fetchReefFeatures = async (
  trpc: TRPCClient,
  pluginsMetadata: TPluginMetadata[]
): Promise<TReefFeatures> => {
  const hasReef = pluginsMetadata.some((p) => p.pluginId === 'reef');

  if (!hasReef) {
    return DEFAULT_REEF_FEATURES;
  }

  try {
    const res = (await trpc.plugins.executeAction.mutate({
      pluginId: 'reef',
      actionName: 'getFeatures'
    })) as GetFeaturesResponse | undefined;

    if (res?.ok && res.features) {
      return { ...DEFAULT_REEF_FEATURES, ...res.features };
    }

    return DEFAULT_REEF_FEATURES;
  } catch {
    // Older reef plugin without getFeatures / no permission — no policy.
    return DEFAULT_REEF_FEATURES;
  }
};
