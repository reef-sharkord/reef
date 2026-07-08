import { getNativePlugin, isNativeApp } from '@/helpers/native';
import { useRailServers } from '@/hooks/use-connections';
import { useBackgroundConnectionEnabled } from '@/lib/background-prefs';
import { memo, useEffect } from 'react';

/**
 * On the Android shell, run the native foreground service (BackgroundConnection
 * plugin) whenever at least one server is connected, so the app process — and
 * therefore its WebSocket connections — survives backgrounding (the §3.6 mobile
 * 1006 fix). Enabling happens from the foreground (while the app is active),
 * which avoids Android 12+'s restriction on starting a foreground service from
 * the background. User-disableable (Settings → App) for people whose servers
 * deliver push while the app is dead — the service's persistent notification
 * is the cost of keep-alive. No-op on web/desktop. (UNCORD_PLAN.md §3.6, M7)
 */
const BackgroundConnectionController = memo(() => {
  const servers = useRailServers();
  const enabled = useBackgroundConnectionEnabled();
  const hasConnection = servers.length > 0;

  useEffect(() => {
    if (!isNativeApp()) {
      return;
    }

    const plugin = getNativePlugin('BackgroundConnection');

    if (!plugin) {
      return;
    }

    if (hasConnection && enabled) {
      void plugin.enable?.();
    } else {
      void plugin.disable?.();
    }
  }, [hasConnection, enabled]);

  return null;
});

export { BackgroundConnectionController };
