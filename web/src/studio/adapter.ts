// Our server's events (master.md §19.8) → the character studio's SwarmEvents (web/shared/events.ts), fed to
// the studio's own engine through consumeEvent (ingest.ts → audio, director, reducer), so the agents'
// tiles behave exactly like the studio's "Squad in action" demo, but driven by the real run.
//
// It listens on the live store's `taps` (every event of the open run, after our reducer). The studio
// characters draw the cursors, so our classic cursor hooks (effects.cursor / hideCursorSoon) are no-ops.
//
// Mapping (ours → theirs):
//   run.created {task}               → run.created {request, templateId "auto", options.maxBots}
//   run.status starting/running      → run.status planning/running
//   run.status ended/failed          → run.status completed|cancelled/failed + run.ended {status, durationMs, costUSD}
//   master.status busy               → master.status "planning" before the plan, "monitoring" after
//   master.tool final_answer         → run.status merging + master.status "merging" (finished agents fly into Onyx)
//   master.text                      → master.text
//   plan.ready {assignments}         → plan.ready {plan:{title, assumptions:[], assignments:[{roleId: botId, goal, successCriteria:[], startUrl}]}} + master.status monitoring
//   bot.assigned                     → bot.spawned {name, cast color, roleId botId, roleName = label, goal, viewport, device desktop}
//                                      (an agent appears, flying out of Onyx, when it gets work; a later assignment re-spawns it
//                                      and drops its old "done"/failed mood)
//   bot.status idle/starting         → bot.status pending/starting
//   bot.status working, cursor.think → bot.status thinking (the model is deciding; tool calls make it "working")
//   bot.status stopped               → bot.status stopped
//   bot.status failed                → bot.error {message: reason, retryable: false} (smoke, error shake, failed face)
//   bot.status finished + reason     → bot.status finished (no bot.result follows); the finish tool's bot.result covers the rest
//   bot.caption {tool, text}         → tool.called {callId, tool} at the call's START (our caption is sent as a call begins),
//                                      then bot.caption {text}. Tools: find→read_text, message→post_to_board, unknown→look
//   tool.called {ok, summary, ms}    → tool.result {callId, ok, code, summary, ms} (+ bot.status thinking while still working).
//                                      Reads, typing and scrolls are held ≥ 0.8–1.1 s so a 5 ms call still reads as a gesture.
//   cursor.move {x, y, box, glideMs} → cursor.move {x, y, box, durationMs} (viewport pixels, as the server sends them)
//                                      (+ cursor.scroll {dy} during a scroll call)
//   cursor.click                     → cursor.click; during a type call, cursor.type {length 1, masked} (click to focus, then keys)
//   page.navigated                   → page.navigated (about:blank skipped)
//   team.message bot → Master/all    → board.posted {note from the bot} (found: sparks, a note to the board, a report to Onyx)
//   team.message Master/bot → bot(s) → board.posted {note} + board.delivered {botId} for each recipient (✉, a paper plane)
//   bot.result {summary, sources}    → bot.result {result: {sources}, summary} (confetti, celebration, ★)
//   bot.notice "…retrying…"          → bot.error {retryable: true} (retry bubble, smoke)
//   bot.search {query, ok, ms}       → tool.called look + tool.result (a reading gesture)
//   human.check {host, reason}       → approval.requested {kind "login", title "Human check on <host>"}
//   takeover.started / ended         → takeover.started / approval.resolved approved + takeover.ended
//                                      (an open check is also resolved when the agent finishes, stops or the run ends)
//   site.request / site.decided deny → gate.checked confirm / safety.blocked
//   run.result {answer}              → run.result {result:{runId, templateId "auto", title, result null, markdown, gaps []}}
//   usage.updated {costUSD}          → usage.updated {agent "master", costUSD, runTotalUSD}
// Ids are our event id + a suffix; seq increases; ts is our ts.
//
// Replays (a closed chat, or the live run on reconnect: S.replaying): the studio store and director are reset
// and the events go straight into the studio reducer (no director, no sound, no bursts), so the tiles open
// with each agent's final state and mood and nothing animates.
import type { Approval, BoardNote, BotId, ToolName } from "@swarm/shared/types";
import type { EventData, EventType, SwarmEvent } from "@swarm/shared/events";
import { castFor } from "@swarm/shared/cast";
import { S, clip, effects, onyx, taps, who, type ServerEvent } from "../live/store";
import { consumeEvent } from "./ingest";
import { useDashboard } from "./store";
import { resetDirector } from "./director/director";
import { stopAudio } from "./effects/sound";

