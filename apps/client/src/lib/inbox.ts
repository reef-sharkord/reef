import {
  channelReadStateByIdSelector,
  channelsSelector,
  directMessagesUnreadCountSelector
} from '@/features/server/channels/selectors';
import {
  hasUnreadMentionsSelector,
  mutedChannelIdsSelector
} from '@/features/server/selectors';
import {
  getConnection,
  getRailServers,
  subscribe as subscribeConnections
} from '@/lib/connections';

/**
 * Cross-server inbox aggregation. Reads each connection's store directly (no
 * dispatch) to collect unread channels + DMs across every connected server, so a
 * single view can surface everything that needs attention. Recomputed on every
 * connection-registry change (the same signal that drives the rail badges), with
 * a cached snapshot so useSyncExternalStore stays stable. (M8)
 */

export type InboxEntry = {
  kind: 'channel' | 'dm';
  channelId?: number;
  name: string;
  unread: number;
  hasMention: boolean;
};

export type InboxServer = {
  host: string;
  name: string;
  iconUrl: string | null;
  entries: InboxEntry[];
};

const build = (): InboxServer[] => {
  const result: InboxServer[] = [];

  for (const server of getRailServers()) {
    const conn = getConnection(server.host);

    if (!conn) {
      continue;
    }

    const state = conn.store.getState();
    const entries: InboxEntry[] = [];
    const mutedIds = mutedChannelIdsSelector(state);

    for (const channel of channelsSelector(state)) {
      if (channel.isDm || mutedIds.includes(channel.id)) {
        continue;
      }

      const unread = channelReadStateByIdSelector(state, channel.id);

      if (unread > 0) {
        entries.push({
          kind: 'channel',
          channelId: channel.id,
          name: channel.name,
          unread,
          hasMention: hasUnreadMentionsSelector(state, channel.id)
        });
      }
    }

    const dmUnread = directMessagesUnreadCountSelector(state);

    if (dmUnread > 0) {
      entries.push({
        kind: 'dm',
        name: 'Direct messages',
        unread: dmUnread,
        hasMention: false
      });
    }

    if (entries.length > 0) {
      entries.sort(
        (a, b) =>
          Number(b.hasMention) - Number(a.hasMention) || b.unread - a.unread
      );
      result.push({
        host: server.host,
        name: server.name,
        iconUrl: server.iconUrl,
        entries
      });
    }
  }

  return result;
};

const keyOf = (servers: InboxServer[]): string =>
  servers
    .map(
      (s) =>
        `${s.host}:` +
        s.entries
          .map(
            (e) =>
              `${e.kind}${e.channelId ?? ''}=${e.unread}${e.hasMention ? '!' : ''}`
          )
          .join(',')
    )
    .join('|');

let snapshot: InboxServer[] = build();
let lastKey = keyOf(snapshot);

const recompute = () => {
  const next = build();
  const key = keyOf(next);

  if (key !== lastKey) {
    lastKey = key;
    snapshot = next;
  }
};

const getInboxSnapshot = (): InboxServer[] => snapshot;

// Subscribes to BOTH the connection registry and every connection's own store.
// The registry alone is not enough: its unread summary excludes DMs and only
// changes on server-level totals, so e.g. a new DM (or a read-state change that
// keeps the total constant) would leave the inbox stale until some unrelated
// registry event. recompute() dedupes by key, so redundant store dispatches
// never produce a new snapshot (and thus never re-render).
const subscribeInbox = (listener: () => void): (() => void) => {
  let storeUnsubs: Array<() => void> = [];

  const onChange = () => {
    recompute();
    listener();
  };

  const resubscribeStores = () => {
    storeUnsubs.forEach((unsub) => unsub());
    storeUnsubs = [];

    for (const server of getRailServers()) {
      const conn = getConnection(server.host);

      if (conn) {
        storeUnsubs.push(conn.store.subscribe(onChange));
      }
    }
  };

  resubscribeStores();

  const unsubRegistry = subscribeConnections(() => {
    resubscribeStores();
    onChange();
  });

  return () => {
    unsubRegistry();
    storeUnsubs.forEach((unsub) => unsub());
    storeUnsubs = [];
  };
};

const getInboxTotals = (): { unread: number; hasMention: boolean } => {
  let unread = 0;
  let hasMention = false;

  for (const server of snapshot) {
    for (const entry of server.entries) {
      unread += entry.unread;
      hasMention = hasMention || entry.hasMention;
    }
  }

  return { unread, hasMention };
};

export { getInboxSnapshot, getInboxTotals, subscribeInbox };
