import { isDesktop } from '@/helpers/desktop';
import { cn } from '@/lib/utils';
import { InputMode } from '@/types';
import { Alert, AlertDescription, Button, Group } from '@sharkord/ui';
import { Info, Keyboard } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Convert a KeyboardEvent.code into a short human-readable label. */
const formatPttKey = (code: string): string => {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);

  return code
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .replace(/\s+/g, ' ');
};

type TInputModeSectionProps = {
  inputMode: InputMode;
  pttKey: string;
  onInputModeChange: (mode: InputMode) => void;
  onPttKeyChange: (key: string) => void;
};

const InputModeSection = memo(
  ({
    inputMode,
    pttKey,
    onInputModeChange,
    onPttKeyChange
  }: TInputModeSectionProps) => {
    const { t } = useTranslation('settings');
    const [isCapturing, setIsCapturing] = useState(false);
    const capturingRef = useRef(false);

    const startCapture = useCallback(() => {
      setIsCapturing(true);
      capturingRef.current = true;
    }, []);

    useEffect(() => {
      if (!isCapturing) return;

      const handleKeyDown = (event: KeyboardEvent) => {
        if (!capturingRef.current) return;
        // Bare modifiers can't be a PTT key (their keyup is unreliable).
        if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return;

        event.preventDefault();
        capturingRef.current = false;
        setIsCapturing(false);
        onPttKeyChange(event.code);
      };

      window.addEventListener('keydown', handleKeyDown);

      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isCapturing, onPttKeyChange]);

    const modes = [
      { value: InputMode.NORMAL, label: t('inputModeNormal') },
      { value: InputMode.PTT, label: t('inputModePtt') },
      { value: InputMode.VAD, label: t('inputModeVad') }
    ] as const;

    return (
      <Group label={t('inputModeLabel')} description={t('inputModeDesc')}>
        <div className="flex flex-col gap-3">
          <div className="flex gap-2 flex-wrap">
            {modes.map(({ value, label }) => (
              <Button
                key={value}
                type="button"
                variant={inputMode === value ? 'default' : 'outline'}
                size="sm"
                onClick={() => onInputModeChange(value)}
                className={cn(
                  'min-w-24',
                  inputMode === value && 'pointer-events-none'
                )}
              >
                {label}
              </Button>
            ))}
          </div>

          {inputMode === InputMode.PTT && (
            <>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={startCapture}
                >
                  <Keyboard className="size-4" />
                  {isCapturing ? t('pttKeyCapture') : formatPttKey(pttKey)}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {isDesktop() ? t('pttKeyHintGlobal') : t('pttKeyHint')}
                </p>
              </div>

              {isDesktop() && (
                <Alert variant="default">
                  <Info />
                  <AlertDescription>{t('pttGlobalDisclaimer')}</AlertDescription>
                </Alert>
              )}
            </>
          )}

          {inputMode === InputMode.VAD && (
            <p className="text-xs text-muted-foreground">{t('vadHint')}</p>
          )}
        </div>
      </Group>
    );
  }
);

export { InputModeSection };