const isCast = (id: unknown): id is BotId => typeof id === "string" && /^bot[1-5]$/.test(id);

const TOOLS: Record<string, ToolName> = {
  open: "open", click: "click", type: "type", select: "select", press: "press", scroll: "scroll", back: "back", wait: "wait",
  list_elements: "list_elements", read_text: "read_text", screenshot: "screenshot", finish: "finish",
  find: "read_text", message: "post_to_board",
};
const toolOf = (tool: unknown): ToolName => TOOLS[String(tool)] ?? "look";
/** Short calls are held this long before their result, so the gesture is visible (the studio's sample calls take 1.6 s). */
const HOLD_MS: Partial<Record<ToolName, number>> = { read_text: 1100, list_elements: 1100, screenshot: 1100, look: 1100, type: 900, scroll: 800 };

type Call = { id: string; tool: ToolName; at: number; dy: number };
type Spawn = EventData["bot.spawned"];
type Agent = {
  spawned: boolean;
  /** What its bot.spawned said (to restore it if the studio store ever loses the agent). */
  spawn?: Spawn;
  /** Its role from the plan (plan.ready assignments[].label). */
  label?: string;
  call?: Call;
  /** A call that began while you had its browser: it waits, so it starts when you hand the browser back. */
  deferred?: { src: ServerEvent; tool: unknown; text: string };
  approval?: string;
  pending?: { timer: ReturnType<typeof setTimeout>; run: () => void };
};

let runId: string | null = null;
let seq = 0;
let replay = false;
let planned = false;
let master = "idle";
/** Server clock minus ours (the tick runs on the server's clock, like the events). */
let skew = 0;
const agents = new Map<BotId, Agent>();
const agent = (id: BotId) => {
  let a = agents.get(id);
  // After a hot reload the studio store may already hold this run's agents.
  if (!a) agents.set(id, (a = { spawned: !!useDashboard.getState().state.bots[id] }));
  return a;
};

const media = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : undefined;
const reduced = () => media?.matches ?? false;
const now = () => Date.now() + skew;

function sourceOf(type: string, botId?: BotId): SwarmEvent["source"] {
  return type.startsWith("cursor.") || type.startsWith("page.") ? "browser"
    : type.startsWith("board.") ? "board"
    : type.startsWith("approval.") || type.startsWith("safety.") || type.startsWith("gate.") ? "safety"
    : type.startsWith("master.") ? "master"
    : botId ? "bot" : "orchestrator";
}

/** One studio event: during a replay straight into their reducer; live through their full pipeline. */
function emit<T extends EventType>(src: ServerEvent, suffix: string, type: T, data: EventData[T], botId?: BotId, ts = src.ts) {
  // Never let an agent's event create a bare studio bot ("Onyx decides"): restore its spawn first, quietly.
  const a = botId && type !== "bot.spawned" ? agents.get(botId) : undefined;
  if (a?.spawned && a.spawn && !useDashboard.getState().state.bots[botId!])
    useDashboard.getState().dispatch({ id: `${src.id ?? src.seq}:respawn`, runId: src.runId, seq: ++seq, ts, source: "bot", botId, type: "bot.spawned", data: a.spawn } as SwarmEvent);
  const event = { id: `${src.id ?? `${src.runId}-${src.seq}`}:${suffix}`, runId: src.runId, seq: ++seq, ts, source: sourceOf(type, botId), botId, type, data } as SwarmEvent;
  if (replay) useDashboard.getState().dispatch(event);
  else consumeEvent(event, { reduced: reduced(), speed: 1 });
}

