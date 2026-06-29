// REEF Push — client entry (UnifiedPush / ntfy).
//
// Invisible home-screen component that, on the native REEF app, registers this
// device with its UnifiedPush distributor (e.g. the ntfy app) and uploads the
// resulting endpoint URL to the server via the `savePushEndpoint` action. The
// server then POSTs notifications to that endpoint.
//
// Talks to a custom native bridge `window.Capacitor.Plugins.UnifiedPush`
// (added to the REEF APK in the native stage). Inert on desktop/browser, or if
// no distributor is installed.

const React = window.__SHARKORD_REACT__;

const getUnifiedPush = () => {
  const cap = window.Capacitor;

  if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) {
    return null;
  }

  return cap.Plugins && cap.Plugins.UnifiedPush ? cap.Plugins.UnifiedPush : null;
};

const uploadEndpoint = (endpoint) => {
  if (!endpoint) {
    return;
  }

  try {
    window.__SHARKORD_STORE__.actions.executePluginAction('savePushEndpoint', {
      endpoint
    });
  } catch {
    // server may not have the plugin enabled; ignore
  }
};

function PushRegistrar() {
  React.useEffect(() => {
    const up = getUnifiedPush();

    if (!up) {
      return;
    }

    let cancelled = false;
    let listener;

    const start = async () => {
      try {
        // If we already have an endpoint, upload it immediately.
        if (typeof up.getEndpoint === 'function') {
          const current = await up.getEndpoint();
          if (!cancelled && current && current.endpoint) {
            uploadEndpoint(current.endpoint);
          }
        }

        // (Re)register with the distributor; the endpoint arrives via the
        // listener below (it's delivered asynchronously by the distributor).
        if (typeof up.register === 'function') {
          await up.register();
        }
      } catch {
        // no distributor installed / user declined — stay inert
      }
    };

    if (typeof up.addListener === 'function') {
      up.addListener('endpointChange', (event) => {
        uploadEndpoint(event && event.endpoint);
      })
        .then((handle) => {
          listener = handle;
        })
        .catch(() => {});
    }

    start();

    return () => {
      cancelled = true;
      if (listener && typeof listener.remove === 'function') {
        listener.remove();
      }
    };
  }, []);

  return null;
}

export const components = {
  home_screen: [PushRegistrar]
};
