import { getDesktopApi } from '@/helpers/desktop';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@sharkord/ui';
import { AppWindow, Monitor } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

/**
 * In-app screen-share source picker (desktop only). When the user starts a
 * screen share, the Electron main process enumerates the available screens and
 * windows and asks us to choose one (see desktop/src/main.ts). We show a grid of
 * thumbnails and reply with the chosen source id — or null if the user cancels,
 * which denies the getDisplayMedia request cleanly. On the web/mobile the bridge
 * is absent, so this renders nothing.
 */
const SourceTile = memo(
  ({
    source,
    onPick
  }: {
    source: DesktopCaptureSource;
    onPick: (id: string) => void;
  }) => (
    <button
      type="button"
      onClick={() => onPick(source.id)}
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-muted/30 text-left transition-colors hover:border-primary hover:bg-muted/60"
    >
      <div className="aspect-video w-full overflow-hidden bg-black/40">
        <img
          src={source.thumbnail}
          alt={source.name}
          className="h-full w-full object-contain"
        />
      </div>
      <div className="flex items-center gap-2 px-2 py-1.5">
        {source.appIcon && (
          <img src={source.appIcon} alt="" className="h-4 w-4 flex-shrink-0" />
        )}
        <span className="truncate text-xs">{source.name}</span>
      </div>
    </button>
  )
);

const Section = memo(
  ({
    title,
    icon,
    sources,
    onPick
  }: {
    title: string;
    icon: React.ReactNode;
    sources: DesktopCaptureSource[];
    onPick: (id: string) => void;
  }) => (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        {icon}
        {title}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {sources.map((source) => (
          <SourceTile key={source.id} source={source} onPick={onPick} />
        ))}
      </div>
    </div>
  )
);

const ScreenSharePicker = memo(() => {
  const { t } = useTranslation('sidebar');
  const [sources, setSources] = useState<DesktopCaptureSource[] | null>(null);

  useEffect(() => {
    const api = getDesktopApi();

    api?.onScreenShareSources?.((next) => setSources(next));
  }, []);

  const choose = useCallback((id: string | null) => {
    getDesktopApi()?.pickScreenShareSource(id);
    setSources(null);
  }, []);

  useEffect(() => {
    if (!sources) {
      return;
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        choose(null);
      }
    };

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, [sources, choose]);

  if (!sources) {
    return null;
  }

  const screens = sources.filter((s) => s.isScreen);
  const windows = sources.filter((s) => !s.isScreen);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={() => choose(null)}
    >
      <Card
        className="flex max-h-[80vh] w-full max-w-3xl flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader>
          <CardTitle>{t('screenSharePickerTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 space-y-6 overflow-y-auto">
          {screens.length > 0 && (
            <Section
              title={t('screenSharePickerScreens')}
              icon={<Monitor className="h-4 w-4" />}
              sources={screens}
              onPick={choose}
            />
          )}
          {windows.length > 0 && (
            <Section
              title={t('screenSharePickerWindows')}
              icon={<AppWindow className="h-4 w-4" />}
              sources={windows}
              onPick={choose}
            />
          )}
        </CardContent>
        <div className="flex justify-end border-t border-border p-4">
          <Button variant="ghost" onClick={() => choose(null)}>
            {t('screenSharePickerCancel')}
          </Button>
        </div>
      </Card>
    </div>,
    document.body
  );
});

export { ScreenSharePicker };
