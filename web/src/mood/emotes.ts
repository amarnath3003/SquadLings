import type { SwarmEvent } from "@swarm/shared/events";
import type { IconName } from "../characters/icons";
export type EmoteName =
  | "ask"
  | "login"
  | "blocked"
  | "alert"
  | "bug"
  | "done"
  | "found"
  | "retry"
  | "mail"
  | "ok"
  | "skip"
  | "low"
  | "think"
  | "wait"
  | "zzz";
export const EMOTES: Record<
  EmoteName,
  { icon: IconName; priority: number; duration?: number }
> = {
  ask: { icon: "ask", priority: 1 },
  login: { icon: "lock", priority: 1 },
  blocked: { icon: "hand", priority: 2, duration: 1600 },
  alert: { icon: "alert", priority: 3, duration: 1000 },
  bug: { icon: "bug", priority: 3, duration: 1400 },
  done: { icon: "star", priority: 3, duration: 2000 },
  found: { icon: "spark", priority: 4, duration: 1200 },
  retry: { icon: "retry", priority: 4 },
  mail: { icon: "mail", priority: 5, duration: 800 },
  ok: { icon: "check", priority: 5, duration: 900 },
  skip: { icon: "back", priority: 5, duration: 900 },
  low: { icon: "battery", priority: 6, duration: 1500 },
  think: { icon: "dots", priority: 7 },
  wait: { icon: "dots", priority: 7 },
  zzz: { icon: "moon", priority: 7 },
};
export interface Bubble {
  name: EmoteName;
  at: number;
  until?: number;
  key?: string;
}
export interface EmoteState {
  current?: Bubble;
  queue: Bubble[];
}
export function pushEmote(
  state: EmoteState,
  name: EmoteName,
  now: number,
  key?: string,
): EmoteState {
  const meta = EMOTES[name],
    next: Bubble = {
      name,
      at: now,
      key,
      until: meta.duration ? now + Math.max(600, meta.duration) : undefined,
    };
  const active = state.current;
  if (
    !active ||
    (active.until !== undefined && active.until <= now) ||
    meta.priority <= EMOTES[active.name].priority
  )
    return { current: next, queue: state.queue };
  return { ...state, queue: [...state.queue, next].slice(-2) };
}
export function expireEmotes(state: EmoteState, now: number): EmoteState {
  if (!state.current && !state.queue.length) return state;
  const queue = state.queue.filter(
    (b) => b.until === undefined || b.until > now,
  );
  if (
    state.current &&
    (state.current.until === undefined || state.current.until > now)
  )
    return queue.length === state.queue.length ? state : { ...state, queue };
  const next = queue.shift();
  return {
    current: next
      ? {
          ...next,
          at: now,
          until:
            next.until === undefined
              ? undefined
              : now + Math.max(600, next.until - next.at),
        }
      : undefined,
    queue,
  };
}
export function eventEmotes(
  previous: EmoteState,
  event: SwarmEvent,
  now: number,
): EmoteState {
  let state = expireEmotes(previous, now);
  const clear = (predicate: (bubble: Bubble) => boolean) => {
    state = {
      current:
        state.current && !predicate(state.current) ? state.current : undefined,
      queue: state.queue.filter((b) => !predicate(b)),
    };
    state = expireEmotes(state, now);
  };
  const push = (name: EmoteName, key?: string) => {
    state = pushEmote(state, name, now, key);
  };
  switch (event.type) {
    case "approval.requested":
      push(
        event.data.approval.kind === "login" ? "login" : "ask",
        event.data.approval.id,
      );
      break;
    case "approval.resolved":
      clear((b) => b.key === event.data.approvalId);
      push(
        event.data.status === "approved" || event.data.status === "answered"
          ? "ok"
          : "skip",
      );
      break;
    case "safety.blocked":
      push("blocked");
      break;
    case "page.dialog":
      push("alert");
      break;
    case "gate.checked":
      if (event.data.level === "confirm") push("alert");
      break;
    case "qa.bug":
      push("bug");
      break;
    case "bot.result":
      push("done");
      break;
    case "board.posted":
      push("found");
      break;
    case "bot.error":
      if (event.data.retryable) push("retry");
      break;
    case "board.delivered":
      push("mail");
      break;
    case "tool.called":
      clear((b) => ["retry", "think", "wait", "zzz"].includes(b.name));
      if (event.data.tool === "wait") push("wait");
      break;
    case "tool.result":
      clear((b) => b.name === "wait" || b.name === "zzz");
      break;
    case "page.loading":
      if (!event.data.loading)
        clear((b) => b.name === "wait" || b.name === "zzz");
      break;
    case "takeover.started":
      push("login", "takeover");
      break;
    case "takeover.ended":
      clear((b) => b.key === "takeover");
      push("ok");
      break;
  }
  return state;
}
