import { getRailCustom, setRailCustom } from '@/lib/rail-prefs';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Group,
  Input
} from '@sharkord/ui';
import { memo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

const SWATCHES = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899'
];

type Props = {
  host: string;
  serverName: string;
  onClose: () => void;
  onSaved: () => void;
};

/**
 * Small modal to set a local custom name + accent color for a rail server.
 * Portaled to <body> so the rail drawer's transform doesn't trap it.
 */
const RailCustomizeDialog = memo(
  ({ host, serverName, onClose, onSaved }: Props) => {
    const { t } = useTranslation('sidebar');
    const initial = getRailCustom(host);
    const [name, setName] = useState(initial.name ?? '');
    const [color, setColor] = useState<string | undefined>(initial.color);

    const save = () => {
      setRailCustom(host, { name, color });
      onSaved();
      onClose();
    };

    const reset = () => {
      setRailCustom(host, {});
      onSaved();
      onClose();
    };

    return createPortal(
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={onClose}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
          <CardHeader>
            <CardTitle>{t('railCustomizeTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Group label={t('railDisplayName')}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={serverName}
                autoFocus
              />
            </Group>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">
                {t('railAccentColor')}
              </span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  title={t('railDefault')}
                  onClick={() => setColor(undefined)}
                  className={`flex h-7 w-7 items-center justify-center rounded-full border bg-muted text-xs ${
                    !color
                      ? 'ring-2 ring-primary ring-offset-2 ring-offset-card'
                      : ''
                  }`}
                >
                  ✕
                </button>
                {SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    style={{ backgroundColor: c }}
                    className={`h-7 w-7 rounded-full ${
                      color === c
                        ? 'ring-2 ring-primary ring-offset-2 ring-offset-card'
                        : ''
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={reset}>
                {t('railReset')}
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onClose}>
                  {t('railCancel')}
                </Button>
                <Button onClick={save}>{t('railSave')}</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>,
      document.body
    );
  }
);

export { RailCustomizeDialog };
