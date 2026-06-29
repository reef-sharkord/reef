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

const DndSettings = memo(() => {
  const [dnd, setDndState] = useState(() => getDnd());

  const update = (patch: Partial<Dnd>) => {
    setDndState(setDnd(patch));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Do Not Disturb</CardTitle>
        <CardDescription>
          Silence notification popups and ping sounds. Unread badges still update.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Group
          label="Do Not Disturb"
          description="Silence everything until you turn it off."
        >
          <Switch
            checked={dnd.enabled}
            onCheckedChange={(v) => update({ enabled: v })}
          />
        </Group>

        <Group
          label="Quiet hours"
          description="Automatically enable DND during a daily window."
        >
          <Switch
            checked={dnd.quietEnabled}
            onCheckedChange={(v) => update({ quietEnabled: v })}
          />
        </Group>

        {dnd.quietEnabled && (
          <Group label="Window" description="Start and end (local time).">
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={minutesToLabel(dnd.start)}
                onChange={(e) => update({ start: labelToMinutes(e.target.value) })}
                className="rounded border bg-background px-2 py-1 text-sm"
              />
              <span className="text-muted-foreground">–</span>
              <input
                type="time"
                value={minutesToLabel(dnd.end)}
                onChange={(e) => update({ end: labelToMinutes(e.target.value) })}
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
