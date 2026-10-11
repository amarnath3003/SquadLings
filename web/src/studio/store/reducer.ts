import type {
  Approval,
  BoardNote,
  BotId,
  BotStatus,
  Plan,
  RunResult,
  ToolName,
  Viewport,
} from "@swarm/shared/types";
import { CAST, ORCHESTRATOR, castFor } from "@swarm/shared/cast";
import { eventBotId, type SwarmEvent } from "@swarm/shared/events";
import { currentMood, updateConditions, type Condition } from "../mood/engine";
import {
  EMOTES,
  eventEmotes,
  expireEmotes,
  pushEmote,
  type EmoteState,
} from "../mood/emotes";
export interface BotView {
  id: BotId;
  name: string;
  color: string;
  roleName: string;
  goal: string;
  status: BotStatus;
  caption: string;
  url?: string;
  steps: number;
  maxSteps: number;
  tool?: ToolName;
  history: ToolName[];
  viewport: Viewport;
  device: "desktop" | "mobile";
  conditions: Condition[];
  emotes: EmoteState;
  report?: string;
  bugCount: number;
  loadingAt?: number;
  thinkingAt?: number;
}
export interface DashboardState {
  bots: Partial<Record<BotId, BotView>>;
  board: BoardNote[];
  approvals: Approval[];
  run: { status: string; title: string; templateId: string; plan?: Plan };
  master: string;
  result?: RunResult;
  events: SwarmEvent[];
  now: number;
  calls: Record<string, { botId: BotId; tool: ToolName }>;
}
export function initialState(): DashboardState {
  return {
    bots: {},
    board: [],
    approvals: [],
    run: {
      status: "created",
      title: "A little teamwork goes a long way.",
      templateId: "trip_planner",
    },
    master: "idle",
    events: [],
    now: 0,
    calls: {},
  };
}
export function newBot(
  id: BotId,
  roleName = `${ORCHESTRATOR.name} decides`,
): BotView {
  const cast = castFor(id);
  return {
    id,
    name: cast.name,
    color: cast.color,
    roleName,
    goal: "",
    status: "pending",
    caption: "Ready when you are.",
    steps: 0,
    maxSteps: 40,
    viewport: { width: 1280, height: 800 },
    device: "desktop",
    conditions: [],
    emotes: { queue: [] },
    history: [],
    bugCount: 0,
  };
}
export function reduce(
  previous: DashboardState,
  event: SwarmEvent,
): DashboardState {
  if (previous.events.some((item) => item.id === event.id)) return previous;
  let state = {
    ...previous,
    now: event.ts,
    events: [...previous.events.slice(-119), event],
  };
  let id = eventBotId(event);
  if (event.type === "tool.result")
    id ??= state.calls[event.data.callId]?.botId;
  if (event.type === "approval.resolved")
    id ??= state.approvals.find((a) => a.id === event.data.approvalId)?.botId;
  if (
    id &&
    !["cursor.move", "cursor.click", "cursor.scroll"].includes(event.type)
  ) {
    const bot = { ...(state.bots[id] ?? newBot(id)) };
    bot.conditions = updateConditions(bot.conditions, event, event.ts);
    bot.emotes = eventEmotes(bot.emotes, event, event.ts);
    switch (event.type) {
      case "bot.spawned":
        Object.assign(bot, event.data, { status: "starting" });
        break;
      case "bot.status":
        bot.status = event.data.status;
        bot.thinkingAt = bot.status === "thinking" ? event.ts : undefined;
        if (event.data.reason) bot.caption = event.data.reason;
        break;
      case "bot.caption":
        bot.caption = event.data.text;
        break;
      case "tool.called": {
        bot.tool = event.data.tool;
        bot.status = "working";
        bot.thinkingAt = undefined;
        bot.history = [event.data.tool, ...bot.history].slice(0, 8);
        state.calls = {
          ...state.calls,
          [event.data.callId]: { botId: id, tool: event.data.tool },
        };
        break;
      }
      case "tool.result": {
        // Only successful browser actions count as steps; reports never fabricate progress.
        const called = state.calls[event.data.callId];
        if (
          event.data.ok &&
          called &&
          [
            "open",
            "click",
            "type",
            "select",
            "press",
            "scroll",
            "back",
          ].includes(called.tool)
        )
          bot.steps++;
        bot.caption = event.data.summary;
        const { [event.data.callId]: _completed, ...remaining } = state.calls;
        state.calls = remaining;
        if (
          bot.steps >= bot.maxSteps * 0.8 &&
          (state.bots[id]?.steps ?? 0) < bot.maxSteps * 0.8
        )
          bot.emotes = pushEmote(bot.emotes, "low", event.ts);
        break;
      }
      case "cursor.type":
        bot.caption = event.data.masked
          ? "Typing ••••"
          : `Typing ${event.data.length} characters`;
        break;
      case "page.navigated":
        bot.url = event.data.url;
        break;
      case "page.loading":
        bot.loadingAt = event.data.loading ? event.ts : undefined;
        break;
      case "approval.requested":
        bot.status = "waiting_user";
        bot.report = event.data.approval.title;
        break;
      case "approval.resolved":
        bot.status = "working";
        break;
      case "takeover.started":
        bot.status = "paused";
        break;
      case "takeover.ended":
        bot.status = "working";
        break;
      case "board.posted":
        bot.report = event.data.note.title;
        break;
      case "qa.bug":
        bot.bugCount++;
        bot.report = event.data.bug.title;
        break;
      case "bot.error":
        bot.status = event.data.retryable ? "thinking" : "failed";
        bot.report = event.data.message;
        break;
      case "bot.result":
        bot.status = "finished";
        bot.report = event.data.summary;
        break;
    }
    state.bots = { ...state.bots, [id]: bot };
  }
  switch (event.type) {
    case "run.created":
      state.run = {
        status: "created",
        title: event.data.request,
        templateId: event.data.templateId,
      };
      break;
    case "run.status":
      state.run = { ...state.run, status: event.data.status };
      if (["failed", "classifying"].includes(event.data.status))
        state.master = event.data.status;
      break;
    case "run.template_selected":
      state.run = { ...state.run, templateId: event.data.templateId };
      break;
    case "master.status":
      state.master = event.data.status;
      break;
    case "plan.ready":
      state.run = {
        ...state.run,
        title: event.data.plan.title,
        plan: event.data.plan,
      };
      break;
    case "board.posted":
      state.board = [event.data.note, ...state.board].slice(0, 30);
      break;
    case "approval.requested":
      state.approvals = [...state.approvals, event.data.approval];
      break;
    case "approval.resolved":
      state.approvals = state.approvals.map((a) =>
        a.id === event.data.approvalId
          ? { ...a, status: event.data.status }
          : a,
      );
      break;
    case "run.result":
      state.result = event.data.result;
      state.master = "done";
      break;
    case "run.ended":
      state.run = { ...state.run, status: event.data.status };
      break;
  }
  return state;
}
// Only replace bot objects when visible mood/emote state changes. Other tiles retain their identity.
export function tick(state: DashboardState, now: number): DashboardState {
  let bots = state.bots;
  for (const { id } of CAST) {
    const bot = bots[id];
    if (!bot) continue;
    let emotes = expireEmotes(bot.emotes, now);
    const mood = currentMood(bot.conditions, now);
    const auto =
      bot.loadingAt !== undefined && now - bot.loadingAt > 700
        ? now - bot.loadingAt > 5000
          ? "zzz"
          : "wait"
        : bot.thinkingAt !== undefined &&
            now - bot.thinkingAt > 1500 &&
            mood === "curious"
          ? "think"
          : undefined;
    if (
      auto &&
      (!emotes.current || EMOTES[emotes.current.name].priority >= 7) &&
      emotes.current?.name !== auto
    )
      emotes = pushEmote(emotes, auto, now);
    if (
      currentMood(bot.conditions, state.now) !== mood ||
      emotes !== bot.emotes
    )
      bots = { ...bots, [id]: { ...bot, emotes } };
  }
  return { ...state, bots, now };
}
