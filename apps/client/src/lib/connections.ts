import { applyNotificationPrefs, resetApp } from '@/features/app/actions';
import { resetDialogs } from '@/features/dialogs/actions';
import { resetServerScreens } from '@/features/server-screens/actions';
import { resetServerState, setDisconnectInfo } from '@/features/server/actions';
import {
  serverHasUnreadMentionsSelector,
  serverUnreadCountSelector
} from '@/features/server/selectors';
import { playSound } from '@/features/server/sounds/actions';
import { SoundType } from '@/features/server/types';
import {
  createServerStore,
  getBootstrapStore,
  runWithActiveStore,
  setActiveStore,
  type ServerStore
} from '@/features/store';
import { getHostFromServer } from '@/helpers/get-file-url';
import { isLocalHost, isStandalone } from '@/helpers/standalone';
import {
  getLocalStorageItem,
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
  unreadCount: number;
  hasMentions: boolean;
  // unsubscribe from this connection's store (summary tracking)
  storeUnsub: () => void;
};

/** Read-only view of a connection for the rail UI. */
export type RailServer = {
  host: string;
  name: string;
  iconUrl: string | null;
  status: ConnectionStatus;
  isActive: boolean;
  unreadCount: number;
  hasMentions: boolean;
};

const connections = new Map<string, ConnectionEntry>();
const tokens = new Map<string, string>();
let activeHost: string | null = null;

/**
 * Last server that dropped on an *unclean* close (e.g. mobile error 1006 when the
 * tab is backgrounded). The foreground-resume controller reads this to re-run the
 * full connect+join flow when the page comes back to the foreground. Intentional
 * closes (clean logout, kick, ban) never set it, so we only auto-resume genuine
 * transient drops. (UNCORD_PLAN.md §3.6)
 */
let resumeTarget: { host: string; token: string } | null = null;

const getResumeTarget = (): { host: string; token: string } | null =>
  resumeTarget;

const clearResumeTarget = () => {
  resumeTarget = null;
};

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
    isActive: entry.host === activeHost,
    unreadCount: entry.unreadCount,
    hasMentions: entry.hasMentions
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
  // Respect an explicit scheme on the stored host.
  if (/^wss?:\/\//i.test(host)) {
    return host;
  }
  if (/^https:\/\//i.test(host)) {
    return host.replace(/^https/i, 'wss');
  }
  if (/^http:\/\//i.test(host)) {
    return host.replace(/^http/i, 'ws');
  }

  // Bare host[:port]. In native shells the page is file:// / capacitor://, so
  // default remote hosts to secure ws (localhost stays insecure); in the browser
  // mirror the page protocol.
  const secure = isStandalone()
    ? !isLocalHost(host)
    : window.location.protocol === 'https:';

  return `${secure ? 'wss' : 'ws'}://${host}`;
};

const createEntry = (host: string): ConnectionEntry => {
  const wsClient = createWSClient({
    url: buildWsUrl(host),
    // @ts-expect-error - the onclose type is not correct in trpc
    onClose: (cause: CloseEvent) => {
      const closing = connections.get(host);
      const closingStore = closing?.store;

      // An unclean close is a transient network drop (mobile 1006, sleep, Wi-Fi
      // flap) rather than an intentional logout/kick/ban. Stash this server's
      // token so the foreground-resume controller can reconnect it without the
      // user re-entering credentials. Capture before closeConnection wipes the
      // token map. (UNCORD_PLAN.md §3.6)
      if (cause && !cause.wasClean) {
        const token =
          tokens.get(host) ||
          getSessionStorageItem(SessionStorageKey.TOKEN) ||
          getLocalStorageItem(LocalStorageKey.AUTO_LOGIN_TOKEN) ||
          '';

        if (token) {
          resumeTarget = { host, token };
        }
      }

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

  // The primary server reuses the bootstrap store so single-server behaviour is
  // identical and the pre-connection UI (which reads the proxy/bootstrap store)
  // stays correct; every additional server gets its own store. Keying this on
  // "is this the primary host" rather than "is this the first connection" makes
  // it order-independent — restoring a saved secondary before the primary, or
  // reconnecting the primary while secondaries are open, still assigns stores
  // correctly. (UNCORD_PLAN.md §3.2)
  const store =
    host === getHostFromServer() ? getBootstrapStore() : createServerStore();

  // Apply this server's own notification preferences (if it has overrides) so
  // each server notifies independently of the others. (UNCORD_PLAN.md §3.5, M4)
  applyNotificationPrefs(host, store);

  const entry: ConnectionEntry = {
    host,
    wsClient,
    trpc,
    store,
    meta: { name: host, iconUrl: null },
    status: 'connecting',
    unreadCount: 0,
    hasMentions: false,
    storeUnsub: () => {}
  };

  // Track this server's unread summary into the rail (cross-server badges, M4).
  const updateSummary = () => {
    const state = store.getState();
    const unreadCount = serverUnreadCountSelector(state);
    const hasMentions = serverHasUnreadMentionsSelector(state);

    if (
      unreadCount !== entry.unreadCount ||
      hasMentions !== entry.hasMentions
    ) {
      entry.unreadCount = unreadCount;
      entry.hasMentions = hasMentions;
      notify();
    }
  };

  entry.storeUnsub = store.subscribe(updateSummary);

  return entry;
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
    entry.storeUnsub();
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
  clearResumeTarget,
  closeConnection,
  getActiveConnection,
  getActiveHost,
  getConnection,
  getRailServers,
  getResumeTarget,
  openConnection,
  setActiveHost,
  setConnectionMeta,
  setToken,
  subscribe,
  type TRPCClient
};
