import type { AudioScope, Priority } from "./catalogue";

export interface AudioPreferences {
  volume: number;
  effects: boolean;
  voices: boolean;
  idle: boolean;
}
export const DEFAULT_AUDIO: AudioPreferences = {
  volume: 0.35,
  effects: true,
  voices: true,
  idle: true,
};
export function normalizePreferences(
  value: Partial<AudioPreferences>,
): AudioPreferences {
  const voices =
    typeof value.voices === "boolean" ? value.voices : DEFAULT_AUDIO.voices;
  return {
    volume:
      typeof value.volume === "number" && Number.isFinite(value.volume)
        ? Math.max(0, Math.min(1, value.volume))
        : DEFAULT_AUDIO.volume,
    effects:
      typeof value.effects === "boolean"
        ? value.effects
        : DEFAULT_AUDIO.effects,
    voices,
    idle:
      voices &&
      (typeof value.idle === "boolean" ? value.idle : DEFAULT_AUDIO.idle),
  };
}
export interface Admission {
  channel: "effect" | "voice";
  scope: AudioScope;
  priority: Priority;
  key: string;
  speed: number;
  botId?: string;
}
export class AudioPolicy {
  private starts: number[] = [];
  private cooldowns = new Map<string, number>();
  private idleAt = -Infinity;
  private foregroundAt = -Infinity;
  reason(request: Admission, now: number): string | undefined {
    this.starts = this.starts.filter((t) => now - t < 1000);
    if (this.starts.length >= 8) return "rate";
    if (request.priority === 2 && request.speed >= 4) return "speed";
    const key = this.key(request);
    const delay =
      request.channel === "voice" && request.priority === 2
        ? 4000
        : request.priority === 2
          ? 250 * Math.max(1, request.speed)
          : 90;
    if (now - (this.cooldowns.get(key) ?? -Infinity) < delay) return "cooldown";
    if (
      request.priority === 1 &&
      (now - this.idleAt < 15000 || now - this.foregroundAt < 3000)
    )
      return "idle";
  }
  record(request: Admission, now: number) {
    this.starts.push(now);
    this.cooldowns.set(this.key(request), now);
    if (request.priority === 1) this.idleAt = now;
    else this.foregroundAt = now;
  }
  clear(scope?: AudioScope) {
    if (!scope) {
      this.starts = [];
      this.cooldowns.clear();
      this.idleAt = this.foregroundAt = -Infinity;
    } else
      for (const key of this.cooldowns.keys())
        if (key.startsWith(scope + ":")) this.cooldowns.delete(key);
  }
  private key(r: Admission) {
    return `${r.scope}:${r.channel}:${r.channel === "voice" && r.priority === 2 ? r.botId : r.key}`;
  }
}
