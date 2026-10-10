import { renderEffect } from "../effects/audio/synthesis";
import type { UiCue } from "../effects/audio/catalogue";
import { DURATION, workers } from "./timeline";

interface SoundCue {
  at: number;
  kind: UiCue;
  pitch: number;
}
export const soundCues = (
  [
    { at: 0.15, kind: "wake", pitch: 220 },
    { at: 1.25, kind: "boop", pitch: 330 },
    ...Array.from({ length: 14 }, (_, i) => ({
      at: 2.55 + i * 0.225,
      kind: "type" as const,
      pitch: 260 + (i % 3) * 25,
    })),
    ...Array.from({ length: 5 }, (_, i) => ({
      at: 6.1 + i * 0.48,
      kind: "join" as const,
      pitch: 330 + i * 55,
    })),
    { at: 9.5, kind: "launch", pitch: 330 },
    { at: 11.3, kind: "spark", pitch: 220 },
    { at: 14.2, kind: "planning", pitch: 260 },
    ...workers.map((w, i) => ({
      at: w.report + 1,
      kind: "deliver" as const,
      pitch: 360 + i * 25,
    })),
    { at: 24, kind: "navigate", pitch: 340 },
    ...workers.map((w, i) => ({
      at: w.done,
      kind: "finish" as const,
      pitch: 370 + i * 28,
    })),
    { at: 31, kind: "merge", pitch: 300 },
    { at: 32, kind: "complete", pitch: 390 },
    { at: 38.2, kind: "leave", pitch: 360 },
    { at: 40, kind: "close", pitch: 280 },
    { at: 43.7, kind: "sleep", pitch: 270 },
  ] satisfies SoundCue[]
).sort((a, b) => a.at - b.at);

export function playFilmCue(context: AudioContext, cue: SoundCue) {
  const gain = context.createGain();
  gain.gain.value = 0.28;
  gain.connect(context.destination);
  const playback = renderEffect(context, gain, cue.kind, cue.pitch);
  setTimeout(
    () => {
      playback.dispose();
      gain.disconnect();
    },
    (playback.duration + 0.1) * 1000,
  );
}

// Render the same effect recipes offline with sample-accurate timeline delays.
// Browser screen recording does not include Web Audio, so the recorder muxes this WAV.
export async function renderSoundtrack(): Promise<string> {
  const rate = 48000;
  const context = new OfflineAudioContext(1, DURATION * rate, rate);
  const master = context.createGain();
  master.gain.value = 0.28;
  master.connect(context.destination);
  for (const cue of soundCues) {
    const delay = context.createDelay(DURATION);
    delay.delayTime.value = cue.at;
    delay.connect(master);
    renderEffect(context, delay, cue.kind, cue.pitch);
  }
  const buffer = await context.startRendering();
  const samples = buffer.getChannelData(0);
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const str = (at: number, value: string) =>
    [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  str(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  str(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) =>
    view.setInt16(
      44 + i * 2,
      Math.round(Math.max(-1, Math.min(1, sample)) * 32767),
      true,
    ),
  );
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
