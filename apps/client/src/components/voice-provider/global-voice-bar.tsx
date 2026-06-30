import { useCurrentVoiceChannelId } from '@/features/server/channels/hooks';
import { channelByIdSelector } from '@/features/server/channels/selectors';
import { leaveVoice } from '@/features/server/voice/actions';
import { useVoice } from '@/features/server/voice/hooks';
import type { IRootState } from '@/features/store';
import {
  getActiveHost,
  getConnection,
  setActiveHost,
  subscribe
} from '@/lib/connections';
import {
  getVoiceConnectionSnapshot,
  subscribeVoiceConnection
} from '@/lib/voice-connection';
import { Mic, MicOff, PhoneOff, Volume2, VolumeX } from 'lucide-react';
import { memo, useSyncExternalStore } from 'react';
import { useSelector } from 'react-redux';

/**
 * Persistent voice status panel shown ONLY while you are in a call but viewing a
 * *different* server — the one moment the per-server sidebar voice panel is not
 * on screen. Lets you mute / deafen / hang up and jump back to the call from
 * anywhere. Rendered inside the global VoiceProvider, so it reads the voice
 * server's store + context. (UNCORD_PLAN.md §3.4, M2)
 */
const GlobalVoiceBar = memo(() => {
  const voiceConnection = useSyncExternalStore(
    subscribeVoiceConnection,
    getVoiceConnectionSnapshot,
    getVoiceConnectionSnapshot
  );
  const activeHost = useSyncExternalStore(
    subscribe,
    getActiveHost,
    getActiveHost
  );
  const channelId = useCurrentVoiceChannelId();
  const channelName = useSelector((state: IRootState) =>
    channelId !== undefined
      ? channelByIdSelector(state, channelId)?.name
      : undefined
  );
  const { ownVoiceState, toggleMic, toggleSound } = useVoice();

  if (!voiceConnection || channelId === undefined) {
    return null;
  }

  // When the call's own server is in view, its sidebar voice panel already
  // covers this; only show the floating bar when you've navigated away.
  if (activeHost === voiceConnection.host) {
    return null;
  }

  const serverName =
    getConnection(voiceConnection.host)?.meta.name ?? voiceConnection.host;

  const iconButton =
    'flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted transition-colors';

  return (
    <div className="fixed bottom-3 left-[84px] z-50 flex items-center gap-2 rounded-lg border bg-card/95 px-3 py-2 shadow-lg backdrop-blur">
      <button
        type="button"
        onClick={() => setActiveHost(voiceConnection.host)}
        title="Return to call"
        className="flex flex-col items-start text-left"
      >
        <span className="text-xs font-semibold text-green-500">
          Voice connected
        </span>
        <span className="max-w-[160px] truncate text-xs text-muted-foreground">
          {(channelName ?? 'Voice') + ' · ' + serverName}
        </span>
      </button>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => void toggleMic()}
          title="Mute (Ctrl+Shift+M)"
          className={iconButton}
        >
          {ownVoiceState.micMuted ? (
            <MicOff className="h-4 w-4 text-red-500" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          onClick={() => void toggleSound()}
          title="Deafen (Ctrl+Shift+D)"
          className={iconButton}
        >
          {ownVoiceState.soundMuted ? (
            <VolumeX className="h-4 w-4 text-red-500" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          onClick={() => void leaveVoice({ reason: 'user_disconnect_button' })}
          title="Disconnect"
          className={iconButton}
        >
          <PhoneOff className="h-4 w-4 text-red-500" />
        </button>
      </div>
    </div>
  );
});

export { GlobalVoiceBar };
