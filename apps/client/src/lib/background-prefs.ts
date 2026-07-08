import {
  getLocalStorageItemBool,
  LocalStorageKey,
  setLocalStorageItemBool
} from '@/helpers/storage';
import { useSyncExternalStore } from 'react';

/**
 * User control over the Android keep-alive foreground service (the persistent
 * "Keeping your servers connected" notification). Defaults to on so servers
 * without push notifications still deliver while backgrounded; users whose
 * servers push via ntfy/webhook can turn it off to hide the notification and
 * save battery (tester feedback, 2026-07-08). Lives outside Redux because it
 * is a device-wide pref read by a controller that outlives server stores.
 */

const listeners = new Set<() => void>();

const isBackgroundConnectionEnabled = (): boolean =>
  getLocalStorageItemBool(LocalStorageKey.BACKGROUND_CONNECTION, true);

const setBackgroundConnectionEnabled = (enabled: boolean): void => {
  setLocalStorageItemBool(LocalStorageKey.BACKGROUND_CONNECTION, enabled);
  listeners.forEach((listener) => listener());
};

const subscribeBackgroundConnection = (listener: () => void): (() => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

const useBackgroundConnectionEnabled = (): boolean =>
  useSyncExternalStore(
    subscribeBackgroundConnection,
    isBackgroundConnectionEnabled,
    isBackgroundConnectionEnabled
  );

export {
  isBackgroundConnectionEnabled,
  setBackgroundConnectionEnabled,
  useBackgroundConnectionEnabled
};
