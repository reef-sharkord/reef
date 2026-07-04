import {
  getDnd,
  labelToMinutes,
  minutesToLabel,
  setDnd,
  type Dnd
} from '@/lib/dnd';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Group,
  Switch
} from '@sharkord/ui';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const DndSettings = memo(() => {
  const { t } = useTranslation('settings');
  const [dnd, setDndState] = useState(() => getDnd());

  const update = (patch: Partial<Dnd>) => {
    setDndState(setDnd(patch));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('dndTitle')}</CardTitle>
        <CardDescription>{t('dndDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Group label={t('dndToggleLabel')} description={t('dndToggleDesc')}>
          <Switch
            checked={dnd.enabled}
            onCheckedChange={(v) => update({ enabled: v })}
          />
        </Group>

        <Group label={t('quietHoursLabel')} description={t('quietHoursDesc')}>
          <Switch
            checked={dnd.quietEnabled}
            onCheckedChange={(v) => update({ quietEnabled: v })}
          />
        </Group>

        {dnd.quietEnabled && (
          <Group
            label={t('quietWindowLabel')}
            description={t('quietWindowDesc')}
          >
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={minutesToLabel(dnd.start)}
                onChange={(e) =>
                  update({ start: labelToMinutes(e.target.value) })
                }
                className="rounded border bg-background px-2 py-1 text-sm"
              />
              <span className="text-muted-foreground">–</span>
              <input
                type="time"
                value={minutesToLabel(dnd.end)}
                onChange={(e) =>
                  update({ end: labelToMinutes(e.target.value) })
                }
                className="rounded border bg-background px-2 py-1 text-sm"
              />
            </div>
          </Group>
        )}
      </CardContent>
    </Card>
  );
});

export { DndSettings };
