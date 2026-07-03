import { UnreadCount } from '@/components/unread-count';
import { toggleVoiceChatSidebar } from '@/features/app/actions';
import {
  useHasUnreadMentions,
  useUnreadMessagesCount,
  useVoiceUsersByChannelId
} from '@/features/server/hooks';
import { useOwnUserId } from '@/features/server/users/hooks';
import {
  useHideNonVideoParticipants,
  useHideOwnScreenShare,
  useVoiceChannelExternalStreamsList
} from '@/features/server/voice/hooks';
import { MessageSquare } from 'lucide-react';
import { memo, useMemo } from 'react';
import { ControlsBar } from './controls-bar';
import { ExternalStreamCard } from './external-stream-card';
import {
  PinnedCardType,
  usePinCardController
} from './hooks/use-pin-card-controller';
import { ScreenShareCard } from './screen-share-card';
import { VoiceGrid } from './voice-grid';
import { VoiceUserCard } from './voice-user-card';

type TChannelProps = {
  channelId: number;
};

// Mobile/tablet entry point for the voice channel's text chat: below lg both
// the top bar (with its chat toggle) and the hover controls bar are hidden,
// which used to leave no way to open voice chat on phones at all.
const MobileChatButton = memo(({ channelId }: TChannelProps) => {
  const unreadCount = useUnreadMessagesCount(channelId);
  const hasUnreadMentions = useHasUnreadMentions(channelId);

  return (
    <button
      type="button"
      aria-label="Open chat"
      onClick={() => toggleVoiceChatSidebar(channelId)}
      className="lg:hidden absolute top-3 right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-border/50 bg-card/90 text-muted-foreground shadow-lg backdrop-blur hover:text-foreground"
    >
      <div className="relative flex items-center justify-center">
        <MessageSquare className="h-5 w-5" />
        <UnreadCount
          count={unreadCount}
          hasMention={hasUnreadMentions}
          className="absolute -top-2 -right-3 ml-0 min-w-4 h-4 px-1 text-[10px] leading-none"
        />
      </div>
    </button>
  );
});

const VoiceChannel = memo(({ channelId }: TChannelProps) => {
  const voiceUsers = useVoiceUsersByChannelId(channelId);
  const externalStreams = useVoiceChannelExternalStreamsList(channelId);
  const { pinnedCard, pinCard, unpinCard, isPinned } = usePinCardController();
  const hideNonVideoParticipants = useHideNonVideoParticipants();
  const hideOwnScreenShare = useHideOwnScreenShare();
  const ownUserId = useOwnUserId();

  const cards = useMemo(() => {
    const cards: React.ReactNode[] = [];

    // Check if there are any video streams at all
    const hasAnyVideoStreams =
      voiceUsers.some(
        (user) => user.state.webcamEnabled || user.state.sharingScreen
      ) || externalStreams.some((stream) => stream.tracks.video);

    // Only apply the filter if there are some video streams
    const shouldFilterNonVideo = hideNonVideoParticipants && hasAnyVideoStreams;

    voiceUsers.forEach((voiceUser) => {
      const userCardId = `user-${voiceUser.id}`;
      const hasVideo = voiceUser.state.webcamEnabled;

      // Only show user card if not filtering, or if they have video
      if (!shouldFilterNonVideo || hasVideo) {
        cards.push(
          <VoiceUserCard
            key={userCardId}
            userId={voiceUser.id}
            isPinned={isPinned(userCardId)}
            onPin={() =>
              pinCard({
                id: userCardId,
                type: PinnedCardType.USER,
                userId: voiceUser.id
              })
            }
            onUnpin={unpinCard}
            voiceUser={voiceUser}
          />
        );
      }

      // Screen shares always have video, so always show them
      const shouldHideOwnScreenShare =
        hideOwnScreenShare && voiceUser.id === ownUserId;
      if (voiceUser.state.sharingScreen && !shouldHideOwnScreenShare) {
        const screenShareCardId = `screen-share-${voiceUser.id}`;

        cards.push(
          <ScreenShareCard
            key={screenShareCardId}
            userId={voiceUser.id}
            isPinned={isPinned(screenShareCardId)}
            onPin={() =>
              pinCard({
                id: screenShareCardId,
                type: PinnedCardType.SCREEN_SHARE,
                userId: voiceUser.id
              })
            }
            onUnpin={unpinCard}
            showPinControls
          />
        );
      }
    });

    externalStreams.forEach((stream) => {
      const externalStreamCardId = `external-stream-${stream.streamId}`;
      const hasVideo = stream.tracks.video;

      // Only show external stream card if not filtering, or if it has video
      if (!shouldFilterNonVideo || hasVideo) {
        cards.push(
          <ExternalStreamCard
            key={externalStreamCardId}
            streamId={stream.streamId}
            stream={stream}
            isPinned={isPinned(externalStreamCardId)}
            onPin={() =>
              pinCard({
                id: externalStreamCardId,
                type: PinnedCardType.EXTERNAL_STREAM,
                userId: stream.streamId
              })
            }
            onUnpin={unpinCard}
            showPinControls
          />
        );
      }
    });

    return cards;
  }, [
    voiceUsers,
    externalStreams,
    isPinned,
    pinCard,
    unpinCard,
    hideNonVideoParticipants,
    hideOwnScreenShare,
    ownUserId
  ]);

  if (voiceUsers.length === 0) {
    return (
      <div className="flex-1 relative flex items-center justify-center">
        <MobileChatButton channelId={channelId} />
        <div className="text-center">
          <p className="text-muted-foreground text-lg mb-2">
            No one in the voice channel
          </p>
          <p className="text-muted-foreground text-sm">
            Join the voice channel to start a meeting
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative bg-background overflow-hidden">
      <MobileChatButton channelId={channelId} />
      <VoiceGrid pinnedCardId={pinnedCard?.id} className="h-full">
        {cards}
      </VoiceGrid>
      <ControlsBar channelId={channelId} />
    </div>
  );
});

export { VoiceChannel };
