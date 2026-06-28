import { Rail } from '@/components/rail';
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
import { getConnection } from '@/lib/connections';
import { Connect } from '@/screens/connect';
import { Disconnected } from '@/screens/disconnected';
import { LoadingApp } from '@/screens/loading-app';
import { ServerView } from '@/screens/server-view';
import { DisconnectCode } from '@sharkord/shared';
import { memo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Provider } from 'react-redux';

const isHardDisconnect = (
  disconnectInfo: ReturnType<typeof useDisconnectInfo>
) =>
  !!disconnectInfo &&
  (!disconnectInfo.wasClean ||
    disconnectInfo.code === DisconnectCode.KICKED ||
    disconnectInfo.code === DisconnectCode.BANNED);

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
    document.title = serverName ? `${serverName} - Uncord` : 'Uncord';
  }, [serverName]);

  if (isAppLoading || isPluginsLoading) {
    return (
      <LoadingApp text={isAppLoading ? t('loadingApp') : t('loadingPlugins')} />
    );
  }

  if (!isConnected) {
    if (isHardDisconnect(disconnectInfo)) {
      return <Disconnected info={disconnectInfo!} />;
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

  useEffect(() => {
    if (!activeConnection) {
      document.title = 'Uncord';
    }
  }, [activeConnection]);

  if (!activeConnection) {
    if (isStandalone()) {
      // Native shells have no primary server: show the rail with an empty state
      // so the user can add (or wait for restored) servers. (M6/M7)
      return (
        <div className="flex h-full w-full">
          <Rail />
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
            {t('standaloneEmpty')}
          </div>
        </div>
      );
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

    if (isHardDisconnect(disconnectInfo)) {
      return <Disconnected info={disconnectInfo!} />;
    }

    return <Connect />;
  }

  return (
    <div className="flex h-full w-full">
      {/* Desktop: rail is always visible. Mobile: it's hidden here and revealed
          as the second stage of the swipe-right gesture inside ServerView. */}
      <Rail className="hidden md:flex" />
      <div className="min-w-0 flex-1">
        <Provider store={activeConnection.store} key={activeHost ?? ''}>
          <ActiveServerScreen />
        </Provider>
      </div>
    </div>
  );
});

export { Routing };
