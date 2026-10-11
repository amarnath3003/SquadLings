// Runs squads for the dashboard (master.md §11.2, §18): one run at a time, started from the browser.
// Each run gets its own Squad, output folder, MCP token and event log; the MCP server, the tunnel and
// the dashboard server outlive runs. Everything a run does becomes an event in the §18.1 envelope:
// it's sent to every open dashboard, saved to events.jsonl (D-05), and replayed to a dashboard that
// connects late or reloads (the "snapshot" is the run's event list, fed to the same reducer).
// Live frames are separate binary messages and are never saved (§18.3).

import { appendFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { randomBytes } from "node:crypto";
import { createAgentsApi } from "./agents-api.ts";
import type { Frame, UserInput } from "./browser.ts";
import type { McpRequest } from "./mcp-browser-server.ts";
import { ROOT, createRunLog, secs } from "./run-kit.ts";
import type { RunLog } from "./run-kit.ts";
import { hostsIn } from "./site-gate.ts";
import { CAST, Squad } from "./squad.ts";
import type { SquadEvent } from "./squad.ts";

export type RunOptions = {
  bots: number;
  masterModel: string;
  botModel: string;
  masterEffort?: string;
  botEffort?: string;
  maxActions: number;
  timeoutMin: number;
  webSearch: boolean;
  allowDirect: boolean;
  allow: string[];
  fresh: boolean;
};

export type RunStatus = "starting" | "running" | "ending" | "ended" | "failed";

/** master.md §18.1. */
export type Envelope = { id: string; runId: string; seq: number; ts: number; source: SquadEvent["source"]; botId?: string; type: string; data: Record<string, unknown> };

export type HubMessage =
  | { kind: "event"; event: Envelope }
  | { kind: "frame"; data: Buffer }
  | { kind: "reset"; runId: string };

/**
 * Reasoning efforts (probed live 2026-10-11): gpt-6.1-sol and gpt-6-astra accept all of these;
 * gpt-6-luna refuses "minimal". The default is medium.
 */
const EFFORTS = new Set(["none", "minimal", "low", "medium", "high", "xhigh", "max"]);
const EFFORT_ORDER = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];
/** The efforts each model accepts (from their 400 errors, 2026-10-11); a model not listed gets what you picked. */
const MODEL_EFFORTS: Record<string, string[]> = {
  "gpt-6.1-sol": ["low", "medium", "high", "xhigh", "max"],
  "gpt-6-luna": ["none", "low", "medium", "high", "xhigh", "max"],
};
/** An effort the model accepts: yours, or the next one up (e.g. "none" on gpt-6.1-sol runs at "low"). */
export function fitEffort(model: string, effort: string | undefined) {
  const ok = MODEL_EFFORTS[model];
  if (!effort || !ok || ok.includes(effort)) return effort;
  const up = EFFORT_ORDER.slice(EFFORT_ORDER.indexOf(effort)).find((e) => ok.includes(e));
  return up ?? ok[0];
}

/** Checks and fills run options from the dashboard; throws a message for the user. */
export function parseRunOptions(raw: any, defaults: RunOptions): RunOptions {
  const o = { ...defaults, ...(raw && typeof raw === "object" ? raw : {}) };
  const int = (v: unknown, lo: number, hi: number, name: string) => {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n) || n < lo || n > hi) throw new Error(`${name} must be between ${lo} and ${hi}`);
    return n;
  };
  const model = (v: unknown, name: string) => {
    if (typeof v !== "string" || !/^[\w.:-]{1,64}$/.test(v)) throw new Error(`${name} isn't a model id`);
    return v;
  };
  const effort = (v: unknown, name: string) => {
    if (v === undefined || v === null || v === "" || v === "default") return undefined;
    if (typeof v !== "string" || !EFFORTS.has(v)) throw new Error(`${name} must be one of ${[...EFFORTS].join(", ")}`);
    return v;
  };
  const allow = Array.isArray(o.allow) ? o.allow : String(o.allow ?? "").split(/[\s,]+/);
  return {
    bots: int(o.bots, 1, CAST.length, "Bots"),
    masterModel: model(o.masterModel, "Master model"),
    botModel: model(o.botModel, "Bot model"),
    masterEffort: fitEffort(String(o.masterModel), effort(o.masterEffort, "Master effort")),
    botEffort: fitEffort(String(o.botModel), effort(o.botEffort, "Bot effort")),
    maxActions: int(o.maxActions, 5, 200, "Actions per bot"),
    timeoutMin: int(o.timeoutMin, 1, 120, "Time limit"),
    webSearch: Boolean(o.webSearch),
    allowDirect: Boolean(o.allowDirect),
    allow: allow.map((h: unknown) => String(h).trim()).filter((h: string) => /^[\w.*-]+(:\d+)?$/.test(h)).slice(0, 50),
    fresh: Boolean(o.fresh),
  };
}

