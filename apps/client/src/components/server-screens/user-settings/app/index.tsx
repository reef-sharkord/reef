import { setAutoJoinLastChannel } from '@/features/app/actions';
import { useAutoJoinLastChannel } from '@/features/app/hooks';
import { isDesktop } from '@/helpers/desktop';
import { isNativeApp } from '@/helpers/native';
import {
  setBackgroundConnectionEnabled,
  useBackgroundConnectionEnabled
} from '@/lib/background-prefs';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Group,
  Switch
} from '@sharkord/ui';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { DesktopStartupSettings } from './desktop-startup-settings';

/** App behavior: startup + connection habits (Discord's "app settings"). */
const App = memo(() => {
  const { t } = useTranslation('settings');
  const autoJoinLastChannel = useAutoJoinLastChannel();
  const backgroundConnection = useBackgroundConnectionEnabled();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('appTitle')}</CardTitle>
        <CardDescription>{t('appDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Group
          label={t('autoJoinLastChannelLabel')}
          description={t('autoJoinLastChannelDesc')}
        >
          <Switch
            checked={autoJoinLastChannel}
            onCheckedChange={(value) => setAutoJoinLastChannel(value)}
          />
        </Group>

        {isNativeApp() && (
          <Group
            label={t('backgroundConnectionLabel')}
            description={t('backgroundConnectionDesc')}
          >
            <Switch
              checked={backgroundConnection}
              onCheckedChange={(value) => setBackgroundConnectionEnabled(value)}
            />
          </Group>
        )}

        {isDesktop() && <DesktopStartupSettings />}
      </CardContent>
    </Card>
  );
});

export { App };
