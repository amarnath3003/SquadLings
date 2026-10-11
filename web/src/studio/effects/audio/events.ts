import { eventBotId, type SwarmEvent } from "@swarm/shared/events";
import type { BotId } from "@swarm/shared/types";
import type { DashboardState } from "../../store/reducer";
import type { Priority, Reaction, UiCue } from "./catalogue";
import { playUi, playVoice, stopAudio, voiceSequence } from "../sound";
export interface EventCue {
  effect?: UiCue;
  reaction?: Reaction;
  id?: BotId;
  priority: Priority;
  key?: string;
}
export function audioCue(
  event: SwarmEvent,
  state: DashboardState,
): EventCue | undefined {
  let id = eventBotId(event);
  if (event.type === "tool.result")
    id ??= state.calls[event.data.callId]?.botId;
  if (event.type === "approval.resolved")
    id ??= state.approvals.find((a) => a.id === event.data.approvalId)?.botId;
  const cue = (
    effect?: UiCue,
    reaction?: Reaction,
    priority: Priority = 3,
    key?: string,
  ): EventCue => ({ effect, reaction, id, priority, key });
  switch (event.type) {
    case "run.created":
      return cue("launch");
    case "run.template_selected":
      return cue("select");
    case "master.status":
      if (state.master === event.data.status) return;
      return event.data.status === "planning"
        ? cue("planning")
        : event.data.status === "merging"
          ? cue("merge")
          : undefined;
    case "plan.ready":
      return cue("ready");
    case "bot.spawned":
      return cue("join", "greeting");
    case "bot.status": {
      if (id && state.bots[id]?.status === event.data.status) return;
      switch (event.data.status) {
        case "finished":
          return cue("finish", "success");
        case "pending":
          return cue("wait", "waiting", 2);
        case "starting":
          return cue("join", "greeting", 2);
        case "thinking":
          return cue("wait", "question", 2);
        case "working":
          return cue(undefined, "working", 2);
        case "paused":
        case "stopped":
          return cue("pause", "waiting");
        case "failed":
          return cue("failure", "failure", 5);
        case "out_of_budget":
          return cue("caution", "frustration", 5);
        case "waiting_user":
          return cue("wait", undefined, 2);
      }
      return;
    }
    case "tool.called":
      if (["wait", "wait_for_user"].includes(event.data.tool))
        return cue("wait", "waiting", 2);
      if (
        [
          "read_text",
          "list_elements",
          "look",
          "screenshot",
          "check_screen",
          "get_errors",
          "read_board",
        ].includes(event.data.tool)
      )
        return cue(undefined, "working", 2);
      return;
    case "tool.result":
      return event.data.ok ? undefined : cue("retry", "frustration", 3);
    case "cursor.click":
      return cue("click", undefined, 2);
    case "cursor.type":
      return cue("type", "working", 2);
    case "cursor.scroll":
      return cue("scroll", undefined, 2);
    case "page.navigated":
      return cue("navigate", "working", 2);
    case "page.loading":
      return event.data.loading ? cue("wait", "waiting", 2) : undefined;
    case "page.dialog":
      return cue("caution", "question", 5);
    case "board.posted":
      return cue("post", "discovery");
    case "board.delivered":
      return cue("deliver", "greeting");
    case "qa.bug":
      return cue("bug", "surprise");
    case "gate.checked":
      return event.data.level === "block"
        ? cue("caution", "frustration", 5, `block:${id}`)
        : undefined;
    case "safety.blocked":
      return cue("caution", "frustration", 5, `block:${id}`);
    case "approval.requested":
      return cue("approval", "question", 5);
    case "approval.resolved":
      return event.data.status === "approved" ||
        event.data.status === "answered"
        ? cue("approved", "success", 5)
        : event.data.status === "expired"
          ? cue("caution", "failure", 5)
          : cue("skipped", "frustration", 5);
    case "takeover.started":
      return cue("pause", "waiting", 4);
    case "takeover.ended":
      return cue("resume", "greeting", 4);
    case "bot.error":
      return cue(
        event.data.retryable ? "retry" : "failure",
        event.data.retryable ? "frustration" : "failure",
        5,
      );
    case "bot.result":
      return cue("finish", "success");
    case "run.result":
      return state.result ? undefined : cue("complete");
    case "run.status":
      if (state.run.status === event.data.status) return;
      if (["planning", "classifying"].includes(event.data.status))
        return cue("planning");
      if (event.data.status === "merging") return cue("merge");
      return event.data.status === "failed"
        ? cue("failure", undefined, 5)
        : event.data.status === "cancelled"
          ? cue("pause", undefined, 5)
          : undefined;
    case "run.ended":
      if (
        state.run.status === event.data.status ||
        (state.result && event.data.status === "completed")
      )
        return;
      return cue(
        event.data.status === "completed"
          ? "complete"
          : event.data.status === "failed"
            ? "failure"
            : "pause",
        undefined,
        event.data.status === "completed" ? 3 : 5,
      );
    default:
      return;
  }
}
export function handleAudioEvent(
  event: SwarmEvent,
  context: { previous: DashboardState; speed: number },
) {
  if (
    event.type === "run.status" &&
    ["failed", "cancelled"].includes(event.data.status)
  )
    stopAudio("workflow");
  const cue = audioCue(event, context.previous);
  if (!cue) return;
  if (cue.priority === 5) {
    stopAudio("room");
    stopAudio("preview");
  }
  const options = {
    scope: "workflow" as const,
    priority: cue.priority,
    speed: context.speed,
    botId: cue.id,
    key: cue.key ?? `${cue.id ?? "master"}:${cue.effect}`,
  };
  if (cue.effect) playUi(cue.effect, options);
  if (cue.reaction && cue.id)
    playVoice(cue.id, cue.reaction, {
      ...options,
      key: cue.key ? `${cue.key}:voice` : undefined,
    });
  if (event.type === "run.result")
    voiceSequence(
      Object.values(context.previous.bots)
        .filter((b) => b?.status === "finished")
        .map((b) => b!.id),
      "success",
      "workflow",
      3,
    );
}
