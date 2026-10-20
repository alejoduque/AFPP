/**
 * One microphone, two engines: capacitor-voice-recorder on the phone (AAC),
 * MediaRecorder in a browser (for development). start() / stop() resolve to
 * {blob, durationSec, mimeType}. Nothing here touches storage or the map.
 *
 * While a walk's sound is live (liveWalk.js), the microphone already belongs
 * to that stream: takes are then recorded from a clone of it with
 * MediaRecorder, on the phone too, so nothing else asks for the mic.
 */
import { VoiceRecorder } from 'capacitor-voice-recorder';

const isNative = () => !!window.Capacitor?.isNativePlatform?.();

let web = null; // {recorder, stream, chunks}
let native = false; // this take went to capacitor-voice-recorder
let startedAt = 0;
let shared = null; // the live walk's microphone stream

export function setSharedStream(stream) {
  shared = stream;
}

export async function startRecording() {
  startedAt = Date.now();
  native = isNative() && !shared;
  if (native) {
    const perm = await VoiceRecorder.requestAudioRecordingPermission();
    if (perm && perm.value === false) throw new Error('microphone permission denied');
    await VoiceRecorder.startRecording();
    return;
  }
  const stream = shared
    ? new MediaStream(shared.getAudioTracks().map((tr) => tr.clone())) // stopping a clone leaves the live mic on
    : await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.start(1000);
  web = { recorder, stream, chunks };
}

export async function stopRecording() {
  const elapsed = (Date.now() - startedAt) / 1000;
  if (native) {
    const { value } = await VoiceRecorder.stopRecording();
    if (!value?.recordDataBase64) throw new Error('nothing was recorded');
    const bin = atob(value.recordDataBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const mimeType = value.mimeType || 'audio/aac';
    return {
      blob: new Blob([bytes], { type: mimeType }),
      durationSec: value.msDuration ? value.msDuration / 1000 : elapsed,
      mimeType,
    };
  }
  if (!web) throw new Error('not recording');
  const { recorder, stream, chunks } = web;
  web = null;
  await new Promise((resolve) => {
    recorder.onstop = resolve;
    recorder.stop();
  });
  stream.getTracks().forEach((tr) => tr.stop());
  if (!chunks.length) throw new Error('nothing was recorded');
  const mimeType = recorder.mimeType || 'audio/mp4';
  return { blob: new Blob(chunks, { type: mimeType }), durationSec: elapsed, mimeType };
}

/** Abandon a take without keeping anything (leaving the screen, errors). */
export async function cancelRecording() {
  try {
    if (native) await VoiceRecorder.stopRecording();
    else if (web) {
      web.recorder.stop();
      web.stream.getTracks().forEach((tr) => tr.stop());
      web = null;
    }
  } catch {
    // already stopped
  }
}
