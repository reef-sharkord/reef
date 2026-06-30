import { useTheme } from '@/components/theme-provider';
import {
  ACCENT_PRESETS,
  getAppearance,
  setAppearance,
  TEXT_SCALE_MAX,
  TEXT_SCALE_MIN
} from '@/lib/appearance';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Group,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider
} from '@sharkord/ui';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const Appearance = memo(() => {
  const { t } = useTranslation('settings');
  const { theme, setTheme } = useTheme();
  const [accent, setAccentState] = useState(() => getAppearance().accent);
  const [scale, setScaleState] = useState(
    () => getAppearance().textScale ?? 100
  );

  const chooseAccent = (value?: string) => {
    setAppearance({ accent: value });
    setAccentState(value);
  };

  const chooseScale = (value: number) => {
    setAppearance({ textScale: value });
    setScaleState(value);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('appearanceTitle')}</CardTitle>
        <CardDescription>{t('appearanceDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Group label={t('themeLabel')} description={t('themeDesc')}>
          <Select
            value={theme}
            onValueChange={(v) => setTheme(v as 'light' | 'dark' | 'system')}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">{t('themeSystem')}</SelectItem>
              <SelectItem value="dark">{t('themeDark')}</SelectItem>
              <SelectItem value="light">{t('themeLight')}</SelectItem>
            </SelectContent>
          </Select>
        </Group>

        <Group label={t('accentColorLabel')} description={t('accentColorDesc')}>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              title={t('accentDefault')}
              onClick={() => chooseAccent(undefined)}
              className={`flex h-7 w-7 items-center justify-center rounded-full border bg-muted text-xs ${
                !accent ? 'ring-2 ring-ring ring-offset-2 ring-offset-card' : ''
              }`}
            >
              ✕
            </button>
            {ACCENT_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                title={preset.name}
                onClick={() => chooseAccent(preset.value)}
                style={{ backgroundColor: preset.value }}
                className={`h-7 w-7 rounded-full ${
                  accent === preset.value
                    ? 'ring-2 ring-ring ring-offset-2 ring-offset-card'
                    : ''
                }`}
              />
            ))}
          </div>
        </Group>

        <Group label={t('textSizeLabel')} description={`${scale}%`}>
          <Slider
            className="w-40 cursor-pointer"
            min={TEXT_SCALE_MIN}
            max={TEXT_SCALE_MAX}
            step={5}
            value={[scale]}
            onValueChange={([v]) => chooseScale(v)}
          />
        </Group>
      </CardContent>
    </Card>
  );
});

export { Appearance };
