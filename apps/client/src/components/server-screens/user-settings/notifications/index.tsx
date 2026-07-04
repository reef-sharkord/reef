import {
  setBrowserNotifications,
  setBrowserNotificationsForDms,
  setBrowserNotificationsForMentions,
  setBrowserNotificationsForReplies
} from '@/features/app/actions';
import {
  useBrowserNotifications,
  useBrowserNotificationsForDms,
  useBrowserNotificationsForMentions,
  useBrowserNotificationsForReplies
} from '@/features/app/hooks';
import { isNativeApp } from '@/helpers/native';
import {
  getOrCreatePushTopic,
  getPushRegistrations,
  subscribePushRegistrations
} from '@/lib/reef-push';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Group,
  Switch
} from '@sharkord/ui';
import { BellRing } from 'lucide-react';
import { memo, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { DndSettings } from './dnd-settings';
import { SoundSettings } from './sound-settings';

const Notifications = memo(() => {
  const { t } = useTranslation('settings');
  const browserNotifications = useBrowserNotifications();
  const browserNotificationsForMentions = useBrowserNotificationsForMentions();
  const browserNotificationsForDms = useBrowserNotificationsForDms();
  const browserNotificationsForReplies = useBrowserNotificationsForReplies();
  const pushRegistrations = useSyncExternalStore(
    subscribePushRegistrations,
    getPushRegistrations,
    getPushRegistrations
  );

  // One subscribe link per distinct ntfy instance the connected servers use
  // (usually just one: ntfy.sh). Webhook-method servers deliver through the
  // admin's own infrastructure — nothing for the user to subscribe to.
  const ntfyServers = Array.from(
    new Set(
      pushRegistrations
        .map((r) => r.ntfyServerUrl)
        .filter((url): url is string => !!url)
    )
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('notificationsTitle')}</CardTitle>
          <CardDescription>{t('notificationsDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Group
            label={t('allMessagesLabel')}
            description={t('allMessagesDesc')}
          >
            <Switch
              checked={browserNotifications}
              onCheckedChange={(value) => setBrowserNotifications(value)}
            />
          </Group>
          <Group
            label={t('mentionsOnlyLabel')}
            description={t('mentionsOnlyDesc')}
          >
            <Switch
              checked={browserNotificationsForMentions}
              onCheckedChange={(value) =>
                setBrowserNotificationsForMentions(value)
              }
            />
          </Group>
          <Group
            label={t('dmNotificationsLabel')}
            description={t('dmNotificationsDesc')}
          >
            <Switch
              checked={browserNotificationsForDms}
              onCheckedChange={(value) => setBrowserNotificationsForDms(value)}
            />
          </Group>
          <Group
            label={t('repliesNotificationsLabel')}
            description={t('repliesNotificationsDesc')}
          >
            <Switch
              checked={browserNotificationsForReplies}
              onCheckedChange={(value) =>
                setBrowserNotificationsForReplies(value)
              }
            />
          </Group>

          {isNativeApp() && ntfyServers.length > 0 && (
            <Group label={t('ntfyPushLabel')} description={t('ntfyPushDesc')}>
              <div className="flex flex-col items-end gap-1">
                {ntfyServers.map((serverUrl) => (
                  <Button key={serverUrl} asChild variant="outline" size="sm">
                    <a
                      href={`${serverUrl}/${getOrCreatePushTopic()}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <BellRing className="mr-2 h-4 w-4" />
                      {t('ntfySubscribeBtn')}
                    </a>
                  </Button>
                ))}
              </div>
            </Group>
          )}
        </CardContent>
      </Card>

      <SoundSettings />
      <DndSettings />
    </div>
  );
});

export { Notifications };
