import { useEffect, type RefObject } from 'react';

/**
 * Pause a preview <video> when the app window is hidden or unfocused, resuming
 * when it returns to focus.
 *
 * This affects only the LOCAL preview render (a CPU/GPU saving) — the outbound
 * MediaStreamTrack keeps flowing, so remote viewers still see the screen share
 * even while the sharer is looking at something else. That distinction matters:
 * we must never gate the *sent* track on the sharer's focus, only the self-view.
 */
export const usePausePreviewWhenHidden = (
  ref: RefObject<HTMLVideoElement | null>,
  enabled: boolean
): void => {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Track the element the listeners last acted on, so cleanup can resume it
    // without reading ref.current (which may have changed by teardown time).
    let current: HTMLVideoElement | null = null;

    const sync = () => {
      current = ref.current;

      if (!current) {
        return;
      }

      if (document.hidden || !document.hasFocus()) {
        current.pause();
      } else {
        void current.play().catch(() => {
          // Autoplay/interaction races are harmless here — the element resumes
          // on the next focus/visibility event.
        });
      }
    };

    document.addEventListener('visibilitychange', sync);
    window.addEventListener('blur', sync);
    window.addEventListener('focus', sync);
    sync();

    return () => {
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('blur', sync);
      window.removeEventListener('focus', sync);

      // Resume so the element isn't left stuck paused if it outlives the effect.
      void current?.play().catch(() => {});
    };
  }, [ref, enabled]);
};
