import { getDesktopApi } from '@/helpers/desktop';
import { memo, useEffect } from 'react';
import { toast } from 'sonner';

/**
 * Desktop auto-update UX. When the Electron shell finishes downloading a new
 * version in the background, prompt the user to restart and install it (the
 * update also installs automatically on next quit). No-op in the browser /
 * mobile, where `window.uncordDesktop` is absent. (UNCORD_PLAN.md M6)
 */
const UpdateNotifier = memo(() => {
  useEffect(() => {
    const api = getDesktopApi();

    if (!api) {
      return;
    }

    api.onUpdateDownloaded((version) => {
      toast('Update ready', {
        description: `REEF ${version} will be installed. Restart to update now.`,
        duration: Infinity,
        action: {
          label: 'Restart now',
          onClick: () => {
            void api.quitAndInstallUpdate();
          }
        }
      });
    });
  }, []);

  return null;
});

export { UpdateNotifier };
