import { describe, expect, it } from "vitest";
import {
  currentMood,
  PRIORITY,
  updateConditions,
  type Condition,
} from "./engine";
import { makeEvent } from "../lab/fakeRun";
import type { Approval, Mood, ToolName } from "@swarm/shared/types";
const approval: Approval = {
  id: "a",
  runId: "r",
  botId: "bot1",
  kind: "confirm",
  title: "Test",
  detail: "Example",
  status: "pending",
  createdAt: 0,
  expiresAt: 300000,
};
describe("mood contracts", () => {
  it("uses exactly the specified priority", () => {
    const all: Condition[] = PRIORITY.map((mood) => ({
      key: mood,
      mood,
      from: 0,
    }));
    for (let i = 0; i < PRIORITY.length; i++)
      expect(currentMood(all.slice(i), 10)).toBe(PRIORITY[i]);
    expect(currentMood([], 10)).toBe("calm");
  });
  it("shows higher priority immediately and restores permanent happy", () => {
    let c = updateConditions(
      [],
      makeEvent(
        "bot.result",
        { botId: "bot1", result: {}, summary: "Done" },
        0,
        1,
        "bot1",
      ),
      0,
    );
    c = updateConditions(
      c,
      makeEvent("approval.requested", { approval }, 100, 2, "bot1"),
      100,
    );
    expect(currentMood(c, 100)).toBe("worried");
    c = updateConditions(
      c,
      makeEvent(
        "approval.resolved",
        { approvalId: "a", status: "approved", by: "user" },
        200,
        3,
      ),
      200,
    );
    expect(currentMood(c, 200)).toBe("content");
    expect(currentMood(c, 1400)).toBe("happy");
    expect(currentMood(c, 999999)).toBe("happy");
  });
  it.each([
    ["open", "focused"],
    ["click", "focused"],
    ["type", "focused"],
    ["select", "focused"],
    ["press", "focused"],
    ["scroll", "focused"],
    ["back", "focused"],
    ["wait", "bored"],
    ["list_elements", "curious"],
    ["read_text", "curious"],
    ["look", "curious"],
    ["read_board", "curious"],
  ] as [ToolName, Mood][])("%s maps to %s", (tool, mood) => {
    const c = updateConditions(
      [],
      makeEvent("tool.called", { callId: "t", tool, args: {} }, 0, 1, "bot1"),
      0,
    );
    expect(currentMood(c, 0)).toBe(mood);
  });
  it("holds focused for 400ms even after an early result", () => {
    let c = updateConditions(
      [],
      makeEvent(
        "tool.called",
        { callId: "t", tool: "click", args: {} },
        0,
        1,
        "bot1",
      ),
      0,
    );
    c = updateConditions(
      c,
      makeEvent(
        "tool.result",
        { callId: "t", ok: true, summary: "", ms: 100 },
        100,
        2,
        "bot1",
      ),
      100,
    );
    expect(currentMood(c, 399)).toBe("focused");
    expect(currentMood(c, 400)).toBe("calm");
  });
  it("keeps curious until the next tool call with a 400ms minimum", () => {
    let c = updateConditions(
      [],
      makeEvent(
        "tool.called",
        { callId: "t", tool: "look", args: {} },
        0,
        1,
        "bot1",
      ),
      0,
    );
    c = updateConditions(
      c,
      makeEvent(
        "tool.result",
        { callId: "t", ok: true, summary: "", ms: 100 },
        100,
        2,
        "bot1",
      ),
      100,
    );
    expect(currentMood(c, 900)).toBe("curious");
    c = updateConditions(
      c,
      makeEvent(
        "tool.called",
        { callId: "u", tool: "wait", args: {} },
        1000,
        3,
        "bot1",
      ),
      1000,
    );
    expect(c.some((x) => x.key === "tool:t")).toBe(false);
    expect(currentMood(c, 1000)).toBe("bored");
  });
  it("delays loading boredom until 700ms and clears it on load end", () => {
    let c = updateConditions(
      [],
      makeEvent("page.loading", { botId: "bot1", loading: true }, 0, 1),
      0,
    );
    expect(currentMood(c, 699)).toBe("calm");
    expect(currentMood(c, 700)).toBe("bored");
    c = updateConditions(
      c,
      makeEvent("page.loading", { botId: "bot1", loading: false }, 900, 2),
      900,
    );
    expect(currentMood(c, 900)).toBe("calm");
  });
  it("expires transient failure and preserves terminal failure", () => {
    const transient = updateConditions(
      [],
      makeEvent(
        "bot.error",
        { botId: "bot1", message: "retry", retryable: true },
        0,
        1,
      ),
      0,
    );
    expect(currentMood(transient, 1199)).toBe("failed");
    expect(currentMood(transient, 1200)).toBe("calm");
    const terminal = updateConditions(
      [],
      makeEvent(
        "bot.error",
        { botId: "bot1", message: "failed", retryable: false },
        0,
        1,
      ),
      0,
    );
    expect(currentMood(terminal, 999999)).toBe("failed");
  });
  it.each([
    ["found", 1200],
    ["content", 1200],
    ["suspicious", 900],
    ["worried", 2000],
  ] as [Mood, number][])("expires %s at the exact boundary", (mood, d) => {
    expect(currentMood([{ key: "t", mood, from: 0, until: d }], d - 1)).toBe(
      mood,
    );
    expect(currentMood([{ key: "t", mood, from: 0, until: d }], d)).toBe(
      "calm",
    );
  });
  it("starts thinking only when a tool is not in flight", () => {
    let c = updateConditions(
      [],
      makeEvent(
        "tool.called",
        { callId: "t", tool: "click", args: {} },
        0,
        1,
        "bot1",
      ),
      0,
    );
    c = updateConditions(
      c,
      makeEvent("bot.status", { botId: "bot1", status: "thinking" }, 100, 2),
      100,
    );
    expect(c.some((x) => x.key === "thinking")).toBe(false);
  });
});
