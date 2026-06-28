import {
  setModifierKeysHeldMap,
  togglePluginSlotDebug
} from '@/features/app/actions';
import { getVoiceControlsBridge } from '@/components/voice-provider/controls-bridge';
import { memo, useCallback, useEffect } from 'react';

const HotkeysController = memo(() => {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'F4') {
      togglePluginSlotDebug();
    }

    // Global voice hotkeys: Ctrl+Shift+M toggles the mic, Ctrl+Shift+D toggles
    // deafen. They work regardless of which server is in view and are ignored
    // when not in a voice channel. `e.repeat` guards against key-hold retrigger.
    // (UNCORD_PLAN.md M2)
    if (e.ctrlKey && e.shiftKey && !e.repeat) {
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
