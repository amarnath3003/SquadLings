// The squad orchestrator (master.md §11, §12, §16, adapted 2026-10-11): one Master session on a
// stronger model and up to five bot sessions, each bot with its own browser window and MCP endpoint.
//
//   you ⇄ chat ⇄ Master (gpt-6.1-sol: web_search groundwork, start_bots, message_bot, final_answer…)
//                  ▲ TEAM UPDATES: reports, results, site requests, your messages, each bot's activity
//   Plum · Lime · Tango · Blu · Sky (gpt-6-luna: browser tools, web_search, message, finish)
//
// Everything goes through this process: every tool call of every agent lands here, so the
// orchestrator sees all of it and the Master gets a digest of it with each update. Bots never talk
// to the user; their site requests and blockers go to the Master. Messages reach a bot on its next
// tool result (D-07), or start a new turn when the bot is idle.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ApiError } from "./agents-api.ts";
import type { AgentsApi, SseStats } from "./agents-api.ts";
import { AgentSession } from "./agent-session.ts";
import type { TurnEnd } from "./agent-session.ts";
import { BotBrowser, ToolError } from "./browser.ts";
import type { Frame, HumanCheckAnswer, UserInput } from "./browser.ts";
import { screenArea, tiles } from "./layout.ts";
import { appendLines, createBotTools, createToolSet, resultText } from "./mcp-browser-server.ts";
import type { BotTools, McpRequest, Source, ToolCall, ToolDef, ToolSet } from "./mcp-browser-server.ts";
import { estimateCost } from "./pricing.ts";
import type { RunLog } from "./run-kit.ts";
import { countBy, localToday, secs } from "./run-kit.ts";
import { SiteGate, hostsIn, siteOf } from "./site-gate.ts";
import { NUDGE, assignmentMessage, botInstructions, masterInstructions, resumeMessage } from "./squad-prompts.ts";
import { printLine } from "./terminal.ts";

/** master.md §7.1: fixed slots, names and colors (the DevDay palette the character studio uses). */
export const CAST = [
  { id: "bot1", name: "Plum", color: "#924FF7" },
  { id: "bot2", name: "Lime", color: "#04B84C" },
  { id: "bot3", name: "Tango", color: "#FF8549" },
  { id: "bot4", name: "Blu", color: "#006AFF" },
  { id: "bot5", name: "Sky", color: "#A6D8F5" },
] as const;

const MASTER_COLOR = "#F2F2F2"; // the cast's master is black; on a dark terminal it's drawn light
const SEARCH_URL = "https://www.bing.com/search?q=";
const WEB_SEARCH_TOOL = { type: "web_search", mode: "live", context_size: "medium" };
const MESSAGE_WAIT_MS = 40000; // under the tunnel's 100 s request limit
const CREATE_LIMIT = 3; // §11.3: session creation at most 3 at a time
const WARM_UP = "WARM-UP: your browser is ready, but you have no assignment yet. Reply with the single word ready, and don't call any tools until an assignment arrives.";

export type SquadOptions = {
  api: AgentsApi;
  run: RunLog;
  token: string;
  runId: string;
  masterModel: string;
  botModel: string;
  masterEffort?: string;
  botEffort?: string;
  bots: number;
  maxActions: number;
  webSearch: boolean;
  headless: boolean;
  cursor: boolean;
  /** Folder for the bots' persistent profiles; undefined = clean temporary profiles. */
  profileRoot?: string;
  allow: string[];
  signal: AbortSignal;
  /** Called after each final answer (the CLI uses it for --once). */
  onAnswer?: () => void;
  /** Let the Master answer from its own research, without bots (off by default: the bots do the work). */
  allowDirect?: boolean;
  /** Send urgent updates while the Master is mid-turn, to start its next turn sooner (default true). */
  steer?: boolean;
  /** Every event, for the dashboard (master.md §18): what happened, to whom, with its data. */
  onEvent?: (e: SquadEvent) => void;
  /** Live frames of each bot's browser, for the dashboard (bot index 1–5). */
  onFrame?: (bot: { id: string; index: number }, frame: Frame) => void;
  /** The dashboard draws the cursors from cursor.* events, so pages stay clean (D-03). */
  cursorEvents?: boolean;
  /** Where the squad's log lines go (default: the terminal). */
  print?: (line: string) => void;
};

/** One thing that happened, for the dashboard; the server wraps it in the §18.1 envelope. */
export type SquadEvent = { type: string; source: "orchestrator" | "master" | "bot" | "browser" | "user"; botId?: string; data: Record<string, unknown> };

type BotStatus = "idle" | "starting" | "working" | "finished" | "stopped" | "failed";
type TeamMessage = { seq: number; at: number; from: string; to: string; text: string };
/**
 * How an update reaches the Master: "now" wakes it within a second (finishes, failures, site
 * requests, the user), even mid-turn; "soon" wakes it after a few seconds, so a report and the
 * finish that often follows it share one turn; "no" rides along with the next one.
 */
type Wake = "now" | "soon" | "no";
type Update = { at: number; text: string; wake: Wake };

type Bot = {
  id: string;
  name: string;
  color: string;
  browser: BotBrowser;
  gate: SiteGate;
  tools: BotTools;
  profileTemp?: string;
  session?: AgentSession;
  pastSessions: AgentSession[];
  status: BotStatus;
  goal?: string;
  /** A short role for the bot's tile, from the plan ("Tokyo forecast"). */
  label?: string;
  startUrl?: string;
  assignments: number;
  assignedAt?: number;
  endedAt?: number;
  result?: { summary: string; sources: Source[] };
  inbox: TeamMessage[];
  waiters: (() => void)[];
  nudges: number;
  retries: number;
  stopping: boolean;
  /** Why it is being stopped (shown on its tile), when not by the Master. */
  stopWhy?: string;
  calls: number;
  actions: number;
  ourErrors: Record<string, number>;
  recent: string[];
  digest: string[];
  searches: number;
  /** The current session failed for good; the next assignment starts a new one. */
  failed: boolean;
  /** Resolves when the bot's session exists (a warm-up may still be creating it). */
  ready?: Promise<void>;
  /** A finished bot was woken by a message: if it doesn't finish again, its earlier result stands. */
  reopened?: boolean;
};

// ── Terminal helpers ──────────────────────────────────

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(";");
const paint = (hex: string, text: string, bold = true) => (COLOR ? `\x1b[${bold ? "1;" : ""}38;2;${rgb(hex)}m${text}\x1b[0m` : text);
const dim = (text: string) => (COLOR ? `\x1b[2m${text}\x1b[0m` : text);
const clip = (t: string, n: number) => {
  const s = t.replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};
const where = (url: string) => {
  try {
    const u = new URL(url);
    return u.protocol.startsWith("http") ? clip(`${u.host.replace(/^www\./, "")}${u.pathname}${u.search}`, 70) : "(start page)";
  } catch {
    return url;
  }
};

/** A short activity line for one bot tool call: what it did, for the Master's digest and team_status. */
function activityOf(c: ToolCall): string {
  const a = c.args as Record<string, any>;
  const what =
    c.tool === "open" ? `opened ${where(String(a.url ?? ""))}`
    : c.tool === "find" ? `find "${clip(String(a.text ?? ""), 40)}"`
    : c.tool === "read_text" ? `read ${c.result.length} chars${a.query ? ` for "${clip(String(a.query), 30)}"` : ""}`
    : c.tool === "type" ? `typed "${clip(String(a.text ?? ""), 40)}"`
    : c.tool === "message" ? `messaged ${a.to}`
    : c.tool === "finish" ? "finished"
    : c.tool;
  const why = typeof a.why === "string" && c.tool !== "open" ? ` (${clip(a.why, 50)})` : "";
  return `${what}${why}${c.ok ? "" : ` ✗ ${c.code ?? "error"}`}`;
}

