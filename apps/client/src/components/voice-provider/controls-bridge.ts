type TVoiceControlsBridge = {
  setMicMuted: (muted: boolean) => Promise<void>;
  setSoundMuted: (muted: boolean) => Promise<void>;
  // Toggle helpers + an in-voice flag so global consumers (the mute hotkey)
  // can flip state without knowing the current value, and no-op when not in a
  // call. (UNCORD_PLAN.md M2)
  toggleMic: () => Promise<void>;
  toggleSound: () => Promise<void>;
  isInVoice: boolean;
};

// Server settings screens are rendered from a top-level portal and may live
// outside VoiceProvider. This bridge exposes live voice controls to those
// screens without changing the existing provider tree.
let voiceControlsBridge: TVoiceControlsBridge | null = null;

const setVoiceControlsBridge = (bridge: TVoiceControlsBridge) => {
  voiceControlsBridge = bridge;
};

const clearVoiceControlsBridge = () => {
  voiceControlsBridge = null;
};

const getVoiceControlsBridge = () => voiceControlsBridge;

export {
  clearVoiceControlsBridge,
  getVoiceControlsBridge,
  setVoiceControlsBridge
};
