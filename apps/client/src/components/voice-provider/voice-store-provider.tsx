import { getBootstrapStore } from '@/features/store';
import {
  getVoiceConnectionSnapshot,
  subscribeVoiceConnection
} from '@/lib/voice-connection';
import { memo, useSyncExternalStore } from 'react';
import { Provider } from 'react-redux';

/**
 * Binds the (global, hoisted) VoiceProvider's React store to the pinned voice
 * connection's store. When you join voice on a server, that server's store
 * drives the voice UI/state regardless of which server you are viewing; when not
 * in voice it falls back to the idle bootstrap store. Changing the `store` prop
 * updates context without remounting children, so the live voice session
 * survives a server switch. (UNCORD_PLAN.md §3.4, M2)
 */
const VoiceStoreProvider = memo(
  ({ children }: { children: React.ReactNode }) => {
    const voiceConnection = useSyncExternalStore(
      subscribeVoiceConnection,
      getVoiceConnectionSnapshot,
      getVoiceConnectionSnapshot
    );

    const store = voiceConnection?.store ?? getBootstrapStore();

    return <Provider store={store}>{children}</Provider>;
  }
);

export { VoiceStoreProvider };
