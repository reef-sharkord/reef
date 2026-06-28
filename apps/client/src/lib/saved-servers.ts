import {
  getLocalStorageItem,
  LocalStorageKey,
  setLocalStorageItem
} from '@/helpers/storage';

/**
 * Persistence for the multi-server rail. Only *secondary* servers added through
 * the rail "+" are stored here; the primary server is restored by the existing
 * auto-login flow (`AUTO_LOGIN_TOKEN`). The token is persisted so the rail can
 * silently reconnect each server on launch, mirroring how the primary server
 * already persists its auto-login token. (UNCORD_PLAN.md §3.1, M3)
 */
export type SavedServer = {
  host: string;
  name: string;
  iconUrl: string | null;
  token: string;
};

const read = (): SavedServer[] => {
  const raw = getLocalStorageItem(LocalStorageKey.SAVED_SERVERS);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (s): s is SavedServer =>
        !!s &&
        typeof s.host === 'string' &&
        typeof s.token === 'string' &&
        typeof s.name === 'string'
    );
  } catch {
    return [];
  }
};

const write = (servers: SavedServer[]) => {
  setLocalStorageItem(LocalStorageKey.SAVED_SERVERS, JSON.stringify(servers));
};

const getSavedServers = (): SavedServer[] => read();

const upsertSavedServer = (server: SavedServer) => {
  const servers = read().filter((s) => s.host !== server.host);

  servers.push(server);
  write(servers);
};

const removeSavedServer = (host: string) => {
  write(read().filter((s) => s.host !== host));
};

export { getSavedServers, removeSavedServer, upsertSavedServer };
