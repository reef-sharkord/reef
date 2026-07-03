import { loadApp, setIsAutoConnecting } from '@/features/app/actions';
import {
  connect,
  resumeDroppedServers,
  setDisconnectInfo
} from '@/features/server/actions';
import { getHostFromServer } from '@/helpers/get-file-url';
import { SessionStorageKey, setSessionStorageItem } from '@/helpers/storage';
import {
  clearResumeTarget,
  getConnection,
  getRailServers,
  getResumeTarget
} from '@/lib/connections';

let resuming = false;

/**
 * Resume every dropped connection: saved rail servers via their persisted
 * tokens, then the primary (auto-login) server via the single resume-target
 * slot. Shared by the foreground-resume controller (fires on
 * visibilitychange/online/pageshow) and the in-app reconnect controller
 * (fires on a backoff timer while the app stays open). Re-entrancy-guarded;
 * failures leave everything retriable.
 */
export const tryResumeAll = async (): Promise<void> => {
  if (resuming) {
    return;
  }

  resuming = true;

  try {
    // Saved rail servers first: any connection soft-disconnected by an
    // unclean drop gets rebuilt with its persisted token. Failures are
    // swallowed per-server inside reconnectSavedServer.
    await resumeDroppedServers();

    // Legacy primary-server resume (browser tab pointed at the server). The
    // primary's entry is deleted on close, so an existing entry means it is
    // already connected or connecting.
    const target = getResumeTarget();
    const primaryHost = getHostFromServer();

    if (!target || target.host !== primaryHost || getConnection(primaryHost)) {
      return;
    }

    setIsAutoConnecting(true);
    setDisconnectInfo(undefined);
    setSessionStorageItem(SessionStorageKey.TOKEN, target.token);

    try {
      // re-fetch server info (cleared on teardown) before the handshake +
      // join, mirroring the boot sequence the auto-login path relies on.
      await loadApp();
      await connect();
      clearResumeTarget();
    } catch {
      // leave the resume target in place: the next attempt (foreground event
      // or backoff tick) will try again.
    } finally {
      setIsAutoConnecting(false);
    }
  } finally {
    resuming = false;
  }
};

/** Whether anything is currently dropped and worth a resume attempt. */
export const hasDroppedConnections = (): boolean =>
  !!getResumeTarget() ||
  getRailServers().some((server) => server.status === 'closed');
