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
 * no policy: everything defaults to on (client-only features work fine without
 * server support).
 */
export type TReefFeatures = {
  gifs: boolean;
  soundboard: boolean;
  savedMessages: boolean;
  // server-backed features default OFF: without the plugin they cannot work
  reports: boolean;
  presence: boolean;
};

export const DEFAULT_REEF_FEATURES: TReefFeatures = {
  gifs: true,
  soundboard: true,
  savedMessages: true,
  reports: false,
  presence: false
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