const studioBot = (id: BotId) => useDashboard.getState().state.bots[id];
const ourBot = (id: BotId) => S.botById.get(id);
const stillWorking = (id: BotId) => {
  const b = ourBot(id);
  return !!b && b.status === "working" && !b.control;
};
function status(src: ServerEvent, suffix: string, id: BotId, value: EventData["bot.status"]["status"], reason?: string) {
  if (studioBot(id)?.status === value) return;
  emit(src, suffix, "bot.status", { botId: id, status: value, ...(reason ? { reason: onyx(reason) } : {}) }, id);
}
function setMaster(src: ServerEvent, value: EventData["master.status"]["status"]) {
  if (master === value) return;
  master = value;
  emit(src, `master-${value}`, "master.status", { status: value });
}
/** The studio never reassigns an agent: drop a finished or failed mood before its next piece of work. */
function clearOutcome(id: BotId) {
  useDashboard.setState((s) => {
    const bot = s.state.bots[id];
    if (!bot) return s;
    const conditions = bot.conditions.filter((c) => !["done", "terminal-error", "error"].includes(c.key));
    return { state: { ...s.state, bots: { ...s.state.bots, [id]: { ...bot, conditions } } } };
  });
}

// ── Tool calls ──

function startCall(src: ServerEvent, id: BotId, a: Agent, tool: unknown, text: string) {
  const t = toolOf(tool);
  const dy = /\bup\b/i.test(text) ? -400 : 400;
  a.call = { id: `${src.id ?? src.seq}`, tool: t, at: performance.now(), dy };
  emit(src, "call", "tool.called", { botId: id, callId: a.call.id, tool: t, args: t === "scroll" ? { dy } : {} }, id);
}
/** Emits a held result now (before any later event of the same agent, so its order holds). */
function flush(id: BotId) {
  const a = agent(id);
  const p = a.pending;
  if (!p) return;
  a.pending = undefined;
  clearTimeout(p.timer);
  p.run();
}
function endCall(src: ServerEvent, id: BotId, a: Agent, result: { ok: boolean; code?: string; summary: string; ms: number }) {
  const call = a.call;
  if (!call) return;
  a.call = undefined;
  const run = () => {
    const ts = replay ? src.ts : Math.max(src.ts, now());
    emit(src, "result", "tool.result", { callId: call.id, ...result }, id, ts);
    if (!replay && stillWorking(id) && call.tool !== "finish") status(src, "think", id, "thinking");
  };
  const wait = replay ? 0 : (HOLD_MS[call.tool] ?? 0) - (performance.now() - call.at);
  if (wait <= 0) return run();
  a.pending = { timer: setTimeout(() => flush(id), wait), run };
}
function resolveCheck(src: ServerEvent, id: BotId, a: Agent, value: Approval["status"]) {
  if (!a.approval) return;
  emit(src, "resolved", "approval.resolved", { approvalId: a.approval, status: value, by: "user" }, id);
  a.approval = undefined;
}

// ── Team traffic → the board ──

function teamMessage(src: ServerEvent) {
  const from = who(src.data.from);
  const to = who(src.data.to);
  if (from === "user") return;
  const named = (name: string) => S.bots.find((b) => b.name === name);
  const sender = named(from);
  const senderId = sender && isCast(sender.id) && agent(sender.id).spawned ? sender.id : undefined;
  if (from !== "Master" && !senderId) return;
  const target = named(to);
  const targetId = target && isCast(target.id) ? target.id : undefined;
  const note: BoardNote = {
    id: `${src.id ?? src.seq}:note`, seq: Number(src.data.seq ?? src.seq), runId: src.runId,
    from: from === "Master" ? "master" : senderId!, to: targetId ?? "all",
    type: from === "Master" ? "instruction" : "report", title: clip(src.data.text, 140), data: { text: String(src.data.text ?? "") }, createdAt: src.ts,
  };
  emit(src, "note", "board.posted", { note }, senderId);
  const recipients = to === "all" ? S.bots.filter((b) => b.status === "working" && b.id !== sender?.id).map((b) => b.id) : targetId && targetId !== senderId ? [targetId] : [];
  for (const r of recipients) if (isCast(r) && agent(r).spawned) emit(src, `to-${r}`, "board.delivered", { botId: r, noteIds: [note.id] }, r);
}

