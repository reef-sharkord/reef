import { Tabs, TabsContent, TabsList, TabsTrigger } from '@sharkord/ui';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TServerScreenBaseProps } from '../screens';
import { ServerScreenLayout } from '../server-screen-layout';
import { Account } from './account';
import { App } from './app';
import { Appearance } from './appearance';
import { Devices } from './devices';
import { VoiceDisplaySettings } from './devices/voice-display-settings';
import { Feedback } from './feedback';
import { Notifications } from './notifications';
import { Profile } from './profile';

type TUserSettingsProps = TServerScreenBaseProps;

// Discord-style settings taxonomy (tester feedback 2026-07-04): Account /
// Profile / Appearance / Voice & Video / Notifications / App / Feedback —
// no more "Others" junk drawer.
const UserSettings = memo(({ close }: TUserSettingsProps) => {
  const { t } = useTranslation('settings');

  return (
    <ServerScreenLayout close={close} title={t('userSettingsTitle')}>
      <div className="mx-auto max-w-4xl">
        <Tabs defaultValue="profile" className="w-full">
          {/* h-auto + flex-wrap: with seven tabs the list must wrap on
              narrow (mobile) screens instead of overflowing. */}
          <TabsList className="mb-6 h-auto flex-wrap">
            <TabsTrigger value="profile">{t('profileTab')}</TabsTrigger>
            <TabsTrigger value="account">{t('accountTab')}</TabsTrigger>
            <TabsTrigger value="appearance">{t('appearanceTab')}</TabsTrigger>
            <TabsTrigger value="voice">{t('voiceVideoTab')}</TabsTrigger>
            <TabsTrigger value="notifications">
              {t('notificationsTab')}
            </TabsTrigger>
            <TabsTrigger value="app">{t('appTab')}</TabsTrigger>
            <TabsTrigger value="feedback">{t('feedbackTab')}</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-6">
            <Profile />
          </TabsContent>
          <TabsContent value="account" className="space-y-6">
            <Account />
          </TabsContent>
          <TabsContent value="appearance" className="space-y-6">
            <Appearance />
          </TabsContent>
          <TabsContent value="voice" className="space-y-6">
            <Devices />
            <VoiceDisplaySettings />
          </TabsContent>
          <TabsContent value="notifications" className="space-y-6">
            <Notifications />
          </TabsContent>
          <TabsContent value="app" className="space-y-6">
            <App />
          </TabsContent>
          <TabsContent value="feedback" className="space-y-6">
            <Feedback />
          </TabsContent>
        </Tabs>
      </div>
    </ServerScreenLayout>
  );
});

export { UserSettings };
