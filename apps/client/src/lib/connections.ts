import { resetApp } from '@/features/app/actions';
import { resetDialogs } from '@/features/dialogs/actions';
import { resetServerScreens } from '@/features/server-screens/actions';
import { resetServerState, setDisconnectInfo } from '@/features/server/actions';
import { playSound } from '@/features/server/sounds/actions';
import { SoundType } from '@/features/server/types';
import {
  getSessionStorageItem,
  LocalStorageKey,
  removeLocalStorageItem,
  removeSessionStorageItem,
  SessionStorageKey
} from '@/helpers/storage';
import { type AppRouter, type TConnectionParams } from '@sharkord/shared';
import { createTRPCProxyClient, createWSClient, wsLink } from '@trpc/client';
import {
  createServerStore,
  getBootstrapStore,
  setActiveStore,
  type ServerStore
} from '@/features/store';

/**
 * Connection registry — owns every server connection the client holds.
 *
 * Today the client only ever has ONE active connection; this registry is a
 * keyed map (`host` → entry) so that multi-server (the rail) can later hold
 * several at once. Step 1 of the multi-server rework: behaviour is identical
 * to the old `lib/trpc.ts` singleton, just relocated behind a registry seam.
 * `lib/trpc.ts` now delegates here.
 *
 * See UNCORD_PLAN.md §3.1.
 */

type TRPCClient = ReturnType<typeof createTRPCProxyClient<AppRouter>>;
type WSClient = ReturnType<typeof createWSClient>;

export type ConnectionStatus =
  | 'connecting'
  | 'open'
  | 'reconnecting'
  | 'closed';

export type ConnectionEntry = {
  host: string;
  wsClient: WSClient;
  trpc: TRPCClient;
  store: ServerStore;
  status: ConnectionStatus;
};

const connections = new Map<string, ConnectionEntry>();
let activeHost: string | null = null;

// Firefox fires WebSocket onClose during page refresh; Chrome does not. When
// navigating away, we must not clear auto-login localStorage or it will be lost
// on refresh in Firefox.
let isNavigatingAway = false;
window.addEventListener('beforeunload', () => {
  isNavigatingAway = true;
});

// Guards re-entrancy of the global reset performed while tearing a connection
// down (a single connection's onClose + an explicit close can race).
let isCleaningUp = false;

const buildWsUrl = (host: string) => {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';

  return `${protocol}://${host}`;
};

const createEntry = (host: string): ConnectionEntry => {
  const wsClient = createWSClient({
    url: buildWsUrl(host),
    // @ts-expect-error - the onclose type is not correct in trpc
    onClose: (cause: CloseEvent) => {
      closeConnection(host);

      setDisconnectInfo({
        code: cause.code,
        reason: cause.reason,
        wasClean: cause.wasClean,
        time: new Date()
      });

      if (!cause.wasClean) {
        playSound(SoundType.SERVER_DISCONNECTED);
      }
    },
    connectionParams: async (): Promise<TConnectionParams> => {
      return {
        token: getSessionStorageItem(SessionStorageKey.TOKEN) || ''
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
  const store = connections.size === 0 ? getBootstrapStore() : createServerStore();

  return { host, wsClient, trpc, store, status: 'connecting' };
};

/**
 * Open (or reuse) a connection to `host` and make it the active one.
 * Returns the tRPC client for that host.
 */
const openConnection = (host: string): TRPCClient => {
  const existing = connections.get(host);

  if (existing) {
    activeHost = host;
    setActiveStore(existing.store);
    return existing.trpc;
  }

  const entry = createEntry(host);
  connections.set(host, entry);
  activeHost = host;
  setActiveStore(entry.store);

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
  }
};

/**
 * Tear down the connection to `host`.
 *
 * NOTE: while there is only one connection this also performs the global state
 * reset the old singleton `cleanup()` did. Per-connection-scoped resets land in
 * a later multi-server step (UNCORD_PLAN.md §3.2) once each server owns its own
 * store; today resetting global state is correct because there is a single one.
 */
const closeConnection = (host: string) => {
  const entry = connections.get(host);

  if (entry) {
    entry.status = 'closed';
    entry.wsClient.close();
    connections.delete(host);
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

  if (isCleaningUp) {
    return;
  }

  isCleaningUp = true;

  // cleanup can be called due to various reasons (manual disconnect, connection
  // error, auto-login failure, etc). so we remove any persisted auto-login token
  // to prevent auto-login loops. skip this when navigating away (refresh/close) -
  // Firefox fires onClose during refresh, Chrome does not.
  if (!isNavigatingAway) {
    removeLocalStorageItem(LocalStorageKey.AUTO_LOGIN_TOKEN);
  }

  resetServerScreens();
  resetServerState();
  resetDialogs();
  resetApp();

  removeSessionStorageItem(SessionStorageKey.TOKEN);

  // this should help Firefox users who report that auto login is not consistent
  setTimeout(() => {
    isCleaningUp = false;
  }, 100);
};

export {
  closeConnection,
  getActiveConnection,
  getActiveHost,
  getConnection,
  openConnection,
  setActiveHost,
  type TRPCClient
};
