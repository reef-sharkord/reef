import {
  setHideNonVideoParticipants,
  setHideOwnScreenShare,
  setShowUserBannersInVoice
} from '@/features/server/voice/actions';
import {
  useHideNonVideoParticipants,
  useHideOwnScreenShare,
  useShowUserBannersInVoice
} from '@/features/server/voice/hooks';
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

/**
 * How voice channels are displayed. The same toggles live in the in-call
 * options popover — surfacing them here makes them findable from settings
 * (tester feedback: "Discord-minded" discoverability).
 */
const VoiceDisplaySettings = memo(() => {
  const { t } = useTranslation('settings');
  const hideNonVideo = useHideNonVideoParticipants();
  const showBanners = useShowUserBannersInVoice();
  const hideOwnShare = useHideOwnScreenShare();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('voiceDisplayTitle')}</CardTitle>
        <CardDescription>{t('voiceDisplayDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Group
          label={t('hideNonVideoLabel')}
          description={t('hideNonVideoDesc')}
        >
          <Switch
            checked={hideNonVideo}
            onCheckedChange={setHideNonVideoParticipants}
          />
        </Group>

        <Group
          label={t('showVoiceBannersLabel')}
          description={t('showVoiceBannersDesc')}
        >
          <Switch
            checked={showBanners}
            onCheckedChange={setShowUserBannersInVoice}
          />
        </Group>

        <Group
          label={t('hideOwnShareLabel')}
          description={t('hideOwnShareDesc')}
        >
          <Switch
            checked={hideOwnShare}
            onCheckedChange={setHideOwnScreenShare}
          />
        </Group>
      </CardContent>
    </Card>
  );
});

export { VoiceDisplaySettings };
