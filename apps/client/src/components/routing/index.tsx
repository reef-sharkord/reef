import { Rail } from '@/components/rail';
import { Welcome } from '@/components/welcome';
import {
  useIsAppLoading,
  useIsAutoConnecting,
  useIsPluginsLoading
} from '@/features/app/hooks';
import {
  useDisconnectInfo,
  useIsConnected,
  useServerName
} from '@/features/server/hooks';
import { isStandalone } from '@/helpers/standalone';
import { useRailServers } from '@/hooks/use-connections';
import { useIsRestoringSavedServers } from '@/lib/boot-state';
import { getConnection } from '@/lib/connections';
import { cn } from '@/lib/utils';
import { BootRestore } from '@/screens/boot-restore';
import { Connect } from '@/screens/connect';
import { Disconnected } from '@/screens/disconnected';
import { LoadingApp } from '@/screens/loading-app';
import { Reconnecting } from '@/screens/reconnecting';
import { ServerView } from '@/screens/server-view';
import { DisconnectCode } from '@sharkord/shared';
import { PanelLeftOpen } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Provider } from 'react-redux';

// Kicked/banned are terminal: the user must act. A transient unclean drop
// (1006, Wi-Fi flap, server restart) instead gets the Reconnecting screen
// while the ReconnectController retries in the background.
const isTerminalDisconnect = (
  disconnectInfo: ReturnType<typeof useDisconnectInfo>
) =>
  !!disconnectInfo &&
  (disconnectInfo.code === DisconnectCode.KICKED ||
    disconnectInfo.code === DisconnectCode.BANNED);

const isTransientDisconnect = (
  disconnectInfo: ReturnType<typeof useDisconnectInfo>
) =>
  !!disconnectInfo &&
  !disconnectInfo.wasClean &&
  !isTerminalDisconnect(disconnectInfo);

/**
 * The screen for the currently-active server. Rendered under that server's own
 * Redux store Provider, so all hooks/components read the active server's state.
 */
const ActiveServerScreen = memo(() => {
  const { t } = useTranslation('connect');
  const isConnected = useIsConnected();
  const isAppLoading = useIsAppLoading();
  const isPluginsLoading = useIsPluginsLoading();
  const disconnectInfo = useDisconnectInfo();
  const serverName = useServerName();

  useEffect(() => {
    document.title = serverName ? `${serverName} - REEF` : 'REEF';
  }, [serverName]);

  if (isAppLoading || isPluginsLoading) {
    return (
      <LoadingApp text={isAppLoading ? t('loadingApp') : t('loadingPlugins')} />
    );
  }

  if (!isConnected) {
    if (isTerminalDisconnect(disconnectInfo)) {
      return <Disconnected info={disconnectInfo!} />;
    }

    if (isTransientDisconnect(disconnectInfo)) {
      return <Reconnecting />;
    }

    return <Connect />;
  }

  return <ServerView />;
});

const Routing = memo(() => {
  const { t } = useTranslation('connect');

  const railServers = useRailServers();
  const activeHost =
    railServers.find((server) => server.isActive)?.host ?? null;
  const activeConnection = activeHost ? getConnection(activeHost) : undefined;

  // Proxy-based gates for the pre-connection flow (boot + first server).
  const isAppLoading = useIsAppLoading();
  const isPluginsLoading = useIsPluginsLoading();
  const isAutoConnecting = useIsAutoConnecting();
  const disconnectInfo = useDisconnectInfo();
  const isActiveConnected = useIsConnected();
  const isRestoringSavedServers = useIsRestoringSavedServers();

  // Mobile rail for the disconnected states (Connect/Disconnected/Loading),
  // where ServerView — and its swipe-to-open rail — isn't mounted. Without this
  // a mobile user whose active server drops (kick/ban/reconnect) would be
  // stranded with no way to switch to another connected server. When connected,
  // ServerView's own two-stage swipe provides the rail.
  const [mobileRailOpen, setMobileRailOpen] = useState(false);

  useEffect(() => {
    if (isActiveConnected) {
      setMobileRailOpen(false);
    }
  }, [isActiveConnected]);

  useEffect(() => {
    if (!activeConnection) {
      document.title = 'REEF';
    }
  }, [activeConnection]);

  // Launch: while the rail is reconnecting saved servers, the boot landing
  // screen covers EVERYTHING — including the intermediate joins, which make
  // themselves the active connection and would otherwise flash the login
  // screen and hop between servers (tester feedback, 2026-07-08). Restoring
  // is initialized synchronously in boot-state, so even the first render
  // never flashes Welcome.
  if (isStandalone() && isRestoringSavedServers) {
    return <BootRestore />;
  }

  if (!activeConnection) {
    if (isStandalone()) {
      // Native shells have no primary server: show the branded welcome / empty
      // state so the user can add their first server. (M6/M7)
      return <Welcome />;
    }

    if (isAppLoading || isPluginsLoading) {
      return (
        <LoadingApp
          text={isAppLoading ? t('loadingApp') : t('loadingPlugins')}
        />
      );
    }

    if (isAutoConnecting) {
      return <LoadingApp text={t('loggingInAutomatically')} />;
    }

    if (isTerminalDisconnect(disconnectInfo)) {
      return <Disconnected info={disconnectInfo!} />;
    }

    if (isTransientDisconnect(disconnectInfo)) {
      return <Reconnecting />;
    }

    return <Connect />;
  }

  return (
    <div className="flex h-full w-full">
      {/* Desktop: rail is always visible. Mobile: it's hidden here and revealed
          as the second stage of the swipe-right gesture inside ServerView. */}
      <Rail className="hidden md:flex" />

      {/* Mobile, disconnected-state only: an opener button + the rail drawer, so
          the user can always switch servers even when ServerView isn't mounted. */}
      {!isActiveConnected && (
        <>
          <button
            type="button"
            onClick={() => setMobileRailOpen(true)}
            aria-label="Show servers"
            className="md:hidden fixed top-3 left-3 z-[55] flex items-center gap-1 rounded-md bg-card/90 px-2 py-1.5 text-sm text-foreground shadow-md backdrop-blur"
          >
            <PanelLeftOpen className="h-4 w-4" />
            Servers
          </button>

          {mobileRailOpen && (
            <div
              className="md:hidden fixed inset-0 bg-black/50 z-[45]"
              onClick={() => setMobileRailOpen(false)}
            />
          )}

          <Rail
            className={cn(
              'md:hidden fixed top-0 bottom-0 left-0 z-50 transition-transform duration-300 ease-in-out',
              mobileRailOpen ? 'translate-x-0' : '-translate-x-full'
            )}
          />
        </>
      )}

      <div className="min-w-0 flex-1">
        <Provider store={activeConnection.store} key={activeHost ?? ''}>
          <ActiveServerScreen />
        </Provider>
      </div>
    </div>
  );
});

export { Routing };
