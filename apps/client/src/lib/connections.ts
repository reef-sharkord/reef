import { resetApp } from '@/features/app/actions';
import { resetDialogs } from '@/features/dialogs/actions';
import { resetServerScreens } from '@/features/server-screens/actions';
import { resetServerState, setDisconnectInfo } from '@/features/server/actions';
import { playSound } from '@/features/server/sounds/actions';
import { SoundType } from '@/features/server/types';
import {
  createServerStore,
  getBootstrapStore,
  runWithActiveStore,
  setActiveStore,
  type ServerStore
} from '@/features/store';
import {
  getSessionStorageItem,
  LocalStorageKey,
  removeLocalStorageItem,
  removeSessionStorageItem,
  SessionStorageKey
} from '@/helpers/storage';
import { type AppRouter, type TConnectionParams } from '@sharkord/shared';
import { createTRPCProxyClient, createWSClient, wsLink } from '@trpc/client';

/**
 * Connection registry — owns every server connection the client holds.
 *
 * A keyed map (`host` → entry) so the multi-server rail can hold several
 * connections at once. Each entry carries its own tRPC/WebSocket client, its own
 * Redux store (UNCORD_PLAN.md §3.2) and its own auth token. `lib/trpc.ts`
 * delegates here for the active connection. The registry is observable via
 * `subscribe()` so React (the rail + routing) re-renders on changes.
 */

type TRPCClient = ReturnType<typeof createTRPCProxyClient<AppRouter>>;
type WSClient = ReturnType<typeof createWSClient>;

export type ConnectionStatus =
  | 'connecting'
  | 'open'
  | 'reconnecting'
  | 'closed';

export type ConnectionMeta = {
  name: string;
  iconUrl: string | null;
};

export type ConnectionEntry = {
  host: string;
  wsClient: WSClient;
  trpc: TRPCClient;
  store: ServerStore;
  meta: ConnectionMeta;
  status: ConnectionStatus;
};

/** Read-only view of a connection for the rail UI. */
export type RailServer = {
  host: string;
  name: string;
  iconUrl: string | null;
  status: ConnectionStatus;
  isActive: boolean;
};

const connections = new Map<string, ConnectionEntry>();
const tokens = new Map<string, string>();
let activeHost: string | null = null;

// Firefox fires WebSocket onClose during page refresh; Chrome does not. When
// navigating away, we must not clear auto-login localStorage or it will be lost
// on refresh in Firefox.
let isNavigatingAway = false;
window.addEventListener('beforeunload', () => {
  isNavigatingAway = true;
});

// Guards re-entrancy of the legacy single-server localStorage cleanup.
let isCleaningUp = false;

// ---- reactive layer (for useSyncExternalStore) --------------------------------

type Listener = () => void;
const listeners = new Set<Listener>();
let railSnapshot: RailServer[] = [];

const rebuildSnapshot = () => {
  railSnapshot = Array.from(connections.values()).map((entry) => ({
    host: entry.host,
    name: entry.meta.name,
    iconUrl: entry.meta.iconUrl,
    status: entry.status,
    isActive: entry.host === activeHost
  }));
};

