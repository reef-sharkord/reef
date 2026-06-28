import { useVoiceUsersByChannelId } from '@/features/server/hooks';
import { memo } from 'react';
import { useVoiceRefs } from './hooks/use-voice-refs';

type TVoiceUserAudioStreamProps = {
  userId: number;
};

const VoiceUserAudioStream = memo(({ userId }: TVoiceUserAudioStreamProps) => {
  const { audioRef, hasAudioStream } = useVoiceRefs(userId);

  return (
    <>
      {hasAudioStream && (
        <audio
          ref={audioRef}
          className="hidden"
          autoPlay
          data-user-id={userId}
        />
      )}
    </>
  );
});

type TVoiceAudioStreamsProps = {
  channelId: number;
};

const VoiceAudioStreams = memo(({ channelId }: TVoiceAudioStreamsProps) => {
  const voiceUsers = useVoiceUsersByChannelId(channelId);

  return (
    <>
      {voiceUsers.map((voiceUser) => (
        <VoiceUserAudioStream key={voiceUser.id} userId={voiceUser.id} />
      ))}
    </>
  );
});

// Remote screen-share audio sink. Lives in the global persistent sink (not the
// per-channel grid card) so screen-share audio keeps playing when you navigate
// to another server, like mic audio does. (review fix, M2)
const VoiceUserScreenShareAudio = memo(
  ({ userId }: TVoiceUserAudioStreamProps) => {
    const { screenShareAudioRef, hasScreenShareAudioStream } =
      useVoiceRefs(userId);

    return (
      <>
        {hasScreenShareAudioStream && (
          <audio
            ref={screenShareAudioRef}
            className="hidden"
            autoPlay
            playsInline
            data-user-id={userId}
          />
        )}
      </>
    );
  }
);

const ScreenShareAudioStreams = memo(
  ({ channelId }: TVoiceAudioStreamsProps) => {
    const voiceUsers = useVoiceUsersByChannelId(channelId);

    return (
      <>
        {voiceUsers.map((voiceUser) => (
          <VoiceUserScreenShareAudio key={voiceUser.id} userId={voiceUser.id} />
        ))}
      </>
    );
  }
);

export { ScreenShareAudioStreams, VoiceAudioStreams };
