import { getActiveStore, type ServerStore } from '@/features/store';
import { getActiveConnection, type TRPCClient } from '@/lib/connections';

/**
 * The single, global voice session is pinned to ONE connection — the server
 * that hosts the voice channel you joined. Voice survives switching the viewed
 * server because this pin does not change when the active connection does; only
 * joining/leaving a voice channel changes it. Every voice tRPC call and every
 * voice-session store read/write goes through the pinned connection rather than
 * the active-server proxy. (UNCORD_PLAN.md §3.4, M2)
 */
export type VoiceConnection = {
  host: string;
  trpc: TRPCClient;
  store: ServerStore;
};

let voiceConnection: VoiceConnection | null = null;
const listeners = new Set<() => void>();

const notify = () => {
  listeners.forEach((listener) => listener());
};

const pinVoiceConnection = (connection: VoiceConnection) => {
  voiceConnection = connection;
  notify();
};

const clearVoiceConnection = () => {
  if (!voiceConnection) {
    return;
  }

  voiceConnection = null;
  notify();
};

const getVoiceConnection = (): VoiceConnection | null => voiceConnection;

/**
 * The store the voice session lives in. Falls back to the active store when no
 * voice is pinned, so voice controls behave exactly as before in the single-
 * server / not-in-call case.
 */
const getVoiceStore = (): ServerStore =>
  voiceConnection?.store ?? getActiveStore();

/**
 * The tRPC client bound to the voice-hosting server. Falls back to the active
 * connection when nothing is pinned.
 */
const getVoiceTRPCClient = (): TRPCClient => {
  if (voiceConnection) {
    return voiceConnection.trpc;
  }

  const active = getActiveConnection();

  if (!active) {
    throw new Error('No voice connection and no active connection');
  }

  return active.trpc;
};

// Reactive subscription so the VoiceStoreProvider can re-bind the React store
// when the pinned voice connection changes. (useSyncExternalStore)
const subscribeVoiceConnection = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

const getVoiceConnectionSnapshot = (): VoiceConnection | null =>
  voiceConnection;

export {
  clearVoiceConnection,
  getVoiceConnection,
  getVoiceConnectionSnapshot,
  getVoiceStore,
  getVoiceTRPCClient,
  pinVoiceConnection,
  subscribeVoiceConnection
};
