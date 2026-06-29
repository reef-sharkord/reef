import { AddServerForm } from '@/components/add-server-form';
import { Button } from '@sharkord/ui';
import { Plus } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ReefBackdrop } from './reef-backdrop';

/**
 * Standalone (native shell) welcome / empty state shown when no server has been
 * added yet. Replaces the bare rail "+" with a branded prompt + add-server CTA.
 */
const Welcome = memo(() => {
  const { t } = useTranslation('connect');
  const [adding, setAdding] = useState(false);

  return (
    <div className="relative isolate flex h-full w-full flex-col items-center justify-center gap-6 overflow-hidden p-6 text-center">
      <ReefBackdrop />

      <img
        src={`${import.meta.env.BASE_URL}icon-192.png`}
        alt="REEF"
        className="h-20 w-20 rounded-3xl shadow-lg"
      />

      <div className="space-y-1">
        <h1 className="text-4xl font-bold tracking-tight">
          {t('welcomeTitle')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('welcomeSubtitle')}</p>
      </div>

      <Button size="lg" onClick={() => setAdding(true)}>
        <Plus className="mr-2 h-5 w-5" />
        {t('welcomeAddServer')}
      </Button>

      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
        {t('welcomeHelp')}
      </p>

      {adding && <AddServerForm onClose={() => setAdding(false)} />}
    </div>
  );
});

export { Welcome };
