import type { StreamKind, TStreamQuality } from '@sharkord/shared';

export type TDevices = {
  input: {
    deviceId: string | undefined;
    autoGainControl: boolean;
    echoCancellation: boolean;
    noiseSuppression: boolean;
  };
  playback: {
    deviceId: string | undefined;
  };
  webcam: {
    deviceId: string | undefined;
    resolution: Resolution;
    framerate: number;
  };
  screen: {
    resolution: Resolution;
    framerate: number;
    audio: boolean;
  };
};

export enum Resolution {
  '2160p' = '2160p',
  '1440p' = '1440p',
  '1080p' = '1080p',
  '720p' = '720p',
  '480p' = '480p',
  '360p' = '360p',
  '240p' = '240p',
  '144p' = '144p'
}

export enum VideoCodec {
  AUTO = 'auto',
  VP8 = 'video/VP8',
  VP9 = 'video/VP9',
  H264 = 'video/H264',
  AV1 = 'video/AV1'
}

export enum NoiseSuppression {
  NONE = 'none',
  STANDARD = 'standard',
  RNNOISE = 'rnnoise',
  DTLN = 'dtln'
}

// Screen-share optimization target. Maps to the video track's contentHint and
// the encoder's degradation preference: TEXT keeps resolution sharp (good for
// docs/code, may drop framerate), MOTION keeps framerate smooth (good for
// video/games, may drop resolution). (screen-share best practices)
export enum ScreenOptimize {
  TEXT = 'text',
  MOTION = 'motion'
}

export type TDeviceSettings = {
  microphoneId: string | undefined;
  playbackId: string | undefined;
  webcamId: string | undefined;
  webcamResolution: Resolution;
  webcamFramerate: number;
  echoCancellation: boolean;
  noiseSuppression: NoiseSuppression;
  autoGainControl: boolean;
  noiseGateEnabled: boolean;
  noiseGateThresholdDb: number;
  shareSystemAudio: boolean;
  restrictOwnAudio: boolean;
  suppressLocalAudioPlayback: boolean;
  mirrorOwnVideo: boolean;
  simulcastEnabled: boolean;
  screenResolution: Resolution;
  screenFramerate: number;
  screenCodec: VideoCodec;
  screenBitrate: number;
  screenOptimize: ScreenOptimize;
};

export type TRemoteUserStreamKinds =
  | StreamKind.AUDIO
  | StreamKind.VIDEO
  | StreamKind.SCREEN
  | StreamKind.SCREEN_AUDIO;

export type TRemoteStreams = {
  [userId: number]: {
    [StreamKind.AUDIO]: MediaStream | undefined;
    [StreamKind.VIDEO]: MediaStream | undefined;
    [StreamKind.SCREEN]: MediaStream | undefined;
    [StreamKind.SCREEN_AUDIO]: MediaStream | undefined;
  };
};

export type TMessageJumpToTarget = {
  channelId: number;
  messageId: number;
  isDm: boolean;
  highlightTime?: number;
};

export type TReplyTarget = {
  userId: number | null;
  pluginId: string | null;
};

export type { TStreamQuality };
