// REEF Push — client entry.
//
// Renders an invisible component into the home screen that, on the native REEF
// app only, asks the native Firebase Messaging plugin for this device's FCM
// token and uploads it to the server via the plugin action `saveFcmToken`.
// On the browser / desktop (no Capacitor FirebaseMessaging) it does nothing.

const React = window.__SHARKORD_REACT__;

const getMessaging = () => {
  const cap = window.Capacitor;

  if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) {
    return null;
  }

  return cap.Plugins && cap.Plugins.FirebaseMessaging
    ? cap.Plugins.FirebaseMessaging
    : null;
};

const uploadToken = (token) => {
  if (!token) {
    return;
  }

  try {
    window.__SHARKORD_STORE__.actions.executePluginAction('saveFcmToken', {
      token
    });
  } catch {
    // server may not have the plugin enabled; ignore
  }
};

function PushRegistrar() {
  React.useEffect(() => {
    const messaging = getMessaging();

    if (!messaging) {
      return;
    }

    let cancelled = false;
    let listenerHandle;

    const register = async () => {
      try {
        await messaging.requestPermissions();
        const result = await messaging.getToken();

        if (!cancelled && result && result.token) {
          uploadToken(result.token);
        }
      } catch {
        // permission denied or Firebase not configured in this build
      }
    };

    register();

    if (typeof messaging.addListener === 'function') {
      messaging
        .addListener('tokenReceived', (event) => {
          uploadToken(event && event.token);
        })
        .then((handle) => {
          listenerHandle = handle;
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
      if (listenerHandle && typeof listenerHandle.remove === 'function') {
        listenerHandle.remove();
      }
    };
  }, []);

  return null;
}

export const components = {
  home_screen: [PushRegistrar]
};
