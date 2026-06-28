import { configureStore } from '@reduxjs/toolkit';
import { appSliceReducer } from './app/slice';
import { dialogSliceReducer } from './dialogs/slice';
import { serverScreenSliceReducer } from './server-screens/slice';
import { serverSliceReducer } from './server/slice';

/**
 * Multi-server store strategy (UNCORD_PLAN.md §3.2).
 *
 * Each server connection owns its OWN Redux store instance (same reducers), so
 * the entire existing per-server slice/selectors/components run unchanged across
 * multiple servers. `store` below is a stable proxy that always delegates to the
 * ACTIVE server's store, which is what imperative UI code (features/.../actions)
 * means when it dispatches. Background code (subscriptions, voice) must bind to
 * its own server's store explicitly and must NOT use this proxy.
 */

const createServerStore = () =>
  configureStore({
    reducer: {
      app: appSliceReducer,
      server: serverSliceReducer,
      dialog: dialogSliceReducer,
      serverScreen: serverScreenSliceReducer
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
        devChecks: {
          identityFunctionCheck: {
            warnAfter: 0 // warn immediately
          }
        }
      })
  });

export type ServerStore = ReturnType<typeof createServerStore>;
export type IRootState = ReturnType<ServerStore['getState']>;

// The bootstrap store exists from app start and also serves as the FIRST
// server's store (see lib/connections.ts), so single-server behaviour is
// identical to before. Additional concurrent servers each get their own store.
const bootstrapStore = createServerStore();

let activeStore: ServerStore = bootstrapStore;

// --- switchable subscription layer -------------------------------------------
// react-redux subscribes to `store` exactly once (the Proxy identity never
// changes), so a naive passthrough would pin that single subscription to
// whatever store was active at mount (the bootstrap store) and never re-render
// outer-Provider consumers when the active store dispatches or switches. So the
// proxy owns its own listener set and forwards notifications from the CURRENT
// active store, re-pointing whenever the active store changes. (review fix:
// dialogs/server-screens stale on secondary/standalone servers)
const proxyListeners = new Set<() => void>();
let forwarderUnsub: (() => void) | null = null;

const repointForwarder = () => {
  forwarderUnsub?.();
  forwarderUnsub =
    proxyListeners.size > 0
      ? activeStore.subscribe(() => {
          proxyListeners.forEach((listener) => listener());
        })
      : null;
};

const proxySubscribe = (listener: () => void) => {
  proxyListeners.add(listener);

  if (proxyListeners.size === 1) {
    repointForwarder();
  }

  return () => {
    proxyListeners.delete(listener);

    if (proxyListeners.size === 0) {
      repointForwarder();
    }
  };
};

const getBootstrapStore = (): ServerStore => bootstrapStore;
const getActiveStore = (): ServerStore => activeStore;
const setActiveStore = (next: ServerStore) => {
  if (next === activeStore) {
    return;
  }

  activeStore = next;
  // forward from the new active store and tell consumers the store swapped.
  repointForwarder();
  proxyListeners.forEach((listener) => listener());
};

/**
 * Run `fn` with `target` temporarily set as the active store, then restore the
 * previous one. Server-bound subscriptions use this so their dispatches land in
 * the originating server's store even when a different server is active (the
 * "background events must use their own store" rule, UNCORD_PLAN.md §3.2/§3.5).
 *
 * `fn` MUST be synchronous — the restore happens as soon as it returns, so any
 * dispatch scheduled in a later microtask would hit the wrong store.
 */
const runWithActiveStore = <T>(target: ServerStore, fn: () => T): T => {
  const previous = activeStore;
  activeStore = target;

  try {
    return fn();
  } finally {
    activeStore = previous;
  }
};

// Stable identity that forwards every store operation to the active store.
// Redux store methods are closures (not `this`-dependent), but we bind anyway
// for safety when handing functions to consumers like react-redux.
const store = new Proxy({} as ServerStore, {
  get(_target, prop) {
    // `subscribe` must go through the switchable layer so react-redux's single
    // root subscription tracks the active store rather than being pinned to the
    // store that was active at mount.
    if (prop === 'subscribe') {
      return proxySubscribe;
    }

    const value = Reflect.get(activeStore, prop) as unknown;

    return typeof value === 'function' ? value.bind(activeStore) : value;
  }
});

export {
  createServerStore,
  getActiveStore,
  getBootstrapStore,
  runWithActiveStore,
  setActiveStore,
  store
};