export type RunnerOptions = {
  apiKey: string;
  apiBase: string;
  /** The public URL of the MCP port (prewarmed tunnel, quick tunnel, or --public-url). */
  publicUrl: () => Promise<string>;
  /** Print the squad's log to the terminal too (it always goes to log.txt in the run's folder). */
  verbose?: boolean;
  /** Output root (default spikes/out); each run writes <root>/ui-<timestamp>/. */
  outRoot?: string;
  /** Create the bots' sessions while the Master plans (D-18). */
  warm?: boolean;
  /** Persistent bot profiles (default spikes/profile; `fresh` runs use temporary ones). */
  profileRoot?: string;
  log?: (line: string) => void;
};

/** One squad run. */
export class ActiveRun {
  id = `run_${Date.now().toString(36)}`;
  token = randomBytes(24).toString("base64url"); // fresh per run (D-12)
  status: RunStatus = "starting";
  startedAt = Date.now();
  endedAt?: number;
  events: Envelope[] = [];
  /** The latest frame of each bot (by index), so a dashboard that connects late isn't blank. */
  frames = new Map<number, Buffer>();
  squad: Squad;
  run: RunLog;
  task: string;
  options: RunOptions;
  private seq = 0;
  private frameSeq = 0;
  private ending?: Promise<void>;
  private life = new AbortController();
  private timer?: ReturnType<typeof setTimeout>;
  private wrapTimer?: ReturnType<typeof setTimeout>;
  private r: SquadRunner;

  constructor(r: SquadRunner, task: string, options: RunOptions) {
    this.r = r;
    this.task = task;
    this.options = options;
    const logFile = () => join(this.run.out, "log.txt");
    const print = (line: string) => {
      appendFileSync(logFile(), `${line.replace(/\x1b\[[\d;]*m/g, "")}\n`);
      if (r.o.verbose) console.log(line);
    };
    this.run = createRunLog({
      prefix: "ui",
      out: r.o.outRoot ? join(r.o.outRoot, `ui-${new Date().toISOString().replace(/[:.]/g, "-")}`) : undefined,
      // Long tool results are cut in the logs; answers (events.jsonl, Recent chats) stay whole.
      replacer: (_key, value) => (typeof value === "string" && value.length > 20000 ? `[${value.length} chars omitted]` : value),
      print,
    });
    const api = createAgentsApi({ base: r.o.apiBase, key: r.o.apiKey, onHttp: (e) => this.run.record("http.jsonl", { at: this.run.elapsed(), ...e }) });
    this.squad = new Squad({
      api,
      run: this.run,
      token: this.token,
      runId: this.id,
      masterModel: options.masterModel,
      botModel: options.botModel,
      masterEffort: options.masterEffort,
      botEffort: options.botEffort,
      bots: options.bots,
      maxActions: options.maxActions,
      webSearch: options.webSearch,
      headless: true, // the dashboard shows the browsers (D-19)
      cursor: true,
      cursorEvents: true,
      profileRoot: options.fresh ? undefined : (r.o.profileRoot ?? join(ROOT, "spikes/profile")),
      allow: [...hostsIn(task), ...options.allow],
      signal: this.life.signal,
      allowDirect: options.allowDirect,
      print,
      onEvent: (e) => this.emit(e),
      onFrame: (bot, f) => this.frame(bot.index, f),
    });
  }

  get out() {
    return relative(process.cwd(), this.run.out) || ".";
  }

  emit(e: SquadEvent) {
    const event: Envelope = { id: `${this.id}-${++this.seq}`, runId: this.id, seq: this.seq, ts: Date.now(), source: e.source, ...(e.botId ? { botId: e.botId } : {}), type: e.type, data: e.data };
    this.events.push(event);
    if (!e.type.startsWith("cursor.")) this.run.record("events.jsonl", event); // cursor moves are many and live-only detail
    this.r.broadcast({ kind: "event", event });
  }

  private setStatus(status: RunStatus, data: Record<string, unknown> = {}) {
    this.status = status;
    this.emit({ type: "run.status", source: "orchestrator", data: { status, ...data } });
  }

  /** §18.3 binary frame: u8 version · u8 bot index · u16 width · u16 height · u32 seq, then the JPEG. */
  private frame(index: number, f: Frame) {
    const head = Buffer.alloc(10);
    head.writeUInt8(1, 0);
    head.writeUInt8(index, 1);
    head.writeUInt16BE(Math.min(f.width, 65535), 2);
    head.writeUInt16BE(Math.min(f.height, 65535), 4);
    head.writeUInt32BE(++this.frameSeq >>> 0, 6);
    const data = Buffer.concat([head, f.jpeg]);
    this.frames.set(index, data);
    this.r.broadcast({ kind: "frame", data });
  }

