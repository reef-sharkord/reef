import { AsciiReefBackdrop } from '@/components/welcome/ascii-reef';
import { useRailServers } from '@/hooks/use-connections';
import { setRestoringSavedServers } from '@/lib/boot-state';
import {
  getRailCustom,
  getRailOrder,
  sortHostsByOrder
} from '@/lib/rail-prefs';
import { getSavedServers } from '@/lib/saved-servers';
import { cn } from '@/lib/utils';
import { Button, Spinner } from '@sharkord/ui';
import { AlertTriangle, Check, Circle } from 'lucide-react';
import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

// If restore somehow never settles (a hung join, an unexpected error path),
// offer a way into the app rather than trapping the user on the boot screen.
const ESCAPE_HATCH_MS = 20_000;

type RowStatus = 'pending' | 'connecting' | 'connected' | 'failed';

const StatusIcon = memo(({ status }: { status: RowStatus }) => {
  switch (status) {
    case 'connected':
      return <Check className="h-4 w-4 text-green-500" />;
    case 'failed':
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    case 'connecting':
      return <Spinner size="xxs" />;
    default:
      return <Circle className="h-3 w-3 text-muted-foreground/40" />;
  }
});

/**
 * Launch landing screen for the standalone shells: shown while the saved rail
 * servers reconnect one by one (top of the rail first), with a live row per
 * server. Covers the whole restore so the login screen and the per-server
 * joins never flash through (tester feedback, 2026-07-08).
 */
const BootRestore = memo(() => {
  const { t } = useTranslation('connect');
  const railServers = useRailServers();
  const [showEscape, setShowEscape] = useState(false);

  // The saved list and order don't change during boot — read once.
  const saved = useMemo(
    () => sortHostsByOrder(getSavedServers(), getRailOrder()),
    []
  );

  useEffect(() => {
    const timer = setTimeout(() => setShowEscape(true), ESCAPE_HATCH_MS);

    return () => clearTimeout(timer);
  }, []);

  const rows = saved.map((server) => {
    const live = railServers.find((rail) => rail.host === server.host);
    const status: RowStatus = !live
      ? 'pending'
      : live.status === 'open'
        ? 'connected'
        : live.status === 'closed'
          ? 'failed'
          : 'connecting';

    return {
      host: server.host,
      name: getRailCustom(server.host).name || server.name,
      iconUrl: server.iconUrl,
      status
    };
  });

  const connectedCount = rows.filter((r) => r.status === 'connected').length;
  const anyFailed = rows.some((r) => r.status === 'failed');

  return (
    <div className="relative isolate flex h-full w-full flex-col items-center justify-center gap-6 overflow-hidden p-6">
      <AsciiReefBackdrop />

      <img
        src={`${import.meta.env.BASE_URL}icon-192.png`}
        alt="REEF"
        className="h-16 w-16 rounded-2xl shadow-lg"
      />

      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold tracking-tight">REEF</h1>
        <p className="text-sm text-muted-foreground">
          {t('bootRestoreProgress', {
            connected: connectedCount,
            total: rows.length
          })}
        </p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-2">
        {rows.map((row) => (
          <div
            key={row.host}
            className={cn(
              'flex items-center gap-3 rounded-md border bg-card/70 px-3 py-2 backdrop-blur',
              row.status === 'pending' && 'opacity-50'
            )}
          >
            {row.iconUrl ? (
              <img
                src={row.iconUrl}
                alt=""
                className="h-6 w-6 rounded-md object-cover"
              />
            ) : (
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-xs font-semibold">
                {row.name.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="min-w-0 flex-1 truncate text-sm">{row.name}</span>
            <StatusIcon status={row.status} />
          </div>
        ))}
      </div>

      {anyFailed && (
        <p className="max-w-xs text-center text-xs text-muted-foreground">
          {t('bootRestoreFailedHint')}
        </p>
      )}

      {showEscape && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRestoringSavedServers(false)}
        >
          {t('bootRestoreContinue')}
        </Button>
      )}
    </div>
  );
});

export { BootRestore };
