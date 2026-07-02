import { getDesktopApi, isDesktop } from '@/helpers/desktop';
import { Copy, Minus, Square, X } from 'lucide-react';
import { memo, useEffect, useState } from 'react';

/**
 * Custom window title bar for the Electron desktop shell (the window is
 * frameless). The bar is the drag region; the buttons opt out via .app-no-drag.
 * Renders nothing in the browser / mobile. (UNCORD_PLAN.md M6)
 */
const Titlebar = memo(() => {
  const [maximized, setMaximized] = useState(false);
  const api = getDesktopApi();

  useEffect(() => {
    if (!api) {
      return;
    }

    void api.isWindowMaximized().then(setMaximized);
    api.onMaximizeChange(setMaximized);

    // Tell full-screen overlays (#portal) how much top space the drag region
    // occupies, so they render below it instead of under it (clicks on a drag
    // region start a window drag — they never reach the overlay).
    document.documentElement.style.setProperty(
      '--reef-titlebar-height',
      '2rem'
    );

    return () => {
      document.documentElement.style.removeProperty('--reef-titlebar-height');
    };
  }, [api]);

  if (!isDesktop()) {
    return null;
  }

  const control =
    'app-no-drag flex h-8 w-12 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground';

  return (
    <div className="app-drag flex h-8 shrink-0 select-none items-center justify-between border-b bg-card">
      <div className="flex items-center gap-2 px-3">
        <img
          src={`${import.meta.env.BASE_URL}icon-192.png`}
          alt=""
          className="h-4 w-4 rounded"
        />
        <span className="text-xs font-semibold text-muted-foreground">
          REEF
        </span>
      </div>

      <div className="flex items-center">
        <button
          type="button"
          className={control}
          title="Minimize"
          onClick={() => void api?.minimizeWindow()}
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={control}
          title={maximized ? 'Restore' : 'Maximize'}
          onClick={() => void api?.toggleMaximizeWindow()}
        >
          {maximized ? (
            <Copy className="h-3.5 w-3.5" />
          ) : (
            <Square className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          className="app-no-drag flex h-8 w-12 items-center justify-center text-muted-foreground transition-colors hover:bg-red-600 hover:text-white"
          title="Close"
          onClick={() => void api?.closeWindow()}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
});

export { Titlebar };