/** A caption for a tool call without a `why` (find, read_text, message…), shown on the bot's tile. */
function captionOf(tool: string, a: Record<string, unknown>): string {
  if (tool === "find") return `Look for "${clip(String(a.text ?? ""), 40)}"`;
  if (tool === "read_text") return a.query ? `Read the lines about "${clip(String(a.query), 30)}"` : "Read the page";
  if (tool === "list_elements") return "Look over the page";
  if (tool === "message") return `Message ${String(a.to ?? "the Master")}`;
  if (tool === "finish") return "Report back to the Master";
  if (tool === "screenshot") return "Take a closer look";
  if (tool === "wait") return "Wait for the page";
  return tool;
}

/** A short role from an assignment, for a plan without labels: its first few words. */
function roleOf(goal: string): string {
  const words = goal.replace(/https?:\/\/\S+/g, "").replace(/[^\p{L}\p{N}\s'’-]/gu, " ").split(/\s+/).filter(Boolean);
  const skip = /^(go|open|visit|find|get|look|check|read|search|use|please|to|the|a|an|on|at|and|then)$/i;
  const start = words.findIndex((w) => !skip.test(w));
  return words.slice(Math.max(0, start), Math.max(0, start) + 4).join(" ") || "Assignment";
}

/** One log line for a bot tool call. */
function describeCall(c: ToolCall): string {
  const first = c.result.split("\n")[0];
  const desc =
    c.tool === "read_text" ? `read ${c.result.length} chars${c.args.query ? ` matching "${c.args.query}"` : ""}`
    : c.tool === "list_elements" ? first.replace(/^Page: /, "")
    : c.tool === "finish" ? "done"
    : c.tool === "screenshot" ? "screenshot taken"
    : c.tool === "message" ? `→ ${c.args.to}: ${c.args.text}`
    : first.replace(/^✓ /, "").replace(/ \(settled in [\d.]+ s\)$/, "");
  const why = typeof c.args.why === "string" ? `  — ${c.args.why}` : "";
  return `${c.ok ? "✓" : "✗"} ${c.tool.padEnd(13)} ${clip(desc, 100)}${why}  ${dim(`[${secs(c.ms)} s]`)}`;
}

// ── Squad ─────────────────────────────────────────────

export class Squad {
  bots: Bot[] = [];
  master?: AgentSession;
  publicUrl = "";
  answers: { at: number; answer: string; sources: Source[] }[] = [];
  messages: TeamMessage[] = [];
  closing = false;
  private o: SquadOptions;
  private toolsets = new Map<string, ToolSet>();
  private masterTools!: ToolSet;
  private updates: Update[] = [];
  private flushTimer?: ReturnType<typeof setTimeout>;
  private flushAt = 0;
  private sending = false;
  private siteAsks = new Map<string, { bots: Set<string>; resolvers: ((yes: boolean) => void)[] }>();
  private creating = 0;
  private createQueue: (() => void)[] = [];
  private seq = 0;
  private masterCalls: { tool: string; ms: number; ok: boolean }[] = [];
  private masterSearches: { query: string; ms: number | null }[] = [];
  private masterFailures = 0;
  private masterDead = false;
  private masterSessions: AgentSession[] = [];
  private task = "";
  private lastBotEndAt = 0;
  private lastAnswerAt = -1;
  mcpRequests: McpRequest[] = [];
  sse: SseStats = { messages: 0, eventField: 0, idField: 0, comments: 0 };
  timings: Record<string, number> = {};

  constructor(o: SquadOptions) {
    this.o = o;
    this.masterTools = this.createMasterTools();
    this.toolsets.set(this.pathFor("master"), this.masterTools);
  }

  private get log() {
    return this.o.run.log;
  }
  private get elapsed() {
    return this.o.run.elapsed();
  }
  pathFor(agent: string) {
    return `/mcp/${this.o.token}/${this.o.runId}/${agent}`;
  }
  /** The MCP router: path → that agent's tools. */
  routes = (path: string) => this.toolsets.get(path);

  private print(line: string) {
    (this.o.print ?? printLine)(line);
  }
  private say(who: { name: string; color: string }, text: string) {
    this.print(`${paint(who.color, who.name.padEnd(6))} ${text}`);
  }
  private emit(type: string, data: Record<string, unknown>, bot?: { id: string }, source?: SquadEvent["source"]) {
    if (!this.o.onEvent) return;
    try {
      this.o.onEvent({ type, source: source ?? (bot ? "bot" : "orchestrator"), botId: bot?.id, data });
    } catch (err) {
      this.log(`event handler failed on ${type}: ${err instanceof Error ? err.message : err}`);
    }
  }
  private setStatus(bot: Bot, status: BotStatus, reason?: string) {
    bot.status = status;
    this.emit("bot.status", { status, reason: reason ?? null, actions: bot.tools?.state.actions ?? 0 }, bot);
  }
  private masterSays(text: string) {
    this.say({ name: "Master", color: MASTER_COLOR }, text);
  }

  // ── Browsers ──

  /** Opens every bot's browser window, tiled on screen (in parallel). */
  async launchBrowsers() {
    const cast = CAST.slice(0, this.o.bots);
    const cells = this.o.headless ? [] : tiles(screenArea(), cast.length);
    this.bots = await Promise.all(cast.map((c, i) => this.launchBot(c, cells[i])));
    for (const b of this.bots) this.toolsets.set(this.pathFor(b.id), b.tools);
    this.timings.browsersReady = this.elapsed;
  }

  private async launchBot(c: (typeof CAST)[number], cell: ReturnType<typeof tiles>[number] | undefined): Promise<Bot> {
    let profileDir: string | undefined;
    let profileTemp: string | undefined;
    if (this.o.profileRoot) profileDir = join(this.o.profileRoot, `squad-${c.name.toLowerCase()}`);
    else if (cell) profileDir = profileTemp = mkdtempSync(join(tmpdir(), `squadlings-${c.name.toLowerCase()}-`)); // a placed window needs a profile for its zoom
    const framesDir = join(this.o.run.out, "frames", c.name.toLowerCase());
    mkdirSync(framesDir, { recursive: true });
    let frames = 0;
    // Each bot has its own gate; a decision by the Master (or the plan) applies to all of them.
    const bot = { id: c.id, name: c.name, color: c.color } as Bot;
    const gate = new SiteGate([...this.o.allow, "bing.com"], { ask: (site, reason) => this.askSite(bot, site, reason) });
    const browser = await BotBrowser.launch({
      headless: this.o.headless,
      viewport: { width: 1280, height: 800 },
      window: cell,
      cursorScale: cell ? Math.max(1, 0.9 / cell.zoom) : 1,
      showCursor: this.o.cursor,
      cursorInPage: !this.o.cursorEvents,
      onCursor: this.o.cursorEvents ? (e) => this.emit(`cursor.${e.kind}`, e, bot, "browser") : undefined,
      onPage: this.o.onEvent ? (p) => this.emit("page.navigated", p, bot, "browser") : undefined,
      color: c.color,
      label: c.name,
      glideMs: 350,
      sites: gate,
      profileDir,
      onHumanCheck: (host, reason) => this.humanCheck(bot, host, reason),
      onKeyframe: (jpeg) => writeFileSync(join(framesDir, `${String(++frames).padStart(3, "0")}.jpg`), jpeg),
    });
    Object.assign(bot, {
      browser, gate, profileTemp, pastSessions: [], status: "idle", assignments: 0, inbox: [], waiters: [], nudges: 0, retries: 0,
      stopping: false, calls: 0, actions: 0, ourErrors: {}, recent: [], digest: [], searches: 0, failed: false,
    });
    bot.tools = createBotTools({
      browser,
      maxActions: this.o.maxActions,
      now: () => this.elapsed,
      onCallStart: (tool, args) => this.emit("bot.caption", { tool, text: typeof args.why === "string" ? args.why : captionOf(tool, args) }, bot),
      onCall: (call) => this.onBotCall(bot, call),
      onFinish: (summary, sources) => this.onBotFinish(bot, summary, sources),
      extraTools: [this.messageTool(bot)],
      inbox: () => this.takeInbox(bot),
    });
    const index = CAST.indexOf(c) + 1;
    this.emit("bot.spawned", { index, name: c.name, color: c.color, viewport: browser.viewport, maxActions: this.o.maxActions }, bot);
    if (this.o.onFrame) await browser.startScreencast((f) => this.o.onFrame?.({ id: c.id, index }, f));
    return bot;
  }

  private bot(name: string): Bot | undefined {
    const n = name.trim().toLowerCase();
    return this.bots.find((b) => b.name.toLowerCase() === n || b.id === n);
  }

  // ── Sites and human checks ──

  /** A bot wants a site nobody allowed yet: the Master decides (site_access). One question per site. */
  private askSite(bot: Bot, site: string, reason?: string): Promise<boolean> {
    return new Promise((resolve) => {
      let entry = this.siteAsks.get(site);
      const first = !entry;
      if (!entry) this.siteAsks.set(site, (entry = { bots: new Set(), resolvers: [] }));
      entry.bots.add(bot.name);
      entry.resolvers.push(resolve);
      if (first) {
        this.say(bot, dim(`wants to open ${site}: asking the Master`));
        this.emit("site.request", { site, reason: reason ?? null }, bot);
        this.pushUpdate(`SITE REQUEST: ${bot.name} wants to open ${site}${reason ? ` (for "${clip(reason, 80)}")` : ""}. Answer with site_access.`, "now");
      }
    });
  }

  /** Allows or blocks sites for every bot and answers any bot waiting on them. */
  private decideSites(sites: string[], allow: boolean, by: string) {
    for (const raw of sites) {
      const site = siteOf(raw.replace(/^https?:\/\//i, "").split("/")[0]);
      if (!site) continue;
      for (const b of this.bots) {
        (allow ? b.gate.allowed : b.gate.denied).add(site);
        (allow ? b.gate.denied : b.gate.allowed).delete(site);
      }
      const entry = this.siteAsks.get(site);
      if (entry) {
        this.siteAsks.delete(site);
        for (const r of entry.resolvers) r(allow);
        for (const name of entry.bots) this.bot(name)?.browser.note(allow ? `The Master allowed ${site}. You can open it now.` : `The Master blocked ${site}. Don't try it again.`);
        this.log(`site ${site} → ${allow ? "allowed" : "blocked"} by ${by}`);
        this.emit("site.decided", { site, allow, by, askedBy: [...entry.bots] });
      }
    }
  }

  private async humanCheck(bot: Bot, host: string, reason: string): Promise<HumanCheckAnswer> {
    this.say(bot, `⚠ hit a human check on ${host} (${reason}). You can solve it in ${bot.name}'s window; ${bot.name} moves on meanwhile.`);
    this.pushUpdate(`${bot.name} hit a human check (CAPTCHA) on ${host}; it's trying the site's normal pages or another site. The user may solve it in ${bot.name}'s window.`, "no");
    this.emit("human.check", { host, reason }, bot);
    return "pending";
  }

  // ── Team messages ──

  private messageTool(bot: Bot): ToolDef {
    return {
      name: "message",
      description: 'Send a short message to the Master ("master"), a teammate (by name) or everyone ("all"). Report key findings and blockers to the Master as soon as you have them. wait_for_reply waits up to 40 s for an answer.',
      shape: {
        to: z.string().describe('"master", a teammate\'s name, or "all"'),
        text: z.string().describe("One or two sentences, with the numbers and URLs that matter"),
        wait_for_reply: z.boolean().optional().describe("Wait up to 40 s for a reply (only when you can't continue without one)"),
      },
      run: async (a: { to: string; text: string; wait_for_reply?: boolean }) => {
        const to = a.to.trim().toLowerCase();
        const text = a.text.trim();
        if (!text) throw new ToolError("INVALID_INPUT", "The message is empty.");
        if (to === "master" || to === "the master") {
          this.post(bot.name, "master", text);
          this.say(bot, `→ ${paint(MASTER_COLOR, "Master")}: ${text}`);
          this.pushUpdate(`${bot.name} → you: ${text}`, a.wait_for_reply ? "now" : "soon");
        } else if (to === "all" || to === "everyone") {
          const m = this.post(bot.name, "all", text);
          for (const b of this.bots) if (b !== bot) this.deliver(b, m, false);
          this.say(bot, `→ all: ${text}`);
          this.pushUpdate(`${bot.name} → all bots: ${text}`, "no");
        } else {
          const peer = this.bot(to);
          if (!peer || peer === bot) throw new ToolError("INVALID_INPUT", `No teammate "${a.to}". Use "master", "all", or one of: ${this.bots.filter((b) => b !== bot).map((b) => b.name).join(", ")}.`);
          const m = this.post(bot.name, peer.name, text);
          this.deliver(peer, m, false);
          this.say(bot, `→ ${paint(peer.color, peer.name)}: ${text}`);
          this.pushUpdate(`${bot.name} → ${peer.name}: ${text}`, "no");
        }
        if (!a.wait_for_reply) return `Sent to ${a.to}.`;
        const from = to === "master" || to === "the master" ? "Master" : to === "all" || to === "everyone" ? undefined : this.bot(to)?.name;
        const reply = await this.waitForMessage(bot, MESSAGE_WAIT_MS, from);
        return reply ? `Sent to ${a.to}. Reply:` : `Sent to ${a.to}. No reply within 40 s; continue, and the reply will appear under "Messages" later.`;
      },
    };
  }

  private post(from: string, to: string, text: string): TeamMessage {
    const m = { seq: ++this.seq, at: this.elapsed, from, to, text };
    this.messages.push(m);
    this.o.run.record("messages.jsonl", m);
    const sender = this.bot(from);
    this.emit("team.message", { seq: m.seq, from, to, text }, sender, from === "user" ? "user" : from === "Master" ? "master" : "bot");
    return m;
  }

  /** Queues a message for a bot (shown with its next tool result). `wake` starts a turn if the bot is idle. */
  private deliver(bot: Bot, m: TeamMessage, wake: boolean) {
    bot.inbox.push(m);
    for (const w of [...bot.waiters]) w();
    if (wake && !this.closing && bot.session && !bot.session.busy && !bot.session.closed && bot.status !== "starting") void this.resumeWithInbox(bot);
  }

  /** The bot's undelivered messages, as lines for its next tool result. */
  private takeInbox(bot: Bot): string[] {
    const lines: string[] = [];
    if (bot.stopping) lines.push("The Master is stopping you: call finish now with what you have.");
    const msgs = bot.inbox.splice(0);
    if (msgs.length) lines.push("Messages:", ...msgs.map((m) => `• ${m.from === "Master" ? "Master" : m.from} → ${m.to === "all" ? "all" : "you"}: ${m.text}`));
    return lines;
  }

  /** Waits for a message to `bot` (from `from`, if given); true if one is waiting in its inbox. */
  private waitForMessage(bot: Bot, ms: number, from?: string): Promise<boolean> {
    const has = () => bot.inbox.some((m) => !from || m.from === from);
    if (has()) return Promise.resolve(true);
    return new Promise((resolve) => {
      const done = (got: boolean) => {
        clearTimeout(timer);
        bot.waiters = bot.waiters.filter((w) => w !== onMessage);
        resolve(got);
      };
      const onMessage = () => {
        if (has()) done(true);
      };
      const timer = setTimeout(() => done(false), ms);
      bot.waiters.push(onMessage);
    });
  }

  /** An idle bot with new messages: show them to it as a new turn. */
  private async resumeWithInbox(bot: Bot) {
    const lines = this.takeInbox(bot);
    if (!lines.length || !bot.session) return;
    if (bot.status === "finished" || bot.status === "stopped") {
      // A finished bot told to do more: it's back at work on the same assignment.
      bot.reopened = bot.status === "finished" && Boolean(bot.result);
      bot.tools.state.finished = false;
      this.setStatus(bot, "working", "back at work for the Master");
      bot.nudges = 0;
    }
    try {
      await bot.session.send(`${lines.join("\n")}\nContinue, then call finish again with your updated result.`);
    } catch (err) {
      this.log(`${bot.name}: couldn't send messages: ${err instanceof Error ? err.message : err}`);
    }
  }

  // ── Bot calls and outcomes ──

  private onBotCall(bot: Bot, c: ToolCall) {
    bot.calls++;
    if (!c.ok) bot.ourErrors[c.tool] = (bot.ourErrors[c.tool] ?? 0) + 1;
    bot.actions = bot.tools.state.actions;
    const line = activityOf(c);
    bot.recent = [...bot.recent, line].slice(-8);
    if (c.tool !== "message") bot.digest.push(line);
    this.o.run.record("tools.jsonl", { agent: bot.name, ...c });
    this.emit("tool.called", { tool: c.tool, ok: c.ok, code: c.code ?? null, summary: line, why: typeof c.args.why === "string" ? c.args.why : null, ms: c.ms, actions: bot.tools.state.actions, maxActions: this.o.maxActions }, bot);
    if (c.tool !== "message") this.say(bot, describeCall(c)); // messages print when sent
  }

  private onBotFinish(bot: Bot, summary: string, sources: Source[]) {
    bot.reopened = false;
    bot.result = { summary, sources };
    void bot.browser.keyframeNow();
    this.setStatus(bot, "finished");
    this.emit("bot.result", { summary, sources }, bot);
    bot.endedAt = this.elapsed;
    this.lastBotEndAt = this.elapsed;
    this.say(bot, `✔ finished: ${clip(summary, 300)}`);
    const src = sources.length ? `\n  sources: ${sources.map((s) => s.url).join(" ")}` : "";
    // While others still work, the Master usually just waits: batch this with the next update.
    this.pushUpdate(`${bot.name} FINISHED: ${summary}${src}`, this.working().length ? "soon" : "now");
  }

  /** A bot's assignment ended without its own finish. `byMaster`: the Master stopped it, so this is no news to wake it for. */
  private botEnded(bot: Bot, status: BotStatus, why: string, byMaster = false) {
    if (bot.status === "finished" && status === "finished") return;
    this.setStatus(bot, status, why);
    bot.stopping = false;
    if (status === "failed") bot.failed = true;
    bot.endedAt = this.elapsed;
    if (!byMaster) this.lastBotEndAt = this.elapsed;
    this.say(bot, `${status === "failed" ? "✗" : "■"} ${why}`);
    const partial = bot.recent.length ? ` Its last steps: ${bot.recent.slice(-4).join("; ")}.` : "";
    this.pushUpdate(`${bot.name} ${status.toUpperCase()}: ${why}.${partial}`, byMaster ? "no" : status === "failed" || !this.working().length ? "now" : "soon");
  }

  private async onBotTurnEnd(bot: Bot, session: AgentSession, kind: TurnEnd, ev: any) {
    if (session !== bot.session || this.closing) return;
    this.refreshCost(session);
    if (bot.assignments === 0) return; // the warm-up turn
    if (bot.stopping) {
      bot.stopping = false;
      if (bot.status !== "finished") this.botEnded(bot, "stopped", bot.stopWhy ?? "stopped by the Master", true);
      return;
    }
    if (kind === "cancelled") return;
    if (kind === "failed") return this.onBotFailure(bot, session, ev?.turn?.error ?? ev?.error ?? "turn failed");
    // A finished bot wakes only for the Master; teammates' notes wait for its next assignment.
    if (bot.tools.state.finished) return bot.inbox.some((m) => m.from === "Master") ? this.resumeWithInbox(bot) : undefined;
    if (bot.inbox.length) return this.resumeWithInbox(bot);
    if (bot.reopened && bot.result) {
      // It answered the message (it often says it's already done) without a new finish: no nudges,
      // its earlier result stands. Live, two nudges here cost ~15 s and read as a failure (2026-10-11).
      bot.reopened = false;
      bot.tools.state.finished = true;
      bot.endedAt = this.lastBotEndAt = this.elapsed;
      this.setStatus(bot, "finished", "kept its earlier result");
      this.pushUpdate(`${bot.name} replied without a new finish; its earlier result stands.`, this.working().length ? "soon" : "now");
      return;
    }
    if (bot.nudges < 2) {
      bot.nudges++;
      this.log(`${bot.name}: turn ended without finish; nudge ${bot.nudges} of 2`);
      await session.send(NUDGE).catch(() => {});
      return;
    }
    this.botEnded(bot, "finished", "ended without calling finish (after 2 nudges)");
  }

  private async onBotFailure(bot: Bot, session: AgentSession, error: unknown) {
    if (session !== bot.session || this.closing) return;
    const text = typeof error === "string" ? error : JSON.stringify(error).slice(0, 300);
    if (bot.assignments === 0) {
      bot.failed = true; // a warm-up failed: the first assignment gets a fresh session
      this.log(`${bot.name}: warm session failed (${clip(text, 160)})`);
      return;
    }
    if (bot.retries < 1 && bot.goal) {
      // §11.6: retry once with a fresh session; the browser and its page stay as they were.
      bot.retries++;
      this.say(bot, `✗ session failed (${clip(text, 120)}); retrying once with a fresh session`);
      this.emit("bot.notice", { text: "Its session failed; retrying once with a fresh session (the browser stays as it was)." }, bot);
      bot.pastSessions.push(session);
      void session.close();
      await this.startSession(bot, resumeMessage(bot.browser.page.url(), bot.goal)).catch((err) => this.botEnded(bot, "failed", `retry failed: ${err instanceof Error ? err.message : err}`));
      return;
    }
    this.botEnded(bot, "failed", `session failed: ${clip(text, 200)}`);
  }

  // ── Bot sessions ──

  private botBody(bot: Bot) {
    return {
      agent: {
        model: this.o.botModel,
        instructions: botInstructions({ name: bot.name, today: localToday(), webSearch: this.o.webSearch, searchUrl: SEARCH_URL }),
        tools: [
          {
            type: "mcp",
            server_label: `squadlings_${bot.id}`,
            transport: { type: "http", server_url: `${this.publicUrl}${this.pathFor(bot.id)}`, authorization: `Bearer ${this.o.token}` },
            connection_origin: "service",
            required: true,
            allowed_tools: bot.tools.toolList.map((t) => t.name),
          },
          ...(this.o.webSearch ? [WEB_SEARCH_TOOL] : []),
        ],
        ...(this.o.botEffort ? { reasoning: { effort: this.o.botEffort } } : {}),
      },
      environment: { type: "none" },
    };
  }

  private newSession(label: string, body: Record<string, unknown>, handlers: { onTurnStart?: (s: AgentSession) => void; onTurnEnd: (s: AgentSession, kind: TurnEnd, ev: any) => void | Promise<void>; onFailure: (s: AgentSession, err: unknown) => void; onText?: (t: string, phase: string | null) => void; onSearch?: (q: string, ms: number | null, ok: boolean) => void; onMcpItem?: (item: any) => void }) {
    const session: AgentSession = new AgentSession({
      api: this.o.api,
      body,
      signal: this.o.signal,
      sse: this.sse,
      log: (msg) => this.log(`${label}: ${msg}`),
      record: (entry) => this.o.run.record(`events-${label.toLowerCase()}.jsonl`, { at: this.elapsed, ...(entry as object) }),
      onTurnStart: handlers.onTurnStart && (() => handlers.onTurnStart?.(session)),
      onTurnEnd: (kind, ev) => handlers.onTurnEnd(session, kind, ev),
      onFailure: (err) => handlers.onFailure(session, err),
      onText: handlers.onText,
      onSearch: handlers.onSearch,
      onMcpItem: handlers.onMcpItem,
    });
    return session;
  }

  /** Creates a bot session with its first message: at most 3 creations at a time, retried on 429/5xx (§11.3). */
  private async startSession(bot: Bot, input: string) {
    const session = this.newSession(bot.name, this.botBody(bot), {
      onTurnEnd: (s, kind, ev) => this.onBotTurnEnd(bot, s, kind, ev),
      onFailure: (s, err) => void this.onBotFailure(bot, s, err),
      onText: (t, phase) => {
        if (bot.assignments === 0) return; // "ready"
        this.say(bot, dim(`says: ${clip(t, 200)}`));
        this.emit("bot.text", { text: t, phase }, bot);
        if (phase !== "commentary") bot.digest.push(`wrote: ${clip(t, 120)}`);
      },
      onSearch: (q, ms, ok) => {
        bot.searches++;
        bot.digest.push(`web_search ${clip(q, 60)}`);
        this.emit("bot.search", { query: q, ms, ok }, bot);
        this.say(bot, `${ok ? "✓" : "✗"} web_search    ${clip(q, 100)}  ${dim(`[${ms === null ? "?" : secs(ms)} s]`)}`);
      },
      onMcpItem: (item) => {
        if (!item.error && item.status !== "failed") return;
        if ((bot.ourErrors[item.name] ?? 0) > 0) bot.ourErrors[item.name]--; // our own tool error, already logged
        else this.say(bot, `✗ MCP call ${item.name ?? ""} failed in OpenAI: ${clip(JSON.stringify(item.error ?? item.status), 160)}`);
      },
    });
    bot.session = session;
    await this.withCreateSlot(async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          await session.start(input);
          return;
        } catch (err) {
          const retryable = err instanceof ApiError && (err.status === 429 || err.status >= 500);
          if (!retryable || attempt >= 3 || this.closing) throw err;
          await new Promise((r) => setTimeout(r, 500 * 2 ** attempt + Math.random() * 300));
        }
      }
    });
  }

  private async withCreateSlot<T>(fn: () => Promise<T>): Promise<T> {
    if (this.creating >= CREATE_LIMIT) await new Promise<void>((r) => this.createQueue.push(r));
    this.creating++;
    try {
      return await fn();
    } finally {
      this.creating--;
      this.createQueue.shift()?.();
    }
  }

  /** Gives a bot an assignment: a new session the first time, a new message in its session after that. */
  private async assign(bot: Bot, a: { goal: string; label?: string; startUrl?: string; sites: string[] }, teammates: { name: string; goal: string }[], delayMs: number) {
    await bot.ready; // a warm-up may still be creating the session
    if (bot.session && (bot.session.closed || bot.failed || !bot.session.id)) {
      // A failed session isn't reused: the new assignment gets a fresh one (the browser stays).
      bot.pastSessions.push(bot.session);
      void bot.session.close();
      bot.session = undefined;
    }
    bot.failed = false;
    const first = !bot.session;
    Object.assign(bot, { goal: a.goal, label: a.label, startUrl: a.startUrl, result: undefined, nudges: 0, retries: 0, stopping: false, reopened: false, assignedAt: this.elapsed, endedAt: undefined });
    bot.assignments++;
    this.emit("bot.assigned", { goal: a.goal, label: a.label ?? null, startUrl: a.startUrl ?? null, sites: a.sites, assignment: bot.assignments }, bot);
    this.setStatus(bot, "starting");
    bot.tools.state.finished = false;
    bot.tools.state.actions = 0;
    bot.tools.state.summary = undefined;
    bot.tools.state.sources = [];
    const text = assignmentMessage({ ...a, teammates, maxActions: this.o.maxActions, first: bot.assignments === 1 });
    this.say(bot, `◆ assignment: ${clip(a.goal, 220)}`);
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs)); // staggered launches (§11.3)
    try {
      if (first) await this.startSession(bot, text);
      else await bot.session!.send(text);
      if (bot.status === "starting") this.setStatus(bot, "working");
      this.timings.firstBotStarted ??= this.elapsed;
    } catch (err) {
      this.botEnded(bot, "failed", `couldn't start: ${err instanceof Error ? err.message : err}`);
    }
  }

  /**
   * Creates every bot's session now, with a one-word warm-up turn, while the Master plans: OpenAI
   * connects to the bot's MCP endpoint and sets the session up off the critical path (≈6 s from
   * create to the first turn, live), so an assignment later is just a message to a warm session.
   */
  warmBots() {
    for (const bot of this.bots) {
      if (bot.session) continue;
      bot.ready = this.startSession(bot, WARM_UP).then(() => this.emit("bot.warm", {}, bot)).catch((err) => {
        bot.failed = true;
        this.log(`${bot.name}: warm-up failed (${err instanceof Error ? err.message : err}); it gets a fresh session when assigned`);
      });
    }
  }

  private stopBot(bot: Bot, why = "stopped by the Master") {
    if (bot.status !== "working" && bot.status !== "starting") return false;
    bot.stopping = true;
    bot.stopWhy = why;
    if (bot.session?.busy) void bot.session.cancel().catch(() => {});
    else this.botEnded(bot, "stopped", why, true);
    return true;
  }

  /** Bots at work. One the Master is stopping doesn't count: its cancel is on the way. */
  private working() {
    return this.bots.filter((b) => (b.status === "working" || b.status === "starting") && !b.stopping);
  }

  // ── Master ──

  private teamLine(): string {
    const busy = this.working();
    if (busy.length) return `Still working: ${busy.map((b) => `${b.name} (${b.tools.state.actions}/${this.o.maxActions} actions)`).join(", ")}.`;
    const assigned = this.bots.some((b) => b.assignments > 0);
    if (assigned && this.lastAnswerAt < this.lastBotEndAt) return "Every bot is done. If the task is complete, call final_answer; otherwise start more work.";
    return "";
  }

  private statusOf(b: Bot) {
    return `${b.status}, ${b.tools.state.actions}/${this.o.maxActions} actions, on ${where(b.browser.page.url())}`;
  }

  /** Pending updates and each bot's activity since the last update, as one message for the Master. */
  private updateText(): string {
    const lines = [`TEAM UPDATES (${secs(this.elapsed)} s into the run)`];
    for (const u of this.updates.splice(0)) lines.push(`- ${u.text}`);
    const act = this.bots.filter((b) => b.digest.length).map((b) => {
      const d = b.digest.splice(0);
      return `- ${b.name} (${this.statusOf(b)}): ${d.slice(-6).join("; ")}${d.length > 6 ? ` (+${d.length - 6} earlier steps)` : ""}`;
    });
    if (act.length) lines.push("Activity since the last update:", ...act);
    const team = this.teamLine();
    if (team) lines.push(team);
    return lines.join("\n");
  }

  private pushUpdate(text: string, wake: Wake) {
    const u = { at: this.elapsed, text, wake };
    this.updates.push(u);
    this.o.run.record("updates.jsonl", u);
    // "now" waits 0.8 s to batch near-simultaneous updates, or 0.2 s once no bot is working.
    if (wake !== "no") this.scheduleFlush(wake === "soon" ? 3000 : this.working().length ? 800 : 200);
  }

  /** Flushes after `delayMs`, or sooner if a flush is already due sooner. The wait batches updates that arrive together. */
  private scheduleFlush(delayMs: number) {
    if (this.closing) return;
    const at = Date.now() + delayMs;
    if (this.flushTimer && this.flushAt <= at) return;
    clearTimeout(this.flushTimer);
    this.flushAt = at;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      void this.flush();
    }, delayMs);
  }

  /**
   * Sends pending updates to the Master. Idle: they start a turn. Busy: urgent updates are sent
   * anyway. The docs say input "steers the active turn"; live (2026-10-11, 3 runs) it didn't join
   * the running turn but started the next one 1.1–1.3 s after it ended, which still beats waiting
   * for the turn end and then sending (1–3 s to the next turn). Other updates wait for the Master's
   * next tool result or the end of its turn.
   */
  private async flush() {
    if (this.closing || this.sending || !this.updates.some((u) => u.wake !== "no")) return;
    if (this.masterDead) return void (await this.restartMaster());
    if (!this.master?.id) return;
    if (this.master.busy && !(this.o.steer !== false && this.updates.some((u) => u.wake === "now"))) return;
    this.sending = true;
    try {
      if (this.master.busy) this.log("urgent updates sent during the Master's turn (they start its next one)");
      await this.master.send(this.updateText());
      this.emit("master.status", { busy: true }, undefined, "master");
    } catch (err) {
      this.log(`couldn't reach the Master: ${err instanceof Error ? err.message : err}`);
    } finally {
      this.sending = false;
    }
  }

  private masterBody() {
    return {
      agent: {
        model: this.o.masterModel,
        instructions: masterInstructions({ today: localToday(), bots: this.bots, botModel: this.o.botModel, maxActions: this.o.maxActions, allowDirect: Boolean(this.o.allowDirect) }),
        tools: [
          {
            type: "mcp",
            server_label: "squadlings_master",
            transport: { type: "http", server_url: `${this.publicUrl}${this.pathFor("master")}`, authorization: `Bearer ${this.o.token}` },
            connection_origin: "service",
            required: true,
            allowed_tools: this.masterTools.toolList.map((t) => t.name),
          },
          WEB_SEARCH_TOOL, // the Master's groundwork
        ],
        ...(this.o.masterEffort ? { reasoning: { effort: this.o.masterEffort } } : {}),
      },
      environment: { type: "none" },
    };
  }

  private newMasterSession() {
    const s = this.newSession("Master", this.masterBody(), {
      onTurnStart: (session) => {
        if (session === this.master) this.emit("master.status", { busy: true }, undefined, "master");
      },
      onTurnEnd: (session, kind, ev) => {
        if (session !== this.master) return;
        this.refreshCost(session);
        this.emit("master.status", { busy: false }, undefined, "master");
        if (kind === "failed") {
          const err = ev?.turn?.error ?? ev?.error;
          this.masterSays(`✗ turn failed: ${clip(JSON.stringify(err ?? "unknown"), 200)}`);
          this.emit("run.notice", { level: "error", text: `The Master's turn failed (${clip(JSON.stringify(err ?? "unknown"), 160)}). It's asked to continue.` });
          if (++this.masterFailures <= 2) this.pushUpdate("Your last turn failed with a technical error. Continue from where you were.", "now");
          return;
        }
        if (this.updates.some((u) => u.wake !== "no")) this.scheduleFlush(300);
      },
      onFailure: (session, err) => {
        if (session !== this.master || this.closing) return;
        this.masterDead = true;
        this.masterSays(`✗ session failed: ${clip(JSON.stringify(err), 200)}. Type a message to restart the Master.`);
        this.emit("master.status", { busy: false }, undefined, "master");
        this.emit("run.notice", { level: "error", text: "The Master's session failed. Send a message to restart it; it gets the team's state." });
      },
      onText: (t, phase) => {
        this.masterSays(t);
        this.emit("master.text", { text: t, phase }, undefined, "master");
      },
      onSearch: (q, ms, ok) => {
        this.masterSearches.push({ query: q, ms });
        this.emit("master.search", { query: q, ms, ok }, undefined, "master");
        this.masterSays(`${ok ? "✓" : "✗"} web_search  ${clip(q, 100)}  ${dim(`[${ms === null ? "?" : secs(ms)} s]`)}`);
      },
    });
    this.masterSessions.push(s);
    return s;
  }

  /** Starts the Master with the user's task. */
  async start(task: string) {
    this.task = task;
    this.master = this.newMasterSession();
    this.emit("master.status", { busy: true }, undefined, "master");
    await this.master.start(`USER TASK\n${task}`);
    this.timings.masterStarted = this.elapsed;
    this.masterSays(dim(`on it (${this.o.masterModel}): researching, then assigning the bots`));
  }

  /** The Master's session failed: start a new one that knows the task and the team's state. */
  private async restartMaster() {
    this.masterDead = false;
    const old = this.master;
    if (old) void old.close();
    this.master = this.newMasterSession();
    this.emit("master.status", { busy: true }, undefined, "master");
    const recap = [`USER TASK\n${this.task}`, "(Your previous session failed; this is a new one. The team's state:)", this.teamStatus(), this.updateText()].join("\n\n");
    await this.master.start(recap).catch((err) => this.masterSays(`✗ couldn't restart: ${err instanceof Error ? err.message : err}`));
  }

  /** A line from the user, for the Master. */
  userSays(text: string) {
    this.post("user", "master", text);
    this.pushUpdate(`USER: ${text}`, "now");
    if (this.master?.busy) this.print(dim("  (the Master is busy; it gets your message with its next step)"));
  }

  teamStatus(): string {
    const lines = this.bots.map((b) => {
      const head = `${b.name}: ${this.statusOf(b)}${b.goal ? `\n  goal: ${clip(b.goal, 200)}` : ""}`;
      const recent = b.recent.length ? `\n  recent: ${b.recent.slice(-5).join("; ")}` : "";
      const result = b.result ? `\n  result: ${clip(b.result.summary, 400)}` : "";
      return head + recent + result;
    });
    const pending = [...this.siteAsks.entries()].map(([site, e]) => `${site} (asked by ${[...e.bots].join(", ")})`);
    if (pending.length) lines.push(`Site requests waiting for you: ${pending.join(", ")}`);
    return lines.join("\n");
  }

  private createMasterTools(): ToolSet {
    const defs: ToolDef[] = [
      {
        name: "start_bots",
        description: "Give assignments to bots, up to one per bot. Each runs in parallel in its own browser. Omit bot to use the next free one; name a finished bot to reuse it (it keeps its browser and memory).",
        shape: {
          bots: z.array(z.object({
            bot: z.string().optional().describe("A free or finished bot's name, to choose it"),
            label: z.string().optional().describe('A 2–4 word role shown on the bot\'s tile, e.g. "Tokyo forecast"'),
            goal: z.string().describe("A self-contained assignment: what to find or do, what to report (fields, source URLs), and when to stop"),
            start_url: z.string().optional().describe("The page to start on"),
            sites: z.array(z.string()).optional().describe("Sites the bot may open, e.g. example.com (subdomains included)"),
          })).min(1).max(5),
        },
        run: async (a: { bots: { bot?: string; label?: string; goal: string; start_url?: string; sites?: string[] }[] }) => this.startBots(a.bots),
      },
      {
        name: "message_bot",
        description: 'Send a bot (or "all" working bots) an instruction or a fact. It arrives with the bot\'s next tool result, within seconds; an idle or finished bot starts working on it.',
        shape: { to: z.string().describe('A bot\'s name, or "all"'), text: z.string() },
        run: async (a: { to: string; text: string }) => {
          const targets = a.to.trim().toLowerCase() === "all" ? this.working() : [this.bot(a.to)].filter((b): b is Bot => Boolean(b));
          if (!targets.length) throw new ToolError("INVALID_INPUT", a.to.trim().toLowerCase() === "all" ? "No bot is working now." : `No bot "${a.to}". Bots: ${this.bots.map((b) => b.name).join(", ")}.`);
          for (const b of targets) {
            if (b.assignments === 0) throw new ToolError("INVALID_INPUT", `${b.name} has no assignment yet; use start_bots.`);
            if (b.status === "failed") throw new ToolError("INVALID_INPUT", `${b.name}'s session failed; give it a new assignment with start_bots (it gets a fresh session).`);
            const m = this.post("Master", b.name, a.text);
            this.masterSays(`→ ${paint(b.color, b.name)}: ${a.text}`);
            this.deliver(b, m, true);
          }
          return `Sent to ${targets.map((b) => b.name).join(", ")}.`;
        },
      },
      {
        name: "stop_bot",
        description: 'Stop a bot (or "all") that is stuck, done enough, or no longer needed. Its result so far stays in team_status.',
        shape: { bot: z.string().describe('A bot\'s name, or "all"'), reason: z.string().optional() },
        run: async (a: { bot: string; reason?: string }) => {
          const targets = a.bot.trim().toLowerCase() === "all" ? this.working() : [this.bot(a.bot)].filter((b): b is Bot => Boolean(b));
          const stopped = targets.filter((b) => this.stopBot(b));
          if (stopped.length) this.masterSays(`■ stopping ${stopped.map((b) => b.name).join(", ")}${a.reason ? ` (${a.reason})` : ""}`);
          if (stopped.length) this.emit("master.stopped", { bots: stopped.map((b) => b.id), reason: a.reason ?? null }, undefined, "master");
          return stopped.length ? `Stopping ${stopped.map((b) => b.name).join(", ")}.` : "No working bot matched; nothing to stop.";
        },
      },
      {
        name: "team_status",
        description: "Every bot's status, goal, current page, action count, recent steps and result. Updates come to you on their own; use this only when you need the full picture.",
        shape: {},
        run: async () => this.teamStatus(),
      },
      {
        name: "site_access",
        description: "Answer bots' site requests: allow or block sites for every bot. Name specific sites (example.com).",
        shape: { sites: z.array(z.string()).min(1), allow: z.boolean() },
        run: async (a: { sites: string[]; allow: boolean }) => {
          if (a.sites.some((s) => s.includes("*"))) throw new ToolError("INVALID_INPUT", "Name specific sites, not wildcards.");
          this.decideSites(a.sites, a.allow, "the Master");
          this.masterSays(dim(`${a.allow ? "allowed" : "blocked"} ${a.sites.join(", ")}`));
          return `${a.allow ? "Allowed" : "Blocked"} for every bot: ${a.sites.join(", ")}.`;
        },
      },
      {
        name: "final_answer",
        description: "Give the user the merged final answer, with sources. Only once no bot is working.",
        shape: {
          answer: z.string().describe("The answer for the user: clear, with numbers and dates where they matter, and what's missing"),
          sources: z.array(z.object({ title: z.string().optional(), url: z.string() })).optional(),
        },
        run: async (a: { answer: string; sources?: Source[] }) => {
          if (!this.o.allowDirect && !this.bots.some((b) => b.assignments > 0)) {
            throw new ToolError("NO_BOT_WORK", "The bots do the work: assign it with start_bots first. Your research is for planning; report the facts the bots find.");
          }
          const busy = this.working();
          if (busy.length) throw new ToolError("BOTS_WORKING", `${busy.map((b) => b.name).join(", ")} ${busy.length === 1 ? "is" : "are"} still working. End your turn to wait for their results, or stop_bot them first.`);
          this.showAnswer(a.answer, a.sources ?? []);
          return "Shown to the user. End your turn now; the user may follow up.";
        },
      },
    ];
    return createToolSet(defs, async (d, args) => {
      const started = this.elapsed;
      let result: CallToolResult;
      try {
        const out = await d.run(args);
        result = typeof out === "string" ? { content: [{ type: "text", text: out }] } : out;
      } catch (err) {
        const code = err instanceof ToolError ? err.code : "ERROR";
        result = { isError: true, content: [{ type: "text", text: `${code}: ${err instanceof Error ? err.message : err}` }] };
      }
      // A busy Master gets queued updates here, without waiting for its turn to end (D-07).
      if (this.updates.length || this.bots.some((b) => b.digest.length)) result = appendLines(result, ["", this.updateText()]);
      const ms = this.elapsed - started;
      this.masterCalls.push({ tool: d.name, ms, ok: !result.isError });
      this.timings.masterFirstTool ??= started;
      this.o.run.record("tools.jsonl", { agent: "Master", tool: d.name, args, startedAt: started, ms, ok: !result.isError, result: resultText(result) });
      this.emit("master.tool", { tool: d.name, ok: !result.isError, error: result.isError ? clip(resultText(result).split("\n")[0], 200) : null }, undefined, "master");
      if (result.isError) this.masterSays(dim(`✗ ${d.name}: ${clip(resultText(result).split("\n")[0], 200)}`));
      return result;
    });
  }

  private async startBots(list: { bot?: string; label?: string; goal: string; start_url?: string; sites?: string[] }[]): Promise<string> {
    const errors: string[] = [];
    const picked: { bot: Bot; goal: string; label?: string; startUrl?: string; sites: string[] }[] = [];
    const taken = new Set<Bot>();
    const free = () => this.bots.find((b) => !taken.has(b) && b.status !== "working" && b.status !== "starting" && b.assignments === 0)
      ?? this.bots.find((b) => !taken.has(b) && b.status !== "working" && b.status !== "starting");
    for (const [i, a] of list.entries()) {
      const goal = a.goal?.trim() ?? "";
      if (goal.length < 20) errors.push(`#${i + 1}: the goal is too short; say exactly what to find or do`);
      let startUrl = a.start_url?.trim() || undefined;
      if (startUrl && !/^https?:\/\//i.test(startUrl)) startUrl = `https://${startUrl}`;
      if (startUrl && !URL.canParse(startUrl)) errors.push(`#${i + 1}: start_url "${a.start_url}" isn't a valid URL`);
      let bot: Bot | undefined;
      if (a.bot) {
        bot = this.bot(a.bot);
        if (!bot) errors.push(`#${i + 1}: no bot "${a.bot}" (bots: ${this.bots.map((b) => b.name).join(", ")})`);
        else if (taken.has(bot)) errors.push(`#${i + 1}: ${bot.name} is already in this list`);
        else if (bot.status === "working" || bot.status === "starting") errors.push(`#${i + 1}: ${bot.name} is busy; use message_bot to change its work, or stop_bot it first`);
      } else {
        bot = free();
        if (!bot) errors.push(`#${i + 1}: no free bot (all ${this.bots.length} are working)`);
      }
      if (bot) taken.add(bot);
      const sites = [...new Set([...(a.sites ?? []), ...(startUrl ? [new URL(startUrl).hostname] : []), ...hostsIn(goal)].map((s) => siteOf(s.replace(/^https?:\/\//i, "").split("/")[0])).filter(Boolean))];
      if (sites.includes("*")) errors.push(`#${i + 1}: name specific sites, not "*"`);
      const label = clip(a.label?.trim() || roleOf(goal), 40);
      if (bot) picked.push({ bot, goal, label, startUrl, sites });
    }
    if (errors.length) throw new ToolError("INVALID_INPUT", `Nothing started. Fix: ${errors.join("; ")}.`);
    // The plan's sites are allowed for the whole team, so bots can share pages without asking.
    this.decideSites(picked.flatMap((p) => p.sites), true, "the plan");
    this.timings.plan ??= this.elapsed;
    this.o.run.record("plan.jsonl", { at: this.elapsed, assignments: picked.map((p) => ({ bot: p.bot.name, goal: p.goal, startUrl: p.startUrl, sites: p.sites })) });
    this.emit("plan.ready", { assignments: picked.map((p) => ({ botId: p.bot.id, name: p.bot.name, label: p.label, goal: p.goal, startUrl: p.startUrl ?? null, sites: p.sites })) }, undefined, "master");
    const roster = () => this.bots.filter((b) => b.status === "working" || b.status === "starting").map((b) => ({ name: b.name, goal: b.goal ?? "" }));
    for (const p of picked) {
      p.bot.goal = p.goal;
      this.setStatus(p.bot, "starting");
    }
    const all = roster();
    picked.forEach((p, i) => void this.assign(p.bot, p, all.filter((t) => t.name !== p.bot.name), i * 300));
    return `Started ${picked.map((p) => `${p.bot.name} (${clip(p.goal, 60)})`).join("; ")}. They report back as TEAM UPDATES; end your turn now unless there's more to do.`;
  }

  /** Called once after the next final answer (the CLI ends a timed-out run with it). */
  onAnswerOnce?: () => void;

  private showAnswer(answer: string, sources: Source[]) {
    this.lastAnswerAt = this.elapsed;
    this.timings.firstAnswer ??= this.elapsed;
    this.answers.push({ at: this.elapsed, answer, sources });
    this.o.run.write("result.json", { task: this.task, answers: this.answers });
    this.emit("run.result", { answer, sources, n: this.answers.length }, undefined, "master");
    const rule = "─".repeat(60);
    this.print(`\n${paint(MASTER_COLOR, `── Final answer ${rule}`.slice(0, 64))}\n${answer}${sources.length ? `\n\nSources:\n${sources.map((s) => `  • ${s.title ? `${s.title} — ` : ""}${s.url}`).join("\n")}` : ""}\n${paint(MASTER_COLOR, rule.slice(0, 64))}\n`);
    this.o.onAnswer?.();
    const once = this.onAnswerOnce;
    this.onAnswerOnce = undefined;
    once?.();
  }

  /** The user pressed Stop: the bots at work stop and the Master's turn is cancelled; the chat stays open.
   *  Nothing starts again until the user writes: queued updates wait for their next message. */
  halt(): boolean {
    const stopped = this.working().filter((b) => this.stopBot(b, "stopped by you"));
    const master = Boolean(this.master?.busy);
    if (master) void this.master!.cancel().catch(() => {});
    if (!stopped.length && !master) return false;
    for (const u of this.updates) u.wake = "no";
    clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    const names = stopped.map((b) => b.name).join(", ");
    this.pushUpdate(`USER PRESSED STOP${stopped.length ? `: ${names} ${stopped.length === 1 ? "was" : "were"} stopped` : ""}. Don't start new work; wait for the user's next message.`, "no");
    this.emit("run.notice", { level: "info", text: `You stopped ${stopped.length ? `${names}${master ? " and the Master" : ""}` : "the Master"}. Send a message to carry on.` });
    this.log(`the user pressed Stop${stopped.length ? ` (${names})` : ""}`);
    return true;
  }

  /** Time's up: stop every bot and ask the Master for its final answer now. */
  wrapUp(reason: string) {
    const stopped = this.working().filter((b) => this.stopBot(b));
    this.emit("run.notice", { level: "warn", text: `${reason}: the bots${stopped.length ? ` (${stopped.map((b) => b.name).join(", ")})` : ""} stop and the Master writes its answer now.` });
    this.pushUpdate(`${reason}: the run ends in about a minute.${stopped.length ? ` ${stopped.map((b) => b.name).join(", ")} ${stopped.length === 1 ? "was" : "were"} stopped.` : ""} Call final_answer now with what the team has.`, "now");
  }

  /** The user takes over a bot's browser, or hands it back (§14.7): e.g. to solve a human check or sign in. */
  takeover(botId: string, on: boolean): boolean {
    const bot = this.bot(botId);
    if (!bot || this.closing || bot.browser.inControl === on) return false;
    bot.browser.takeover(on);
    this.emit(on ? "takeover.started" : "takeover.ended", {}, bot, "user");
    this.log(`${bot.name}: the user ${on ? "took over the browser" : "handed the browser back"}`);
    const busy = bot.status === "working" || bot.status === "starting";
    this.pushUpdate(
      on ? `The user took over ${bot.name}'s browser (for example, to solve a human check or sign in). ${bot.name}'s actions wait until it's handed back.`
        : `The user handed ${bot.name}'s browser back${busy ? `; ${bot.name} continues` : ` (${bot.name} is ${bot.status}; it's on ${where(bot.browser.page.url())})`}.`,
      on || busy ? "no" : "soon",
    );
    return true;
  }

  /** The user's mouse and keys for a browser they control. Never logged or shown to a model. */
  userInput(botId: string, e: UserInput) {
    const bot = this.bot(botId);
    if (bot?.browser.inControl) void bot.browser.userInput(e);
  }

  // ── Cost ──

  private lastCost = -1;

  private agentSessions() {
    return [
      ...this.masterSessions.map((s, i) => ({ agent: i ? `Master (restart ${i})` : "Master", model: this.o.masterModel, session: s })),
      ...this.bots.flatMap((b) => [...b.pastSessions, ...(b.session ? [b.session] : [])].map((s) => ({ agent: b.name, model: this.o.botModel, session: s }))),
    ];
  }

  /** The cost so far from each session's latest usage (model tokens; usage lands a little after each turn). */
  costs() {
    const by: Record<string, number> = {};
    for (const a of this.agentSessions()) {
      const usd = estimateCost(a.model, a.session.usage);
      if (usd !== null) by[a.agent.replace(/ \(restart \d+\)$/, "")] = (by[a.agent.replace(/ \(restart \d+\)$/, "")] ?? 0) + usd;
    }
    const total = Object.values(by).reduce((x, y) => x + y, 0);
    return { total: Math.round(total * 10000) / 10000, byAgent: by };
  }

  /** Reads a session's usage now and again shortly (it lands a little after the turn), then tells the dashboard. */
  private refreshCost(session: AgentSession) {
    const read = () => session.refreshUsage().then(() => {
      if (this.closing) return;
      const c = this.costs();
      if (c.total === this.lastCost) return;
      this.lastCost = c.total;
      this.emit("usage.updated", { costUSD: c.total, byAgent: c.byAgent });
    });
    void read();
    if (this.o.onEvent) setTimeout(() => void (this.closing ? undefined : read()), 2500).unref();
  }

  /** The create bodies as sent (the token is redacted), for request.json. */
  requestBodies() {
    const redact = (x: unknown) => JSON.parse(JSON.stringify(x).replaceAll(this.o.token, "<token>"));
    return { master: redact(this.masterBody()), bot: this.bots[0] ? redact(this.botBody(this.bots[0])) : null };
  }

  // ── Shutdown and summary ──

  async shutdown() {
    if (this.closing) return;
    this.closing = true;
    clearTimeout(this.flushTimer);
    for (const e of this.siteAsks.values()) for (const r of e.resolvers) r(false);
    const sessions = [...this.masterSessions, ...this.bots.flatMap((b) => [...b.pastSessions, ...(b.session ? [b.session] : [])])];
    await Promise.all([...sessions.map((s) => s.close().catch(() => {})), ...this.bots.map((b) => b.browser.keyframeNow())]);
    await Promise.all(this.bots.map(async (b) => {
      await b.browser.close().catch(() => {});
      if (b.profileTemp) rmSync(b.profileTemp, { recursive: true, force: true });
    }));
  }

  summary() {
    const agents = this.agentSessions().map((x) => ({ agent: x.agent, model: x.model, sessionId: x.session.id || null, environment: x.session.environment, turns: x.session.turns, usage: x.session.usage ?? null, costUSD: estimateCost(x.model, x.session.usage), eventTypes: x.session.eventTypes }));
    const cost = agents.reduce((sum, a) => sum + (a.costUSD ?? 0), 0);
    return {
      task: this.task,
      models: { master: this.o.masterModel, bots: this.o.botModel },
      timingsMs: { ...this.timings, total: this.elapsed } as Record<string, number | undefined>,
      answers: this.answers,
      bots: this.bots.map((b) => ({ name: b.name, status: b.status, assignments: b.assignments, goal: b.goal ?? null, result: b.result ?? null, toolCalls: b.calls, actionsLastAssignment: b.tools.state.actions, webSearches: b.searches, assignedAtMs: b.assignedAt ?? null, endedAtMs: b.endedAt ?? null })),
      master: { toolCalls: this.masterCalls.length, byTool: countBy(this.masterCalls, (c) => c.tool), webSearches: this.masterSearches },
      messages: this.messages.length,
      agents,
      costUSD: Math.round(cost * 10000) / 10000,
      mcpRequests: countBy(this.mcpRequests, (r) => r.agent),
      mcpStatuses: countBy(this.mcpRequests, (r) => String(r.status)),
      sse: this.sse,
    };
  }
}
