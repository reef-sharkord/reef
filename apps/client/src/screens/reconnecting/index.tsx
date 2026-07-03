import { setDisconnectInfo } from '@/features/server/actions';
import { Button, Spinner } from '@sharkord/ui';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Shown when the active server dropped on a transient/unclean close while the
 * ReconnectController retries in the background — instead of dumping the user
 * on the Disconnected/Connect screens for a drop that usually heals itself.
 * The escape hatch clears the disconnect info, which lands on Connect.
 */
const Reconnecting = memo(() => {
  const { t } = useTranslation('disconnected');

  const giveUp = useCallback(() => {
    setDisconnectInfo(undefined);
  }, []);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <Spinner size="lg" />
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{t('reconnecting')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('reconnectingMessage')}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={giveUp}>
        {t('goToConnectScreen')}
      </Button>
    </div>
  );
});

export { Reconnecting };
