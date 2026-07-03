import { useSyncExternalStore } from 'react';

/**
 * Tiny observable for the launch-time "restoring saved servers" phase, so the
 * standalone shells can show a boot loading screen instead of flashing the
 * empty Welcome while the rail reconnects (tester feedback, 2026-07-03).
 * Lives outside Redux because it spans stores: it starts before any server
 * store exists.
 */

let restoring = false;
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
