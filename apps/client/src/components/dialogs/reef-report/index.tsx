import { getTRPCClient } from '@/lib/trpc';
import {
  AutoFocus,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Group,
  Input,
  Textarea
} from '@sharkord/ui';
import { Bug, Lightbulb } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { TDialogBaseProps } from '../types';

/**
 * Bug report / feature request (REEF). Submits through the connected server's
 * reef plugin (`submitReport` action), which emails it to the server operator —
 * the mail relay credentials never reach the client. Only reachable when the
 * server's switchboard has reports enabled.
 */
type TReportKind = 'bug' | 'feature';

const TITLE_MAX = 100;
const DESCRIPTION_MAX = 2000;

type TSubmitReportResponse = {
  ok?: boolean;
  reason?: string;
};

const ReefReportDialog = memo(({ isOpen, close }: TDialogBaseProps) => {
  const { t } = useTranslation('dialogs');
  const [kind, setKind] = useState<TReportKind>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = useCallback(async () => {
    if (!title.trim() || !description.trim()) {
      toast.error(t('reportEmptyError'));
      return;
    }

    const trpc = getTRPCClient();

    setLoading(true);

    try {
      const res = (await trpc.plugins.executeAction.mutate({
        pluginId: 'reef',
        actionName: 'submitReport',
        payload: {
          kind,
          title: title.trim(),
          description: description.trim(),
          clientInfo: navigator.userAgent
        }
      })) as TSubmitReportResponse | undefined;

      if (res?.ok) {
        toast.success(t('reportSentToast'));
        close();
      } else if (res?.reason === 'cooldown') {
        toast.error(t('reportCooldownError'));
      } else {
        toast.error(t('reportFailedError'));
      }
    } catch {
      toast.error(t('reportFailedError'));
    } finally {
      setLoading(false);
    }
  }, [kind, title, description, close, t]);

  return (
    <Dialog open={isOpen}>
      <DialogContent onInteractOutside={close} close={close}>
        <DialogHeader>
          <DialogTitle>{t('reportTitle')}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Button
            variant={kind === 'bug' ? 'default' : 'outline'}
            className="flex-1"
            onClick={() => setKind('bug')}
          >
            <Bug className="mr-2 h-4 w-4" />
            {t('reportKindBug')}
          </Button>
          <Button
            variant={kind === 'feature' ? 'default' : 'outline'}
            className="flex-1"
            onClick={() => setKind('feature')}
          >
            <Lightbulb className="mr-2 h-4 w-4" />
            {t('reportKindFeature')}
          </Button>
        </div>

        <Group label={t('reportTitleLabel')}>
          <AutoFocus>
            <Input
              value={title}
              maxLength={TITLE_MAX}
              placeholder={
                kind === 'bug'
                  ? t('reportTitlePlaceholderBug')
                  : t('reportTitlePlaceholderFeature')
              }
              onChange={(e) => setTitle(e.target.value)}
            />
          </AutoFocus>
        </Group>

        <Group label={t('reportDescriptionLabel')}>
          <Textarea
            value={description}
            maxLength={DESCRIPTION_MAX}
            rows={6}
            placeholder={
              kind === 'bug'
                ? t('reportDescriptionPlaceholderBug')
                : t('reportDescriptionPlaceholderFeature')
            }
            onChange={(e) => setDescription(e.target.value)}
          />
        </Group>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={close}>
            {t('cancel')}
          </Button>
          <Button onClick={onSubmit} disabled={loading}>
            {t('reportSubmitBtn')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export { ReefReportDialog };
