import { LanguageSwitcher } from '@/components/language-switcher';
import { setAutoJoinLastChannel } from '@/features/app/actions';
import { useAutoJoinLastChannel } from '@/features/app/hooks';
import { isDesktop } from '@/helpers/desktop';
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
import { Appearance } from './appearance';
import { DesktopStartupSettings } from './desktop-startup-settings';
import { DndSettings } from './dnd-settings';

const Others = memo(() => {
  const { t } = useTranslation('settings');
  const autoJoinLastChannel = useAutoJoinLastChannel();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('othersTitle')}</CardTitle>
          <CardDescription>{t('othersDesc')}</CardDescription>
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

          <Group label={t('languageLabel')} description={t('languageDesc')}>
            <LanguageSwitcher />
          </Group>

          {isDesktop() && <DesktopStartupSettings />}
        </CardContent>
      </Card>

      <Appearance />
      <DndSettings />
    </div>
  );
});

export { Others };
