import { useSyncExternalStore } from 'react';

/**
 * Cross-shell update state driving the Discord-style update cue (titlebar
 * button on desktop, banner on mobile). Two producers feed it:
 *  - installed desktop: electron-updater events (download happens in the
 *    background; 'ready' means restart-to-install)
 *  - portable desktop & Android: the GitHub release check in update-check.ts
 *    ('available' means a newer release exists; clicking opens its page)
 * Lives outside Redux: it is device-wide and outlives server stores.
 */

export type TUpdateState =
  | { status: 'idle' }
  | { status: 'downloading'; version: string; percent: number }
  // installed desktop: downloaded, restart installs it
  | { status: 'ready'; version: string }
  // portable/mobile: newer release exists, link to its download page
  | { status: 'available'; version: string; url: string };

let state: TUpdateState = { status: 'idle' };
const listeners = new Set<() => void>();

const getUpdateState = (): TUpdateState => state;

const setUpdateState = (next: TUpdateState): void => {
  // A finished download must never be downgraded by a late progress event or
  // a slower GitHub check answering after electron-updater already finished.
  if (state.status === 'ready' && next.status !== 'ready') {
    return;
  }

  state = next;
  listeners.forEach((listener) => listener());
};

const subscribeUpdateState = (listener: () => void): (() => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

const useUpdateState = (): TUpdateState =>
  useSyncExternalStore(subscribeUpdateState, getUpdateState, getUpdateState);

export { getUpdateState, setUpdateState, useUpdateState };
