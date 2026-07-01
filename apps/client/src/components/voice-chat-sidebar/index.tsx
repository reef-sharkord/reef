import { TextChannel } from '@/components/channel-view/text';
import { ResizableSidebar } from '@/components/resizable-sidebar';
import { closeVoiceChatSidebar } from '@/features/app/actions';
import { useVoiceChatSidebar } from '@/features/app/hooks';
import { channelByIdSelector } from '@/features/server/channels/selectors';
import type { IRootState } from '@/features/store';
import { LocalStorageKey } from '@/helpers/storage';
import { ChannelType } from '@sharkord/shared';
import { memo } from 'react';
import { useSelector } from 'react-redux';

const MIN_WIDTH = 360;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 384;

const VoiceChatSidebar = memo(() => {
  const { isOpen, channelId } = useVoiceChatSidebar();

  // Only render for a voice channel that exists in the *current* server. This
  // guards against a stale or foreign channel id (one persisted for another
  // server, or a channel since deleted) — rendering the text view for such an
  // id bugs out. (REEF multi-server)
  const isValidVoiceChannel = useSelector((state: IRootState) =>
    channelId !== undefined
      ? channelByIdSelector(state, channelId)?.type === ChannelType.VOICE
      : false
  );

  if (!channelId || !isValidVoiceChannel) {
    return null;
  }

  return (
    <ResizableSidebar
      storageKey={LocalStorageKey.VOICE_CHAT_SIDEBAR_WIDTH}
      minWidth={MIN_WIDTH}
      maxWidth={MAX_WIDTH}
      defaultWidth={DEFAULT_WIDTH}
      edge="left"
      isOpen={isOpen}
      className="hidden lg:flex"
    >
      <div className="flex flex-col h-full w-full">
        <div className="flex-1 flex flex-col overflow-hidden">
          <TextChannel channelId={channelId} onClose={closeVoiceChatSidebar} />
        </div>
      </div>
    </ResizableSidebar>
  );
});

export { VoiceChatSidebar };
