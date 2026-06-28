import { getDesktopApi } from '@/helpers/desktop';
import { Group, Switch } from '@sharkord/ui';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Desktop-only launch settings (open at login, start minimized to tray). Reads
 * the current state from the Electron shell and writes changes back through the
 * `window.uncordDesktop` bridge. (UNCORD_PLAN.md M6)
 */
const DesktopStartupSettings = memo(() => {
  const { t } = useTranslation('settings');
  const [openAtLogin, setOpenAtLogin] = useState(false);
  const [openInTray, setOpenInTray] = useState(false);

  useEffect(() => {
    const api = getDesktopApi();

    if (!api) {
      return;
    }

    void api.getStartupSettings().then((settings) => {
      setOpenAtLogin(settings.openAtLogin);
      setOpenInTray(settings.openInTray);
    });
  }, []);

  const apply = (login: boolean, tray: boolean) => {
    setOpenAtLogin(login);
    setOpenInTray(tray);
    void getDesktopApi()?.setStartupSettings(login, tray);
  };

  return (
    <>
      <Group
        label={t('launchOnStartupLabel')}
        description={t('launchOnStartupDesc')}
      >
        <Switch
          checked={openAtLogin}
          onCheckedChange={(value) => apply(value, value ? openInTray : false)}
        />
      </Group>

      {openAtLogin && (
        <Group
          label={t('startInTrayLabel')}
          description={t('startInTrayDesc')}
        >
          <Switch
            checked={openInTray}
            onCheckedChange={(value) => apply(openAtLogin, value)}
          />
        </Group>
      )}
    </>
  );
});

export { DesktopStartupSettings };
