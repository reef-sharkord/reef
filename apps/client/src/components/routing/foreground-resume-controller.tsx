import { tryResumeAll } from '@/features/server/resume';
import { memo, useEffect } from 'react';

/**
 * Mobile browsers close the WebSocket with error 1006 when the tab is
 * backgrounded, and the page cannot keep a socket alive while suspended (true
 * background persistence belongs to the native shells — UNCORD_PLAN.md §3.6).
 * The best the browser layer can do is reconnect *promptly* when the user
 * returns. This controller listens for the page coming back to the foreground
 * (`visibilitychange`, `pageshow`, `online`) and re-runs the shared resume
 * (saved rail servers via persisted tokens + the primary via the resume-target
 * slot — see features/server/resume.ts). While the app stays open, the
 * ReconnectController's backoff timer covers the same ground.
 */
const ForegroundResumeController = memo(() => {
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void tryResumeAll();
      }
    };
    const onResume = () => void tryResumeAll();

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onResume);
    window.addEventListener('pageshow', onResume);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onResume);
      window.removeEventListener('pageshow', onResume);
    };
  }, []);

  return null;
});

export { ForegroundResumeController };
