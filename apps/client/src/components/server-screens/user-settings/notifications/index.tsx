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
  subscribePushRegistrations,
  type TPushRegistration
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
import { BellRing, CheckCircle2, CircleAlert, Copy } from 'lucide-react';
import { memo, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { DndSettings } from './dnd-settings';
import { SoundSettings } from './sound-settings';

const PUSH_GUIDE_URL =
  'https://github.com/reef-sharkord/reef/blob/main/docs/PUSH_NOTIFICATIONS.md';

const STATUS_I18N_KEY: Record<TPushRegistration['status'], string> = {
  registered: 'pushStatusRegistered',
  'no-plugin': 'pushStatusNoPlugin',
  'push-off': 'pushStatusPushOff',
  'no-permission': 'pushStatusNoPermission',
  'fcm-unavailable': 'pushStatusFcmUnavailable',
  error: 'pushStatusError'
};

/**
 * One row per rail server: its push status in plain words, and — when the
 * server delivers via ntfy — the button that opens this device's private
 * topic in the ntfy app. Always visible on mobile so a broken setup explains
 * itself instead of hiding (tester feedback, 2026-07-08).
 *
 * Subscribe uses ntfy's `ntfy://<host>/<topic>` deep link, which opens the
 * ntfy APP and subscribes in one tap — a plain https link only opens the
 * browser and forces the user to copy the topic by hand (tester feedback,
 * 2026-07-09; ntfy docs say https subscribe links are not possible on
 * Android). The copy button covers the no-app / self-hosted edge cases.
 */
const PushServerRow = memo(({ reg }: { reg: TPushRegistration }) => {
  const { t } = useTranslation('settings');
  const ready = reg.status === 'registered';
  const topic = getOrCreatePushTopic();

  const copyTopic = async () => {
    try {
      await navigator.clipboard.writeText(topic);
      toast.success(t('ntfyTopicCopied'));
    } catch {
      toast.error(t('ntfyTopicCopyFailed'));
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border p-3">
      <div className="flex min-w-0 items-center gap-2">
        {ready ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
        ) : (
          <CircleAlert className="h-4 w-4 shrink-0 text-yellow-500" />
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{reg.serverName}</div>
          <div className="text-xs text-muted-foreground">
            {t(STATUS_I18N_KEY[reg.status])}
          </div>
        </div>
      </div>
      {ready && reg.ntfyServerUrl && (
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a
              href={`${reg.ntfyServerUrl.replace(/^https?:\/\//, 'ntfy://')}/${topic}`}
            >
              <BellRing className="mr-2 h-4 w-4" />
              {t('ntfySubscribeBtn')}
            </a>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('ntfyCopyTopic')}
            title={t('ntfyCopyTopic')}
            onClick={() => void copyTopic()}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
});

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
        </CardContent>
      </Card>

      {isNativeApp() && (
        <Card>
          <CardHeader>
            <CardTitle>{t('ntfyPushLabel')}</CardTitle>
            <CardDescription>
              {t('ntfyPushDesc')}{' '}
              <a
                href={PUSH_GUIDE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                {t('pushGuideLink')}
              </a>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {pushRegistrations.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                {t('pushNoServers')}
              </div>
            ) : (
              pushRegistrations.map((reg) => (
                <PushServerRow key={reg.host} reg={reg} />
              ))
            )}
          </CardContent>
        </Card>
      )}

      <SoundSettings />
      <DndSettings />
    </div>
  );
});

export { Notifications };
