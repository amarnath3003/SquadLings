import type { BotId } from "@swarm/shared/types";
import { eventBotId, type SwarmEvent } from "@swarm/shared/events";
import { castFor } from "@swarm/shared/cast";
import type { Actor } from "../characters/useBotActor";
import type { Point } from "../mood/attention";
import { center } from "./geometry";
import { burst } from "../effects/EffectsCanvas";
import { fly, clearFlights } from "../effects/Flights";
import { sound } from "../effects/sound";
import { PERSONALITY, hash } from "../characters/personality";
import { useDashboard } from "../store";
import { currentMood } from "../mood/engine";
import { create } from "zustand";

interface Entry {
  actor: Actor;
  map: (point: Point) => Point;
  point: () => Point | undefined;
  effect: (event: SwarmEvent) => void;
}
const actors = new Map<BotId, Entry>();
const pendingSpawns = new Map<
  BotId,
  { event: SwarmEvent; reduced: boolean; speed: number }
>();
const pendingEvents = new Map<
  BotId,
  { event: SwarmEvent; reduced: boolean; speed: number }[]
>();
const timers = new Set<ReturnType<typeof setTimeout>>();
let generation = 0,
  nextSpawn = 0;
let lastSocial: Partial<Record<BotId, number>> = {};
export const useMasterTick = create<{
  tick: number;
  lastBot?: BotId;
  receive: (id: BotId) => void;
}>((set) => ({
  tick: 0,
  receive: (id) => set((state) => ({ tick: state.tick + 1, lastBot: id })),
}));
function later(callback: () => void, delay: number) {
  const token = generation;
  const timer = setTimeout(() => {
    timers.delete(timer);
    if (token === generation) callback();
  }, delay);
  timers.add(timer);
}
function spawnFlight(id: BotId, entry: Entry, reduced: boolean, speed: number) {
  if (reduced) {
    entry.actor.opacity.set(1);
    return;
  }
  entry.actor.opacity.set(0);
  const delay = Math.max(0, nextSpawn - performance.now());
  nextSpawn = performance.now() + delay + 250 / speed;
  later(
    () => {
      const from = center(document.querySelector(".master-card .master-logo"));
      const to = entry.point();
      if (!from || !to) {
        entry.actor.opacity.set(1);
        return;
      }
      const token = generation;
      fly({
        id: `spawn-${id}-${token}`,
        botId: id,
        kind: "character",
        from,
        to,
        color: castFor(id).color,
        duration: 700,
        onLand: () => {
          if (token === generation) {
            entry.actor.opacity.set(1);
            entry.actor.hop();
          }
        },
      });
    },
    Math.max(16, delay),
  );
}
export function registerActor(id: BotId, entry: Entry) {
  actors.set(id, entry);
  const pending = pendingSpawns.get(id);
  if (pending) {
    pendingSpawns.delete(id);
    spawnFlight(id, entry, pending.reduced, pending.speed);
  }
  const events = pendingEvents.get(id);
  if (events) {
    pendingEvents.delete(id);
    later(
      () =>
        events.forEach((item) => direct(item.event, item.reduced, item.speed)),
      16,
    );
  }
  return () => {
    if (actors.get(id) === entry) actors.delete(id);
    entry.actor.stop();
  };
}
export function resetDirector() {
  generation++;
  nextSpawn = 0;
  lastSocial = {};
  pendingSpawns.clear();
  pendingEvents.clear();
  timers.forEach(clearTimeout);
  timers.clear();
  actors.forEach((entry) => {
    entry.actor.stop();
    entry.actor.opacity.set(1);
  });
  clearFlights();
}
function merge(reduced: boolean, speed: number) {
  if (reduced) return;
  const to = center(document.querySelector(".master-card .master-logo"));
  if (!to) return;
  let index = 0;
  for (const [id, entry] of actors) {
    if (useDashboard.getState().state.bots[id]?.status !== "finished") continue;
    const from = entry.point();
    if (!from) continue;
    later(
      () => {
        entry.actor.opacity.set(0);
        fly({
          id: `merge-${id}-${generation}`,
          botId: id,
          kind: "character",
          from,
          to,
          color: castFor(id).color,
          duration: 700,
        });
      },
      (index++ * 150) / speed,
    );
  }
}
function social(
  event: SwarmEvent,
  from: Point | undefined,
  reduced: boolean,
  speed: number,
) {
  if (
    !from ||
    !["bot.result", "bot.error", "approval.requested"].includes(event.type)
  )
    return;
  const id = eventBotId(event);
  for (const [other, peer] of actors) {
    if (
      other === id ||
      event.ts - (lastSocial[other] ?? -Infinity) < 3000 ||
      peer.actor.isGliding()
    )
      continue;
    const bot = useDashboard.getState().state.bots[other];
    if (
      !bot ||
      bot.status === "paused" ||
      !["calm", "curious"].includes(currentMood(bot.conditions, event.ts))
    )
      continue;
    const here = peer.point();
    if (!here) continue;
    lastSocial[other] = event.ts;
    peer.actor.look({
      x: peer.actor.x.get() + from.x - here.x,
      y: peer.actor.y.get() + from.y - here.y,
    });
    later(() => {
      if (!peer.actor.isGliding()) peer.actor.look();
    }, 500 / speed);
    if (event.type === "bot.result" && !reduced) peer.actor.hop();
  }
}
export function direct(event: SwarmEvent, reduced: boolean, speed: number) {
  if (event.type === "master.status" && event.data.status === "merging") {
    merge(reduced, speed);
    return;
  }
  let id = eventBotId(event);
  if (event.type === "tool.result")
    id ??= useDashboard.getState().state.calls[event.data.callId]?.botId;
  if (!id) return;
  const entry = actors.get(id);
  if (!entry) {
    if (event.type === "bot.spawned")
      pendingSpawns.set(id, { event, reduced, speed });
    else
      pendingEvents.set(
        id,
        [...(pendingEvents.get(id) ?? []), { event, reduced, speed }].slice(
          -20,
        ),
      );
    return;
  }
  const { actor, map } = entry;
  entry.effect(event);
  switch (event.type) {
    case "cursor.move":
      actor.glide(map(event.data), event.data.durationMs);
      break;
    case "cursor.click":
      actor.click(map(event.data));
      sound(id, "click", speed);
      break;
    case "cursor.type":
      actor.flourish("type");
      break;
    case "cursor.scroll":
      actor.flourish("scroll");
      break;
    case "bot.spawned":
      spawnFlight(id, entry, reduced, speed);
      break;
    case "board.delivered":
      actor.hop();
      break;
    case "board.posted":
    case "qa.bug":
      actor.flourish("found");
      sound(id, "found", speed);
      break;
    case "bot.result":
      actor.flourish("finish");
      sound(id, "finish", speed);
      break;
    case "bot.error":
      actor.flourish("error");
      break;
    case "tool.called":
      if (
        useDashboard.getState().state.bots[id]?.emotes.current?.name === "retry"
      )
        actor.flourish("retry");
      break;
    case "approval.requested":
      sound(id, "approval", speed);
      break;
  }
  const from = entry.point(),
    color = castFor(id).color;
  if (
    from &&
    ["board.posted", "qa.bug", "bot.result", "bot.error"].includes(event.type)
  ) {
    burst({
      botId: id,
      ...from,
      color,
      count: speed === 4 ? 6 : PERSONALITY[id].sparkles,
      seed: hash(event.id),
      kind:
        event.type === "bot.error"
          ? "smoke"
          : event.type === "bot.result"
            ? "confetti"
            : "spark",
    });
  }
  if (
    [
      "board.posted",
      "qa.bug",
      "approval.requested",
      "bot.error",
      "bot.result",
    ].includes(event.type) &&
    from
  ) {
    const to = center(document.querySelector(`[data-master-row="${id}"]`));
    if (to) {
      if (reduced) useMasterTick.getState().receive(id);
      else
        fly({
          id: event.id,
          botId: id,
          kind: "report",
          from,
          to,
          color,
          icon:
            event.type === "approval.requested"
              ? "ask"
              : event.type === "qa.bug"
                ? "bug"
                : event.type === "bot.result"
                  ? "note"
                  : event.type === "bot.error"
                    ? "dots"
                    : "spark",
          onLand: () => useMasterTick.getState().receive(id),
        });
    }
  }
  if (from && event.type === "board.posted") {
    const board = center(document.querySelector("[data-board]"));
    if (board && !reduced)
      fly({
        id: `board-${event.id}`,
        botId: id,
        kind: "board",
        from,
        to: board,
        color,
        icon: "note",
      });
  }
  if (from && event.type === "board.delivered") {
    const board = center(document.querySelector("[data-board]"));
    if (board && !reduced)
      fly({
        id: event.id,
        botId: id,
        kind: "plane",
        from: board,
        to: from,
        color,
        icon: "plane",
      });
  }
  social(event, from, reduced, speed);
}
