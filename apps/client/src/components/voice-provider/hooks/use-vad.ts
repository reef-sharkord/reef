import { useEffect, useRef } from 'react';

const VAD_FFT_SIZE = 512;
const VAD_SMOOTHING = 0.8;
const VAD_HOLD_MS = 400;

// These must match the AnalyserNode settings below.
const ANALYSER_MIN_DB = -90;
const ANALYSER_MAX_DB = -10;

// Fixed detection threshold: -45 dB activates on normal speech while ignoring
// ambient noise and keyboard sounds.
const VAD_THRESHOLD_DB = -45;

type TUseVadParams = {
  enabled: boolean;
  // The RAW microphone stream, never the transmit stream: a gated (disabled)
  // transmit track produces silence, so analysing it could never re-open the
  // gate.
  rawStream: MediaStream | null;
  onSpeakingChange: (speaking: boolean) => void;
};

/**
 * Voice Activity Detection. Analyses the raw microphone stream's level and
 * reports speech starts/stops around a dB threshold, with a hold time so the
 * gate doesn't flutter at the boundary. The hook never touches the mic track
 * itself — the voice provider owns track state and combines this with
 * mute/input mode.
 */
const useVad = ({ enabled, rawStream, onSpeakingChange }: TUseVadParams) => {
  const onSpeakingChangeRef = useRef(onSpeakingChange);

  useEffect(() => {
    onSpeakingChangeRef.current = onSpeakingChange;
  }, [onSpeakingChange]);

  useEffect(() => {
    if (!enabled || !rawStream) return;

    const rawTrack = rawStream.getAudioTracks()[0];

    if (!rawTrack) return;

    // Analyse a CLONE of the raw track. When no processing chain (noise gate/
    // suppression/soundboard) is active the transmit track IS the raw track,
    // and gating it would silence this analyser too — the gate could then
    // never re-open. A clone's enabled state is independent of the original.
    const analysisTrack = rawTrack.clone();
    const analysisStream = new MediaStream([analysisTrack]);

    const audioContext = new window.AudioContext();
    const analyser = audioContext.createAnalyser();

    analyser.fftSize = VAD_FFT_SIZE;
    analyser.minDecibels = ANALYSER_MIN_DB;
    analyser.maxDecibels = ANALYSER_MAX_DB;
    analyser.smoothingTimeConstant = VAD_SMOOTHING;

    const source = audioContext.createMediaStreamSource(analysisStream);
    source.connect(analyser);

    // Route through a zero-gain node to the destination so Chrome does not
    // auto-suspend the context after ~10s of "no speaker output".
    const silentGain = audioContext.createGain();
    silentGain.gain.value = 0;
    analyser.connect(silentGain);
    silentGain.connect(audioContext.destination);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const thresholdByte =
      ((VAD_THRESHOLD_DB - ANALYSER_MIN_DB) /
        (ANALYSER_MAX_DB - ANALYSER_MIN_DB)) *
      255;

    let holdTimerId: ReturnType<typeof setTimeout> | null = null;
    let isSpeaking = false;
    let animFrameId: number;

    const detect = () => {
      analyser.getByteFrequencyData(dataArray);

      // RMS of the frequency bins (0-255 scale).
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / dataArray.length);

      if (rms > thresholdByte) {
        if (holdTimerId !== null) {
          clearTimeout(holdTimerId);
          holdTimerId = null;
        }
        if (!isSpeaking) {
          isSpeaking = true;
          onSpeakingChangeRef.current(true);
        }
      } else if (isSpeaking && holdTimerId === null) {
        holdTimerId = setTimeout(() => {
          holdTimerId = null;
          isSpeaking = false;
          onSpeakingChangeRef.current(false);
        }, VAD_HOLD_MS);
      }

      animFrameId = requestAnimationFrame(detect);
    };

    animFrameId = requestAnimationFrame(detect);

    return () => {
      cancelAnimationFrame(animFrameId);
      if (holdTimerId !== null) clearTimeout(holdTimerId);
      audioContext.close();
      analysisTrack.stop();
      onSpeakingChangeRef.current(false);
    };
  }, [enabled, rawStream]);
};

export { useVad };
