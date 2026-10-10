import type { BotId } from '@swarm/shared/types';
export const PERSONALITY = {
  bot1: { ease: [0.65, 0, 0.35, 1], squish: 1.10, float: 2, period: 3.4, blink: [3000, 6000, 120], pitch: 330, bounce: 0, sparkles: 8 },
  bot2: { ease: [0.22, 1, 0.36, 1], squish: 1.15, float: 3, period: 2.6, blink: [2500, 5000, 120], pitch: 440, bounce: 0.3, sparkles: 14 },
  bot3: { ease: [0.37, 0, 0.63, 1], squish: 1.08, float: 3, period: 4.2, blink: [4000, 8000, 180], pitch: 262, bounce: 0, sparkles: 8 },
  bot4: { ease: [0.16, 1, 0.3, 1], squish: 1.20, float: 2, period: 2.2, blink: [2500, 5000, 100], pitch: 392, bounce: 0, sparkles: 10 },
  bot5: { ease: [0.22, 1, 0.36, 1], squish: 1.15, float: 4, period: 3.0, blink: [2500, 5000, 120], pitch: 523, bounce: 0.35, sparkles: 12 },
} as const satisfies Record<BotId, object>;
export function hash(value: string) { let n = 2166136261; for (const char of value) n = Math.imul(n ^ char.charCodeAt(0), 16777619); return n >>> 0; }
export function mulberry32(seed: number) { return () => { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