  /** Opens the browsers and the tunnel, warms the bots and starts the Master. */
  async begin() {
    const o = this.options;
    this.emit({ type: "run.created", source: "user", data: { task: this.task, options: o, out: this.out, cast: CAST.slice(0, o.bots) } });
    this.setStatus("starting", { step: `Opening ${o.bots} browser${o.bots === 1 ? "" : "s"} and checking the tools tunnel` });
    this.timer = setTimeout(() => this.timeUp(), o.timeoutMin * 60_000);
    try {
      const [url] = await Promise.all([this.r.o.publicUrl(), this.squad.launchBrowsers()]);
      if (this.ending) return;
      this.squad.publicUrl = url;
      this.run.write("request.json", this.squad.requestBodies());
      if (this.r.o.warm !== false) this.squad.warmBots();
      await this.squad.start(this.task);
      if (this.ending) return;
      this.setStatus("running");
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      this.run.log(`✗ ${text}`);
      this.emit({ type: "run.notice", source: "orchestrator", data: { level: "error", text: `The run couldn't start: ${text}` } });
      await this.end("error");
    }
  }

  say(text: string) {
    if (this.status === "ended" || this.status === "failed" || this.status === "ending") throw new Error("This run has ended. Start a new one.");
    this.squad.userSays(text);
  }

  /** Stop: the agents at work stop and the Master's turn is cancelled; the chat stays open. */
  halt() {
    if (this.status === "ended" || this.status === "failed" || this.status === "ending") throw new Error("This run has ended. Start a new one.");
    return this.squad.halt();
  }

  takeover(botId: string, on: boolean) {
    if (this.status === "ended" || this.status === "failed") return false;
    return this.squad.takeover(botId, on);
  }

  input(botId: string, e: UserInput) {
    this.squad.userInput(botId, e);
  }

  /** Time's up: stop the bots and ask the Master for its answer; end after it (or after 75 s). */
  private timeUp() {
    if (this.ending) return;
    if (!this.squad.master) return void this.end("timeout");
    this.run.log("time's up: stopping the bots and asking the Master for its final answer");
    this.squad.wrapUp("TIME IS UP");
    this.squad.onAnswerOnce = () => void this.end("timeout");
    this.wrapTimer = setTimeout(() => void this.end("timeout"), 75_000);
  }

  /** Stops every session, closes the browsers and writes summary.json. */
  end(reason: string): Promise<void> {
    this.ending ??= (async () => {
      clearTimeout(this.timer);
      clearTimeout(this.wrapTimer);
      const failed = reason === "error";
      this.setStatus("ending", { reason });
      this.run.log(`ending (${reason}): stopping sessions and closing the browsers…`);
      await this.squad.shutdown().catch((err) => this.run.log(`shutdown: ${err instanceof Error ? err.message : err}`));
      this.life.abort();
      const summary = { outcome: reason, ...this.squad.summary() };
      this.run.write("summary.json", summary);
      this.endedAt = Date.now();
      this.setStatus(failed ? "failed" : "ended", { reason, durationMs: this.endedAt - this.startedAt, costUSD: summary.costUSD, out: this.out, answers: summary.answers.length });
      this.r.o.log?.(`run ${this.id} ended (${reason}) after ${secs(this.endedAt - this.startedAt)} s, ≈ $${summary.costUSD.toFixed(4)} · ${this.out}`);
    })();
    return this.ending;
  }

  onMcp(r: McpRequest) {
    this.squad.mcpRequests.push(r);
    this.run.record("mcp.jsonl", { at: this.run.elapsed(), ...r });
  }
}

/** A finished or live run, for the dashboard's Recent chats. */
export type RunListing = { id: string; task: string; startedAt: number; status: string; reason: string | null; costUSD: number | null; answers: number; bots: number; live: boolean };

/** Starts and tracks runs; fans events and frames out to every connected dashboard. */
export class SquadRunner {
  current?: ActiveRun;
  o: RunnerOptions;
  private listeners = new Set<(m: HubMessage) => void>();

  constructor(o: RunnerOptions) {
    this.o = o;
  }

  get active() {
    return this.current && (this.current.status === "starting" || this.current.status === "running" || this.current.status === "ending") ? this.current : undefined;
  }

  /** Starts a run unless one is active. Resolves once it's created; it starts up in the background. */
  start(task: string, options: RunOptions): ActiveRun {
    const t = task.trim();
    if (!t) throw new Error("Describe a task for the squad.");
    if (t.length > 4000) throw new Error("The task is too long (4,000 characters at most).");
    if (this.active) throw new Error("A run is already going. End it first.");
    const run = new ActiveRun(this, t, options);
    this.current = run;
    this.broadcast({ kind: "reset", runId: run.id });
    this.o.log?.(`run ${run.id} started: ${t.length > 100 ? `${t.slice(0, 99)}…` : t} (output ${run.out})`);
    void run.begin();
    return run;
  }

