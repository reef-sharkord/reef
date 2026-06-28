import { getVoiceControlsBridge } from '@/components/voice-provider/controls-bridge';
import { getDesktopApi } from '@/helpers/desktop';
import { useRailServers } from '@/hooks/use-connections';
import { memo, useEffect, useRef } from 'react';

/**
 * Desktop-shell integration: global media hotkeys and the taskbar unread badge.
 * No-op in the browser / mobile (no `window.uncordDesktop`). (UNCORD_PLAN.md M6)
 */
const DesktopController = memo(() => {
  const servers = useRailServers();
  const totalUnread = servers.reduce((n, s) => n + s.unreadCount, 0);
  const hasMentions = servers.some((s) => s.hasMentions);
  const hotkeysBound = useRef(false);

  // Register the global hotkey handlers once. The main process fires these even
  // when the app is unfocused/in the tray; we toggle the active voice session.
  useEffect(() => {
    const api = getDesktopApi();

    if (!api || hotkeysBound.current) {
      return;
    }

    hotkeysBound.current = true;

    api.onToggleMic(() => {
      const bridge = getVoiceControlsBridge();

      if (bridge?.isInVoice) {
        void bridge.toggleMic();
      }
    });
    api.onToggleDeafen(() => {
      const bridge = getVoiceControlsBridge();

      if (bridge?.isInVoice) {
        void bridge.toggleSound();
      }
    });
  }, []);

  // Push the cross-server unread total to the taskbar/dock badge.
  useEffect(() => {
    const api = getDesktopApi();

    if (!api) {
      return;
    }

    void api.setUnreadBadge(totalUnread, hasMentions);
  }, [totalUnread, hasMentions]);

  return null;
});

export { DesktopController };
