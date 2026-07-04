import { SoundType } from '@/features/server/types';
import {
  getLocalStorageItem,
  LocalStorageKey,
  setLocalStorageItem
} from '@/helpers/storage';

/**
 * User control over REEF's UI sounds (Discord-style): a master toggle, a
 * volume slider, and per-group toggles so e.g. message pings can stay on
 * while the voice join/leave chimes go quiet. Read by playSound on every
 * call; edited from Settings → Notifications → Sounds.
 */

export type SoundGroup =
  | 'messages'
  | 'voiceJoinLeave'
  | 'muteDevice'
  | 'screenShare'
  | 'disconnect';

export type TSoundPrefs = {
  enabled: boolean;
  // 0–100
  volume: number;
  // absent group = enabled
  groups: Partial<Record<SoundGroup, boolean>>;
};

const DEFAULT_PREFS: TSoundPrefs = { enabled: true, volume: 100, groups: {} };

const GROUP_BY_TYPE: Record<SoundType, SoundGroup> = {
  [SoundType.MESSAGE_RECEIVED]: 'messages',
  [SoundType.MESSAGE_SENT]: 'messages',
  [SoundType.SERVER_DISCONNECTED]: 'disconnect',
  [SoundType.OWN_USER_JOINED_VOICE_CHANNEL]: 'voiceJoinLeave',
  [SoundType.OWN_USER_LEFT_VOICE_CHANNEL]: 'voiceJoinLeave',
  [SoundType.REMOTE_USER_JOINED_VOICE_CHANNEL]: 'voiceJoinLeave',
  [SoundType.REMOTE_USER_LEFT_VOICE_CHANNEL]: 'voiceJoinLeave',
  [SoundType.OWN_USER_MUTED_MIC]: 'muteDevice',
  [SoundType.OWN_USER_UNMUTED_MIC]: 'muteDevice',
  [SoundType.OWN_USER_MUTED_SOUND]: 'muteDevice',
  [SoundType.OWN_USER_UNMUTED_SOUND]: 'muteDevice',
  [SoundType.OWN_USER_STARTED_WEBCAM]: 'muteDevice',
  [SoundType.OWN_USER_STOPPED_WEBCAM]: 'muteDevice',
  [SoundType.OWN_USER_STARTED_SCREENSHARE]: 'screenShare',
  [SoundType.OWN_USER_STOPPED_SCREENSHARE]: 'screenShare',
  [SoundType.REMOTE_USER_STARTED_SCREENSHARE]: 'screenShare',
  [SoundType.REMOTE_USER_STOPPED_SCREENSHARE]: 'screenShare'
};

const getSoundPrefs = (): TSoundPrefs => {
  const raw = getLocalStorageItem(LocalStorageKey.SOUND_PREFS);

  if (!raw) {
    return DEFAULT_PREFS;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<TSoundPrefs>;

    return {
      enabled: parsed.enabled !== false,
      volume:
        typeof parsed.volume === 'number'
          ? Math.min(100, Math.max(0, parsed.volume))
          : 100,
      groups:
        parsed.groups && typeof parsed.groups === 'object' ? parsed.groups : {}
    };
  } catch {
    return DEFAULT_PREFS;
  }
};

const setSoundPrefs = (patch: Partial<TSoundPrefs>): TSoundPrefs => {
  const next = {
    ...getSoundPrefs(),
    ...patch,
    groups: { ...getSoundPrefs().groups, ...(patch.groups ?? {}) }
  };

  setLocalStorageItem(LocalStorageKey.SOUND_PREFS, JSON.stringify(next));

  return next;
};

const isSoundEnabled = (type: SoundType): boolean => {
  const prefs = getSoundPrefs();

  return (
    prefs.enabled &&
    prefs.volume > 0 &&
    prefs.groups[GROUP_BY_TYPE[type]] !== false
  );
};

/** 0–1 multiplier applied on top of the built-in gain of every sound. */
const getSoundVolumeMultiplier = (): number => getSoundPrefs().volume / 100;

export {
  getSoundPrefs,
  getSoundVolumeMultiplier,
  isSoundEnabled,
  setSoundPrefs
};
