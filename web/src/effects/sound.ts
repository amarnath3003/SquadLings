import { create } from "zustand";
import type { BotId } from "@swarm/shared/types";
import { PERSONALITY } from "../characters/personality";
import {
  AudioPolicy,
  DEFAULT_AUDIO,
  normalizePreferences,
  type AudioPreferences,
  type Admission,
} from "./audio/policy";
import type {
  AudioOptions,
  AudioScope,
  Reaction,
  UiCue,
} from "./audio/catalogue";
import { renderEffect, renderVoice, type Playback } from "./audio/synthesis";
export type {
  AudioOptions,
  AudioScope,
  Reaction,
  UiCue,
} from "./audio/catalogue";
export const AUDIO_STORAGE_KEY = "squadlings.audio.v1";
function savedPreferences(): AudioPreferences {
  try {
    return normalizePreferences(
      JSON.parse(localStorage.getItem(AUDIO_STORAGE_KEY) ?? "{}") ?? {},
    );
  } catch {
    return { ...DEFAULT_AUDIO };
  }
}
export const useAudio = create<{
  enabled: boolean;
  pending: boolean;
  error: string;
  preferences: AudioPreferences;
  speaking?: { id: BotId; reaction: Reaction; scope: AudioScope };
}>(() => ({
  enabled: false,
  pending: false,
  error: "",
  preferences: savedPreferences(),
}));

let context: AudioContext | undefined,
  effects: GainNode,
  voices: GainNode,
  master: GainNode;
let intent = 0;
const policy = new AudioPolicy();
interface Active {
  request: Admission;
  playback: Playback;
  timer: ReturnType<typeof setTimeout>;
  label: string;
}
interface VoiceRequest {
  id: BotId;
  reaction: Reaction;
  options: AudioOptions;
  expires: number;
}
const active = new Set<Active>(),
  scheduled = new Map<
    ReturnType<typeof setTimeout>,
    { scope: AudioScope; voice: boolean }
  >();
