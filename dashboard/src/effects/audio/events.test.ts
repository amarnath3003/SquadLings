import { describe, expect, it } from "vitest";
import { audioCue } from "./events";
import { initialState, newBot, reduce } from "../../store/reducer";
import { fakeRun, makeEvent } from "../../lab/fakeRun";
import { REACTIONS, VOICE_PATTERNS } from "./catalogue";
describe("workflow audio", () => {
  it("covers the complete sample lifecycle without sounding frame/cursor movement", () => {
    let state = initialState();
    const effects = new Set<string>();
    for (const event of fakeRun("audio-coverage", 5)) {
      const cue = audioCue(event, state);
      if (cue?.effect) effects.add(cue.effect);
      if (
        ["frame", "cursor.move", "usage.updated", "bot.caption"].includes(
          event.type,
        )
      )
        expect(cue).toBeUndefined();
      state = reduce(state, event);
    }
    for (const cue of [
      "launch",
      "planning",
      "ready",
      "join",
      "navigate",
      "click",
      "post",
      "deliver",
      "approval",
      "approved",
      "finish",
      "merge",
      "complete",
    ])
      expect(effects.has(cue), cue).toBe(true);
  });
  it("resolves tool and approval owners from the previous state", () => {
    const state = initialState();
    state.calls.a = { botId: "bot2", tool: "click" };
    state.approvals.push({
      id: "a",
      runId: "r",
      botId: "bot3",
      status: "pending",
      kind: "confirm",
      title: "Example",
      detail: "Example",
      createdAt: 0,
      expiresAt: 100,
    });
    expect(
      audioCue(
        makeEvent(
          "tool.result",
          { callId: "a", ok: false, summary: "Retry", ms: 1 },
          1,
          1,
        ),
        state,
      ),
    ).toMatchObject({ id: "bot2", effect: "retry", reaction: "frustration" });
    expect(
      audioCue(
        makeEvent(
          "approval.resolved",
          { approvalId: "a", status: "skipped", by: "user" },
          1,
          2,
        ),
        state,
      ),
    ).toMatchObject({ id: "bot3", effect: "skipped", priority: 5 });
  });
  it("distinguishes caution, retry, failure, and expired approvals", () => {
    const state = initialState();
    expect(
      audioCue(
        makeEvent(
          "bot.error",
          { botId: "bot1", message: "Example", retryable: false },
          0,
          1,
        ),
        state,
      )?.effect,
    ).toBe("failure");
    expect(
      audioCue(
        makeEvent(
          "bot.error",
          { botId: "bot1", message: "Example", retryable: true },
          0,
          2,
        ),
        state,
      )?.effect,
    ).toBe("retry");
    expect(
      audioCue(
        makeEvent(
          "safety.blocked",
          { botId: "bot1", code: "test", reason: "Example" },
          0,
          3,
        ),
        state,
      )?.effect,
    ).toBe("caution");
    expect(
      audioCue(
        makeEvent(
          "approval.resolved",
          { approvalId: "a", status: "expired", by: "system" },
          0,
          4,
        ),
        state,
      )?.reaction,
    ).toBe("failure");
  });
  it("suppresses unchanged statuses and the second final completion", () => {
    const state = initialState();
    state.bots.bot1 = newBot("bot1");
    state.bots.bot1.status = "paused";
    expect(
      audioCue(
        makeEvent("bot.status", { botId: "bot1", status: "paused" }, 0, 1),
        state,
      ),
    ).toBeUndefined();
    state.result = {
      runId: "r",
      templateId: "t",
      title: "Example",
      result: {},
      markdown: "",
      gaps: [],
    };
    expect(
      audioCue(
        makeEvent(
          "run.ended",
          { status: "completed", durationMs: 10, costUSD: 0 },
          0,
          2,
        ),
        state,
      ),
    ).toBeUndefined();
    expect(
      audioCue(
        makeEvent(
          "run.ended",
          { status: "failed", durationMs: 10, costUSD: 0 },
          0,
          3,
        ),
        state,
      )?.effect,
    ).toBe("failure");
  });
  it("has three different syllable variants for every reaction", () => {
    for (const reaction of REACTIONS)
      expect(new Set(VOICE_PATTERNS[reaction].map((v) => v.join())).size).toBe(
        3,
      );
  });
});
