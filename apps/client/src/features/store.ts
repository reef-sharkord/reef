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

const getBootstrapStore = (): ServerStore => bootstrapStore;
const getActiveStore = (): ServerStore => activeStore;
const setActiveStore = (next: ServerStore) => {
  activeStore = next;
};

// Stable identity that forwards every store operation to the active store.
// Redux store methods are closures (not `this`-dependent), but we bind anyway
// for safety when handing functions to consumers like react-redux.
const store = new Proxy({} as ServerStore, {
  get(_target, prop) {
    const value = Reflect.get(activeStore, prop) as unknown;

    return typeof value === 'function' ? value.bind(activeStore) : value;
  }
});

export {
  createServerStore,
  getActiveStore,
  getBootstrapStore,
  setActiveStore,
  store
};
