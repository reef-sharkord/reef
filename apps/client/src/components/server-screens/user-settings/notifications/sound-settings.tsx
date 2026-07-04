import { playSound } from '@/features/server/sounds/actions';
import { SoundType } from '@/features/server/types';
import {
  getSoundPrefs,
  setSoundPrefs,
  type SoundGroup
} from '@/lib/sound-prefs';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Group,
  Slider,
  Switch
} from '@sharkord/ui';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const GROUPS: { key: SoundGroup; labelKey: string; descKey: string }[] = [
  {
    key: 'messages',
    labelKey: 'soundsMessages',
    descKey: 'soundsMessagesDesc'
  },
  {
    key: 'voiceJoinLeave',
    labelKey: 'soundsVoiceJoinLeave',
    descKey: 'soundsVoiceJoinLeaveDesc'
  },
  {
    key: 'muteDevice',
    labelKey: 'soundsMuteDevice',
    descKey: 'soundsMuteDeviceDesc'
  },
  {
    key: 'screenShare',
    labelKey: 'soundsScreenShare',
    descKey: 'soundsScreenShareDesc'
  },
  {
    key: 'disconnect',
    labelKey: 'soundsDisconnect',
    descKey: 'soundsDisconnectDesc'
  }
];

const SoundSettings = memo(() => {
  const { t } = useTranslation('settings');
  const [prefs, setPrefsState] = useState(() => getSoundPrefs());

  const update = (patch: Parameters<typeof setSoundPrefs>[0]) => {
    setPrefsState(setSoundPrefs(patch));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('soundsTitle')}</CardTitle>
        <CardDescription>{t('soundsDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Group
          label={t('soundsEnabledLabel')}
          description={t('soundsEnabledDesc')}
        >
          <Switch
            checked={prefs.enabled}
            onCheckedChange={(v) => update({ enabled: v })}
          />
        </Group>

        {prefs.enabled && (
          <>
            <Group
              label={t('soundsVolumeLabel')}
              description={t('soundsVolumeDesc')}
            >
              <div className="w-48">
                <Slider
                  value={[prefs.volume]}
                  min={0}
                  max={100}
                  step={5}
                  onValueChange={([v]) => update({ volume: v })}
                  onValueCommit={() => {
                    // audible confirmation at the new volume
                    void playSound(SoundType.MESSAGE_RECEIVED);
                  }}
                />
              </div>
            </Group>

            {GROUPS.map(({ key, labelKey, descKey }) => (
              <Group key={key} label={t(labelKey)} description={t(descKey)}>
                <Switch
                  checked={prefs.groups[key] !== false}
                  onCheckedChange={(v) => update({ groups: { [key]: v } })}
                />
              </Group>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
});

export { SoundSettings };