// ── The translation ──

const RUN_STATUS: Record<string, EventData["run.status"]["status"]> = { starting: "planning", running: "running" };

function translate(e: ServerEvent) {
  const id = isCast(e.botId) ? e.botId : undefined;
  if (id && !e.type.startsWith("cursor.")) flush(id);
  const d = e.data ?? {};
  switch (e.type) {
    case "run.created":
      return emit(e, "created", "run.created", { request: String(d.task ?? ""), templateId: "auto", options: { maxBots: Number(d.options?.bots ?? 5) } });
    case "run.status": {
      if (RUN_STATUS[d.status]) return emit(e, "status", "run.status", { status: RUN_STATUS[d.status] });
      if (d.status !== "ended" && d.status !== "failed") return; // "ending": the run is shutting down
      const end = d.status === "failed" ? "failed" : S.run?.answered ? "completed" : "cancelled";
      for (const [bot, a] of agents) (flush(bot), resolveCheck(e, bot, a, "expired"));
      emit(e, "status", "run.status", { status: end });
      return emit(e, "ended", "run.ended", { status: end, durationMs: Math.max(0, e.ts - (S.run?.startedAt ?? e.ts)), costUSD: Number(d.costUSD ?? S.run?.cost ?? 0) });
    }
    case "master.status":
      if (d.busy && !["merging", "done"].includes(master)) setMaster(e, planned ? "monitoring" : "planning");
      return;
    case "master.text":
      return emit(e, "text", "master.text", { text: String(d.text ?? "") });
    case "master.tool":
      if (d.tool === "final_answer" && d.ok !== false && master !== "merging" && master !== "done") {
        emit(e, "merging", "run.status", { status: "merging" });
        setMaster(e, "merging");
      }
      return;
    case "plan.ready":
      planned = true;
      for (const x of d.assignments ?? []) if (isCast(x.botId) && x.label) agent(x.botId).label = String(x.label);
      emit(e, "plan", "plan.ready", {
        plan: {
          title: clip(S.run?.task ?? "The plan", 80), assumptions: [],
          assignments: (d.assignments ?? []).map((a: { botId: string; goal: string; startUrl?: string }) => ({ roleId: a.botId, goal: a.goal, successCriteria: [], ...(a.startUrl ? { startUrl: a.startUrl } : {}) })),
        },
      });
      if (!["merging", "done"].includes(master)) setMaster(e, "monitoring");
      return;
    case "run.result":
      master = "done";
      return emit(e, "result", "run.result", { result: { runId: e.runId, templateId: "auto", title: clip(S.run?.task ?? "The answer", 80), result: null, markdown: String(d.answer ?? ""), gaps: [] } });
    case "usage.updated":
      return emit(e, "usage", "usage.updated", { agent: "master", inputTokens: 0, cachedTokens: 0, outputTokens: 0, costUSD: Number(d.costUSD ?? 0), estimated: false, runTotalUSD: Number(d.costUSD ?? 0) });
    case "team.message":
      return teamMessage(e);
    case "site.decided":
      if (d.allow) return;
      for (const name of d.askedBy ?? []) {
        const b = S.bots.find((x) => x.name === name);
        if (b && isCast(b.id) && agent(b.id).spawned) emit(e, `blocked-${b.id}`, "safety.blocked", { botId: b.id, code: "site_blocked", reason: `${d.site} is not allowed`, url: String(d.site ?? "") }, b.id);
      }
      return;
  }
  if (!id) return;
  const a = agent(id);
  const b = ourBot(id);

  if (e.type === "bot.assigned") {
    if (a.spawned) clearOutcome(id);
    a.spawned = true;
    // Its role: the assignment's label, else the plan's, else ours, else the goal's first words.
    const roleName = String(d.label || a.label || b?.label || clip(d.goal, 40) || "Agent");
    a.label = roleName;
    a.spawn = {
      botId: id, name: b?.name ?? castFor(id).name, color: castFor(id).color, roleId: id, roleName, goal: String(d.goal ?? ""),
      viewport: { width: b?.vw ?? 1280, height: b?.vh ?? 800 }, device: "desktop",
    };
    return emit(e, "spawn", "bot.spawned", a.spawn, id);
  }
  if (!a.spawned) return; // an agent shows up when it gets work

  switch (e.type) {
    case "bot.status": {
      const value = d.status;
      if (value === "idle") return status(e, "status", id, "pending");
      if (value === "starting") return status(e, "status", id, "starting");
      if (value === "working") {
        if (["finished", "failed", "stopped"].includes(studioBot(id)?.status ?? "")) clearOutcome(id);
        if (!a.call) status(e, "status", id, "thinking");
        return;
      }
      if (value === "stopped") {
        endCall(e, id, a, { ok: true, summary: "stopped", ms: 0 });
        flush(id);
        resolveCheck(e, id, a, "skipped");
        return status(e, "status", id, "stopped", d.reason ?? undefined);
      }
      if (value === "failed") {
        endCall(e, id, a, { ok: false, summary: String(d.reason ?? "failed"), ms: 0 });
        flush(id);
        resolveCheck(e, id, a, "skipped");
        return emit(e, "error", "bot.error", { botId: id, message: String(d.reason ?? "failed"), retryable: false }, id);
      }
      if (value === "finished" && d.reason) {
        resolveCheck(e, id, a, "approved");
        return status(e, "status", id, "finished", d.reason);
      }
      return;
    }
    case "bot.caption":
      if (d.tool) {
        endCall(e, id, a, { ok: true, summary: "", ms: 0 });
        flush(id);
        a.deferred = undefined;
        if (b?.control) a.deferred = { src: e, tool: d.tool, text: String(d.text ?? "") };
        else startCall(e, id, a, d.tool, String(d.text ?? ""));
      }
      if (d.text) emit(e, "caption", "bot.caption", { botId: id, text: String(d.text) }, id);
      return;
    case "tool.called":
      a.deferred = undefined;
      if (!a.call) startCall(e, id, a, d.tool, String(d.why ?? ""));
      return endCall(e, id, a, { ok: d.ok !== false, ...(d.code ? { code: String(d.code) } : {}), summary: String(d.summary ?? ""), ms: Number(d.ms ?? 0) });
    case "cursor.move": {
      if (replay) return;
      const box = d.box ? { x: d.box.x, y: d.box.y, width: d.box.width, height: d.box.height } : undefined;
      emit(e, "move", "cursor.move", { botId: id, x: d.x, y: d.y, ...(box ? { box } : {}), durationMs: Math.max(0, Number(d.glideMs ?? 0)) }, id);
      if (a.call?.tool === "scroll") emit(e, "scroll", "cursor.scroll", { botId: id, dy: a.call.dy }, id);
      return;
    }
    case "cursor.click":
      if (replay) return;
      if (a.call?.tool === "type") return emit(e, "type", "cursor.type", { botId: id, x: d.x, y: d.y, length: 1, masked: true }, id);
      return emit(e, "click", "cursor.click", { botId: id, x: d.x, y: d.y }, id);
    case "cursor.think":
      if (!replay && !a.call && stillWorking(id)) status(e, "think", id, "thinking");
      return;
    case "page.navigated":
      if (/^about:/.test(String(d.url ?? ""))) return;
      return emit(e, "nav", "page.navigated", { botId: id, url: String(d.url ?? ""), title: String(d.title ?? "") }, id);
    case "bot.result":
      resolveCheck(e, id, a, "approved");
      return emit(e, "result", "bot.result", { botId: id, result: { sources: d.sources ?? [] }, summary: String(d.summary ?? "") }, id);
    case "bot.notice":
      if (/retry/i.test(String(d.text ?? ""))) emit(e, "retry", "bot.error", { botId: id, message: String(d.text), retryable: true }, id);
      return;
    case "bot.search": {
      if (a.call) return; // inside a call: the call's gesture already shows
      startCall(e, id, a, "look", "");
      return endCall(e, id, a, { ok: d.ok !== false, summary: `web search ${clip(d.query, 60)}`, ms: Number(d.ms ?? 0) });
    }
    case "human.check": {
      resolveCheck(e, id, a, "skipped");
      const approval: Approval = {
        id: `${e.id ?? e.seq}:check`, runId: e.runId, botId: id, kind: "login",
        title: `Human check on ${d.host ?? "this site"}`, detail: String(d.reason ?? ""), status: "pending",
        createdAt: e.ts, expiresAt: e.ts + 15 * 60_000,
      };
      a.approval = approval.id;
      return emit(e, "check", "approval.requested", { approval }, id);
    }
    case "takeover.started":
      return emit(e, "takeover", "takeover.started", { botId: id }, id);
    case "takeover.ended": {
      resolveCheck(e, id, a, "approved");
      emit(e, "takeover", "takeover.ended", { botId: id }, id);
      const waiting = a.deferred;
      a.deferred = undefined;
      if (waiting) startCall(waiting.src, id, a, waiting.tool, waiting.text);
      return;
    }
    case "site.request":
      return emit(e, "gate", "gate.checked", { botId: id, action: `open ${d.site ?? "a site"}`, level: "confirm", via: "master", ms: 0 }, id);
  }
}

