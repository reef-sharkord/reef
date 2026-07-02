import type { TRPCClient } from '@/lib/connections';
import { getTRPCClient } from '@/lib/trpc';

/**
 * Custom status ("presence") via the connected server's reef plugin (REEF).
 *
 * The plugin keeps an in-memory userId → status-text map per server. Clients
 * set their own text with `setPresence` and read everyone's with
 * `getPresences` (fetched on join and refreshed on a slow poll — plugins can't
 * push events to clients, so polling is the transport). Ephemeral by design:
 * a server restart clears all statuses.
 */
export type TPresence = {
  text: string;
  updatedAt: number;
};

export type TPresenceMap = {
  [userId: number]: TPresence;
};

type TGetPresencesResponse = {
  ok?: boolean;
  presences?: TPresenceMap;
};

export const PRESENCE_TEXT_MAX = 80;
export const PRESENCE_POLL_MS = 60_000;

export const fetchPresences = async (
  trpc: TRPCClient
): Promise<TPresenceMap> => {
  try {
    const res = (await trpc.plugins.executeAction.mutate({
      pluginId: 'reef',
      actionName: 'getPresences'
    })) as TGetPresencesResponse | undefined;

    if (res?.ok && res.presences) {
      return res.presences;
    }

    return {};
  } catch {
    return {};
  }
};

/** Set (or clear, with empty text) your status on the ACTIVE server. */
export const setOwnPresence = async (text: string): Promise<boolean> => {
  const trpc = getTRPCClient();

  try {
    const res = (await trpc.plugins.executeAction.mutate({
      pluginId: 'reef',
      actionName: 'setPresence',
      payload: { text: text.trim().slice(0, PRESENCE_TEXT_MAX) }
    })) as { ok?: boolean } | undefined;

    return !!res?.ok;
  } catch {
    return false;
  }
};
