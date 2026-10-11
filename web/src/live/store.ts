// The live state and the reducer, ported from ui/app.js ("State", "Dirty tracking", "Events") with
// the same shapes, so the React components can follow the classic code one to one.
//
// The state is one mutable object, `S`. Every server event goes through apply(e); handlers mutate S and
// mark what changed (touchItem / touchBot / touchTop / touchLayout bump a `rev`). Components subscribe
// with useLive() and re-render once per animation frame after changes (never during a replay: a whole
// run's events replay first, then one render). Memoized components can compare `rev` to skip work.
//
// Things the classic reducer did straight to the DOM (cursor, speech bubbles, the "finished" pulse, the
// tab title) are hooks in `effects`, set by the components that own them.

import { useSyncExternalStore } from "react";
import type { Config, RunListing, Tunnel } from "../api";

// ── Shapes ──

export type Phase = "home" | "center" | "side";
export type BotStatus = "idle" | "starting" | "working" | "finished" | "stopped" | "failed";
export type Source = { url: string; title?: string };
export type Step = { kind: "ok" | "bad" | "search" | "assign" | "done" | "msg"; text: string; ms?: number; at: number };
export type CursorData = { kind?: "move" | "click" | "think"; x: number; y: number; box?: { x: number; y: number; width: number; height: number }; glideMs?: number; why?: string };

export type Bot = {
  id: string; // "bot1"…
  index: number;
  name: string;
  color: string;
  status: BotStatus;
  reason: string | null;
  warm: boolean;
  label: string;
  goal: string;
  startUrl: string;
  assignments: number;
  actions: number;
  maxActions: number;
  caption: string;
  url: string;
  title: string;
  vw: number;
  vh: number;
  /** A frame (or a closed chat's keyframe) has been painted. */
  live: boolean;
  steps: Step[];
  result: { summary: string; sources: Source[] } | null;
  human: { host: string; reason?: string } | null;
  /** You have this agent's browser (takeover). */
  control: boolean;
  lastReport: string | null;
  missionId: number | null;
  rev: number;
};

export type LogEntry = { from: string; to?: string; botId?: string; event?: string; text: string; sources?: Source[]; ts: number };
export type Mission = {
  kind: "mission";
  id: number;
  rev: number;
  first: boolean;
  bots: string[];
  plan: { botId: string; label?: string; goal: string; startUrl?: string }[];
  log: LogEntry[];
  note: { text: string; ts: number } | null;
  open: boolean;
  closed: boolean;
  ts: number;
};
type Base = { id: number; rev: number; ts: number };
export type Item =
  | (Base & { kind: "you"; text: string })
  | (Base & { kind: "master"; text: string })
  | (Base & { kind: "research"; live: boolean; list: { q: string; ok: boolean }[] })
  | (Base & { kind: "radio" } & Omit<LogEntry, "ts">)
  | (Base & { kind: "notice"; level: "info" | "warn" | "error"; text: string })
  | (Base & { kind: "human"; botId: string; host: string; done?: boolean })
  | (Base & { kind: "answer"; answer: string; sources: Source[]; n: number })
  | (Base & { kind: "ended"; status: string; reason?: string; costUSD?: number; [k: string]: unknown })
  | Mission;

export type Run = {
  id: string;
  task?: string;
  status: string;
  step?: string;
  startedAt?: number;
  endedAt?: number;
  out?: string;
  options?: { maxActions?: number; [k: string]: unknown };
  /** A closed chat opened from Chats (read-only). */
  past: boolean;
  cost?: number;
  byAgent?: unknown;
  masterBusy: boolean;
  masterDoing?: string;
  planned: boolean;
  answered: boolean;
  /** You wrote since the Master's last message: its next text is a reply (a bubble), not narration. */
  replyDue: boolean;
  missions: Mission[];
  ended?: Record<string, unknown>;
};

export type ServerEvent = { id: string; runId: string; seq: number; ts: number; source: string; botId?: string; type: string; data: any };

