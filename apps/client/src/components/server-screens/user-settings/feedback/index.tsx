import type { FeedbackType } from '@/lib/feedback';
import {
  collectDiagnostics,
  openFeedbackMailto,
  submitFeedback
} from '@/lib/feedback-transport';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Group,
  Input,
  Textarea
} from '@sharkord/ui';
import { Bug, Lightbulb } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

const Feedback = memo(() => {
  const { t } = useTranslation('settings');
  const [type, setType] = useState<FeedbackType>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const diagnostics = collectDiagnostics();
  const canSubmit =
    title.trim().length > 0 && description.trim().length > 0 && !submitting;

  const resetBody = () => {
    setTitle('');
    setDescription('');
    setSteps('');
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }

    // Honeypot: a filled hidden field means a bot — silently drop.
    if (honeypot) {
      resetBody();
      return;
    }

    const input = {
      type,
      title,
      description,
      steps: type === 'bug' ? steps : undefined,
      contactEmail
    };

    setSubmitting(true);

    try {
      const result = await submitFeedback(input);

      if (result.ok) {
        toast.success(
          result.via === 'mailto'
            ? t('feedbackMailtoOpened')
            : t('feedbackSent')
        );
        resetBody();
      } else {
        toast.error(t('feedbackFailed'), {
          action: {
            label: t('feedbackOpenEmail'),
            onClick: () => openFeedbackMailto(input)
          }
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('feedbackTitle')}</CardTitle>
        <CardDescription>{t('feedbackDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button
            type="button"
            variant={type === 'bug' ? 'default' : 'outline'}
            onClick={() => setType('bug')}
          >
            <Bug className="mr-2 h-4 w-4" />
            {t('feedbackTypeBug')}
          </Button>
          <Button
            type="button"
            variant={type === 'feature' ? 'default' : 'outline'}
            onClick={() => setType('feature')}
          >
            <Lightbulb className="mr-2 h-4 w-4" />
            {t('feedbackTypeFeature')}
          </Button>
        </div>

        <Group label={t('feedbackTitleLabel')}>
          <Input
            value={title}
            maxLength={120}
            placeholder={t('feedbackTitlePlaceholder')}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Group>

        <Group label={t('feedbackDescLabel')}>
          <Textarea
            value={description}
            rows={5}
            maxLength={4000}
            placeholder={t('feedbackDescPlaceholder')}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Group>

        {type === 'bug' && (
          <Group label={t('feedbackStepsLabel')}>
            <Textarea
              value={steps}
              rows={3}
              maxLength={2000}
              placeholder={t('feedbackStepsPlaceholder')}
              onChange={(e) => setSteps(e.target.value)}
            />
          </Group>
        )}

        <Group
          label={t('feedbackEmailLabel')}
          description={t('feedbackEmailDesc')}
        >
          <Input
            type="email"
            value={contactEmail}
            placeholder={t('feedbackEmailPlaceholder')}
            onChange={(e) => setContactEmail(e.target.value)}
          />
        </Group>

        {/* Honeypot — hidden from real users, catches bots. */}
        <input
          type="text"
          value={honeypot}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="hidden"
          onChange={(e) => setHoneypot(e.target.value)}
        />

        <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          <div className="mb-1 font-medium text-foreground">
            {t('feedbackIncluded')}
          </div>
          <ul className="space-y-0.5">
            <li>
              {t('feedbackDiagVersion')}: {diagnostics.appVersion}
            </li>
            <li>
              {t('feedbackDiagPlatform')}: {diagnostics.platform} (
              {diagnostics.os})
            </li>
            <li>
              {t('feedbackDiagServers')}: {diagnostics.serversConnected}
            </li>
            <li>
              {t('feedbackDiagLocale')}: {diagnostics.locale}
            </li>
            <li className="break-all">
              {t('feedbackDiagUserAgent')}: {diagnostics.userAgent}
            </li>
          </ul>
          <div className="mt-2">{t('feedbackPrivacyNote')}</div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? t('feedbackSending') : t('feedbackSubmit')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});

export { Feedback };
