import { isNativeApp } from '@/helpers/native';
import { subscribe } from '@/lib/connections';
import {
  ensureNativeNotificationPermission,
  registerNativeNotificationTapHandler
} from '@/lib/native-notifications';
import { registerPushTopicWithServers } from '@/lib/reef-push';
import { memo, useEffect } from 'react';

// reefFeatures arrives shortly after join (a plugin action round-trip), so a
// single pass on registry change would race it — recheck on a slow tick too.
const RECHECK_MS = 30_000;

/**
 * Android shell notification wiring (deliberately Firebase-free):
 * - asks for the Android 13+ notification permission and routes notification
 *   taps to the originating server (local notifications from the live socket
 *   handle the app-alive case — see lib/native-notifications.ts);
 * - registers this device's private ntfy topic with every connected server
 *   whose reef plugin has push enabled, covering DMs/@mentions while the app
 *   is dead (see lib/reef-push.ts).
 * No-op on web/desktop.
 */
const NativePushController = memo(() => {
  useEffect(() => {
    if (!isNativeApp()) {
      return;
    }

    void ensureNativeNotificationPermission();
    registerNativeNotificationTapHandler();

    const unsubscribe = subscribe(() => void registerPushTopicWithServers());
    const interval = setInterval(
      () => void registerPushTopicWithServers(),
      RECHECK_MS
    );

    void registerPushTopicWithServers();

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  return null;
});

export { NativePushController };