export type LiveState = {
  config: Config | null;
  tunnel: Tunnel;
  view: "home" | "run";
  run: Run | null;
  /** The run the server is running now, if any. */
  liveId: string | null;
  /** This tab just asked for a new run: open it when it starts. */
  starting: boolean;
  bots: Bot[];
  botById: Map<string, Bot>;
  thread: Item[];
  replaying: boolean;
  ui: { focus: string | null; hover: string | null; chatHidden: boolean; unread: number; control: string | null };
  /** The line under the composer (live/actions.ts showHint). */
  hint: { text: string; error: boolean } | null;
  /** Shown while the WebSocket is down. */
  banner: string | null;
  /** The Chats list (GET /api/runs), and whether its panel is open. */
  history: RunListing[];
  historyOpen: boolean;
  /** Bumped by touchTop/touchLayout. */
  rev: { top: number; layout: number };
};

export const S: LiveState = {
  config: null,
  tunnel: { state: "starting" },
  view: "home",
  run: null,
  liveId: null,
  starting: false,
  bots: [],
  botById: new Map(),
  thread: [],
  replaying: false,
  ui: { focus: null, hover: null, chatHidden: false, unread: 0, control: null },
  hint: null,
  banner: null,
  history: [],
  historyOpen: false,
  rev: { top: 0, layout: 0 },
};

/** Hooks for what the classic reducer drew directly. Owners replace them; the defaults do nothing. */
export const effects = {
  /** An agent's cursor moved, clicked or is thinking (cursor.* events; positions are % of its viewport). */
  cursor: (_b: Bot, _d: CursorData) => {},
  /** The agent stopped working: hide its cursor after a moment. */
  hideCursorSoon: (_b: Bot) => {},
  /** The agent finished: pulse its tile. */
  pulse: (_b: Bot) => {},
  /** The agent said something: a speech bubble over its tile. */
  bubble: (_b: Bot, _label: string, _text: string) => {},
  /** Something in a background tab needs you ("needs") or the answer is in ("answer"). */
  attention: (_kind: "needs" | "answer") => {},
  /** The live run ended: the Chats list changed. */
  historyChanged: () => {},
};

// ── Helpers (as in app.js) ──

export const clip = (s: unknown, n: number) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
export function hostOf(url: string) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.host.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}
export function shortUrl(url: string) {
  try {
    const u = new URL(url);
    const s = `${u.host.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname}`;
    return s.length > 60 ? `${s.slice(0, 59)}…` : s;
  } catch {
    return url;
  }
}
export const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
export const money = (usd?: number | null) => (usd === undefined || usd === null ? "" : `$${usd < 0.1 ? usd.toFixed(3) : usd.toFixed(2)}`);
export const clock = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
export const safeHref = (url: unknown) => (/^https?:\/\//i.test(String(url)) ? String(url) : "#");
/** A lighter version of a bot color, readable as text on the dark background. */
export function tint(hex: string, amount = 0.35) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}
/** Black or white text on a bot color. */
export function onColor(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((c) => c / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? "#111" : "#fff";
}
/** The CSS variables classic.css reads for a bot's color (`style={colorVars(b.color)}`). */
export const colorVars = (color: string) => ({ "--c": color, "--ct": tint(color), "--on-c": onColor(color) }) as React.CSSProperties;
/** What you see the Master called: Onyx, the studio's coordinator. Used on our own wording and the
 *  server's notices; agents' and Onyx's own words stay as written. */
export const onyx = (text: unknown) => String(text ?? "").replace(/\b[Tt]he Master\b/g, "Onyx").replace(/\bMaster\b/g, "Onyx");

/** Bots address the Master as "master"; show one spelling. */
export const who = (name: unknown) => {
  const t = String(name ?? "").trim();
  return /^(the )?master$/i.test(t) ? "Master" : /^(all|everyone)$/i.test(t) ? "all" : String(name ?? "");
};

const ACTIVE = new Set(["starting", "running"]);
export const runActive = () => Boolean(S.run && !S.run.past && ACTIVE.has(S.run.status));
export const working = () => S.bots.filter((b) => b.status === "working" || b.status === "starting");
/** The team card of the latest plan. */
export const mission = () => S.run?.missions.at(-1);

/** Which layout: the home bar, the centered chat, or chat on the side with the agents' browsers. */
export function phase(): Phase {
  if (S.view === "home" || !S.run) return "home";
  return S.run.planned || S.bots.some((b) => b.assignments > 0) ? "side" : "center";
}

// ── Subscriptions: one render per frame after changes ──

let version = 0;
let raf = 0;
const listeners = new Set<() => void>();
function flush() {
  raf = 0;
  version++;
  for (const l of listeners) l();
}
function schedule() {
  if (!raf && !S.replaying) raf = requestAnimationFrame(flush);
}
/** Re-render now-ish (after a replay, or after changing S.ui yourself). */
export const notify = () => schedule();
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));
/** Re-renders the component after any change to S; read S directly. Returns a version number. */
export const useLive = () => useSyncExternalStore(subscribe, () => version);

