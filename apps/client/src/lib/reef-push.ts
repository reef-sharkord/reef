import { reefFeaturesSelector } from '@/features/server/selectors';
import {
  getLocalStorageItem,
  LocalStorageKey,
  setLocalStorageItem
} from '@/helpers/storage';
import { getConnection, getRailServers } from '@/lib/connections';

/**
 * Push notifications via ntfy (https://ntfy.sh) — deliberately NO
 * Firebase/Google services. This device generates one private random ntfy
 * topic and registers it with every connected server whose reef plugin has
 * push enabled; the plugin publishes DM/@mention notifications to that topic
 * for *offline* users, and the ntfy app (subscribed to the topic) displays
 * them. While the app is alive, local notifications from the live socket
 * cover everything instead.
 *
 * The topic name is the only secret — it's 128 bits of randomness, never
 * shown to other users, and registered over the authenticated tRPC channel.
 */

export type TPushRegistration = {
  host: string;
  serverName: string;
  ntfyServerUrl: string;
};

// host -> registration result for this session (drives the settings UI).
const registrations = new Map<string, TPushRegistration>();
const listeners = new Set<() => void>();
let snapshot: TPushRegistration[] = [];

const notify = () => {
  snapshot = Array.from(registrations.values());
  listeners.forEach((listener) => listener());
};

const subscribePushRegistrations = (listener: () => void): (() => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

const getPushRegistrations = (): TPushRegistration[] => snapshot;

const getOrCreatePushTopic = (): string => {
  const existing = getLocalStorageItem(LocalStorageKey.NTFY_TOPIC);

  if (existing) {
    return existing;
  }

  const bytes = new Uint8Array(16);

  crypto.getRandomValues(bytes);

  const topic = `reef-${Array.from(bytes, (b) =>
    b.toString(16).padStart(2, '0')
  ).join('')}`;

  setLocalStorageItem(LocalStorageKey.NTFY_TOPIC, topic);

  return topic;
};

type RegisterResponse = {
  ok?: boolean;
  ntfyServerUrl?: string;
};

/**
 * Register this device's topic with every connected push-enabled server that
 * hasn't been registered this session. Safe to call repeatedly.
 */
const registerPushTopicWithServers = async (): Promise<void> => {
  for (const server of getRailServers()) {
    if (server.status !== 'open' || registrations.has(server.host)) {
      continue;
    }

    const conn = getConnection(server.host);

    if (!conn || !reefFeaturesSelector(conn.store.getState()).push) {
      continue;
    }

    try {
      const res = (await conn.trpc.plugins.executeAction.mutate({
        pluginId: 'reef',
        actionName: 'registerPushTopic',
        payload: { topic: getOrCreatePushTopic() }
      })) as RegisterResponse | undefined;

      if (res?.ok) {
        registrations.set(server.host, {
          host: server.host,
          serverName: server.name,
          ntfyServerUrl: res.ntfyServerUrl || 'https://ntfy.sh'
        });
        notify();
      }
    } catch {
      // plugin missing/erroring — retried on the next tick
    }
  }
};

export {
  getOrCreatePushTopic,
  getPushRegistrations,
  registerPushTopicWithServers,
  subscribePushRegistrations
};