// ── Lifecycle ──

function reset(next: string | null) {
  for (const a of agents.values()) if (a.pending) clearTimeout(a.pending.timer);
  agents.clear();
  runId = next;
  seq = 0;
  planned = false;
  master = "idle";
  stopAudio("workflow");
  resetDirector();
  useDashboard.getState().reset();
}

function onEvent(e: ServerEvent, replaying: boolean) {
  if (replaying && !replay) {
    // loadRun replays synchronously: everything up to the next task is this replay.
    replay = true;
    reset(e.runId);
    queueMicrotask(() => {
      replay = false;
      useDashboard.getState().tick(now());
    });
  } else if (e.runId !== runId) reset(e.runId);
  if (!replaying && typeof e.ts === "number") skew = e.ts - Date.now();
  translate(e);
}

let ticker: ReturnType<typeof setInterval> | undefined;
let installed = false;
// A hot-reloaded copy of this module carries on with the run the studio store already holds (instead of
// resetting it under the old copy's feet), and the old copy stops listening.
runId = useDashboard.getState().state.events.at(-1)?.runId ?? null;
if (import.meta.hot) import.meta.hot.dispose(() => uninstallStudioAdapter());
/** Starts the adapter (idempotent). Importing StudioFx does this. */
export function installStudioAdapter() {
  if (installed) return;
  installed = true;
  taps.add(onEvent);
  // The studio characters are the cursors now.
  effects.cursor = () => {};
  effects.hideCursorSoon = () => {};
  // The studio's clock: expire timed moods and emote bubbles (studio useLab: every 100 ms).
  ticker = setInterval(() => {
    if (!runId || replay || document.hidden) return;
    useDashboard.getState().tick(now());
  }, 100);
}

/** Dev/test: stop listening (for HMR or a harness). */
export function uninstallStudioAdapter() {
  taps.delete(onEvent);
  clearInterval(ticker);
  installed = false;
}
