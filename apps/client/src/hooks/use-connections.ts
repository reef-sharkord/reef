import { getRailServers, subscribe, type RailServer } from '@/lib/connections';
import { useSyncExternalStore } from 'react';

/**
 * Reactive view of the connection registry for the rail + routing. Re-renders
 * whenever a connection is added/removed, becomes active, or changes status.
 */
export const useRailServers = (): RailServer[] =>
  useSyncExternalStore(subscribe, getRailServers, getRailServers);
