import { loadApp, setIsAutoConnecting } from '@/features/app/actions';
import {
  connect,
  resumeDroppedServers,
  setDisconnectInfo
} from '@/features/server/actions';
import { useIsConnected } from '@/features/server/hooks';
import { getHostFromServer } from '@/helpers/get-file-url';
import { SessionStorageKey, setSessionStorageItem } from '@/helpers/storage';
import { clearResumeTarget, getResumeTarget } from '@/lib/connections';
import { memo, useCallback, useEffect, useRef } from 'react';

/**
 * Mobile browsers close the WebSocket with error 1006 when the tab is
 * backgrounded, and the page cannot keep a socket alive while suspended (true
 * background persistence belongs to the native shells — UNCORD_PLAN.md §3.6).
 * The best the browser layer can do is reconnect *promptly* when the user
 * returns. This controller listens for the page coming back to the foreground
 * (`visibilitychange`, `pageshow`, `online`) and, if the primary server dropped
 * on a transient/unclean close, re-runs the proven full connect+join flow.
 *
 * Two resume paths run here:
 * - the primary (auto-login) server, via the single resume-target slot;
 * - saved rail servers, via their persisted per-host tokens (M3). In the
 *   native shells window.location is the app itself, so every real server is a
 *   "secondary" and this is the only resume path there.
 * If a resume fails the user simply lands on the existing Disconnected screen
 * — never a worse state.
 */
const ForegroundResumeController = memo(() => {
  const isConnected = useIsConnected();
  const resuming = useRef(false);

  const tryResume = useCallback(async () => {
    if (resuming.current) {
      return;
    }

    resuming.current = true;

    try {
      // Saved rail servers first: any connection soft-disconnected by an
      // unclean drop gets rebuilt with its persisted token. Failures are
      // swallowed per-server inside reconnectSavedServer.
      await resumeDroppedServers();

      // Legacy primary-server resume (browser tab pointed at the server).
      const target = getResumeTarget();

      if (isConnected || !target || target.host !== getHostFromServer()) {
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
        // leave the resume target in place: the next foreground/online event
        // will try again, and meanwhile the user sees the Disconnected screen.
      } finally {
        setIsAutoConnecting(false);
      }
    } finally {
      resuming.current = false;
    }
  }, [isConnected]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void tryResume();
      }
    };
    const onResume = () => void tryResume();

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onResume);
    window.addEventListener('pageshow', onResume);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onResume);
      window.removeEventListener('pageshow', onResume);
    };
  }, [tryResume]);

  return null;
});

export { ForegroundResumeController };