let itemSeq = 0;
const MAIN_KINDS = new Set(["you", "master", "answer", "human", "notice"]);
export const touchBot = (b: Bot) => (b.rev++, S.rev.top++, schedule());
export const touchTop = () => (S.rev.top++, schedule());
export const touchLayout = () => (S.rev.layout++, S.rev.top++, schedule());
export const touchItem = (item: { rev: number }) => (item.rev++, schedule());
function addItem<T extends Omit<Item, "id" | "rev">>(item: T): T & { id: number; rev: number } {
  const it = Object.assign(item, { id: ++itemSeq, rev: 0 });
  S.thread.push(it as unknown as Item);
  if (S.ui.chatHidden && !S.replaying && MAIN_KINDS.has(it.kind)) (S.ui.unread++, S.rev.top++);
  schedule();
  return it;
}

export function makeBot(c: { id: string; name: string; color: string }, index: number): Bot {
  return {
    id: c.id, index, name: c.name, color: c.color, status: "idle", reason: null, warm: false,
    label: "", goal: "", startUrl: "", assignments: 0, actions: 0, maxActions: S.run?.options?.maxActions ?? 30,
    caption: "", url: "", title: "", vw: 1280, vh: 800, live: false, steps: [], result: null, human: null, control: false,
    lastReport: null, missionId: null, rev: 0,
  };
}

// ── Run lifecycle ──

/** Rebuilds the state from a run's events (the same reducer as live). `past`: a closed chat. */
export function loadRun(info: { id: string; task?: string; status: string; startedAt?: number; endedAt?: number; out?: string }, events: ServerEvent[], past: boolean) {
  S.bots = [];
  S.botById = new Map();
  S.view = "run";
  S.ui.unread = 0;
  S.ui.focus = null;
  S.ui.control = null;
  S.run = { ...info, past, cost: undefined, masterBusy: false, planned: false, answered: false, replyDue: false, missions: [] };
  S.thread = [];
  S.replaying = true;
  for (const e of events) apply(e);
  S.replaying = false;
  S.run.status = info.status; // the server's word is final (an event may still be in flight)
  if (past) S.run.masterBusy = false;
  touchLayout();
}

/** Back to the home bar. A closed chat leaves the screen; the live one keeps running in the background. */
export function goHome() {
  S.view = "home";
  S.ui.focus = null;
  if (S.run && S.run.id !== S.liveId) {
    S.bots = [];
    S.botById = new Map();
    S.run = null;
    S.thread = [];
  }
  touchLayout();
}

// ── Events (the reducer) ──

function botOf(e: ServerEvent) {
  return e.botId ? S.botById.get(e.botId) : undefined;
}
function step(b: Bot, s: Omit<Step, "at"> & { at?: number }) {
  b.steps.push({ ...s, at: s.at ?? Date.now() });
  if (b.steps.length > 300) b.steps.splice(0, b.steps.length - 300);
}
function researchItem(ts: number) {
  const last = S.thread.at(-1);
  if (last?.kind === "research" && last.live) return last;
  return addItem({ kind: "research" as const, live: true, list: [] as { q: string; ok: boolean }[], ts });
}
function closeResearch() {
  for (const it of S.thread) if (it.kind === "research" && it.live) (it.live = false), touchItem(it);
}
/** Team traffic goes into the latest team card's log (or the thread, before any plan). */
function teamLog(entry: LogEntry) {
  const m = mission();
  if (m) {
    m.log.push(entry);
    touchItem(m);
  } else addItem({ kind: "radio" as const, ...entry });
}

