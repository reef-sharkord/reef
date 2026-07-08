import { getDesktopApi } from '@/helpers/desktop';
import { isNativeApp } from '@/helpers/native';
import { checkLatestRelease, RECHECK_INTERVAL_MS } from '@/lib/update-check';
import { setUpdateState } from '@/lib/update-state';
import { memo, useEffect } from 'react';

/**
 * Feeds lib/update-state with whatever update source this shell has
 * (Discord-style: the UI is a quiet titlebar button / mobile banner, no
 * pop-ups):
 *  - installed desktop: electron-updater events; the shell re-checks every 4h
 *  - portable desktop & Android: GitHub release check on launch + every 6h
 *  - plain browser: nothing (the server serves whatever client it bundles)
 */
const UpdateController = memo(() => {
  useEffect(() => {
    const api = getDesktopApi();

    if (api) {
      let version = '';

      api.onUpdateAvailable((v) => {
        version = v;
        setUpdateState({ status: 'downloading', version: v, percent: 0 });
      });

      api.onUpdateProgress((percent) => {
        setUpdateState({ status: 'downloading', version, percent });
      });

      api.onUpdateDownloaded((v) => {
        setUpdateState({ status: 'ready', version: v });
      });

      // The portable exe never receives updater events — fall back to the
      // release check. Older shells without isPortable() are installed builds.
      void api.isPortable?.().then((portable) => {
        if (!portable) {
          return;
        }

        void checkLatestRelease();
        setInterval(() => void checkLatestRelease(), RECHECK_INTERVAL_MS);
      });

      return;
    }

    if (isNativeApp()) {
      void checkLatestRelease();

      const interval = setInterval(
        () => void checkLatestRelease(),
        RECHECK_INTERVAL_MS
      );

      return () => clearInterval(interval);
    }
  }, []);

  return null;
});

export { UpdateController };
