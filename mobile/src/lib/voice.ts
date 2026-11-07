import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useCallback } from 'react';

// Push-to-talk: record while held, then hand the clip to the server as base64.
export function useVoiceNote() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);

  const start = useCallback(async () => {
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) throw new Error('Microphone permission is needed to talk to your agent.');
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
  }, [recorder]);

  const stop = useCallback(async () => {
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    const seconds = (recorder.getStatus().durationMillis ?? 0) / 1000;
    if (!recorder.uri) return null;
    // fetch + FileReader works for file:// on native and blob: on web.
    const blob = await (await fetch(recorder.uri)).blob();
    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    const mime = blob.type || (recorder.uri.endsWith('.webm') ? 'audio/webm' : 'audio/m4a');
    return { audio: dataUrl, mime, seconds };
  }, [recorder]);

  return { recording: state.isRecording, start, stop };
}