const MASTER_DOING: Record<string, string> = { start_bots: "Assigning the agents", message_bot: "Messaging an agent", stop_bot: "Stopping an agent", site_access: "Deciding on a site", final_answer: "Writing the answer", team_status: "Checking on the team" };

const handlers: Record<string, (e: ServerEvent) => void> = {
  "run.created"(e) {
    Object.assign(S.run!, { task: e.data.task, options: e.data.options, out: e.data.out, replyDue: true });
    addItem({ kind: "you" as const, text: e.data.task, ts: e.ts });
  },
  "run.status"(e) {
    const r = S.run!;
    r.status = e.data.status;
    if (e.data.step) r.step = e.data.step;
    if (e.data.status === "ended" || e.data.status === "failed") {
      r.endedAt = e.ts;
      r.ended = e.data;
      if (e.data.costUSD !== undefined) r.cost = e.data.costUSD;
      r.masterBusy = false;
      closeResearch();
      for (const m of r.missions) (m.closed = true), touchItem(m);
      addItem({ kind: "ended" as const, ...e.data, ts: e.ts });
      if (!S.replaying && r.id === S.liveId) (S.liveId = null), effects.historyChanged();
    }
    touchLayout();
  },
  "run.notice"(e) {
    addItem({ kind: "notice" as const, level: e.data.level ?? "info", text: e.data.text, ts: e.ts });
  },
  "run.result"(e) {
    S.run!.answered = true;
    const m = mission();
    if (m) (m.closed = true), touchItem(m);
    addItem({ kind: "answer" as const, answer: e.data.answer, sources: e.data.sources ?? [], n: e.data.n ?? 1, ts: e.ts });
    if (!S.replaying) effects.attention("answer");
    touchTop();
  },
  "usage.updated"(e) {
    S.run!.cost = e.data.costUSD;
    S.run!.byAgent = e.data.byAgent;
    touchTop();
  },

  "bot.spawned"(e) {
    let b = S.botById.get(e.botId!);
    if (!b) {
      b = makeBot({ id: e.botId!, name: e.data.name, color: e.data.color }, e.data.index);
      S.bots.push(b);
      S.bots.sort((x, y) => x.index - y.index);
      S.botById.set(b.id, b);
    }
    Object.assign(b, { vw: e.data.viewport?.width ?? 1280, vh: e.data.viewport?.height ?? 800, maxActions: e.data.maxActions ?? b.maxActions });
    touchBot(b);
    touchLayout();
  },
  "bot.warm"(e) {
    const b = botOf(e);
    if (b) (b.warm = true), touchBot(b);
  },
  "bot.status"(e) {
    const b = botOf(e);
    if (!b) return;
    const was = b.status;
    b.status = e.data.status;
    b.reason = e.data.reason ?? null;
    if (typeof e.data.actions === "number") b.actions = e.data.actions;
    if (b.status === "failed" && was !== "failed") {
      teamLog({ from: b.name, botId: b.id, event: "failed", text: `failed: ${b.reason ?? "unknown error"}`, ts: e.ts });
      step(b, { kind: "bad", text: `failed: ${b.reason ?? ""}`, at: e.ts });
    } else if (b.status === "stopped" && was !== "stopped") {
      teamLog({ from: b.name, botId: b.id, event: "stopped", text: b.reason && b.reason !== "stopped by the Master" ? `stopped (${b.reason})` : "stopped", ts: e.ts });
    } else if (b.status === "finished" && was !== "finished" && b.reason === "kept its earlier result") {
      teamLog({ from: b.name, to: "Master", botId: b.id, event: "kept", text: "replied; its earlier result stands", ts: e.ts });
    } else if (b.status === "finished" && was !== "finished" && b.reason) {
      teamLog({ from: b.name, botId: b.id, event: "stopped", text: b.reason, ts: e.ts });
    }
    if (b.status !== "working" && b.status !== "starting") effects.hideCursorSoon(b);
    touchBot(b);
    touchLayout();
  },
  "bot.assigned"(e) {
    const b = botOf(e);
    if (!b) return;
    Object.assign(b, { goal: e.data.goal, label: e.data.label || b.label, startUrl: e.data.startUrl ?? "", assignments: e.data.assignment, result: null, actions: 0, caption: "", lastReport: null });
    step(b, { kind: "assign", text: e.data.assignment > 1 ? `New assignment: ${e.data.label || clip(e.data.goal, 60)}` : `Assignment: ${e.data.label || clip(e.data.goal, 60)}`, at: e.ts });
    touchBot(b);
    touchLayout();
  },
  "bot.caption"(e) {
    const b = botOf(e);
    if (b) (b.caption = e.data.text), touchBot(b);
  },
  "tool.called"(e) {
    const b = botOf(e);
    if (!b) return;
    b.actions = e.data.actions ?? b.actions;
    if (e.data.tool !== "message" && e.data.tool !== "finish") step(b, { kind: e.data.ok ? "ok" : "bad", text: e.data.summary, ms: e.data.ms, at: e.ts });
    touchBot(b);
  },
  "bot.search"(e) {
    const b = botOf(e);
    if (b) step(b, { kind: "search", text: `web search ${e.data.query}`, ms: e.data.ms, at: e.ts }), touchBot(b);
  },
  "bot.text"() {},
  "bot.notice"(e) {
    const b = botOf(e);
    if (b) teamLog({ from: b.name, botId: b.id, event: "notice", text: e.data.text, ts: e.ts });
  },
  "bot.result"(e) {
    const b = botOf(e);
    if (!b) return;
    b.result = { summary: e.data.summary, sources: e.data.sources ?? [] };
    step(b, { kind: "done", text: "finished and reported to the Master", at: e.ts });
    teamLog({ from: b.name, to: "Master", botId: b.id, event: "finished", text: e.data.summary, sources: e.data.sources ?? [], ts: e.ts });
    if (!S.replaying) effects.pulse(b);
    touchBot(b);
  },
  "page.navigated"(e) {
    const b = botOf(e);
    if (!b) return;
    b.url = e.data.url;
    if (e.data.title) b.title = e.data.title;
    touchBot(b);
  },
  "human.check"(e) {
    const b = botOf(e);
    if (!b) return;
    b.human = { host: e.data.host, reason: e.data.reason };
    addItem({ kind: "human" as const, botId: b.id, host: e.data.host, ts: e.ts });
    teamLog({ from: b.name, botId: b.id, event: "notice", text: `hit a human check on ${e.data.host}`, ts: e.ts });
    if (!S.replaying) effects.attention("needs");
    touchBot(b);
  },
  "takeover.started"(e) {
    const b = botOf(e);
    if (!b) return;
    b.control = true;
    S.ui.control = b.id;
    if (!S.replaying) S.ui.focus = b.id;
    addItem({ kind: "notice" as const, level: "info" as const, text: `You took over ${b.name}'s browser. ${b.name}'s next actions wait until you hand it back.`, ts: e.ts });
    touchBot(b);
    touchLayout();
  },
  "takeover.ended"(e) {
    const b = botOf(e);
    if (!b) return;
    b.control = false;
    b.human = null;
    if (S.ui.control === b.id) S.ui.control = null;
    // Back to the whole squad, so Onyx's card (and the reports flying to it) is on screen again.
    if (!S.replaying && S.ui.focus === b.id) S.ui.focus = null;
    for (const it of S.thread) if (it.kind === "human" && it.botId === b.id && !it.done) (it.done = true), touchItem(it);
    addItem({ kind: "notice" as const, level: "info" as const, text: `You handed ${b.name}'s browser back.`, ts: e.ts });
    touchBot(b);
    touchLayout();
  },
  "site.request"(e) {
    const b = botOf(e);
    if (b) teamLog({ from: b.name, to: "Master", botId: b.id, event: "site", text: `asks to open ${e.data.site}${e.data.reason ? ` (${clip(e.data.reason, 80)})` : ""}`, ts: e.ts });
  },
  "site.decided"(e) {
    if (!e.data.askedBy?.length) return; // the plan's own sites
    teamLog({ from: e.data.by === "the Master" ? "Master" : "Plan", to: e.data.askedBy.join(", "), event: "site", text: `${e.data.allow ? "allowed" : "blocked"} ${e.data.site}`, ts: e.ts });
  },
  "team.message"(e) {
    const { text } = e.data;
    const from = who(e.data.from);
    const to = who(e.data.to);
    if (from === "user") {
      S.run!.replyDue = true;
      return void addItem({ kind: "you" as const, text, ts: e.ts });
    }
    const sender = S.bots.find((b) => b.name === from);
    const target = S.bots.find((b) => b.name === to);
    teamLog({ from, to, text, botId: sender?.id ?? target?.id, ts: e.ts });
    if (sender) {
      if (to === "Master") sender.lastReport = text;
      step(sender, { kind: "msg", text: `→ ${to === "all" ? "everyone" : to}: ${text}`, at: e.ts });
      if (!S.replaying) effects.bubble(sender, `→ ${to === "all" ? "everyone" : to}`, text);
      touchBot(sender);
    }
    if (from === "Master") {
      const targets = to === "all" ? working() : target ? [target] : [];
      for (const t of targets) {
        step(t, { kind: "msg", text: `← Master: ${text}`, at: e.ts });
        if (!S.replaying) effects.bubble(t, "Master", text);
        touchBot(t);
      }
    }
  },
  "master.status"(e) {
    const r = S.run!;
    r.masterBusy = Boolean(e.data.busy);
    if (r.masterBusy) r.masterDoing = r.planned ? "Thinking" : "Reading the task";
    else closeResearch();
    touchTop();
  },
  "master.text"(e) {
    // A reply to you is a message; progress narration while the agents work goes on the team card.
    const m = mission();
    if (S.run!.replyDue || !m || m.closed) {
      S.run!.replyDue = false;
      return void addItem({ kind: "master" as const, text: e.data.text, ts: e.ts });
    }
    m.note = { text: e.data.text, ts: e.ts };
    m.log.push({ from: "Master", text: e.data.text, ts: e.ts, event: "note" });
    touchItem(m);
  },
  "master.search"(e) {
    const it = researchItem(e.ts);
    it.list.push({ q: e.data.query, ok: e.data.ok !== false });
    touchItem(it);
    S.run!.masterDoing = /^open /.test(e.data.query) ? `Reading ${shortUrl(e.data.query.slice(5))}` : `Searching ${clip(e.data.query, 60)}`;
    touchTop();
  },
  "master.tool"(e) {
    if (MASTER_DOING[e.data.tool]) S.run!.masterDoing = e.data.ok ? MASTER_DOING[e.data.tool] : "Fixing a step";
    touchTop();
  },
  "master.stopped"(e) {
    const names = (e.data.bots ?? []).map((id: string) => S.botById.get(id)?.name).filter(Boolean);
    teamLog({ from: "Master", to: names.join(", "), event: "halt", text: `stop${e.data.reason ? `: ${e.data.reason}` : ""}`, ts: e.ts });
  },
  "plan.ready"(e) {
    closeResearch();
    const first = !S.run!.planned;
    S.run!.planned = true;
    const prev = mission();
    if (prev) (prev.closed = true), touchItem(prev);
    const m = addItem({ kind: "mission" as const, first, bots: e.data.assignments.map((a: { botId: string }) => a.botId), plan: e.data.assignments, log: [] as LogEntry[], note: null, open: false, closed: false, ts: e.ts }) as Mission;
    S.run!.missions.push(m);
    for (const a of e.data.assignments) {
      const b = S.botById.get(a.botId);
      if (!b) continue;
      b.label = a.label || b.label;
      b.goal = a.goal;
      b.missionId = m.id;
      b.lastReport = null;
      b.result = null;
      touchBot(b);
    }
    touchLayout();
  },
  "cursor.move"(e) {
    const b = botOf(e);
    if (b && !S.replaying) effects.cursor(b, { kind: "move", ...e.data });
  },
  "cursor.click"(e) {
    const b = botOf(e);
    if (b && !S.replaying) effects.cursor(b, { kind: "click", ...e.data });
  },
  "cursor.think"(e) {
    const b = botOf(e);
    if (b && !S.replaying) effects.cursor(b, { kind: "think", ...e.data });
  },
};

/** Listeners that see every event of the open run after the reducer (the characters use this). */
export const taps = new Set<(e: ServerEvent, replaying: boolean) => void>();

/** One server event into the state (events of other runs are ignored). */
export function apply(e: ServerEvent) {
  if (!S.run || e.runId !== S.run.id) return;
  handlers[e.type]?.(e);
  for (const tap of taps) tap(e, S.replaying);
}
