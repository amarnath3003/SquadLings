import { describe, expect, it } from "vitest";
import { initialState, reduce, tick } from "./reducer";
import { fakeRun, makeEvent } from "../lab/fakeRun";
import { currentMood } from "../mood/engine";
import { mapPoint } from "../director/geometry";
import { attention } from "../mood/attention";
describe("event integration", () => {
  it("benches unassigned slots without creating ghost bots", () => {
    const state = fakeRun("bench", 5, "trip_planner", false, 3).reduce(
      reduce,
      initialState(),
    );
    expect(state.run.plan?.assignments).toHaveLength(3);
    expect(Object.keys(state.bots)).toHaveLength(3);
    expect(state.bots.bot4).toBeUndefined();
  });
  it("rejects invalid squad counts", () => {
    expect(() => fakeRun("bad", 6)).toThrow(/Squad size/);
    expect(() => fakeRun("bad", 3, "auto", false, 4)).toThrow(/Squad size/);
  });
  it("does not double-count a repeated result event", () => {
    const events = fakeRun("demo", 1),
      before = events
        .slice(
          0,
          events.findIndex(
            (event) =>
              event.type === "tool.result" && event.data.callId === "bot1-1",
          ) + 1,
        )
        .reduce(reduce, initialState());
    const event = before.events.at(-1)!;
    expect(reduce(before, event)).toBe(before);
  });
  it("produces deterministic run and replay mood/bubble sequences", () => {
    const simulate = () => {
      let state = initialState();
      const log = fakeRun("same-seed", 5);
      return log.map((e) => {
        state = reduce(state, e);
        state = tick(state, e.ts);
        return Object.values(state.bots).map((b) => [
          b!.id,
          currentMood(b!.conditions, state.now),
          b!.emotes.current?.name,
        ]);
      });
    };
    expect(fakeRun("same-seed", 5)).toEqual(fakeRun("same-seed", 5));
    expect(simulate()).toEqual(simulate());
    expect(simulate()).toEqual(simulate());
    expect(fakeRun("different-seed", 5)).not.toEqual(fakeRun("same-seed", 5));
  });
  it("finishes every bot, resolves the approval, and records real step counts", () => {
    const state = fakeRun("demo", 5).reduce(reduce, initialState());
    expect(state.master).toBe("done");
    expect(state.run.status).toBe("completed");
    expect(
      Object.values(state.bots).every((b) => b?.status === "finished"),
    ).toBe(true);
    expect(state.approvals[0].status).toBe("approved");
    expect(state.bots.bot1?.steps).toBe(3);
    expect(state.bots.bot3?.steps).toBe(4);
    expect(state.board).toHaveLength(5);
  });
  it("does not change another bot slice or mutate the previous state", () => {
    let state = fakeRun("demo", 2).slice(0, 20).reduce(reduce, initialState());
    const old = state,
      peer = state.bots.bot2;
    state = reduce(
      state,
      makeEvent(
        "bot.caption",
        { botId: "bot1", text: "Changed" },
        9999,
        100,
        "bot1",
      ),
    );
    expect(state.bots.bot2).toBe(peer);
    expect(old.bots.bot1?.caption).not.toBe("Changed");
  });
  it("derives bot identity from nested approvals and note authors", () => {
    const state = fakeRun("demo", 2).reduce(reduce, initialState());
    expect(state.bots.bot2?.report).toContain("report is ready");
    expect(state.bots.bot1?.name).toBe("Plum");
  });
  it("maps desktop and mobile coordinates without changing the hotspot", () => {
    expect(
      mapPoint(
        { x: 640, y: 400 },
        { width: 1280, height: 800 },
        { width: 320, height: 200 },
      ),
    ).toEqual({ x: 160, y: 100 });
    expect(
      mapPoint(
        { x: 195, y: 422 },
        { width: 390, height: 844 },
        { width: 97.5, height: 211 },
      ),
    ).toEqual({ x: 48.75, y: 105.5 });
  });
  it("keeps gaze inside 3px and prioritizes the action target", () => {
    const p = attention(
      { x: 0, y: 0 },
      { action: { x: 50, y: 0 }, pointer: { x: 0, y: 90 } },
    );
    expect(p).toEqual({ x: 3, y: 0 });
    expect(
      Math.hypot(
        ...Object.values(
          attention({ x: 0, y: 0 }, { pointer: { x: 100, y: 100 } }),
        ),
      ),
    ).toBeCloseTo(3);
  });
});
