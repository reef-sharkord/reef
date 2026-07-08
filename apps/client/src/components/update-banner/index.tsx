import { isNativeApp } from '@/helpers/native';
import { useUpdateState } from '@/lib/update-state';
import { CircleArrowDown, X } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Mobile counterpart of the desktop titlebar update button (no title bar on
 * Android): a slim tappable banner above the app when a newer release exists.
 * Tapping opens the release page in the browser (the APK is installed over
 * the old one). Dismissible per detected version — it returns if a yet-newer
 * release appears.
 */
const UpdateBanner = memo(() => {
  const { t } = useTranslation('common');
  const update = useUpdateState();
  const [dismissedVersion, setDismissedVersion] = useState<string>();

  if (
    !isNativeApp() ||
    update.status !== 'available' ||
    update.version === dismissedVersion
  ) {
    return null;
  }

  return (
    <div className="flex shrink-0 items-center gap-2 bg-green-600 px-3 py-1.5 text-sm text-white">
      <a
        href={update.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-w-0 flex-1 items-center gap-2"
      >
        <CircleArrowDown className="h-4 w-4 shrink-0" />
        <span className="truncate">
          {t('updateBannerText', { version: update.version })}
        </span>
      </a>
      <button
        type="button"
        aria-label={t('updateBannerDismiss')}
        onClick={() => setDismissedVersion(update.version)}
        className="shrink-0 rounded p-1 hover:bg-green-700"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
});

export { UpdateBanner };
