import { isStandalone } from '@/helpers/standalone';
import { getSavedServers } from '@/lib/saved-servers';
import { useSyncExternalStore } from 'react';

/**
 * Tiny observable for the launch-time "restoring saved servers" phase, so the
 * standalone shells can show a boot loading screen instead of flashing the
 * empty Welcome while the rail reconnects (tester feedback, 2026-07-03).
 * Lives outside Redux because it spans stores: it starts before any server
 * store exists.
 *
 * Initialized synchronously from whether there is anything to restore, so the
 * very first React render already shows the boot screen — otherwise the
 * Welcome/login flashes for a frame before the restore effect runs (tester
 * feedback, 2026-07-08). restoreSavedServers always clears it in a finally.
 */

let restoring = isStandalone() && getSavedServers().length > 0;
const listeners = new Set<() => void>();

const setRestoringSavedServers = (value: boolean) => {
  if (restoring === value) {
    return;
  }

  restoring = value;
  listeners.forEach((listener) => listener());
};

const isRestoringSavedServers = () => restoring;

const subscribeBootState = (listener: () => void): (() => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

const useIsRestoringSavedServers = (): boolean =>
  useSyncExternalStore(
    subscribeBootState,
    isRestoringSavedServers,
    isRestoringSavedServers
  );

export {
  isRestoringSavedServers,
  setRestoringSavedServers,
  useIsRestoringSavedServers
};
