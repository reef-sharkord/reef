import { pluginsMetadataSelector } from '@/features/server/plugins/selectors';
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
 *
 * Every rail server gets a status — not just the successes — so the settings
 * UI can always show WHY push isn't working on a server (plugin missing, push
 * turned off, no USE_PLUGINS permission, …) instead of silently hiding
 * (tester feedback, 2026-07-08).
 */

export type TPushStatus =
  // registered with the server; push will be delivered
  | 'registered'
  // the server doesn't have the reef plugin installed
  | 'no-plugin'
  // reef plugin present but the admin hasn't enabled a push method
  | 'push-off'
  // the user's role lacks USE_PLUGINS, so the plugin can't be reached
  | 'no-permission'
  // server uses FCM but this build has no Firebase config
  | 'fcm-unavailable'
  // unexpected failure — retried on the next tick
  | 'error';

export type TPushRegistration = {
  host: string;
  serverName: string;
  status: TPushStatus;
  // set only for successfully registered ntfy servers — webhook servers
  // deliver through the admin's own infrastructure, nothing to subscribe to
  ntfyServerUrl?: string;
};

// host -> latest status (drives the settings UI).
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

const setStatus = (
  host: string,
  serverName: string,
  status: TPushStatus,
  ntfyServerUrl?: string
) => {
  const prev = registrations.get(host);

  if (
    prev?.status === status &&
    prev.serverName === serverName &&
    prev.ntfyServerUrl === ntfyServerUrl
  ) {
    return;
  }

  registrations.set(host, { host, serverName, status, ntfyServerUrl });
  notify();
};

/**
 * Register this device's push handle with every connected server that isn't
 * registered yet, recording a diagnosable status per server. Safe to call
 * repeatedly — failures are retried on the caller's next tick.
 */
const registerPushTopicWithServers = async (): Promise<void> => {
  const railHosts = new Set<string>();

  for (const server of getRailServers()) {
    railHosts.add(server.host);

    if (server.status !== 'open') {
      continue;
    }

    if (registrations.get(server.host)?.status === 'registered') {
      continue;
    }

    const conn = getConnection(server.host);

    if (!conn) {
      continue;
    }

    const hasReef = pluginsMetadataSelector(conn.store.getState()).some(
      (p) => p.pluginId === 'reef'
    );

    if (!hasReef) {
      setStatus(server.host, server.name, 'no-plugin');
      continue;
    }

    try {
      // Ask the server which method it uses — it decides what we register.
      const info = (await conn.trpc.plugins.executeAction.mutate({
        pluginId: 'reef',
        actionName: 'getPushInfo'
      })) as PushInfoResponse | undefined;

      if (!info?.ok || !info.method || info.method === 'off') {
        setStatus(server.host, server.name, 'push-off');
        continue;
      }

      const topic =
        info.method === 'fcm' ? await getFcmToken() : getOrCreatePushTopic();

      if (!topic) {
        setStatus(server.host, server.name, 'fcm-unavailable');
        continue;
      }

      const res = (await conn.trpc.plugins.executeAction.mutate({
        pluginId: 'reef',
        actionName: 'registerPushTopic',
        payload: { topic }
      })) as RegisterResponse | undefined;

      if (res?.ok) {
        setStatus(
          server.host,
          server.name,
          'registered',
          info.method === 'ntfy'
            ? info.ntfyServerUrl || 'https://ntfy.sh'
            : undefined
        );
      } else {
        setStatus(server.host, server.name, 'error');
      }
    } catch (err) {
      // FORBIDDEN = the role lacks USE_PLUGINS — the #1 silent setup trap.
      const message = err instanceof Error ? err.message : String(err);

      setStatus(
        server.host,
        server.name,
        message.includes('FORBIDDEN') || message.includes('permission')
          ? 'no-permission'
          : 'error'
      );
    }
  }

  // Servers removed from the rail shouldn't linger in the settings UI.
  let removed = false;

  for (const host of registrations.keys()) {
    if (!railHosts.has(host)) {
      registrations.delete(host);
      removed = true;
    }
  }

  if (removed) {
    notify();
  }
};

export {
  getOrCreatePushTopic,
  getPushRegistrations,
  registerPushTopicWithServers,
  subscribePushRegistrations
};
