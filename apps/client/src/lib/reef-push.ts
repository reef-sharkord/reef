import { reefFeaturesSelector } from '@/features/server/selectors';
import { getNativePlugin } from '@/helpers/native';
import {
  getLocalStorageItem,
  LocalStorageKey,
  setLocalStorageItem
} from '@/helpers/storage';
import { getConnection, getRailServers } from '@/lib/connections';

/**
 * Push notifications — the SERVER admin picks the delivery method (reef
 * plugin `pushMethod`), and this module registers whatever handle that method
 * needs with each connected push-enabled server:
 *  - ntfy/webhook: one private random topic per device (128 bits, never shown
 *    to other users, registered over the authenticated tRPC channel). For
 *    ntfy the user subscribes once in the ntfy app.
 *  - fcm: the device's Firebase registration token — only obtainable when the
 *    APK was built with a google-services.json (official REEF builds are
 *    not; this path exists for self-hosters who build their own app against
 *    their own Firebase project).
 * While the app is alive, local notifications from the live socket cover
 * everything; push is for the killed-app case.
 */

export type TPushRegistration = {
  host: string;
  serverName: string;
  // set only for the ntfy method — webhook servers deliver through the
  // admin's own infrastructure, so there is nothing to subscribe to
  ntfyServerUrl?: string;
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

type PushInfoResponse = {
  ok?: boolean;
  method?: string;
  ntfyServerUrl?: string;
};

type RegisterResponse = {
  ok?: boolean;
};

// The FCM device token, if this build can produce one (needs the Firebase
// messaging plugin compiled in AND a google-services.json baked into the APK).
const getFcmToken = async (): Promise<string | undefined> => {
  const messaging = getNativePlugin('FirebaseMessaging');

  if (!messaging) {
    return undefined;
  }

  try {
    await messaging.requestPermissions?.();

    const result = (await messaging.getToken?.()) as
      | { token?: string }
      | undefined;

    return result?.token || undefined;
  } catch {
    return undefined; // no Firebase config in this build
  }
};

/**
 * Register this device's push handle with every connected push-enabled server
 * that hasn't been registered this session. Safe to call repeatedly.
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
      // Ask the server which method it uses — it decides what we register.
      const info = (await conn.trpc.plugins.executeAction.mutate({
        pluginId: 'reef',
        actionName: 'getPushInfo'
      })) as PushInfoResponse | undefined;

      if (!info?.ok || !info.method || info.method === 'off') {
        continue;
      }

      const topic =
        info.method === 'fcm' ? await getFcmToken() : getOrCreatePushTopic();

      if (!topic) {
        continue; // fcm server but this build has no Firebase config
      }

      const res = (await conn.trpc.plugins.executeAction.mutate({
        pluginId: 'reef',
        actionName: 'registerPushTopic',
        payload: { topic }
      })) as RegisterResponse | undefined;

      if (res?.ok) {
        registrations.set(server.host, {
          host: server.host,
          serverName: server.name,
          ntfyServerUrl:
            info.method === 'ntfy'
              ? info.ntfyServerUrl || 'https://ntfy.sh'
              : undefined
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
