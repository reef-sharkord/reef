import { type AppRouter } from '@sharkord/shared';
import {
  closeConnection,
  getActiveConnection,
  getActiveHost,
  openConnection
} from './connections';

/**
 * Compatibility facade over the connection registry (`lib/connections.ts`).
 *
 * Historically this module held the single tRPC/WebSocket client as a set of
 * module-level singletons. It now delegates to the registry so multi-server can
 * hold several connections, while keeping this module's public API stable —
 * ~58 call sites import `getTRPCClient` from here and must keep working
 * unchanged. `getTRPCClient()` resolves to the *active* connection (the server
 * currently being viewed), which is both the old behaviour and the forward one.
 *
 * See UNCORD_PLAN.md §3.1.
 */

const connectToTRPC = (host: string) => {
  return openConnection(host);
};

const getTRPCClient = () => {
  const active = getActiveConnection();

  if (!active) {
    throw new Error('TRPC client is not initialized');
  }

  return active.trpc;
};

const cleanup = () => {
  const host = getActiveHost();

  if (host) {
    closeConnection(host);
  }
};

export { cleanup, connectToTRPC, getTRPCClient, type AppRouter };
