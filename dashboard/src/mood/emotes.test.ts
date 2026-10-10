import { describe, expect, it } from "vitest";
import {
  eventEmotes,
  expireEmotes,
  pushEmote,
  type EmoteState,
} from "./emotes";
import { makeEvent } from "../lab/fakeRun";
describe("one-bubble queue", () => {
  it("preempts low priority, replaces equals, and bounds the waiting queue", () => {
    let s = pushEmote({ queue: [] }, "think", 0);
    s = pushEmote(s, "found", 100);
    expect(s.current?.name).toBe("found");
    s = pushEmote(s, "retry", 200);
    expect(s.current?.name).toBe("retry");
    for (const name of ["mail", "ok", "skip"] as const)
      s = pushEmote(s, name, 300);
    expect(s.queue.map((b) => b.name)).toEqual(["ok", "skip"]);
    s = pushEmote(s, "ask", 400);
    expect(s.current?.name).toBe("ask");
  });
  it("retains unresolved approvals and clears only the matching request", () => {
    let s: EmoteState = {
      queue: [],
      current: { name: "ask", key: "a", at: 0 },
    };
    expect(expireEmotes(s, 999999).current?.name).toBe("ask");
    s = eventEmotes(
      s,
      makeEvent(
        "approval.resolved",
        { approvalId: "b", status: "approved", by: "user" },
        100,
        1,
      ),
      100,
    );
    expect(s.current?.key).toBe("a");
    s = eventEmotes(
      s,
      makeEvent(
        "approval.resolved",
        { approvalId: "a", status: "approved", by: "user" },
        200,
        2,
      ),
      200,
    );
    expect(s.current?.name).toBe("ok");
  });
  it("does not create new bot state when an empty queue is ticked", () => {
    const s = { queue: [] };
    expect(expireEmotes(s, 100)).toBe(s);
  });
  it("discards waiting emotes that expired behind an approval", () => {
    let s = pushEmote({ queue: [] }, "ask", 0, "a");
    s = pushEmote(s, "mail", 50);
    s = eventEmotes(
      s,
      makeEvent(
        "approval.resolved",
        { approvalId: "a", status: "skipped", by: "user" },
        5000,
        1,
      ),
      5000,
    );
    expect(s.queue).toHaveLength(0);
  });
});
