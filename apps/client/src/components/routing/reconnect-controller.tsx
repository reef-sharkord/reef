import { hasDroppedConnections, tryResumeAll } from '@/features/server/resume';
import { subscribe } from '@/lib/connections';
import { memo, useEffect } from 'react';

// Backoff schedule between automatic reconnect attempts. Caps at the last
// entry and stays there until something reconnects (or the user acts).
const RETRY_DELAYS_MS = [2000, 5000, 10000, 30000, 60000];

/**
 * In-app auto-reconnect. The foreground-resume controller only fires when the
 * page *returns* to the foreground — if a server drops while the app is open
 * and visible (server restart, Wi-Fi flap), nothing retried and the user sat
 * on the Reconnecting screen forever. This controller watches the connection
 * registry and, while anything is dropped, re-runs the shared resume on a
 * backoff timer. Attempts pause while the page is hidden or offline (the
 * foreground/online events own those transitions) and the schedule resets
 * once everything is connected again.
 */
const ReconnectController = memo(() => {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const schedule = () => {
      if (!hasDroppedConnections()) {
        attempt = 0;

        if (timer) {
          clearTimeout(timer);
          timer = null;
        }

        return;
      }

      if (timer) {
        return;
      }

      const delay =
        RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];

      timer = setTimeout(async () => {
        timer = null;

        // Hidden/offline: let the foreground-resume events handle the retry
        // the moment the app is usable again — don't burn attempts meanwhile.
        if (document.visibilityState === 'visible' && navigator.onLine) {
          attempt++;
          await tryResumeAll();
        }

        schedule();
      }, delay);
    };

    const unsubscribe = subscribe(schedule);

    schedule();

    return () => {
      unsubscribe();

      if (timer) {
        clearTimeout(timer);
      }
    };
  }, []);

  return null;
});

export { ReconnectController };