let queued: VoiceRequest[] = [];
const variants = new Map<string, number>();
const trace: {
  channel: string;
  label: string;
  scope: AudioScope;
  id?: string;
  at: number;
}[] = [];
const totals = {
  effects: 0,
  voices: 0,
  dropped: 0,
  maxEffects: 0,
  maxVoices: 0,
};
export function getAudioDiagnostics() {
  return {
    ...totals,
    activeEffects: [...active].filter((a) => a.request.channel === "effect")
      .length,
    activeVoices: [...active].filter((a) => a.request.channel === "voice")
      .length,
    queued: queued.length,
    scheduled: scheduled.size,
    contextState: context?.state ?? "uninitialized",
    trace: [...trace],
  };
}
function initialize() {
  context = new AudioContext();
  effects = context.createGain();
  voices = context.createGain();
  master = context.createGain();
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 12;
  compressor.ratio.value = 8;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.15;
  effects.gain.value = 0.65;
  voices.gain.value = 0.9;
  master.gain.value = useAudio.getState().preferences.volume;
  effects.connect(master);
  voices.connect(master);
  master.connect(compressor);
  compressor.connect(context.destination);
  context.addEventListener("statechange", () => {
    if (context?.state !== "running" && useAudio.getState().enabled) {
      stopAudio();
      useAudio.setState({
        enabled: false,
        error: "Audio was paused by the browser. Turn sound on to resume.",
      });
    }
  });
}
export async function setSound(value: boolean) {
  const token = ++intent;
  if (!value) {
    useAudio.setState({ enabled: false, pending: false, error: "" });
    stopAudio();
    return;
  }
  useAudio.setState({ pending: true, error: "" });
  try {
    if (!context || context.state === "closed") initialize();
    await context!.resume();
    if (token !== intent) return;
    if (context!.state !== "running")
      throw new Error("Audio is still suspended");
    useAudio.setState({ enabled: true, pending: false });
    playUi("on");
  } catch {
    if (token !== intent) return;
    useAudio.setState({
      enabled: false,
      pending: false,
      error:
        "Audio could not start. Try turning sound on again in this browser.",
    });
  }
}
export function setAudioPreferences(value: Partial<AudioPreferences>) {
  const preferences = normalizePreferences({
    ...useAudio.getState().preferences,
    ...value,
  });
  useAudio.setState({ preferences });
  if (context && master)
    master.gain.setTargetAtTime(preferences.volume, context.currentTime, 0.015);
  if (!preferences.voices) {
    queued = [];
    [...active]
      .filter((a) => a.request.channel === "voice")
      .forEach(stopActive);
    for (const [timer, task] of scheduled)
      if (task.voice) {
        clearTimeout(timer);
        scheduled.delete(timer);
      }
  }
  if (!preferences.effects)
    [...active]
      .filter((a) => a.request.channel === "effect")
      .forEach(stopActive);
  if (!preferences.idle) {
    queued = queued.filter((a) => a.options.priority !== 1);
    [...active].filter((a) => a.request.priority === 1).forEach(stopActive);
  }
  if (preferences.volume === 0) stopAudio();
  try {
    localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    /* Settings still work for this visit. */
  }
}
function allowed(channel: "effect" | "voice", priority: number) {
  const state = useAudio.getState();
  return (
    state.enabled &&
    state.preferences.volume > 0 &&
    context?.state === "running" &&
    !document.hidden &&
    (channel === "effect"
      ? state.preferences.effects
      : state.preferences.voices && (priority !== 1 || state.preferences.idle))
  );
}
function admission(
  channel: "effect" | "voice",
  key: string,
  options: AudioOptions,
): Admission {
  return {
    channel,
    scope: options.scope ?? "ui",
    priority: options.priority ?? 4,
    key: options.key ?? key,
    speed: options.speed ?? 1,
    botId: options.botId,
  };
}
function start(request: Admission, label: string, playback: Playback) {
  policy.record(request, performance.now());
  const item: Active = {
    request,
    playback,
    label,
    timer: setTimeout(() => finish(item), playback.duration * 1000 + 10),
  };
  active.add(item);
  if (request.channel === "voice") totals.voices++;
  else totals.effects++;
  totals.maxEffects = Math.max(
    totals.maxEffects,
    [...active].filter((a) => a.request.channel === "effect").length,
  );
  totals.maxVoices = Math.max(
    totals.maxVoices,
    [...active].filter((a) => a.request.channel === "voice").length,
  );
  trace.push({
    channel: request.channel,
    label,
    scope: request.scope,
    id: request.botId,
    at: performance.now(),
  });
  if (trace.length > 160) trace.shift();
}
function finish(item: Active) {
  if (!active.delete(item)) return;
  item.playback.dispose();
  if (item.request.channel === "voice") {
    useAudio.setState({ speaking: undefined });
    drain();
  }
}
function stopActive(item: Active) {
  clearTimeout(item.timer);
  active.delete(item);
  item.playback.stop();
  setTimeout(() => item.playback.dispose(), 30);
  if (item.request.channel === "voice")
    useAudio.setState({ speaking: undefined });
}
export function stopAudio(scope?: AudioScope) {
  for (const [timer, owner] of scheduled)
    if (!scope || scope === owner.scope) {
      clearTimeout(timer);
      scheduled.delete(timer);
    }
  queued = queued.filter((item) => scope && item.options.scope !== scope);
  [...active]
    .filter((item) => !scope || item.request.scope === scope)
    .forEach(stopActive);
  policy.clear(scope);
}
export function attachAudioLifecycle() {
  const hide = () => {
    if (document.hidden) stopAudio();
  };
  const leave = () => stopAudio();
  document.addEventListener("visibilitychange", hide);
  window.addEventListener("pagehide", leave);
  return () => {
    document.removeEventListener("visibilitychange", hide);
    window.removeEventListener("pagehide", leave);
    stopAudio();
  };
}
export function playUi(cue: UiCue, options: AudioOptions = {}) {
  const request = admission("effect", cue, options);
  if (!allowed("effect", request.priority)) return false;
  if (policy.reason(request, performance.now())) {
    totals.dropped++;
    return false;
  }
  const playing = [...active].filter((a) => a.request.channel === "effect");
  if (playing.length >= 4) {
    const lowest = playing.sort(
      (a, b) => a.request.priority - b.request.priority,
    )[0];
    if (request.priority <= lowest.request.priority) {
      totals.dropped++;
      return false;
    }
    stopActive(lowest);
  }
  const pitch = options.botId
    ? PERSONALITY[options.botId].pitch
    : ["planning", "merge"].includes(cue)
      ? 262
      : ["approval", "caution"].includes(cue)
        ? 660
        : 440;
  start(request, cue, renderEffect(context!, effects, cue, pitch));
  return true;
}
export function playVoice(
  id: BotId,
  reaction: Reaction,
  options: AudioOptions = {},
) {
  const request = admission("voice", `${id}:${reaction}`, {
    ...options,
    botId: id,
  });
  if (!allowed("voice", request.priority)) return false;
  if (policy.reason(request, performance.now())) {
    totals.dropped++;
    return false;
  }
  const current = [...active].find((a) => a.request.channel === "voice");
  if (current) {
    if (request.priority > current.request.priority) stopActive(current);
    else {
      if (request.priority < 3) {
        totals.dropped++;
        return false;
      }
      queued = queued.filter((v) => v.id !== id || v.reaction !== reaction);
      queued.push({
        id,
        reaction,
        options: { ...options, scope: request.scope },
        expires: performance.now() + 800,
      });
      queued.sort(
        (a, b) => (b.options.priority ?? 4) - (a.options.priority ?? 4),
      );
      queued = queued.slice(0, 2);
      return false;
    }
  }
  const key = `${id}:${reaction}`,
    variant = variants.get(key) ?? 0;
  variants.set(key, (variant + 1) % 3);
  start(
    request,
    reaction,
    renderVoice(context!, voices, id, reaction, variant),
  );
  useAudio.setState({ speaking: { id, reaction, scope: request.scope } });
  return true;
}
function drain() {
  const now = performance.now();
  queued = queued.filter((item) => item.expires > now);
  while (queued.length) {
    const next = queued.shift()!;
    if (playVoice(next.id, next.reaction, next.options)) break;
  }
}
export function scheduleAudio(
  callback: () => void,
  delay: number,
  scope: AudioScope,
  voice = false,
) {
  if (!useAudio.getState().enabled || document.hidden) return;
  const timer = setTimeout(() => {
    scheduled.delete(timer);
    callback();
  }, delay);
  scheduled.set(timer, { scope, voice });
}
export function voiceSequence(
  ids: BotId[],
  reaction: Reaction,
  scope: AudioScope,
  priority: 3 | 4 = 4,
) {
  if (!useAudio.getState().preferences.voices) return;
  ids.forEach((id, index) =>
    scheduleAudio(
      () => playVoice(id, reaction, { scope, priority }),
      index * 700,
      scope,
      true,
    ),
  );
}
