import { channelsSelector } from '@/features/server/channels/selectors';
import { getConnection, getRailServers } from '@/lib/connections';

/**
 * Quick switcher: a cross-server command palette to jump to any server, channel,
 * or DM by name. Client-only, REEF-exclusive. Targets are read from each
 * connection's store directly (same pattern as the inbox). A tiny open-state
 * pub/sub lets both the keyboard shortcut and the rail button drive one
 * root-mounted overlay.
 */
export type QuickTargetKind = 'server' | 'channel' | 'dm';

export type QuickTarget = {
  id: string;
  kind: QuickTargetKind;
  host: string;
  serverName: string;
  channelId?: number;
  name: string;
};

export const getQuickSwitchTargets = (): QuickTarget[] => {
  const targets: QuickTarget[] = [];

  for (const server of getRailServers()) {
    const conn = getConnection(server.host);

    targets.push({
      id: `server:${server.host}`,
      kind: 'server',
      host: server.host,
      serverName: server.name,
      name: server.name
    });

    if (!conn) {
      continue;
    }

    const state = conn.store.getState();

    for (const channel of channelsSelector(state)) {
      if (channel.isDm) {
        continue;
      }

      targets.push({
        id: `channel:${server.host}:${channel.id}`,
        kind: 'channel',
        host: server.host,
        serverName: server.name,
        channelId: channel.id,
        name: channel.name
      });
    }

    targets.push({
      id: `dm:${server.host}`,
      kind: 'dm',
      host: server.host,
      serverName: server.name,
      name: ''
    });
  }

  return targets;
};

// --- open-state pub/sub -------------------------------------------------------
let isOpen = false;
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) {
    listener();
  }
};

export const openQuickSwitch = (): void => {
  if (!isOpen) {
    isOpen = true;
    emit();
  }
};

export const closeQuickSwitch = (): void => {
  if (isOpen) {
    isOpen = false;
    emit();
  }
};

export const toggleQuickSwitch = (): void => {
  isOpen = !isOpen;
  emit();
};

export const getQuickSwitchOpen = (): boolean => isOpen;

export const subscribeQuickSwitch = (listener: () => void): (() => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};
