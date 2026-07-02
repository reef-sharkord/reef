import { SavedMessages } from '@/components/saved-messages';
import {
  useCurrentVoiceChannelId,
  useIsCurrentVoiceChannelSelected
} from '@/features/server/channels/hooks';
import { usePublicServerSettings } from '@/features/server/hooks';
import {
  getAppearance,
  getAppearanceRaw,
  subscribeAppearance
} from '@/lib/appearance';
import { openQuickSwitch } from '@/lib/quick-switch';
import { PluginSlot } from '@sharkord/shared';
import { Button, Tooltip } from '@sharkord/ui';
import { Bookmark, Command, PanelRight, PanelRightClose } from 'lucide-react';
import { memo, useMemo, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { PluginSlotRenderer } from '../plugin-slot-renderer';
import { ServerSearch } from './server-search';
import { VoiceButtons } from './voice-buttons';

type TTopBarProps = {
  onToggleRightSidebar: () => void;
  isOpen: boolean;
};

const TopBar = memo(({ onToggleRightSidebar, isOpen }: TTopBarProps) => {
  const { t } = useTranslation('topbar');
  const isCurrentVoiceChannelSelected = useIsCurrentVoiceChannelSelected();
  const currentVoiceChannelId = useCurrentVoiceChannelId();
  const settings = usePublicServerSettings();
  const [savedOpen, setSavedOpen] = useState(false);
  // Re-render when the button toggles change in settings.
  const appearanceRaw = useSyncExternalStore(
    subscribeAppearance,
    getAppearanceRaw,
    getAppearanceRaw
  );
  const { showSavedMessages, showQuickSwitch } = useMemo(
    () => getAppearance(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [appearanceRaw]
  );

  return (
    <div className="hidden lg:grid h-12 w-full grid-cols-[1fr_minmax(320px,1.4fr)_1fr] items-center border-b border-border bg-card px-4 transition-all duration-300 ease-in-out gap-2">
      <div className="flex min-w-0 items-center gap-2" />

      <div className="flex items-center justify-center">
        {settings?.enableSearch && <ServerSearch />}
      </div>

      <div className="flex min-w-0 items-center justify-end gap-2">
        <PluginSlotRenderer slotId={PluginSlot.TOPBAR_RIGHT} />
        {isCurrentVoiceChannelSelected && currentVoiceChannelId && (
          <VoiceButtons currentVoiceChannelId={currentVoiceChannelId} />
        )}
        {showSavedMessages !== false && (
          <Tooltip content={t('savedMessages')}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSavedOpen(true)}
              className="h-7 px-2"
            >
              <Bookmark className="w-4 h-4" />
            </Button>
          </Tooltip>
        )}
        {showQuickSwitch !== false && (
          <Tooltip content={t('quickSwitch')}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openQuickSwitch()}
              className="h-7 px-2"
            >
              <Command className="w-4 h-4" />
            </Button>
          </Tooltip>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleRightSidebar}
          className="h-7 px-2 transition-all duration-200 ease-in-out"
        >
          {isOpen ? (
            <Tooltip content={t('closeMembersSidebar')}>
              <div>
                <PanelRightClose className="w-4 h-4 transition-transform duration-200 ease-in-out" />
              </div>
            </Tooltip>
          ) : (
            <Tooltip content={t('openMembersSidebar')}>
              <div>
                <PanelRight className="w-4 h-4 transition-transform duration-200 ease-in-out" />
              </div>
            </Tooltip>
          )}
        </Button>
      </div>

      {savedOpen && <SavedMessages onClose={() => setSavedOpen(false)} />}
    </div>
  );
});

export { TopBar };
