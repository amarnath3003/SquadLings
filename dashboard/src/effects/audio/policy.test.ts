import { describe, expect, it } from "vitest";
import {
  AudioPolicy,
  DEFAULT_AUDIO,
  normalizePreferences,
  type Admission,
} from "./policy";
const request: Admission = {
  channel: "effect",
  scope: "workflow",
  priority: 2,
  key: "click",
  speed: 1,
};
describe("audio admission", () => {
  it("limits actual starts to eight in a rolling second", () => {
    const policy = new AudioPolicy();
    for (let i = 0; i < 8; i++) {
      const r = { ...request, key: String(i) };
      expect(policy.reason(r, i * 10)).toBeUndefined();
      policy.record(r, i * 10);
    }
    expect(policy.reason({ ...request, priority: 5 }, 90)).toBe("rate");
    expect(policy.reason(request, 1100)).toBeUndefined();
  });
  it("uses per-bot routine voice cooldowns across different reactions", () => {
    const policy = new AudioPolicy(),
      r = { ...request, channel: "voice" as const, botId: "bot1" };
    policy.record(r, 0);
    expect(policy.reason({ ...r, key: "another-reaction" }, 3999)).toBe(
      "cooldown",
    );
    expect(policy.reason({ ...r, botId: "bot2" }, 1000)).toBeUndefined();
    expect(policy.reason(r, 4000)).toBeUndefined();
    expect(policy.reason({ ...r, priority: 5 }, 1000)).toBeUndefined();
  });
  it("thins 2x effects and suppresses routine 4x cues without dropping alerts", () => {
    const policy = new AudioPolicy();
    policy.record(request, 0);
    expect(policy.reason({ ...request, speed: 2 }, 400)).toBe("cooldown");
    expect(policy.reason({ ...request, speed: 2 }, 500)).toBeUndefined();
    expect(policy.reason({ ...request, speed: 4 }, 5000)).toBe("speed");
    expect(
      policy.reason({ ...request, priority: 5, speed: 4 }, 5000),
    ).toBeUndefined();
  });
  it("gives idle chatter a global fifteen-second cooldown and foreground quiet time", () => {
    const policy = new AudioPolicy(),
      idle = {
        ...request,
        channel: "voice" as const,
        scope: "room" as const,
        priority: 1 as const,
      };
    policy.record(idle, 0);
    expect(policy.reason({ ...idle, key: "other" }, 14999)).toBe("idle");
    expect(policy.reason(idle, 15000)).toBeUndefined();
    policy.record(request, 14000);
    expect(policy.reason(idle, 16000)).toBe("idle");
    expect(policy.reason(idle, 17000)).toBeUndefined();
  });
  it("clears one scope without removing global burst protection", () => {
    const policy = new AudioPolicy();
    policy.record(request, 0);
    policy.clear("room");
    expect(policy.reason(request, 100)).toBe("cooldown");
    policy.clear("workflow");
    expect(policy.reason(request, 100)).toBeUndefined();
    policy.clear();
    expect(policy.reason(request, 0)).toBeUndefined();
  });
});
describe("audio preferences", () => {
  it("starts with a soft mix and separates voices from sound effects", () => {
    expect(normalizePreferences({})).toEqual(DEFAULT_AUDIO);
    expect(normalizePreferences({ voices: false, idle: true })).toMatchObject({
      voices: false,
      idle: false,
      effects: true,
    });
  });
  it("rejects malformed values and clamps volume", () => {
    expect(normalizePreferences({ volume: NaN }).volume).toBe(0.35);
    expect(normalizePreferences({ volume: 10 }).volume).toBe(1);
    expect(normalizePreferences({ volume: -1 }).volume).toBe(0);
    expect(normalizePreferences({ voices: "yes" } as never).voices).toBe(true);
  });
});
