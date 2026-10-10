import type { BotId, Mood } from "@swarm/shared/types";

export type AudioScope = "ui" | "room" | "workflow" | "preview";
export type Priority = 1 | 2 | 3 | 4 | 5; // idle, routine, milestone, touch, urgent
export const REACTIONS = [
  "greeting",
  "working",
  "waiting",
  "question",
  "discovery",
  "frustration",
  "success",
  "failure",
  "affection",
  "surprise",
  "laughter",
  "sleep",
  "wake",
] as const;
export type Reaction = (typeof REACTIONS)[number];
export interface AudioOptions {
  scope?: AudioScope;
  priority?: Priority;
  speed?: number;
  key?: string;
  botId?: BotId;
}
export const EFFECTS = {
  click: [1],
  tab: [1, 1.2],
  select: [1.2],
  on: [1, 1.5],
  off: [1.5, 1],
  tick: [1],
  join: [0.75, 1],
  leave: [1, 0.75],
  launch: [0.5, 0.75, 1, 1.5],
  planning: [0.5, 0.75],
  ready: [1, 1.25],
  navigate: [0.8, 1.2],
  type: [1, 0.92, 1.08],
  scroll: [1.1, 0.9],
  wait: [0.75],
  found: [1, 1.5],
  bug: [1, 1.2, 1.6],
  post: [1, 1.25],
  deliver: [1.5, 1.25],
  approval: [1, 1.5, 1.25],
  approved: [1, 1.5],
  skipped: [1, 0.8],
  caution: [1, 0.7],
  retry: [0.7, 1],
  failure: [1, 0.75, 0.5],
  pause: [1, 0.75],
  resume: [0.75, 1],
  finish: [1, 1.25, 1.5],
  merge: [0.5, 0.75, 1],
  complete: [1, 1.25, 1.5, 2],
  boop: [1.3, 0.9],
  pickup: [0.8, 1.2],
  release: [1.2, 0.85],
  spark: [1, 1.5],
  dance: [1, 1.25, 1, 1.5],
  sleep: [1, 0.8, 0.6],
  wake: [0.6, 0.8, 1],
  open: [0.8, 1],
  close: [1, 0.8],
  reset: [1.2, 0.9, 0.6],
} as const;
export type UiCue = keyof typeof EFFECTS;
// Vowel transitions are deliberately nonsense; captions convey the actual task.
export const VOICE_PATTERNS: Record<
  Reaction,
  readonly [number[], number[], number[]]
> = {
  greeting: [
    [0, 2, 1],
    [1, 0, 3],
    [2, 1, 0],
  ],
  working: [
    [3, 1, 3],
    [1, 3, 2],
    [3, 0, 1],
  ],
  waiting: [
    [3, 3],
    [2, 3],
    [3, 1],
  ],
  question: [
    [0, 3, 2],
    [3, 0, 2],
    [1, 3, 0],
  ],
  discovery: [
    [2, 0, 2],
    [0, 1, 2],
    [1, 2, 0],
  ],
  frustration: [
    [0, 3, 0],
    [3, 0, 3],
    [1, 0, 3],
  ],
  success: [
    [0, 1, 2, 0],
    [2, 0, 1],
    [1, 2, 0, 2],
  ],
  failure: [
    [0, 3],
    [1, 3, 3],
    [3, 0, 3],
  ],
  affection: [
    [3, 2, 3],
    [1, 3, 2],
    [2, 3, 1],
  ],
  surprise: [
    [0, 2],
    [2, 0],
    [1, 0, 2],
  ],
  laughter: [
    [0, 0, 2, 0],
    [1, 1, 0],
    [2, 0, 2, 0],
  ],
  sleep: [
    [0, 3],
    [3, 0, 3],
    [1, 3],
  ],
  wake: [
    [3, 0, 2],
    [0, 3, 1],
    [1, 0, 2],
  ],
};
export const VOICE_DNA: Record<
  BotId,
  {
    pace: number;
    breath: number;
    vibrato: number;
    formant: number;
    shape: OscillatorType;
  }
> = {
  bot1: {
    pace: 1.05,
    breath: 0.055,
    vibrato: 3,
    formant: 0.9,
    shape: "sawtooth",
  },
  bot2: {
    pace: 0.82,
    breath: 0.015,
    vibrato: 9,
    formant: 1.18,
    shape: "sawtooth",
  },
  bot3: {
    pace: 1.25,
    breath: 0.035,
    vibrato: 4,
    formant: 0.78,
    shape: "triangle",
  },
  bot4: { pace: 0.72, breath: 0.02, vibrato: 2, formant: 1, shape: "sawtooth" },
  bot5: {
    pace: 0.95,
    breath: 0.012,
    vibrato: 12,
    formant: 1.25,
    shape: "sawtooth",
  },
};
export const MOOD_VOICE: Record<Mood, Reaction> = {
  calm: "greeting",
  curious: "question",
  focused: "working",
  bored: "waiting",
  suspicious: "question",
  found: "discovery",
  worried: "frustration",
  content: "affection",
  failed: "failure",
  happy: "laughter",
};
