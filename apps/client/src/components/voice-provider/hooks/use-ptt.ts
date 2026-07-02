import { getDesktopApi } from '@/helpers/desktop';
import { useCallback, useEffect, useRef } from 'react';

type TUsePttParams = {
  enabled: boolean;
  pttKey: string;
  onHeldChange: (held: boolean) => void;
};

/**
 * Push-to-Talk key tracking. Reports whether the configured key
 * (KeyboardEvent.code) is currently held. The hook never touches the mic
 * track itself — the voice provider owns track state and combines this with
 * mute/input mode.
 *
 * Two sources, best available wins:
 * - Desktop shell: a global OS keyboard hook (see desktop/src/ptt.ts), so PTT
 *   works while tabbed into a game. Bound only while `enabled` — i.e. only
 *   while actually in voice with PTT mode selected.
 * - Everywhere else (browser, mobile, bind failure): window-scoped key events;
 *   losing window focus releases, so the mic can't stick open.
 *
 * The window listeners stay attached even when the global hook is active:
 * they suppress the key's default action while the app is focused (so the PTT
 * key doesn't type into chat), and their held reports are idempotent with the
 * hook's.
 */
const usePtt = ({ enabled, pttKey, onHeldChange }: TUsePttParams) => {
  const isHeldRef = useRef(false);
  const usingGlobalRef = useRef(false);
  // Refs keep the listeners stable across prop changes without re-registering.
  const pttKeyRef = useRef(pttKey);
  const onHeldChangeRef = useRef(onHeldChange);

  useEffect(() => {
    pttKeyRef.current = pttKey;
  }, [pttKey]);

  useEffect(() => {
    onHeldChangeRef.current = onHeldChange;
  }, [onHeldChange]);

  const setHeld = useCallback((held: boolean) => {
    if (isHeldRef.current === held) return;

    isHeldRef.current = held;
    onHeldChangeRef.current(held);
  }, []);

  // Global hook via the desktop bridge (when present and the bind succeeds).
  useEffect(() => {
    if (!enabled) return;

    const desktop = getDesktopApi();

    if (!desktop?.pttBind || !desktop.pttUnbind || !desktop.onPttHeldChange) {
      return;
    }

    let cancelled = false;

    const unsubscribe = desktop.onPttHeldChange((held) => {
      if (cancelled) return;

      setHeld(held);
    });

    desktop
      .pttBind(pttKey)
      .then((bound) => {
        if (cancelled) return;

        usingGlobalRef.current = bound;
      })
      .catch(() => {
        // main-process failure — window-scoped fallback keeps working
      });

    return () => {
      cancelled = true;
      usingGlobalRef.current = false;
      unsubscribe();
      void desktop.pttUnbind?.();
      setHeld(false);
    };
  }, [enabled, pttKey, setHeld]);

  // Window-scoped key events: the only source off-desktop, and the
  // preventDefault layer on desktop.
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== pttKeyRef.current) return;

      event.preventDefault();
      setHeld(true); // no-ops on key auto-repeat and alongside the global hook
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== pttKeyRef.current) return;

      setHeld(false);
    };

    const handleBlur = () => {
      // With the global hook active the key is still tracked while unfocused —
      // releasing here would defeat the point of global PTT.
      if (usingGlobalRef.current) return;

      setHeld(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      setHeld(false);
    };
  }, [enabled, setHeld]);
};

export { usePtt };
