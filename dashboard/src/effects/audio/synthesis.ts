import type { BotId } from "@swarm/shared/types";
import { PERSONALITY, mulberry32 } from "../../characters/personality";
import {
  EFFECTS,
  VOICE_DNA,
  VOICE_PATTERNS,
  type Reaction,
  type UiCue,
} from "./catalogue";

export interface Playback {
  duration: number;
  stop: () => void;
  dispose: () => void;
}
function session(context: BaseAudioContext, destination: AudioNode) {
  const output = context.createGain();
  output.connect(destination);
  const nodes: AudioNode[] = [output],
    sources: AudioScheduledSourceNode[] = [];
  return {
    output,
    nodes,
    sources,
    finish(duration: number): Playback {
      let stopped = false;
      return {
        duration,
        stop() {
          if (stopped) return;
          stopped = true;
          const now = context.currentTime;
          output.gain.cancelScheduledValues(now);
          output.gain.setTargetAtTime(0, now, 0.004);
          sources.forEach((source) => {
            try {
              source.stop(now + 0.02);
            } catch {
              /* Already ended. */
            }
          });
        },
        dispose() {
          nodes.forEach((node) => node.disconnect());
        },
      };
    },
  };
}
export function renderEffect(
  context: BaseAudioContext,
  destination: AudioNode,
  cue: UiCue,
  pitch = 440,
): Playback {
  const s = session(context, destination),
    notes = EFFECTS[cue],
    start = context.currentTime + 0.005;
  const tiny = ["click", "tick", "type", "scroll"].includes(cue);
  const step = tiny ? 0.032 : 0.065,
    length = tiny ? 0.045 : 0.1;
  notes.forEach((ratio, index) => {
    const oscillator = context.createOscillator(),
      envelope = context.createGain();
    const t = start + index * step;
    oscillator.type = cue === "type" || cue === "pickup" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(pitch * ratio, t);
    oscillator.frequency.exponentialRampToValueAtTime(
      pitch * ratio * 0.9,
      t + length,
    );
    envelope.gain.setValueAtTime(0.0001, t);
    envelope.gain.exponentialRampToValueAtTime(tiny ? 0.09 : 0.12, t + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, t + length);
    oscillator.connect(envelope);
    envelope.connect(s.output);
    oscillator.start(t);
    oscillator.stop(t + length + 0.01);
    s.nodes.push(oscillator, envelope);
    s.sources.push(oscillator);
  });
  return s.finish((notes.length - 1) * step + length + 0.025);
}
const vowels = [
  [750, 1200],
  [450, 1900],
  [320, 2450],
  [360, 850],
];
const noise = new WeakMap<BaseAudioContext, AudioBuffer>();
function breathBuffer(context: BaseAudioContext) {
  let buffer = noise.get(context);
  if (!buffer) {
    buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = buffer.getChannelData(0),
      random = mulberry32(419);
    for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1;
    noise.set(context, buffer);
  }
  return buffer;
}
export function renderVoice(
  context: BaseAudioContext,
  destination: AudioNode,
  id: BotId,
  reaction: Reaction,
  variant = 0,
): Playback {
  const s = session(context, destination),
    dna = VOICE_DNA[id];
  const pattern = VOICE_PATTERNS[reaction][variant % 3],
    pitch = PERSONALITY[id].pitch;
  const slow = ["sleep", "failure", "waiting"].includes(reaction),
    bright = ["discovery", "success", "surprise", "wake"].includes(reaction);
  const step =
    (slow ? 0.18 : reaction === "laughter" ? 0.095 : 0.12) * dna.pace;
  const duration = step * pattern.length + 0.055,
    start = context.currentTime + 0.005;
  const vibrato = context.createOscillator(),
    depth = context.createGain();
  const oscillator = context.createOscillator(),
    envelope = context.createGain();
  const breath = context.createBufferSource(),
    air = context.createBiquadFilter(),
    airGain = context.createGain();
  oscillator.type = dna.shape;
  breath.buffer = breathBuffer(context);
  air.type = "highpass";
  air.frequency.value = 1800;
  breath.connect(air);
  air.connect(airGain);
  airGain.connect(s.output);
  envelope.connect(s.output);
  // Reuse one vocal tract for the whole utterance, avoiding a graph per syllable.
  const filters = vowels[pattern[0]].map((_, band) => {
    const filter = context.createBiquadFilter(),
      level = context.createGain();
    filter.type = "bandpass";
    filter.Q.value = band ? 4 : 3;
    level.gain.value = band ? 0.55 : 1;
    oscillator.connect(filter);
    filter.connect(level);
    level.connect(envelope);
    s.nodes.push(filter, level);
    return filter;
  });
  vibrato.frequency.value = reaction === "laughter" ? 12 : 6;
  depth.gain.value = dna.vibrato;
  vibrato.connect(depth);
  depth.connect(oscillator.frequency);
  vibrato.start(start);
  vibrato.stop(start + duration);
  oscillator.start(start);
  oscillator.stop(start + duration);
  breath.start(start);
  breath.stop(start + duration);
  s.nodes.push(vibrato, depth, oscillator, envelope, breath, air, airGain);
  s.sources.push(vibrato, oscillator, breath);
  pattern.forEach((vowel, index) => {
    const t = start + index * step,
      end = t + step * 0.86;
    const contour =
      reaction === "question"
        ? 0.85 + index * 0.15
        : bright
          ? 1 + index * 0.09
          : slow
            ? 1 - index * 0.06
            : 1 + Math.sin(index * 2 + variant) * 0.1;
    const frequency = pitch * contour * (1 + (variant - 1) * 0.035);
    oscillator.frequency.setValueAtTime(frequency * 0.92, t);
    oscillator.frequency.exponentialRampToValueAtTime(
      frequency * (reaction === "frustration" ? 0.8 : 1.08),
      end,
    );
    envelope.gain.setValueAtTime(0.0001, t);
    envelope.gain.exponentialRampToValueAtTime(0.26, t + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    // Two resonances move between vowels, giving a small vocal tract rather than a beep.
    vowels[vowel].forEach((formant, band) => {
      const filter = filters[band];
      filter.frequency.setValueAtTime(formant * dna.formant, t);
      filter.frequency.linearRampToValueAtTime(
        vowels[pattern[(index + 1) % pattern.length]][band] * dna.formant,
        end,
      );
    });
    airGain.gain.setValueAtTime(0.0001, t);
    airGain.gain.linearRampToValueAtTime(dna.breath, t + 0.01);
    airGain.gain.exponentialRampToValueAtTime(0.0001, end);
  });
  return s.finish(duration);
}