const notify = () => {
  rebuildSnapshot();
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: Listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

// Stable snapshot reference between mutations (required by useSyncExternalStore).
const getRailServers = (): RailServer[] => railSnapshot;

// ---- tokens -------------------------------------------------------------------

const setToken = (host: string, token: string) => {
  tokens.set(host, token);
};

// ---- lifecycle ----------------------------------------------------------------

const buildWsUrl = (host: string) => {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';

  return `${protocol}://${host}`;
};

const createEntry = (host: string): ConnectionEntry => {
  const wsClient = createWSClient({
    url: buildWsUrl(host),
    // @ts-expect-error - the onclose type is not correct in trpc
    onClose: (cause: CloseEvent) => {
      const closing = connections.get(host);
      const closingStore = closing?.store;

      closeConnection(host);

      // Report the disconnect into the closing server's own store so a
      // backgrounded server dropping never shows a disconnect screen on the
      // server you are currently viewing.
      if (closingStore) {
        runWithActiveStore(closingStore, () => {
          setDisconnectInfo({
            code: cause.code,
            reason: cause.reason,
            wasClean: cause.wasClean,
            time: new Date()
          });

          if (!cause.wasClean) {
            playSound(SoundType.SERVER_DISCONNECTED);
          }
        });
      }
    },
    connectionParams: async (): Promise<TConnectionParams> => {
      return {
        // per-host token; fall back to the legacy single-server session token
        // for the primary auto-login path.
        token:
          tokens.get(host) ||
          getSessionStorageItem(SessionStorageKey.TOKEN) ||
          ''
      };
    },
    keepAlive: {
      enabled: true,
      intervalMs: 30_000,
      pongTimeoutMs: 5_000
    }
  });

  const trpc = createTRPCProxyClient<AppRouter>({
    links: [wsLink({ client: wsClient })]
  });

  // The primary (first/only) connection reuses the bootstrap store so
  // single-server behaviour is identical; additional concurrent servers each
  // get their own store. On reconnect the registry is empty again, so the
  // primary server keeps reusing the bootstrap store. (UNCORD_PLAN.md §3.2)
  const store =
    connections.size === 0 ? getBootstrapStore() : createServerStore();

  return {
    host,
    wsClient,
    trpc,
    store,
    meta: { name: host, iconUrl: null },
    status: 'connecting'
  };
};

/**
 * Open (or reuse) a connection to `host` and make it the active one.
 * Optionally seeds the per-host auth token. Returns the tRPC client.
 */
const openConnection = (
  host: string,
  options?: { token?: string }
): TRPCClient => {
  if (options?.token) {
    setToken(host, options.token);
  }

  const existing = connections.get(host);

  if (existing) {
    activeHost = host;
    setActiveStore(existing.store);
    notify();
    return existing.trpc;
  }

  const entry = createEntry(host);
  connections.set(host, entry);
  activeHost = host;
  entry.status = 'open';
  setActiveStore(entry.store);
  notify();

  return entry.trpc;
};

const getConnection = (host: string): ConnectionEntry | undefined =>
  connections.get(host);

const getActiveConnection = (): ConnectionEntry | undefined =>
  activeHost ? connections.get(activeHost) : undefined;

const getActiveHost = (): string | null => activeHost;

const setActiveHost = (host: string) => {
  const entry = connections.get(host);

  if (entry) {
    activeHost = host;
    setActiveStore(entry.store);
    notify();
  }
};

const setConnectionMeta = (host: string, meta: ConnectionMeta) => {
  const entry = connections.get(host);

  if (entry) {
    entry.meta = meta;
    notify();
  }
};

/**
 * Tear down the connection to `host`. State resets are scoped to the closing
 * server's own store so other connections are untouched; the legacy
 * single-server localStorage cleanup only runs when no connections remain.
 */
const closeConnection = (host: string) => {
  const entry = connections.get(host);
  const closingStore = entry?.store;

  if (entry) {
    entry.status = 'closed';
    entry.wsClient.close();
    connections.delete(host);
  }

  tokens.delete(host);

  if (closingStore) {
    runWithActiveStore(closingStore, () => {
      resetServerScreens();
      resetServerState();
      resetDialogs();
      resetApp();
    });
  }

  if (activeHost === host) {
    // hand active status to a remaining connection if there is one, otherwise
    // fall back to the bootstrap store so the proxy always points somewhere.
    const next = connections.values().next().value as
      | ConnectionEntry
      | undefined;

    activeHost = next?.host ?? null;
    setActiveStore(next?.store ?? getBootstrapStore());
  }

  // Legacy single-server cleanup: only when the last connection is gone, so
  // closing a secondary server never clears the primary's persisted auth.
  if (connections.size === 0 && !isCleaningUp) {
    isCleaningUp = true;

    if (!isNavigatingAway) {
      removeLocalStorageItem(LocalStorageKey.AUTO_LOGIN_TOKEN);
    }

    removeSessionStorageItem(SessionStorageKey.TOKEN);

    // this should help Firefox users who report that auto login is not consistent
    setTimeout(() => {
      isCleaningUp = false;
    }, 100);
  }

  notify();
};

export {
  closeConnection,
  getActiveConnection,
  getActiveHost,
  getConnection,
  getRailServers,
  openConnection,
  setActiveHost,
  setConnectionMeta,
  setToken,
  subscribe,
  type TRPCClient
};