  subscribe(fn: (m: HubMessage) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  broadcast(m: HubMessage) {
    for (const fn of this.listeners) {
      try {
        fn(m);
      } catch {
        // one dashboard's socket failing doesn't stop the others
      }
    }
  }

  private get outRoot() {
    return this.o.outRoot ?? join(ROOT, "spikes/out");
  }

  /** Run folders written by the dashboard, newest first: runId → folder. */
  private folders = new Map<string, string>();
  private scan(): { id: string; dir: string; created: Envelope }[] {
    if (!existsSync(this.outRoot)) return [];
    const dirs = readdirSync(this.outRoot).filter((d) => d.startsWith("ui-")).sort().reverse().slice(0, 60);
    const out: { id: string; dir: string; created: Envelope }[] = [];
    for (const d of dirs) {
      const dir = join(this.outRoot, d);
      try {
        const first = readFileSync(join(dir, "events.jsonl"), "utf8").split("\n", 1)[0];
        const created = JSON.parse(first) as Envelope;
        if (created.type !== "run.created") continue;
        this.folders.set(created.runId, dir);
        out.push({ id: created.runId, dir, created });
      } catch {
        // a run that never got going
      }
    }
    return out;
  }

  /** Recent chats: the live run (if any) and the ones on disk. */
  listRuns(limit = 30): RunListing[] {
    const live = this.active;
    const list: RunListing[] = [];
    for (const r of this.scan()) {
      if (live && r.id === live.id) continue;
      let summary: any = null;
      try {
        summary = JSON.parse(readFileSync(join(r.dir, "summary.json"), "utf8"));
      } catch {
        // interrupted: no summary
      }
      const status = this.current?.id === r.id ? this.current.status : summary ? (summary.outcome === "error" ? "failed" : "ended") : "interrupted";
      list.push({
        id: r.id, task: String(r.created.data.task ?? ""), startedAt: r.created.ts, status, reason: summary?.outcome ?? null,
        costUSD: summary?.costUSD ?? null, answers: summary?.answers?.length ?? 0, bots: (summary?.bots ?? []).filter((b: any) => b.assignments > 0).length, live: false,
      });
    }
    if (live) list.unshift({ id: live.id, task: live.task, startedAt: live.startedAt, status: live.status, reason: null, costUSD: live.squad.costs().total, answers: live.squad.answers.length, bots: live.squad.bots.filter((b) => b.assignments > 0).length, live: true });
    return list.slice(0, limit);
  }

  /** A run's events: from memory for the current run, else from its events.jsonl. */
  runEvents(id: string): { run: { id: string; task: string; status: string; startedAt: number; endedAt: number | null; out: string }; events: Envelope[] } | undefined {
    const cur = this.current;
    if (cur && cur.id === id) return { run: { id, task: cur.task, status: cur.status, startedAt: cur.startedAt, endedAt: cur.endedAt ?? null, out: cur.out }, events: cur.events };
    if (!this.folders.has(id)) this.scan();
    const dir = this.folders.get(id);
    if (!dir) return undefined;
    const events = readFileSync(join(dir, "events.jsonl"), "utf8").split("\n").filter(Boolean).flatMap((l) => {
      try {
        return [JSON.parse(l) as Envelope];
      } catch {
        return [];
      }
    });
    const status = [...events].reverse().find((e) => e.type === "run.status")?.data.status;
    const ended = status === "ended" || status === "failed";
    return { run: { id, task: String(events[0]?.data.task ?? ""), status: ended ? String(status) : "interrupted", startedAt: events[0]?.ts ?? 0, endedAt: events.at(-1)?.ts ?? null, out: relative(process.cwd(), dir) }, events };
  }

  /** The last keyframe a bot's browser saved in a run (frames/<bot>/NNN.jpg), for a closed chat's tiles. */
  lastFrame(id: string, bot: string): Buffer | undefined {
    if (!/^[a-z]{2,10}$/.test(bot)) return undefined;
    const cur = this.current;
    const dir = cur && cur.id === id ? cur.run.out : (this.folders.get(id) ?? (this.scan(), this.folders.get(id)));
    if (!dir) return undefined;
    try {
      const files = readdirSync(join(dir, "frames", bot)).filter((f) => /^\d+\.jpg$/.test(f)).sort();
      return files.length ? readFileSync(join(dir, "frames", bot, files.at(-1)!)) : undefined;
    } catch {
      return undefined;
    }
  }

  /** The MCP router: the current run's agents' tools. */
  routes = (path: string) => this.current?.squad.routes(path);
  token = () => this.current?.token ?? "";

  async shutdown() {
    await this.current?.end("server_stopped");
  }
}
