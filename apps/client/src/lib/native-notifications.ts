import { getNativePlugin, isNativeApp } from '@/helpers/native';
import { setActiveHost } from '@/lib/connections';

/**
 * System notifications on the Android shell via Capacitor LocalNotifications —
 * NO push service involved (deliberately no Firebase/FCM). The app's
 * foreground service keeps the WebSockets alive while backgrounded, messages
 * keep flowing through the normal tRPC subscriptions, and the existing
 * notification pipeline (prefs, per-server/channel mute, DND) decides what
 * notifies — this module only replaces the final "show it" step, because the
 * web Notification API is inert inside the Android WebView.
 *
 * Limit to be honest about: if Android kills the app (or the user swipes it
 * away), there is no socket and therefore no notifications until the app runs
 * again. That is the price of staying push-broker-free.
 */

// Android notification ids are 32-bit ints; a wrapping counter seeded from the
// clock keeps ids unique enough without persisting anything.
let nextId = Date.now() % 2_000_000_000;

const getPlugin = () =>
  isNativeApp() ? getNativePlugin('LocalNotifications') : undefined;

const isNativeNotificationsAvailable = (): boolean => !!getPlugin();

/** Ask Android 13+ for the runtime notification permission (no-op elsewhere). */
const ensureNativeNotificationPermission = async (): Promise<void> => {
  try {
    await getPlugin()?.requestPermissions?.();
  } catch {
    // denied — sends below become silent no-ops at the OS level
  }
};

/** Tapping a notification brings the originating server to the front. */
const registerNativeNotificationTapHandler = (): void => {
  try {
    void getPlugin()?.addListener?.(
      'localNotificationActionPerformed',
      (event: unknown) => {
        const host = (event as { notification?: { extra?: { host?: string } } })
          ?.notification?.extra?.host;

        if (host) {
          setActiveHost(host);
        }
      }
    );
  } catch {
    // listener registration failed — taps just open the app
  }
};

const sendNativeNotification = (options: {
  title: string;
  body: string;
  host?: string;
}): void => {
  nextId = (nextId + 1) % 2_000_000_000;

  void getPlugin()
    ?.schedule?.({
      notifications: [
        {
          id: nextId,
          title: options.title,
          body: options.body,
          extra: options.host ? { host: options.host } : undefined
        }
      ]
    })
    ?.catch?.(() => {});
};

export {
  ensureNativeNotificationPermission,
  isNativeNotificationsAvailable,
  registerNativeNotificationTapHandler,
  sendNativeNotification
};
