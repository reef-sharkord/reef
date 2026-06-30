import { getVoiceControlsBridge } from '@/components/voice-provider/controls-bridge';
import {
  setModifierKeysHeldMap,
  togglePluginSlotDebug
} from '@/features/app/actions';
import { isDesktop } from '@/helpers/desktop';
import { memo, useCallback, useEffect } from 'react';

const HotkeysController = memo(() => {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'F4') {
      togglePluginSlotDebug();
    }

    // Global voice hotkeys: Ctrl+Shift+M toggles the mic, Ctrl+Shift+D toggles
    // deafen. They work regardless of which server is in view and are ignored
    // when not in a voice channel. `e.repeat` guards against key-hold retrigger.
    // On the desktop shell these are handled by an OS-level globalShortcut
    // instead (works when unfocused), so skip the in-app handler to avoid
    // double-firing. (UNCORD_PLAN.md M2/M6)
    if (e.ctrlKey && e.shiftKey && !e.repeat && !isDesktop()) {
      const bridge = getVoiceControlsBridge();
      const key = e.key.toLowerCase();

      if (bridge?.isInVoice && (key === 'm' || key === 'd')) {
        e.preventDefault();

        if (key === 'm') {
          void bridge.toggleMic();
        } else {
          void bridge.toggleSound();
        }
      }
    }

    if (e.key === 'Alt') {
      e.preventDefault();
    }
    setModifierKeysHeldMap({
      Shift: e.shiftKey,
      Control: e.ctrlKey,
      Alt: e.altKey
    });
  }, []);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    setModifierKeysHeldMap({
      Shift: e.shiftKey,
      Control: e.ctrlKey,
      Alt: e.altKey
    });
  }, []);

  const handleBlur = useCallback(() => {
    setModifierKeysHeldMap({
      Shift: false,
      Control: false,
      Alt: false
    });
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [handleKeyDown, handleKeyUp, handleBlur]);
  return null;
});

export { HotkeysController };
