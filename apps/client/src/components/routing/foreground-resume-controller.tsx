import { loadApp, setIsAutoConnecting } from '@/features/app/actions';
import { connect, setDisconnectInfo } from '@/features/server/actions';
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
 * Only the primary (auto-login) server is auto-resumed here: rail secondaries
 * would need a password we deliberately don't persist. If the resume fails the
 * user simply lands on the existing Disconnected screen — never a worse state.
 */
const ForegroundResumeController = memo(() => {
  const isConnected = useIsConnected();
  const resuming = useRef(false);

  const tryResume = useCallback(async () => {
    if (resuming.current || isConnected) {
      return;
    }

    const target = getResumeTarget();

    if (!target || target.host !== getHostFromServer()) {
      return;
    }

    resuming.current = true;
    setIsAutoConnecting(true);
    setDisconnectInfo(undefined);
    setSessionStorageItem(SessionStorageKey.TOKEN, target.token);

    try {
      // re-fetch server info (cleared on teardown) before the handshake + join,
      // mirroring the boot sequence the auto-login path relies on.
      await loadApp();
      await connect();
      clearResumeTarget();
    } catch {
      // leave the resume target in place: the next foreground/online event will
      // try again, and meanwhile the user sees the Disconnected screen.
    } finally {
      resuming.current = false;
      setIsAutoConnecting(false);
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
